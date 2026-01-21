use serde::Deserialize;

use crate::processor::attitude_fusion::AttitudeFusionConfig;
use crate::processor::calibration::ImuCalibrationConfig;
use crate::processor::ekf::EkfConfig;
use crate::processor::filter::LowPassFilterConfig;
use crate::processor::strapdown::StrapdownConfig;
use crate::processor::zupt::ZuptConfig;

#[derive(Debug, Clone, Deserialize)]
pub struct ProcessorPipelineConfig {
    pub calibration: ImuCalibrationConfig,
    pub filter: LowPassFilterConfig,
    pub attitude_fusion: AttitudeFusionConfig,
    pub strapdown: StrapdownConfig,
    pub zupt: ZuptConfig,
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
