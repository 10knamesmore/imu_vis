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
    /// 线加速度幅值钳位（m/s²），防止传感器饱和尖峰被积分。0 表示不钳位。
    #[serde(default)]
    pub accel_clamp_ms2: f64,
}

impl Default for TrajectoryConfig {
    fn default() -> Self {
        Self {
            passby: false,
            integrator: IntegratorImpl::default(),
            dt_min_ms: 1,
            dt_max_ms: 50,
            accel_clamp_ms2: 0.0,
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
    /// 是否启用运动→静止的回溯速度/位移修正。
    #[serde(default)]
    pub backward_correction: bool,
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
            backward_correction: false,
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

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
/// 导航器实现类型。
pub enum NavigatorImplType {
    /// 传统积分 + ZUPT 硬修正（原有实现）。
    #[default]
    Legacy,
    /// 15-state 误差状态卡尔曼滤波（Error-State Kalman Filter）。
    Eskf,
}

/// ESKF（误差状态卡尔曼滤波）噪声与初始化参数配置。
///
/// 这些参数控制 ESKF 对传感器噪声的建模和初始不确定性的设定。
/// 参数值越大，表示对该信号源越不信任，滤波器在观测更新时的修正量越大。
///
/// # 调参建议
///
/// - `gyro_noise` / `accel_noise`：由传感器 datasheet 的噪声谱密度决定，
///   典型 MEMS 陀螺 0.001–0.01 rad/s/√Hz，加速度计 0.01–0.1 m/s²/√Hz。
/// - `gyro_bias_walk` / `accel_bias_walk`：描述偏差随时间漂移的速率，
///   值越大允许偏差估计变化越快。
/// - `zupt_velocity_noise`：ZUPT 观测置信度，越小表示越信任「静止时速度为零」。
/// - `init_sigma_*`：初始不确定性，决定滤波器收敛速度。设太小会导致收敛慢，
///   设太大可能在初始阶段产生跳变。
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(default)]
pub struct EskfConfig {
    /// 陀螺仪噪声谱密度 (rad/s/√Hz)。
    /// 影响姿态误差协方差增长速率。典型值：0.001–0.01。
    pub gyro_noise: f64,
    /// 加速度计噪声谱密度 (m/s²/√Hz)。
    /// 影响速度误差协方差增长速率。典型值：0.01–0.1。
    pub accel_noise: f64,
    /// 位置过程噪声 (m/√Hz)。保持极小值，位置不直接受噪声驱动。
    pub pos_noise: f64,
    /// 陀螺仪偏差随机游走 (rad/s²/√Hz)。
    /// 描述陀螺零偏随时间漂移的速率。典型值：1e-5–1e-4。
    pub gyro_bias_walk: f64,
    /// 加速度计偏差随机游走 (m/s³/√Hz)。
    /// 描述加速度计零偏随时间漂移的速率。典型值：1e-4–1e-3。
    pub accel_bias_walk: f64,
    /// ZUPT 速度观测噪声标准差 (m/s)。
    /// 越小 → 越信任「静止时速度为零」→ 修正越激进。典型值：0.005–0.05。
    pub zupt_velocity_noise: f64,
    /// 初始姿态误差标准差 (rad)。板载四元数可信时可设小值。
    pub init_sigma_attitude: f64,
    /// 初始速度误差标准差 (m/s)。从静止启动时设小值。
    pub init_sigma_velocity: f64,
    /// 初始位置误差标准差 (m)。已知初始位置时设小值。
    pub init_sigma_position: f64,
    /// 初始陀螺偏差误差标准差 (rad/s)。
    pub init_sigma_gyro_bias: f64,
    /// 初始加速度计偏差误差标准差 (m/s²)。
    pub init_sigma_accel_bias: f64,
}

impl Default for EskfConfig {
    fn default() -> Self {
        Self {
            gyro_noise: 0.005,
            accel_noise: 0.05,
            pos_noise: 1e-6,
            gyro_bias_walk: 1e-5,
            accel_bias_walk: 1e-4,
            zupt_velocity_noise: 0.01,
            init_sigma_attitude: 0.01,
            init_sigma_velocity: 0.01,
            init_sigma_position: 0.001,
            init_sigma_gyro_bias: 0.01,
            init_sigma_accel_bias: 0.1,
        }
    }
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
    /// 导航器实现类型。
    pub navigator_impl: NavigatorImplType,
    /// ESKF 参数配置。
    pub eskf: EskfConfig,
}
