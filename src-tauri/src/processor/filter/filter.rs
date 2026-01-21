use math_f64::DVec3;

use crate::processor::calibration::ImuSampleCalibrated;
use crate::processor::filter::types::{ImuSampleFiltered, LowPassFilterConfig};

pub struct LowPassFilter {
    config: LowPassFilterConfig,
    prev_accel: Option<DVec3>,
    prev_gyro: Option<DVec3>,
}

impl LowPassFilter {
    pub fn new(config: LowPassFilterConfig) -> Self {
        Self {
            config,
            prev_accel: None,
            prev_gyro: None,
        }
    }

    pub fn apply(&mut self, sample: &ImuSampleCalibrated) -> ImuSampleFiltered {
        let alpha = self.config.alpha;
        let accel_lp = match self.prev_accel {
            Some(prev) => prev * alpha + sample.accel * (1.0 - alpha),
            None => sample.accel,
        };
        let gyro_lp = match self.prev_gyro {
            Some(prev) => prev * alpha + sample.gyro * (1.0 - alpha),
            None => sample.gyro,
        };

        self.prev_accel = Some(accel_lp);
        self.prev_gyro = Some(gyro_lp);

        ImuSampleFiltered {
            timestamp_ms: sample.timestamp_ms,
            accel_lp,
            gyro_lp,
        }
    }
}
