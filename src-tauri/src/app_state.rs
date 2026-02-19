//! 应用全局状态与资源管理。

use flume::Receiver;
use tokio::sync::{oneshot, Mutex, MutexGuard};

use crate::{
    imu::IMUClient,
    processor::{
        calibration::CorrectionRequest,
        pipeline::{PipelineConfigRequest, ProcessorPipelineConfig},
        Processor,
    },
    recorder::{spawn_recorder, RecorderCommand},
    types::outputs::ResponseData,
};

/// 姿态零位校准请求通道句柄。
pub struct CalibrationHandle {
    tx: flume::Sender<CorrectionRequest>,
}

const CALIBRATION_ERROR: &str = "Failed to update axis calibration";
const PIPELINE_CONFIG_ERROR: &str = "Failed to update pipeline config";
const PIPELINE_CONFIG_SAVE_ERROR: &str = "Failed to save pipeline config";

impl CalibrationHandle {
    /// 创建校准通道句柄与接收端。
    /// rx 交给processor用于接收请求。
    /// 这种设计模式用来在异步的通道中发送请求并等待响应
    pub fn new() -> (Self, flume::Receiver<CorrectionRequest>) {
        let (tx, rx) = flume::unbounded();
        (Self { tx }, rx)
    }

    /// 请求以当前姿态作为零位。
    pub async fn request_axis_calibration(&self) -> Result<(), &'static str> {
        // response tells the caller
        // 给 Processor 发一个请求， 等待其完成后返回结果
        let (respond_to, response_rx) = oneshot::channel();
        self.tx
            .send(CorrectionRequest::SetAxis { respond_to })
            .map_err(|_| CALIBRATION_ERROR)?;
        response_rx.await.map_err(|_| CALIBRATION_ERROR)?
    }

    /// 请求设置位置。
    pub async fn request_set_position(&self, x: f64, y: f64, z: f64) -> Result<(), &'static str> {
        let (respond_to, response_rx) = oneshot::channel();
        self.tx
            .send(CorrectionRequest::SetPosition {
                position: math_f64::DVec3::new(x, y, z),
                respond_to,
            })
            .map_err(|_| CALIBRATION_ERROR)?;
        response_rx.await.map_err(|_| CALIBRATION_ERROR)?
    }
}

/// Pipeline 配置请求通道句柄。
pub struct PipelineConfigHandle {
    tx: flume::Sender<PipelineConfigRequest>,
}

impl PipelineConfigHandle {
    /// 创建配置通道句柄与接收端。
    pub fn new() -> (Self, flume::Receiver<PipelineConfigRequest>) {
        let (tx, rx) = flume::unbounded();
        (Self { tx }, rx)
    }

    /// 获取当前生效配置。
    pub async fn get_config(&self) -> Result<ProcessorPipelineConfig, &'static str> {
        let (respond_to, response_rx) = oneshot::channel();
        self.tx
            .send(PipelineConfigRequest::Get { respond_to })
            .map_err(|_| PIPELINE_CONFIG_ERROR)?;
        response_rx.await.map_err(|_| PIPELINE_CONFIG_ERROR)
    }

    /// 更新并应用配置。
    pub async fn update_config(&self, config: ProcessorPipelineConfig) -> Result<(), &'static str> {
        let (respond_to, response_rx) = oneshot::channel();
        self.tx
            .send(PipelineConfigRequest::Update { config, respond_to })
            .map_err(|_| PIPELINE_CONFIG_ERROR)?;
        response_rx.await.map_err(|_| PIPELINE_CONFIG_ERROR)?
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

    /// Pipeline 配置控制句柄。
    pub pipeline_config_handle: PipelineConfigHandle,
}

impl AppState {
    /// 蓝牙数据包 -.-> |btleplug| imu_client
    /// imu_client -.-> |flume::bounded| processor
    /// processor -.-> |flume::bounded| sub
    /// sub -.-> |tauri ipc channel| front end
    /// 创建应用状态。
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let (upstream_tx, upstream_rx) = flume::bounded(256);
        let (downstream_tx, downstream_rx) = flume::bounded(256);
        let (record_tx, record_rx) = flume::bounded(2048);
        let (recorder_tx, recorder_rx) = flume::unbounded();
        spawn_recorder(record_rx, recorder_rx);
        let (calibration_handle, calibration_rx) = CalibrationHandle::new();
        let (pipeline_config_handle, pipeline_config_rx) = PipelineConfigHandle::new();
        AppState {
            imu_client: Mutex::new(IMUClient::new(upstream_tx)),
            processor: Processor::new(
                upstream_rx,
                downstream_tx,
                record_tx,
                calibration_rx,
                pipeline_config_rx,
                app_handle,
            ),
            downstream_rx,
            recorder_tx,
            calibration_handle,
            pipeline_config_handle,
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

    /// 请求设置位置。
    pub async fn request_set_position(&self, x: f64, y: f64, z: f64) -> Result<(), &'static str> {
        self.calibration_handle.request_set_position(x, y, z).await
    }

    /// 获取当前生效的 Pipeline 配置。
    pub async fn get_pipeline_config(&self) -> Result<ProcessorPipelineConfig, &'static str> {
        self.pipeline_config_handle.get_config().await
    }

    /// 更新 Pipeline 配置并立即生效。
    pub async fn update_pipeline_config(
        &self,
        config: ProcessorPipelineConfig,
    ) -> Result<(), &'static str> {
        self.pipeline_config_handle.update_config(config).await
    }

    /// 持久化当前生效的 Pipeline 配置到 processor.toml。
    pub async fn save_pipeline_config_to_file(&self) -> Result<(), &'static str> {
        let config = self.get_pipeline_config().await?;
        let content =
            toml::to_string_pretty(&config).map_err(|_| PIPELINE_CONFIG_SAVE_ERROR)?;
        let path = ProcessorPipelineConfig::default_config_path();
        std::fs::write(path, content).map_err(|_| PIPELINE_CONFIG_SAVE_ERROR)?;
        Ok(())
    }
}
