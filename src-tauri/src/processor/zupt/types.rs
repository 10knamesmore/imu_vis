//! ZUPT 相关类型。

use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// ZUPT 配置参数。
pub struct ZuptConfig {
    /// 是否跳过 ZUPT 处理。
    pub passby: bool,
    /// 角速度阈值（rad/s）。
    pub gyro_thresh: f64,
    /// 线加速度阈值（m/s^2）。
    pub accel_thresh: f64,
    /// 静止偏置回归增益。
    pub bias_correction_gain: f64,
}

impl Default for ZuptConfig {
    fn default() -> Self {
        Self {
            passby: false,
            gyro_thresh: 0.1,
            accel_thresh: 0.2,
            bias_correction_gain: 0.01,
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// ZUPT 观测结果。
pub struct ZuptObservation {
    /// 是否静止。
    pub is_static: bool,
}
