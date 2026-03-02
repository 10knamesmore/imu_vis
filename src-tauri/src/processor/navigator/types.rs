//! 导航融合相关类型。

use math_f64::{DQuat, DVec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
/// 轨迹积分实现。
pub enum IntegratorImpl {
    /// 一阶欧拉积分（旧实现）。
    LegacyEuler,
    /// 梯形积分（新实现，默认）。
    #[default]
    Trapezoid,
    /// 四阶 Runge-Kutta（RK4）积分。
    Rk4,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(default)]
/// 轨迹积分配置。
pub struct TrajectoryConfig {
    /// 是否跳过轨迹积分处理。
    pub passby: bool,
    /// 积分算法实现。
    #[serde(default)]
    pub integrator: IntegratorImpl,
    /// 最小积分步长（毫秒）。
    pub dt_min_ms: u64,
    /// 最大积分步长（毫秒）。
    pub dt_max_ms: u64,
}

impl Default for TrajectoryConfig {
    fn default() -> Self {
        Self {
            passby: false,
            integrator: IntegratorImpl::default(),
            dt_min_ms: 1,
            dt_max_ms: 50,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
/// ZUPT 约束实现。
pub enum ZuptImpl {
    /// 硬清零+硬锁定（旧实现）。
    LegacyHardLock,
    /// 滞回检测+平滑收敛（新实现，默认）。
    #[default]
    SmoothHysteresis,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(default)]
/// ZUPT 约束配置。
pub struct ZuptConfig {
    /// 是否跳过 ZUPT 处理。
    pub passby: bool,
    /// ZUPT 算法实现。
    #[serde(default)]
    pub impl_type: ZuptImpl,
    /// 角速度阈值（rad/s）。
    pub gyro_thresh: f64,
    /// 线加速度阈值（m/s^2）。
    pub accel_thresh: f64,
    /// 进入静止的角速度阈值（rad/s）。
    pub gyro_enter_thresh: f64,
    /// 进入静止的线加速度阈值（m/s²）。
    pub accel_enter_thresh: f64,
    /// 退出静止的角速度阈值（rad/s）。
    pub gyro_exit_thresh: f64,
    /// 退出静止的线加速度阈值（m/s²）。
    pub accel_exit_thresh: f64,
    /// 进入静止的连续帧数。
    pub enter_frames: u32,
    /// 退出静止的连续帧数。
    pub exit_frames: u32,
    /// 速度衰减时间常数（毫秒）。
    pub vel_decay_tau_ms: f64,
    /// 位置锁定时间常数（毫秒）。
    pub pos_lock_tau_ms: f64,
    /// 速度直接清零阈值（m/s）。
    pub vel_zero_eps: f64,
}

impl Default for ZuptConfig {
    fn default() -> Self {
        Self {
            passby: false,
            impl_type: ZuptImpl::default(),
            gyro_thresh: 0.1,
            accel_thresh: 0.2,
            gyro_enter_thresh: 0.15,
            accel_enter_thresh: 0.22,
            gyro_exit_thresh: 0.2,
            accel_exit_thresh: 0.3,
            enter_frames: 3,
            exit_frames: 3,
            vel_decay_tau_ms: 70.0,
            pos_lock_tau_ms: 110.0,
            vel_zero_eps: 0.03,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
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
