//! IMU 数据处理器与处理链入口。
//!
//! 这里负责启动处理线程，并把原始数据送入 pipeline。
//! pipeline 内部遵循固定链路：解析 → 标定 → 滤波 → 姿态融合 → 捷联 → ZUPT → EKF → 输出。

use std::thread;

use crate::processor::calibration::AxisCalibrationRequest;
use crate::processor::pipeline::{ProcessorPipeline, ProcessorPipelineConfig};
use crate::types::outputs::ResponseData;

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
/// 捷联惯导模块。
pub mod strapdown;
/// ZUPT 模块。
pub mod zupt;

/// 对外暴露的计算结果数据类型。
pub use output::CalculatedData;

/// 数据处理器实例，启动独立线程消费 IMU 流。
pub struct Processor;

impl Processor {
    /// 数据处理器实例。
    ///
    /// 数据为时序，无法并行，单计算线程处理。
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
        upstream_rx: flume::Receiver<Vec<u8>>,
        downstream_tx: flume::Sender<ResponseData>,
        record_tx: flume::Sender<ResponseData>,
        calibration_rx: flume::Receiver<AxisCalibrationRequest>,
    ) -> Self {
        let config = ProcessorPipelineConfig::load_from_default_paths();
        thread::Builder::new()
            .name("DataProcessorThread".into())
            .spawn(move || {
                let mut pipeline = ProcessorPipeline::new(config);

                loop {
                    enum PipelineEvent {
                        Packet(Vec<u8>),
                        Calibration(AxisCalibrationRequest),
                        UpstreamClosed,
                        CalibrationClosed,
                    }

                    let event = flume::Selector::new()
                        .recv(&upstream_rx, |result| match result {
                            Ok(data) => PipelineEvent::Packet(data),
                            Err(e) => {
                                tracing::warn!("从上游通道接收数据失败: {:?}", e);
                                PipelineEvent::UpstreamClosed
                            }
                        })
                        .recv(&calibration_rx, |result| match result {
                            Ok(request) => PipelineEvent::Calibration(request),
                            Err(e) => {
                                tracing::warn!("从校准通道接收请求失败: {:?}", e);
                                PipelineEvent::CalibrationClosed
                            }
                        })
                        .wait();

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
                            tracing::error!("数据上游通道接收失败: channel closed");
                        }
                        PipelineEvent::CalibrationClosed => {
                            tracing::error!("标定通道接收失败: channel closed");
                        }
                    }
                }
            })
            .unwrap_or_else(|e| panic!("创建核心处理线程失败 : {:?}", e));
        Processor {}
    }
}
