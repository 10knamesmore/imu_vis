//! IMU 数据处理器与处理链入口。
//!
//! 这里负责启动处理线程，并把原始数据送入 pipeline。
//! pipeline 内部遵循固定链路：解析 → 标定 → 滤波 → 姿态融合 → 捷联 → ZUPT → EKF → 输出。

use std::{
    thread::{self, JoinHandle},
    time::Duration,
};

use flume::Receiver;
use tauri::Emitter as _;

use crate::{
    processor::{
        calibration::AxisCalibrationRequest,
        pipeline::{ProcessorPipeline, ProcessorPipelineConfig},
    },
    types::outputs::ResponseData,
};

/// 姿态融合模块。
pub mod attitude_fusion;
/// 标定模块。
pub mod calibration;
/// EKF 模块。
pub mod ekf;
/// 滤波模块。
pub mod filter;
/// 输出构建模块。
pub mod output;
/// 解析模块。
pub mod parser;
/// 管线模块。
pub mod pipeline;
/// 三维轨迹计算模块。
pub mod trajectory;
/// ZUPT 模块。
pub mod zupt;

/// 对外暴露的计算结果数据类型。
pub use output::CalculatedData;

/// 数据处理器实例，启动独立线程消费 IMU 流。
pub struct Processor {
    _processor_thread: JoinHandle<()>,
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
    /// * `calibration_rx`: 姿态零位校准请求通道
    pub fn new(
        upstream_rx: flume::Receiver<RawImuData>,
        downstream_tx: flume::Sender<ResponseData>,
        record_tx: flume::Sender<ResponseData>,
        calibration_rx: flume::Receiver<AxisCalibrationRequest>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        let (config, config_rx) = Self::init_config_watcher();

        let app_handle = app_handle.clone();
        let _processor_thread = thread::Builder::new()
            .name("DataProcessorThread".into())
            .spawn(move || {
                let mut pipeline = ProcessorPipeline::new(config);
                let mut config_enabled = true;

                loop {
                    enum PipelineEvent {
                        Packet(Vec<u8>),
                        Calibration(AxisCalibrationRequest),
                        UpstreamClosed,
                        CalibrationClosed,
                        Reset,
                        ConfigUpdated(Box<ProcessorPipelineConfig>),
                        ConfigClosed,
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
                            pipeline.reset_with_config(*config);
                            if let Err(e) = app_handle.emit("config_update", ()) {
                                tracing::warn!("推送 config_update 事件失败: {:?}", e);
                            }
                            tracing::info!("处理管线配置已更新");
                        }
                        PipelineEvent::ConfigClosed => {
                            config_enabled = false;
                        }
                    }
                }
            })
            .unwrap_or_else(|e| panic!("创建核心处理线程失败 : {:?}", e));
        Processor { _processor_thread }
    }

    /// 初始化配置监听器。
    ///
    /// # Return:
    ///   config: 第一次默认的配置
    ///   config_rx: 配置更新通道接收端
    fn init_config_watcher() -> (ProcessorPipelineConfig, Receiver<ProcessorPipelineConfig>) {
        let config_snapshot = ProcessorPipelineConfig::load_from_default_paths_with_modified();
        let config = config_snapshot
            .as_ref()
            .map(|snapshot| snapshot.config.clone())
            .unwrap_or_default();
        let initial_modified = config_snapshot.map(|snapshot| snapshot.modified);
        let (config_tx, config_rx) = flume::unbounded::<ProcessorPipelineConfig>();
        thread::Builder::new()
            .name("PipelineConfigWatcher".into())
            .spawn(move || {
                let mut last_modified = initial_modified;
                loop {
                    if let Some(snapshot) =
                        ProcessorPipelineConfig::load_from_default_paths_with_modified()
                    {
                        let modified = snapshot.modified;
                        if last_modified != Some(modified) {
                            last_modified = Some(modified);
                            tracing::info!("处理管线配置文件变更，路径: {:?}", snapshot.source);
                            if config_tx.send(snapshot.config).is_err() {
                                break;
                            }
                        }
                    }
                    thread::sleep(Duration::from_secs(3));
                }
            })
            .unwrap_or_else(|e| panic!("创建配置监听线程失败 : {:?}", e));

        (config, config_rx)
    }
}
