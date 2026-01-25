//! 姿态融合相关类型。

use math_f64::DQuat;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// 姿态融合配置。
pub struct AttitudeFusionConfig {
    /// 是否跳过姿态融合处理。
    pub passby: bool,
    /// 融合权重（互补滤波比例）。
    pub beta: f64,
}

impl Default for AttitudeFusionConfig {
    fn default() -> Self {
        Self {
            passby: false,
            beta: 0.02,
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// 姿态估计结果。
pub struct AttitudeEstimate {
    /// 姿态四元数。
    pub quat: DQuat,
}
