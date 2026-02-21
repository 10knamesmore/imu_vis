//! IMU 数据处理器与处理链入口。
//!
//! 这里负责启动处理线程，并把原始数据送入 pipeline。
//! pipeline 内部遵循固定链路：解析 → 标定 → 滤波 → Navigator → 输出。

use std::{
    thread::{self, JoinHandle},
    time::Duration,
};

use flume::{Receiver, RecvTimeoutError};
use tauri::Emitter as _;

use crate::{
    processor::{
        calibration::CorrectionRequest,
        pipeline::{PipelineConfigRequest, ProcessorPipeline, ProcessorPipelineConfig},
    },
    types::outputs::ResponseData,
};

/// 标定模块。
pub mod calibration;
/// 滤波模块。
pub mod filter;
/// 导航融合模块。
pub mod navigator;
/// 输出构建模块。
pub mod output;
/// 解析模块。
pub mod parser;
/// 管线模块。
pub mod pipeline;

/// 对外暴露的计算结果数据类型。
pub use output::CalculatedData;

/// 数据处理器实例，启动独立线程消费 IMU 流。
pub struct Processor {
    shutdown_tx: Option<flume::Sender<()>>,
    processor_thread: Option<JoinHandle<()>>,
    config_watcher_thread: Option<JoinHandle<()>>,
}

/// 原始 IMU 数据包枚举。
pub enum RawImuData {
    Packet(Vec<u8>),
    Reset,
}

impl Processor {
    /// 数据处理器实例。
    ///
    /// 数据为时序，无法并行，单计算线程处理。
    /// 处理器是无状态， 只做转发的
    ///
    /// 通道关系（上游 -> 下游）：
    /// - `imu::client` 通过 `upstream_tx` 推送原始蓝牙包。
    /// - 本处理器线程持有 `upstream_rx`，消费原始包并运行 pipeline。
    /// - 处理结果通过 `downstream_tx` 发给 `AppState.downstream_rx`，
    ///   再由 tauri command/IPC 推给前端。
    /// - 同时通过 `record_tx` 发给 recorder 线程持久化存储。
    ///
    /// * `upstream_rx`: 接收来自 imu_client 的原始蓝牙二进制数据
    /// * `downstream_tx`: 发给 AppState 的 rx（command 中接收）
    /// * `record_tx`: 发给 recorder 线程的录制通道
    /// * `calibration_rx`: 手动校正请求通道
    pub fn new(
        upstream_rx: flume::Receiver<RawImuData>,
        downstream_tx: flume::Sender<ResponseData>,
        record_tx: flume::Sender<ResponseData>,
        calibration_rx: flume::Receiver<CorrectionRequest>,
        pipeline_config_rx: flume::Receiver<PipelineConfigRequest>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        let (shutdown_tx, shutdown_rx) = flume::unbounded::<()>();
        let (config, config_rx, config_watcher_thread) =
            Self::init_config_watcher(shutdown_rx.clone());

        let app_handle = app_handle.clone();
        let processor_thread = thread::Builder::new()
            .name("DataProcessorThread".into())
            .spawn(move || {
                let mut current_config = config.clone();
                let mut pipeline = ProcessorPipeline::new(config);
                let mut config_enabled = true;

                loop {
                    enum PipelineEvent {
                        Packet(Vec<u8>),
                        Calibration(CorrectionRequest),
                        UpstreamClosed,
                        CalibrationClosed,
                        Reset,
                        ConfigUpdated(Box<ProcessorPipelineConfig>),
                        PipelineConfigRequest(Box<PipelineConfigRequest>),
                        ConfigClosed,
                        PipelineConfigClosed,
                        Shutdown,
                    }

                    let mut selector = flume::Selector::new()
                        .recv(&upstream_rx, |result| match result {
                            Ok(data) => match data {
                                RawImuData::Packet(packet) => PipelineEvent::Packet(packet),
                                RawImuData::Reset => PipelineEvent::Reset,
                            },
                            Err(e) => {
                                tracing::error!("从上游通道接收数据失败: {:?}", e);
                                PipelineEvent::UpstreamClosed
                            }
                        })
                        .recv(&calibration_rx, |result| match result {
                            Ok(request) => PipelineEvent::Calibration(request),
                            Err(e) => {
                                tracing::warn!("从校准通道接收请求失败: {:?}", e);
                                PipelineEvent::CalibrationClosed
                            }
                        });

                    selector = selector.recv(&shutdown_rx, |_result| PipelineEvent::Shutdown);

                    selector = selector.recv(&pipeline_config_rx, |result| match result {
                        Ok(request) => PipelineEvent::PipelineConfigRequest(Box::new(request)),
                        Err(e) => {
                            tracing::warn!("从 pipeline 配置请求通道接收失败: {:?}", e);
                            PipelineEvent::PipelineConfigClosed
                        }
                    });

                    if config_enabled {
                        selector = selector.recv(&config_rx, |result| match result {
                            Ok(config) => PipelineEvent::ConfigUpdated(Box::new(config)),
                            Err(e) => {
                                tracing::warn!("从配置通道接收失败: {:?}", e);
                                PipelineEvent::ConfigClosed
                            }
                        });
                    }

                    let event = selector.wait();

                    match event {
                        PipelineEvent::Packet(data) => {
                            if let Some(response_data) = pipeline.process_packet(&data) {
                                if let Err(e) = downstream_tx.send(response_data) {
                                    tracing::error!("下游发送数据时失败: {:?}", e);
                                }
                                if let Err(e) = record_tx.send(response_data) {
                                    tracing::error!("记录数据失败: {:?}", e);
                                }
                            }
                        }
                        PipelineEvent::Calibration(request) => {
                            pipeline.handle_calibration_request(request);
                        }
                        PipelineEvent::UpstreamClosed => {
                            // imu::Client 的生命周期预期覆盖整个应用，正常情况下不应关闭。
                            tracing::error!("数据上游通道接收失败: channel closed");
                            break;
                        }
                        PipelineEvent::CalibrationClosed => {
                            tracing::error!("标定通道接收失败: channel closed");
                            break;
                        }
                        PipelineEvent::Reset => {
                            pipeline.reset();
                            tracing::info!("处理管线已重置");
                        }
                        PipelineEvent::ConfigUpdated(config) => {
                            current_config = *config;
                            pipeline.reset_with_config(current_config.clone());
                            if let Err(e) = app_handle.emit("config_update", ()) {
                                tracing::warn!("推送 config_update 事件失败: {:?}", e);
                            }
                            tracing::info!("处理管线配置已更新");
                        }
                        PipelineEvent::PipelineConfigRequest(request) => match *request {
                            PipelineConfigRequest::Get { respond_to } => {
                                if respond_to.send(current_config.clone()).is_err() {
                                    tracing::warn!("返回 pipeline 配置失败: 接收端已关闭");
                                }
                            }
                            PipelineConfigRequest::Update { config, respond_to } => {
                                let new_config = *config;
                                current_config = new_config.clone();
                                pipeline.reset_with_config(new_config);
                                if let Err(e) = app_handle.emit("config_update", ()) {
                                    tracing::warn!("推送 config_update 事件失败: {:?}", e);
                                }
                                if respond_to.send(Ok(())).is_err() {
                                    tracing::warn!("返回 pipeline 配置更新结果失败: 接收端已关闭");
                                }
                                tracing::info!("处理管线配置已通过命令更新");
                            }
                        },
                        PipelineEvent::ConfigClosed => {
                            config_enabled = false;
                        }
                        PipelineEvent::PipelineConfigClosed => {
                            tracing::error!("pipeline 配置请求通道接收失败: channel closed");
                            break;
                        }
                        PipelineEvent::Shutdown => {
                            tracing::info!("处理器收到关闭信号，准备退出");
                            break;
                        }
                    }
                }
            })
            .unwrap_or_else(|e| panic!("创建核心处理线程失败 : {:?}", e));
        Processor {
            shutdown_tx: Some(shutdown_tx),
            processor_thread: Some(processor_thread),
            config_watcher_thread: Some(config_watcher_thread),
        }
    }

