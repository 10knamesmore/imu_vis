//! 应用全局状态与资源管理。

use std::sync::{Arc, Mutex as StdMutex};

use flume::Receiver;
use tokio::sync::{Mutex, MutexGuard};

use crate::{
    imu::IMUClient,
    processor::Processor,
    recorder::{spawn_recorder, RecorderCommand},
    types::outputs::ResponseData,
};
use math_f64::{DQuat, DVec3};

#[derive(Debug, Clone, Copy)]
/// IMU 姿态矫正数据：记录角度偏移与四元数偏移。
/// TODO: 这里的逻辑移动到 processor/calibration 里
pub struct ImuCalibration {
    /// 欧拉角偏移（用于直接减去，令当前角度归零）
    pub angle_offset: DVec3,
    /// 四元数偏移（用于姿态归零：实际使用其逆来校正）
    pub quat_offset: DQuat,
}

impl Default for ImuCalibration {
    fn default() -> Self {
        Self {
            angle_offset: DVec3::ZERO,
            quat_offset: DQuat::IDENTITY,
        }
    }
}

/// 应用状态。
///
/// * `imu_client`: 与IMU连接相关的客户端 上游
/// * `processor`: 数据处理器
/// * `downstream_rx`: 交给tauri command用来收数据的通道
pub struct AppState {
    imu_client: Mutex<IMUClient>,

    #[allow(unused)]
    processor: Processor,

    /// 下游订阅通道。
    pub downstream_rx: Receiver<ResponseData>,

    /// 录制控制通道。
    pub recorder_tx: flume::Sender<RecorderCommand>,

    /// 当前生效的姿态矫正值（由前端触发“校准”更新）
    pub imu_calibration: Arc<StdMutex<ImuCalibration>>,
    /// 最新原始姿态快照（未矫正），用于后端在校准时取“当前姿态”
    pub imu_latest_raw: Arc<StdMutex<Option<ImuCalibration>>>,
}

impl AppState {
    /// 蓝牙数据包 -.-> |btleplug| imu_client
    /// imu_client -.-> |flume::bounded| processor
    /// processor -.-> |flume::bounded| sub
    /// sub -.-> |tauri ipc channel| front end
    /// 创建应用状态。
    pub fn new() -> Self {
        let (upstream_tx, upstream_rx) = flume::bounded(256);
        let (downstream_tx, downstream_rx) = flume::bounded(256);
        let (record_tx, record_rx) = flume::bounded(2048);
        let (recorder_tx, recorder_rx) = flume::unbounded();
        spawn_recorder(record_rx, recorder_rx);
        let imu_calibration = Arc::new(StdMutex::new(ImuCalibration::default()));
        let imu_latest_raw = Arc::new(StdMutex::new(None));
        AppState {
            imu_client: Mutex::new(IMUClient::new(upstream_tx)),
            processor: Processor::new(
                upstream_rx,
                downstream_tx,
                record_tx,
                imu_calibration.clone(),
                imu_latest_raw.clone(),
            ),
            downstream_rx,
            recorder_tx,
            imu_calibration,
            imu_latest_raw,
        }
    }

    /// 获取 IMU 客户端引用。
    pub async fn client(&self) -> MutexGuard<'_, IMUClient> {
        self.imu_client.lock().await
    }
}
