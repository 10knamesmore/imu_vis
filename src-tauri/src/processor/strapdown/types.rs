use math_f64::{DQuat, DVec3};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct StrapdownConfig {
    pub gravity: f64,
}

impl Default for StrapdownConfig {
    fn default() -> Self {
        Self { gravity: 9.80665 }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NavState {
    pub timestamp_ms: u64,
    pub position: DVec3,
    pub velocity: DVec3,
    pub attitude: DQuat,
    pub bias_g: DVec3,
    pub bias_a: DVec3,
}
