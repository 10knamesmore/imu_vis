//! ZUPT 相关类型。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
/// ZUPT 配置参数。
pub struct ZuptConfig {
    /// 是否跳过 ZUPT 处理。
    pub passby: bool,
    /// 角速度阈值（rad/s）。
    pub gyro_thresh: f64,
    /// 线加速度阈值（m/s^2）。
    pub accel_thresh: f64,
}

impl Default for ZuptConfig {
    fn default() -> Self {
        Self {
            passby: false,
            gyro_thresh: 0.1,
            accel_thresh: 0.2,
        }
    }
}
