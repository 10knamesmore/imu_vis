use math_f64::DVec3;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct LowPassFilterConfig {
    pub alpha: f64,
}

impl Default for LowPassFilterConfig {
    fn default() -> Self {
        Self { alpha: 0.9 }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ImuSampleFiltered {
    pub timestamp_ms: u64,
    pub accel_lp: DVec3,
    pub gyro_lp: DVec3,
}
