//! EKF 相关类型。

use math_f64::DVec3;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// EKF 配置。
pub struct EkfConfig {
    /// 是否启用 EKF。
    pub enabled: bool,
}

impl Default for EkfConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

#[derive(Debug, Clone, Copy)]
/// 误差状态向量。
pub struct ErrorState {
    /// 位置误差。
    pub delta_p: DVec3,
    /// 速度误差。
    pub delta_v: DVec3,
    /// 姿态误差。
    pub delta_theta: DVec3,
    /// 陀螺仪偏置误差。
    pub delta_b_g: DVec3,
    /// 加速度计偏置误差。
    pub delta_b_a: DVec3,
}

#[derive(Debug, Clone, Copy)]
/// EKF 协方差状态。
pub struct EkfState {
    /// 协方差矩阵 P（15x15）。
    pub p: [[f64; 15]; 15],
}
