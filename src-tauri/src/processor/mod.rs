use std::thread;

use math_f64::DQuat;
use serde::Serialize;

use crate::{processor::parser::data::IMUParser, processor::state::State, types::outputs::ResponseData};

pub mod parser;
mod state;

pub use state::{attitude::Attitude, position::Position, velocity::Velocity};

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
    ) -> Self {
        thread::Builder::new()
            .name("DataProcessorThread".into())
            .spawn(move || {
                // TODO: MOCK
                let mut state = State::new(DQuat::IDENTITY, 0);

                loop {
                    match upstream_rx.recv() {
                        Ok(data) => {
                            // TODO: 数据包第一字节 0x02 - 0x51结果可能都不同, 需要dispatch
                            let imu_data = match IMUParser::parse(&data) {
                                Ok(data) => data,
                                Err(e) => {
                                    eprintln!("{e}");
                                    continue;
                                    // return;
                                }
                            };
                            state.update(&imu_data);

                            let response_data = ResponseData::from_parts(
                                &imu_data,
                                &CalculatedData::from_state(&state),
                            );

                            if let Err(e) = downstream_tx.send(response_data) {
                                eprintln!("{}", e);
                            }
                            if let Err(e) = record_tx.send(response_data) {
                                eprintln!("Recorder channel send failed: {}", e);
                            }
                        }
                        Err(e) => {
                            eprintln!("Error receiving: {}", e);
                            // break;
                        }
                    }
                }
            })
            .unwrap_or_else(|e| panic!("error while creating data processor thread : {}", e));
        Processor {}
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CalculatedData {
    pub attitude: Attitude,
    pub velocity: Velocity,
    pub position: Position,
    pub timestamp_ms: u64,
}

impl CalculatedData {
    pub fn from_state(state: &State) -> Self {
        CalculatedData {
            attitude: state.attitude,
            velocity: state.velocity,
            position: state.position,
            timestamp_ms: state.timestamp_ms,
        }
    }
}
