use math_f64::DVec3;

use crate::processor::{
    calibration::types::{CalibrationState, ImuCalibrationConfig, ImuSampleCalibrated},
    parser::ImuSampleRaw,
};

const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;

pub struct Calibration {
    config: ImuCalibrationConfig,
    state: CalibrationState,
}

impl Calibration {
    pub fn new(config: ImuCalibrationConfig) -> Self {
        let state = CalibrationState::new(&config);
        Self { config, state }
    }

    pub fn update(&mut self, raw: &ImuSampleRaw) -> ImuSampleCalibrated {
        // 先去偏置再做矩阵标定，并将角速度转为 rad/s
        let accel = apply_matrix(self.config.accel_matrix, raw.accel_with_g - self.state.bias_a);
        let gyro_rad = raw.gyro * DEG_TO_RAD;
        let gyro = apply_matrix(self.config.gyro_matrix, gyro_rad - self.state.bias_g);

        ImuSampleCalibrated {
            timestamp_ms: raw.timestamp_ms,
            accel,
            gyro,
            bias_g: self.state.bias_g,
            bias_a: self.state.bias_a,
        }
    }
}

fn apply_matrix(matrix: [[f64; 3]; 3], v: DVec3) -> DVec3 {
    // 3x3 矩阵乘向量
    let x = matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z;
    let y = matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z;
    let z = matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z;
    DVec3 { x, y, z }
}
