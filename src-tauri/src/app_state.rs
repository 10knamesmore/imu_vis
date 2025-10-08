use flume::Receiver;
use tokio::sync::{Mutex, MutexGuard};

use crate::{
    imu::IMUClient,
    processor::{IMUData, Processor},
};

/// 应用状态
///
/// * `imu_client`: 与IMU连接相关的客户端 上游
/// * `processor`: 数据处理器
/// * `downstream_rx`: 交给tauri command用来收数据的通道
pub struct AppState {
    imu_client: Mutex<IMUClient>,

    #[allow(unused)]
    processor: Processor,

    pub downstream_rx: Receiver<IMUData>,
}

impl AppState {
    /// 蓝牙数据包 -.-> |btleplug| imu_client
    /// imu_client -.-> |flume::bounded| processor
    /// processor -.-> |flume::bounded| sub
    /// sub -.-> |tauri ipc channel| front end
    pub fn new() -> Self {
        let (upstream_tx, upstream_rx) = flume::bounded(256);
        let (downstream_tx, downstream_rx) = flume::bounded(256);
        AppState {
            imu_client: Mutex::new(IMUClient::new(upstream_tx)),
            processor: Processor::new(upstream_rx, downstream_tx),
            downstream_rx,
        }
    }

    pub async fn client(&self) -> MutexGuard<'_, IMUClient> {
        self.imu_client.lock().await
    }
}
