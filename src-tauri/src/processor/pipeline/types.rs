//! 处理管线配置类型。

use serde::Deserialize;

use crate::processor::attitude_fusion::AttitudeFusionConfig;
use crate::processor::calibration::ImuCalibrationConfig;
use crate::processor::ekf::EkfConfig;
use crate::processor::filter::LowPassFilterConfig;
use crate::processor::strapdown::StrapdownConfig;
use crate::processor::zupt::ZuptConfig;

#[derive(Debug, Clone, Deserialize)]
/// 处理管线配置。
pub struct ProcessorPipelineConfig {
    /// 标定配置。
    pub calibration: ImuCalibrationConfig,
    /// 滤波配置。
    pub filter: LowPassFilterConfig,
    /// 姿态融合配置。
    pub attitude_fusion: AttitudeFusionConfig,
    /// 捷联惯导配置。
    pub strapdown: StrapdownConfig,
    /// ZUPT 配置。
    pub zupt: ZuptConfig,
    /// EKF 配置。
    pub ekf: EkfConfig,
}

impl Default for ProcessorPipelineConfig {
    fn default() -> Self {
        Self {
            calibration: ImuCalibrationConfig::default(),
            filter: LowPassFilterConfig::default(),
            attitude_fusion: AttitudeFusionConfig::default(),
            strapdown: StrapdownConfig::default(),
            zupt: ZuptConfig::default(),
            ekf: EkfConfig::default(),
        }
    }
}
