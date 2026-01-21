use std::{
    sync::{Arc, Mutex as StdMutex},
    thread,
};

use crate::processor::pipeline::{ProcessorPipeline, ProcessorPipelineConfig};
use crate::types::outputs::ResponseData;

pub mod attitude_fusion;
pub mod calibration;
pub mod ekf;
pub mod filter;
pub mod output;
pub mod parser;
pub mod pipeline;
pub mod shared;
pub mod strapdown;
pub mod zupt;

pub use output::CalculatedData;

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
