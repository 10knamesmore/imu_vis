//! 滤波相关类型。

use math_f64::DVec3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
/// 低通滤波配置。
pub struct LowPassFilterConfig {
    /// 是否跳过滤波处理。
    pub passby: bool,
    /// 滤波系数，越大越平滑。
    pub alpha: f64,
}

impl Default for LowPassFilterConfig {
    fn default() -> Self {
        Self {
            passby: false,
            alpha: 0.9,
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// 低通滤波后的 IMU 样本。
pub struct ImuSampleFiltered {
    /// 时间戳（毫秒）。
    pub timestamp_ms: u64,
    /// 低通滤波后的加速度。
    pub accel_lp: DVec3,
    /// 低通滤波后的角速度。
    pub gyro_lp: DVec3,
}
