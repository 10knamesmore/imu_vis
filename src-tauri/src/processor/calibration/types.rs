use math_f64::DVec3;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ImuCalibrationConfig {
    pub accel_bias: DVec3,
    pub gyro_bias: DVec3,
    pub accel_matrix: [[f64; 3]; 3],
    pub gyro_matrix: [[f64; 3]; 3],
}

impl Default for ImuCalibrationConfig {
    fn default() -> Self {
        Self {
            accel_bias: DVec3::ZERO,
            gyro_bias: DVec3::ZERO,
            accel_matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            gyro_matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CalibrationState {
    pub bias_g: DVec3,
    pub bias_a: DVec3,
}

impl CalibrationState {
    pub fn new(config: &ImuCalibrationConfig) -> Self {
        Self {
            bias_g: config.gyro_bias,
            bias_a: config.accel_bias,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ImuSampleCalibrated {
    pub timestamp_ms: u64,
    pub accel: DVec3,
    pub gyro: DVec3,
    pub bias_g: DVec3,
    pub bias_a: DVec3,
}
