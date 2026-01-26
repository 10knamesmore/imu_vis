//! 处理管线配置类型。

use serde::Deserialize;

use crate::processor::attitude_fusion::AttitudeFusionConfig;
use crate::processor::calibration::ImuCalibrationConfig;
use crate::processor::ekf::EkfConfig;
use crate::processor::filter::LowPassFilterConfig;
use crate::processor::trajectory::TrajectoryConfig;
use crate::processor::zupt::ZuptConfig;

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Deserialize, Default)]
/// 处理管线配置。
pub struct ProcessorPipelineConfig {
    /// 全局配置。
    pub global: GlobalConfig,
    /// 标定配置。
    pub calibration: ImuCalibrationConfig,
    /// 滤波配置。
    pub filter: LowPassFilterConfig,
    /// 姿态融合配置。
    pub attitude_fusion: AttitudeFusionConfig,
    /// 轨迹计算配置。
    pub trajectory: TrajectoryConfig,
    /// ZUPT 配置。
    pub zupt: ZuptConfig,
    /// EKF 配置。
    pub ekf: EkfConfig,
}
