pub mod mahony;
pub mod madgwick;
pub mod types;

use crate::processor::attitude_fusion::mahony::MahonyFusion;
use crate::processor::filter::ImuSampleFiltered;

pub struct AttitudeFusion {
    inner: MahonyFusion,
}

impl AttitudeFusion {
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            inner: MahonyFusion::new(config),
        }
    }

    pub fn update(&mut self, sample: &ImuSampleFiltered) -> AttitudeEstimate {
        self.inner.update(sample)
    }
}

pub use types::{AttitudeEstimate, AttitudeFusionConfig};
