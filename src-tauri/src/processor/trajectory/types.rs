//! 轨迹计算相关类型。

use math_f64::{DQuat, DVec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Default)]
/// 轨迹计算配置。
pub struct TrajectoryConfig {
    /// 是否跳过轨迹计算。
    pub passby: bool,
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
}