    /// 关闭处理器后台线程并等待退出。
    pub fn shutdown(&mut self) {
        let _ = self.shutdown_tx.take();
        if let Some(handle) = self.processor_thread.take() {
            if let Err(err) = handle.join() {
                tracing::error!("等待处理器线程退出失败: {:?}", err);
            }
        }
        if let Some(handle) = self.config_watcher_thread.take() {
            if let Err(err) = handle.join() {
                tracing::error!("等待配置监听线程退出失败: {:?}", err);
            }
        }
    }

    /// 初始化配置监听器。
    ///
    /// # Return:
    ///   config: 第一次默认的配置
    ///   config_rx: 配置更新通道接收端
    fn init_config_watcher(
        shutdown_rx: flume::Receiver<()>,
    ) -> (
        ProcessorPipelineConfig,
        Receiver<ProcessorPipelineConfig>,
        JoinHandle<()>,
    ) {
        let (config, initial_modified) =
            match ProcessorPipelineConfig::load_from_default_paths_with_modified() {
                Ok(snapshot) => {
                    tracing::info!("读取配置文件 {:?} : {:?}", snapshot.source, snapshot.config);
                    (snapshot.config, Some(snapshot.modified))
                }
                Err(err) => {
                    tracing::warn!(
                        "读取 processor.toml 失败，使用默认配置。path: {:?}, err: {:#}",
                        ProcessorPipelineConfig::default_config_path(),
                        err
                    );
                    (ProcessorPipelineConfig::default(), None)
                }
            };
        let (config_tx, config_rx) = flume::unbounded::<ProcessorPipelineConfig>();
        let config_watcher_thread = thread::Builder::new()
            .name("PipelineConfigWatcher".into())
            .spawn(move || {
                let mut last_modified = initial_modified;
                loop {
                    match ProcessorPipelineConfig::load_from_default_paths_with_modified() {
                        Ok(snapshot) => {
                            let modified = snapshot.modified;
                            if last_modified != Some(modified) {
                                last_modified = Some(modified);
                                tracing::info!("处理管线配置文件变更，路径: {:?}", snapshot.source);
                                if config_tx.send(snapshot.config).is_err() {
                                    break;
                                }
                            }
                        }
                        Err(err) => {
                            tracing::warn!(
                                "轮询读取 processor.toml 失败。path: {:?}, err: {:#}",
                                ProcessorPipelineConfig::default_config_path(),
                                err
                            );
                        }
                    }
                    match shutdown_rx.recv_timeout(Duration::from_secs(3)) {
                        Ok(()) => break,
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .unwrap_or_else(|e| panic!("创建配置监听线程失败 : {:?}", e));

        (config, config_rx, config_watcher_thread)
    }
}

impl Drop for Processor {
    fn drop(&mut self) {
        self.shutdown();
    }
}
