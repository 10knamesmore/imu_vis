use math_f64::DVec3;

use crate::processor::filter::ImuSampleFiltered;
use crate::processor::strapdown::NavState;
use crate::processor::zupt::types::{ZuptConfig, ZuptObservation};

pub struct ZuptDetector {
    config: ZuptConfig,
    last_is_static: Option<bool>,
}

impl ZuptDetector {
    pub fn new(config: ZuptConfig) -> Self {
        Self {
            config,
            last_is_static: None,
        }
    }

    pub fn apply(&mut self, mut nav: NavState, sample: &ImuSampleFiltered) -> (NavState, ZuptObservation) {
        let gyro_norm = sample.gyro_lp.length();
        let g_world = DVec3::new(0.0, 0.0, -1.0);
        let accel_world = nav.attitude.rotate_vec3(sample.accel_lp);
        let accel_lin = accel_world - g_world * 9.80665;
        let accel_norm = accel_lin.length();

        let is_static = gyro_norm < self.config.gyro_thresh && accel_norm < self.config.accel_thresh;

        if self.last_is_static != Some(is_static) {
            if is_static {
                tracing::info!("ZUPT: enter static state");
            } else {
                tracing::info!("ZUPT: exit static state");
            }
            self.last_is_static = Some(is_static);
        }

        if is_static {
            nav.velocity = DVec3::ZERO;
            nav.bias_a = nav.bias_a + accel_lin * self.config.bias_correction_gain;
        }

        (
            nav,
            ZuptObservation {
                is_static,
            },
        )
    }
}
