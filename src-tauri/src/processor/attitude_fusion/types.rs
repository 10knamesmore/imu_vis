//! 姿态融合相关类型。

use math_f64::{DQuat, DVec3};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// 姿态融合配置。
pub struct AttitudeFusionConfig {
    /// 融合权重（互补滤波比例）。
    pub beta: f64,
}

impl Default for AttitudeFusionConfig {
    fn default() -> Self {
        Self { beta: 0.02 }
    }
}

#[derive(Debug, Clone, Copy)]
/// 姿态估计结果。
pub struct AttitudeEstimate {
    /// 时间戳（毫秒）。
    pub timestamp_ms: u64,
    /// 姿态四元数。
    pub quat: DQuat,
    /// 欧拉角（可选填充）。
    pub euler: DVec3,
}
