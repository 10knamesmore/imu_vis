use crate::processor::attitude_fusion::types::{AttitudeEstimate, AttitudeFusionConfig};
use crate::processor::filter::ImuSampleFiltered;
use math_f64::DQuat;

pub struct MadgwickFusion {
    #[allow(dead_code)]
    config: AttitudeFusionConfig,
    quat: DQuat,
}

impl MadgwickFusion {
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            config,
            quat: DQuat::IDENTITY,
        }
    }

    pub fn update(&mut self, sample: &ImuSampleFiltered) -> AttitudeEstimate {
        AttitudeEstimate {
            timestamp_ms: sample.timestamp_ms,
            quat: self.quat,
            euler: math_f64::DVec3::ZERO,
        }
    }
}
