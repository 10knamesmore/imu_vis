use math_f64::{DQuat, DVec3};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct AttitudeFusionConfig {
    pub beta: f64,
}

impl Default for AttitudeFusionConfig {
    fn default() -> Self {
        Self { beta: 0.02 }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AttitudeEstimate {
    pub timestamp_ms: u64,
    pub quat: DQuat,
    pub euler: DVec3,
}
