//! 标定相关类型。

use math_f64::DVec3;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// IMU 标定参数配置。
pub struct ImuCalibrationConfig {
    /// 是否跳过标定处理。
    pub passby: bool,
    /// 加速度计偏置。
    pub accel_bias: DVec3,
    /// 陀螺仪偏置。
    pub gyro_bias: DVec3,
    /// 加速度计标定矩阵。
    pub accel_matrix: [[f64; 3]; 3],
    /// 陀螺仪标定矩阵。
    pub gyro_matrix: [[f64; 3]; 3],
}

impl Default for ImuCalibrationConfig {
    fn default() -> Self {
        Self {
            passby: false,
            accel_bias: DVec3::ZERO,
            gyro_bias: DVec3::ZERO,
            accel_matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            gyro_matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// 标定运行时状态。
pub struct CalibrationState {
    /// 陀螺仪偏置。
    pub bias_g: DVec3,
    /// 加速度计偏置。
    pub bias_a: DVec3,
}

impl CalibrationState {
    /// 从配置初始化标定状态。
    pub fn new(config: &ImuCalibrationConfig) -> Self {
        Self {
            bias_g: config.gyro_bias,
            bias_a: config.accel_bias,
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// 标定后的 IMU 样本。
pub struct ImuSampleCalibrated {
    /// 时间戳（毫秒）。
    pub timestamp_ms: u64,
    /// 标定后的加速度。
    pub accel: DVec3,
    /// 标定后的角速度（rad/s）。
    pub gyro: DVec3,
    /// 使用的陀螺仪偏置。
    pub bias_g: DVec3,
    /// 使用的加速度计偏置。
    pub bias_a: DVec3,
}
