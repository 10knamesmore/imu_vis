//! 捷联惯导相关类型。

use math_f64::{DQuat, DVec3};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
/// 捷联惯导配置。
pub struct StrapdownConfig {
    /// 重力常量。
    pub gravity: f64,
}

impl Default for StrapdownConfig {
    fn default() -> Self {
        Self { gravity: 9.80665 }
    }
}

#[derive(Debug, Clone, Copy)]
/// 导航状态。
pub struct NavState {
    /// 时间戳（毫秒）。
    pub timestamp_ms: u64,
    /// 位置（世界系）。
    pub position: DVec3,
    /// 速度（世界系）。
    pub velocity: DVec3,
    /// 姿态四元数。
    pub attitude: DQuat,
    /// 陀螺仪偏置。
    pub bias_g: DVec3,
    /// 加速度计偏置。
    pub bias_a: DVec3,
}
