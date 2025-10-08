use std::thread;

use flume::{Receiver, Sender};

pub use crate::processor::parser::IMUData;

mod parser;

#[allow(unused)]
pub struct Processor;

impl Processor {
    /// 数据处理器实例
    /// 数据为时序,无法并行, 单计算线程处理
    ///
    /// * `upstream_rx`: 接收来自imu_client的原始蓝牙二进制数据
    /// * `downstream_tx`: 发给AppState的rx, 被command里面接收
    pub fn new(upstream_rx: Receiver<Vec<u8>>, downstream_tx: Sender<IMUData>) -> Self {
        // 引入计数器和计时器
        thread::spawn(move || loop {
            match upstream_rx.recv() {
                Ok(data) => {
                    // TODO: 数据包第一字节 0x02 - 0x51结果可能都不同, 需要dispatch
                    let imu_data = match parser::IMUParser::parse_imu(&data) {
                        Ok(data) => data,
                        Err(e) => {
                            eprintln!("{e}");
                            continue;
                            // return;
                        }
                    };

                    match downstream_tx.send(imu_data) {
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("{}", e);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error receiving: {}", e);
                    // break;
                }
            }
        });
        Processor {}
    }
}
