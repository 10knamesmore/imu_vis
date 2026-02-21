//! 导航融合相关类型。

use math_f64::{DQuat, DVec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Default)]
/// 轨迹积分配置。
pub struct TrajectoryConfig {
    /// 是否跳过轨迹积分处理。
    pub passby: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
/// ZUPT 约束配置。
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

#[derive(Debug, Clone, Copy)]
/// 导航融合配置。
pub struct NavigatorConfig {
    /// 轨迹积分配置。
    pub trajectory: TrajectoryConfig,
    /// ZUPT 约束配置。
    pub zupt: ZuptConfig,
    /// 重力加速度（m/s²）。
    pub gravity: f64,
}
