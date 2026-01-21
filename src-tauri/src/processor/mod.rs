//! IMU 数据处理器与处理链入口。
//!
//! 这里负责启动处理线程，并把原始数据送入 pipeline。
//! pipeline 内部遵循固定链路：解析 → 标定 → 滤波 → 姿态融合 → 捷联 → ZUPT → EKF → 输出。

use std::{
    sync::{Arc, Mutex as StdMutex},
    thread,
};

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
    /// 数据处理器实例
    /// 数据为时序,无法并行, 单计算线程处理
    ///
    /// * `upstream_rx`: 接收来自imu_client的原始蓝牙二进制数据
    /// * `downstream_tx`: 发给AppState的rx, 被command里面接收
    pub fn new(
        upstream_rx: flume::Receiver<Vec<u8>>,
        downstream_tx: flume::Sender<ResponseData>,
        record_tx: flume::Sender<ResponseData>,
        imu_calibration: Arc<StdMutex<crate::app_state::ImuCalibration>>,
        imu_latest_raw: Arc<StdMutex<Option<crate::app_state::ImuCalibration>>>,
    ) -> Self {
        let config = ProcessorPipelineConfig::load_from_default_paths();
        thread::Builder::new()
            .name("DataProcessorThread".into())
            .spawn(move || {
                let mut pipeline = ProcessorPipeline::new(config);

                loop {
                    match upstream_rx.recv() {
                        Ok(data) => {
                            if let Some(response_data) = pipeline.process_packet(
                                &data,
                                &imu_calibration,
                                &imu_latest_raw,
                            ) {
                                if let Err(e) = downstream_tx.send(response_data) {
                                    tracing::error!("Downstream channel send failed: {:?}", e);
                                }
                                if let Err(e) = record_tx.send(response_data) {
                                    tracing::error!("Recorder channel send failed: {:?}", e);
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("Upstream channel receive failed: {:?}", e);
                        }
                    }
                }
            })
            .unwrap_or_else(|e| panic!("error while creating data processor thread : {:?}", e));
        Processor {}
    }
}
