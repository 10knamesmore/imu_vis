//! 处理管线配置类型。

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use crate::processor::calibration::ImuCalibrationConfig;
use crate::processor::filter::LowPassFilterConfig;
use crate::processor::navigator::{TrajectoryConfig, ZuptConfig};

#[derive(Debug, Clone, Deserialize, Serialize)]
/// 全局配置参数。
pub struct GlobalConfig {
    /// 重力加速度常数（m/s²）。
    pub gravity: f64,
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self { gravity: 9.80665 }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
/// 处理管线配置。
pub struct ProcessorPipelineConfig {
    /// 全局配置。
    pub global: GlobalConfig,
    /// 标定配置。
    pub calibration: ImuCalibrationConfig,
    /// 滤波配置。
    pub filter: LowPassFilterConfig,
    /// 轨迹计算配置。
    pub trajectory: TrajectoryConfig,
    /// ZUPT 配置。
    pub zupt: ZuptConfig,
}

/// Pipeline 运行时配置请求。
pub enum PipelineConfigRequest {
    /// 获取当前生效配置。
    Get {
        /// 请求响应通道。
        respond_to: oneshot::Sender<ProcessorPipelineConfig>,
    },
    /// 更新并立即应用配置。
    Update {
        /// 新配置。
        config: Box<ProcessorPipelineConfig>,
        /// 请求响应通道。
        respond_to: oneshot::Sender<Result<(), &'static str>>,
    },
}
