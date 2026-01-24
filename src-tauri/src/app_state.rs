//! 应用全局状态与资源管理。

use flume::Receiver;
use tokio::sync::{oneshot, Mutex, MutexGuard};

use crate::{
    imu::IMUClient,
    processor::{calibration::AxisCalibrationRequest, Processor},
    recorder::{spawn_recorder, RecorderCommand},
    types::outputs::ResponseData,
};

/// 姿态零位校准请求通道句柄。
pub struct CalibrationHandle {
    tx: flume::Sender<AxisCalibrationRequest>,
}

const CALIBRATION_ERROR: &str = "Failed to update axis calibration";

impl CalibrationHandle {
    /// 创建校准通道句柄与接收端。
    /// rx 交给processor用于接收请求。
    pub fn new() -> (Self, flume::Receiver<AxisCalibrationRequest>) {
        let (tx, rx) = flume::unbounded();
        (Self { tx }, rx)
    }

    /// 请求以当前姿态作为零位。
    pub async fn request_axis_calibration(&self) -> Result<(), &'static str> {
        // response tells the caller
        // 给 Processor 发一个请求， 等待其完成后返回结果
        let (respond_to, response_rx) = oneshot::channel();
        self.tx
            .send(AxisCalibrationRequest::SetAxis { respond_to })
            .map_err(|_| CALIBRATION_ERROR)?;
        response_rx.await.map_err(|_| CALIBRATION_ERROR)?
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

    /// 姿态零位校准控制句柄。
    pub calibration_handle: CalibrationHandle,
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
        let (calibration_handle, calibration_rx) = CalibrationHandle::new();
        AppState {
            imu_client: Mutex::new(IMUClient::new(upstream_tx)),
            processor: Processor::new(upstream_rx, downstream_tx, record_tx, calibration_rx),
            downstream_rx,
            recorder_tx,
            calibration_handle,
        }
    }

    /// 获取 IMU 客户端引用。
    pub async fn client(&self) -> MutexGuard<'_, IMUClient> {
        self.imu_client.lock().await
    }

    /// 请求姿态零位校准。
    pub async fn request_axis_calibration(&self) -> Result<(), &'static str> {
        self.calibration_handle.request_axis_calibration().await
    }
}
