use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ZuptConfig {
    pub gyro_thresh: f64,
    pub accel_thresh: f64,
    pub bias_correction_gain: f64,
}

impl Default for ZuptConfig {
    fn default() -> Self {
        Self {
            gyro_thresh: 0.1,
            accel_thresh: 0.2,
            bias_correction_gain: 0.01,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ZuptObservation {
    pub is_static: bool,
}
