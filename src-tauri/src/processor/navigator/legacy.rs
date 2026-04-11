//! 传统导航融合实现（Legacy Navigator）。
//!
//! 这是原始的直接积分 + ZUPT 硬修正/平滑修正导航器实现。
//! 保留为独立模块以供对比测试和向后兼容，新代码应优先使用 ESKF 导航器。

use math_f64::{DQuat, DVec3};

use crate::processor::{
    filter::ImuSampleFiltered,
    navigator::types::{IntegratorImpl, NavState, NavigatorConfig, ZuptImpl},
};

/// 传统导航融合器（Legacy）。
///
/// 单模块维护同一份导航状态，按固定顺序执行：
/// 1) 预测（轨迹积分）
/// 2) 约束（ZUPT 静止修正）
/// 3) 提交（写回内部状态）
///
/// 此实现为原始版本，不包含卡尔曼滤波或偏差估计。
pub struct LegacyNavigator {
    config: NavigatorConfig,
    nav_state: NavState,
    gravity_ref: DVec3,
    last_timestamp_ms: Option<u64>,
    current_dt_s: f64,
    last_accel_lin: Option<DVec3>,
    last_is_static: Option<bool>,
    static_enter_count: u32,
    static_exit_count: u32,
    static_position: Option<DVec3>,
    /// 运动段起始时间戳（用于 backward correction）。
    swing_start_time: Option<u64>,
    /// 运动段起始位置（用于 backward correction）。
    swing_start_position: Option<DVec3>,
    /// gravity_ref 是否已被首帧 bootstrap 过。
    gravity_initialized: bool,
    /// gravity_ref 是否已经锁定（结束初始化窗口）。
    gravity_locked: bool,
    /// 初始化窗口内累计的帧数。
    gravity_init_total_frames: u32,
    /// 初始化窗口内低 gyro 帧的 `R(q)*a` 累加。
    gravity_init_sum: DVec3,
    /// 初始化窗口内低 gyro 帧数。
    gravity_init_static_frames: u32,

    // —— 诊断用字段（仅用于读取，不影响导航逻辑）——
    /// 最近一帧 ZUPT 检测的陀螺仪范数 (rad/s)。
    diag_gyro_norm: f64,
    /// 最近一帧 ZUPT 检测的线加速度范数 (m/s²)。
    diag_accel_norm: f64,
    /// 最近一帧的世界系线性加速度 (m/s²)。
    diag_linear_accel: DVec3,
    /// 本帧是否触发了后向修正。
    diag_backward_triggered: bool,
    /// 后向修正量 (m)。
    diag_backward_correction_mag: f64,
}

impl LegacyNavigator {
    /// 创建传统导航融合器。
    pub fn new(config: NavigatorConfig) -> Self {
        let gravity = config.gravity;
        Self {
            config,
            nav_state: NavState {
                timestamp_ms: 0,
                position: DVec3::ZERO,
                velocity: DVec3::ZERO,
                attitude: DQuat::IDENTITY,
            },
            gravity_ref: DVec3::new(0.0, 0.0, gravity),
            last_timestamp_ms: None,
            current_dt_s: 0.0,
            last_accel_lin: None,
            last_is_static: None,
            static_enter_count: 0,
            static_exit_count: 0,
            static_position: None,
            swing_start_time: None,
            swing_start_position: None,
            gravity_initialized: false,
            gravity_locked: false,
            gravity_init_total_frames: 0,
            gravity_init_sum: DVec3::ZERO,
            gravity_init_static_frames: 0,
            diag_gyro_norm: 0.0,
            diag_accel_norm: 0.0,
            diag_linear_accel: DVec3::ZERO,
            diag_backward_triggered: false,
            diag_backward_correction_mag: 0.0,
        }
    }

    /// 返回当前是否处于 ZUPT 静止状态。
    pub fn is_static(&self) -> bool {
        self.last_is_static.unwrap_or(false)
    }

    /// 设置姿态零位校准后的重力参考向量。
    ///
    /// `quat_offset` 为姿态零位校准使用的左乘四元数，导航中应使用同一参考系
    /// 下的重力向量，避免静止时出现伪线加速度积分。
    pub fn set_gravity_reference(&mut self, quat_offset: DQuat) {
        let gravity_world = DVec3::new(0.0, 0.0, self.config.gravity);
        self.gravity_ref = quat_offset.rotate_vec3(gravity_world);
        // 手动校准立即锁定 gravity_ref，绕过初始化窗口的自动 refine。
        self.gravity_initialized = true;
        self.gravity_locked = true;
        tracing::info!(
            "重力参考更新 | g_ref=[{:.3}, {:.3}, {:.3}]",
            self.gravity_ref.x,
            self.gravity_ref.y,
            self.gravity_ref.z
        );
    }

    /// 更新一帧导航状态。
    pub fn update(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) -> NavState {
        // 每帧重置事件标记
        self.diag_backward_triggered = false;
        self.diag_backward_correction_mag = 0.0;

        // gravity_ref 三种初始化策略，逻辑与 EskfNavigator 一致。
        // 见 eskf/mod.rs 的详细注释。
        if !self.gravity_locked {
            let g_now = attitude.rotate_vec3(sample.accel_lp);
            let g_mag_err = (g_now.length() - self.config.gravity).abs();
            let gyro_norm_init = sample.gyro_lp.length();
            const CLEAN_G_MAG_THRESH: f64 = 0.15;
            const CLEAN_GYRO_THRESH: f64 = 0.15;
            const INIT_WINDOW_FRAMES: u32 = 100;
            let is_clean = g_mag_err < CLEAN_G_MAG_THRESH && gyro_norm_init < CLEAN_GYRO_THRESH;

            if !self.gravity_initialized {
                self.gravity_ref = g_now;
                self.gravity_initialized = true;
                if is_clean {
                    self.gravity_locked = true;
                    tracing::info!(
                        "Legacy gravity_ref 首帧干净，立即锁定 | g=[{:.3},{:.3},{:.3}] |g|={:.3}",
                        g_now.x, g_now.y, g_now.z, g_now.length()
                    );
                }
            } else {
                if is_clean {
                    self.gravity_init_sum += g_now;
                    self.gravity_init_static_frames += 1;
                }
                self.gravity_init_total_frames += 1;
                if self.gravity_init_total_frames >= INIT_WINDOW_FRAMES {
                    if self.gravity_init_static_frames >= 10 {
                        let refined = self.gravity_init_sum
                            / self.gravity_init_static_frames as f64;
                        tracing::info!(
                            "Legacy gravity_ref refined | bootstrap=[{:.3},{:.3},{:.3}] → refined=[{:.3},{:.3},{:.3}] ({}干净/{}总帧)",
                            self.gravity_ref.x, self.gravity_ref.y, self.gravity_ref.z,
                            refined.x, refined.y, refined.z,
                            self.gravity_init_static_frames,
                            self.gravity_init_total_frames,
                        );
                        self.gravity_ref = refined;
                    }
                    self.gravity_locked = true;
                }
            }
        }

        self.predict(attitude, sample);
        self.apply_zupt(sample);
        self.nav_state
    }

    // —— 诊断访问器 ——

    /// 最近一帧 ZUPT 检测的陀螺仪范数 (rad/s)。
    pub fn zupt_gyro_norm(&self) -> f64 {
        self.diag_gyro_norm
    }

    /// 最近一帧 ZUPT 检测的线加速度范数 (m/s²)。
    pub fn zupt_accel_norm(&self) -> f64 {
        self.diag_accel_norm
    }

    /// 迟滞进入计数器。
    pub fn zupt_enter_count(&self) -> u32 {
        self.static_enter_count
    }

    /// 迟滞退出计数器。
    pub fn zupt_exit_count(&self) -> u32 {
        self.static_exit_count
    }

    /// 当前积分步长 (s)。
    pub fn current_dt(&self) -> f64 {
        self.current_dt_s
    }

    /// 最近一帧世界系线性加速度 (m/s²)。
    pub fn last_linear_accel(&self) -> DVec3 {
        self.diag_linear_accel
    }

    /// 本帧是否触发了后向修正。
    pub fn backward_triggered(&self) -> bool {
        self.diag_backward_triggered
    }

    /// 后向修正量 (m)。
    pub fn backward_correction_mag(&self) -> f64 {
        self.diag_backward_correction_mag
    }

    /// 手动设置位置（用于校正）。
    pub fn set_position(&mut self, position: DVec3) {
        tracing::info!(
            "位置手动校正 | old=[{:.3}, {:.3}, {:.3}] | new=[{:.3}, {:.3}, {:.3}]",
            self.nav_state.position.x,
            self.nav_state.position.y,
            self.nav_state.position.z,
            position.x,
            position.y,
            position.z
        );
        self.nav_state.position = position;
        // 坐标校正后清零速度，避免残余速度导致下一帧继续积分偏移。
        self.nav_state.velocity = DVec3::ZERO;
        // 若当前处于静止锁定，需同步锁定点，否则会被旧锁定点覆盖回去。
        if self.last_is_static == Some(true) {
            self.static_position = Some(position);
        }
    }

    /// 重置内部状态。
    pub fn reset(&mut self) {
        self.nav_state = NavState {
            timestamp_ms: 0,
            position: DVec3::ZERO,
            velocity: DVec3::ZERO,
            attitude: DQuat::IDENTITY,
        };
        self.gravity_ref = DVec3::new(0.0, 0.0, self.config.gravity);
        self.gravity_initialized = false;
        self.gravity_locked = false;
        self.gravity_init_total_frames = 0;
        self.gravity_init_sum = DVec3::ZERO;
        self.gravity_init_static_frames = 0;
        self.last_timestamp_ms = None;
        self.current_dt_s = 0.0;
        self.last_accel_lin = None;
        self.last_is_static = None;
        self.static_enter_count = 0;
        self.static_exit_count = 0;
        self.static_position = None;
        self.swing_start_time = None;
        self.swing_start_position = None;
        self.diag_gyro_norm = 0.0;
        self.diag_accel_norm = 0.0;
        self.diag_linear_accel = DVec3::ZERO;
        self.diag_backward_triggered = false;
        self.diag_backward_correction_mag = 0.0;
    }

    fn predict(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) {
        self.nav_state.attitude = attitude;
        self.nav_state.timestamp_ms = sample.timestamp_ms;

        if self.config.trajectory.passby {
            return;
        }

        let dt = self
            .last_timestamp_ms
            .map(|ts| clamp_dt_s(sample.timestamp_ms.saturating_sub(ts), self.config.trajectory.dt_min_ms, self.config.trajectory.dt_max_ms))
            .unwrap_or(0.0);
        self.current_dt_s = dt;
        self.last_timestamp_ms = Some(sample.timestamp_ms);

        let a_world = attitude.rotate_vec3(sample.accel_lp);
        let mut a_lin = a_world - self.gravity_ref;
        self.diag_linear_accel = a_lin;

        // 加速度幅值钳位：防止传感器饱和尖峰被积分
        let clamp = self.config.trajectory.accel_clamp_ms2;
        if clamp > 0.0 {
            let mag = a_lin.length();
            if mag > clamp {
                a_lin *= clamp / mag;
            }
        }

        if dt <= 0.0 {
            self.last_accel_lin = Some(a_lin);
            return;
        }

        match self.config.trajectory.integrator {
            IntegratorImpl::LegacyEuler => {
                self.nav_state.velocity += a_lin * dt;
                self.nav_state.position += self.nav_state.velocity * dt;
            }
            IntegratorImpl::Trapezoid => {
                let v_prev = self.nav_state.velocity;
                let a_prev = self.last_accel_lin.unwrap_or(a_lin);
                let v_next = v_prev + (a_prev + a_lin) * (0.5 * dt);
                self.nav_state.velocity = v_next;
                self.nav_state.position += (v_prev + v_next) * (0.5 * dt);
            }
            IntegratorImpl::Rk4 => {
                // 对状态 x=[p,v] 做 RK4：
                //   dp/dt = v
                //   dv/dt = a(t)
                // 其中 a(t) 由 a_prev -> a_lin 做线性插值，避免退化为仅对 v 的梯形更新。
                let v_prev = self.nav_state.velocity;
                let a_prev = self.last_accel_lin.unwrap_or(a_lin);
                let accel_at = |alpha: f64| a_prev + (a_lin - a_prev) * alpha;

                let p0 = self.nav_state.position;
                let v0 = v_prev;

                let k1_p = v0;
                let k1_v = accel_at(0.0);

                let v2 = v0 + k1_v * (0.5 * dt);
                let k2_p = v2;
                let k2_v = accel_at(0.5);

                let v3 = v0 + k2_v * (0.5 * dt);
                let k3_p = v3;
                let k3_v = accel_at(0.5);

                let v4 = v0 + k3_v * dt;
                let k4_p = v4;
                let k4_v = accel_at(1.0);

                self.nav_state.position = p0 + (k1_p + k2_p * 2.0 + k3_p * 2.0 + k4_p) * (dt / 6.0);
                self.nav_state.velocity = v0 + (k1_v + k2_v * 2.0 + k3_v * 2.0 + k4_v) * (dt / 6.0);
            }
        }
        self.last_accel_lin = Some(a_lin);
    }

    fn apply_zupt(&mut self, sample: &ImuSampleFiltered) {
        if self.config.zupt.passby {
            return;
        }

        let gyro_norm = sample.gyro_lp.length();
        let accel_world = self.nav_state.attitude.rotate_vec3(sample.accel_lp);
        let accel_lin = accel_world - self.gravity_ref;
        let accel_norm = accel_lin.length();
        let dt = self.current_dt_s;

        // 保存诊断值
        self.diag_gyro_norm = gyro_norm;
        self.diag_accel_norm = accel_norm;

        match self.config.zupt.impl_type {
            ZuptImpl::LegacyHardLock => {
                let is_static =
                    gyro_norm < self.config.zupt.gyro_thresh && accel_norm < self.config.zupt.accel_thresh;
                self.apply_static_transition(is_static, gyro_norm, accel_norm);
                if is_static {
                    self.apply_hard_lock(accel_lin, sample.timestamp_ms);
                }
            }
            ZuptImpl::SmoothHysteresis => {
                let entering = gyro_norm < self.config.zupt.gyro_enter_thresh
                    && accel_norm < self.config.zupt.accel_enter_thresh;
                let exiting = gyro_norm > self.config.zupt.gyro_exit_thresh
                    || accel_norm > self.config.zupt.accel_exit_thresh;

                let prev_is_static = self.last_is_static.unwrap_or(false);
                let mut is_static = prev_is_static;
                if prev_is_static {
                    if exiting {
                        self.static_exit_count = self.static_exit_count.saturating_add(1);
                    } else {
                        self.static_exit_count = 0;
                    }
                    if self.static_exit_count >= self.config.zupt.exit_frames.max(1) {
                        is_static = false;
                        self.static_exit_count = 0;
                    }
                } else {
                    if entering {
                        self.static_enter_count = self.static_enter_count.saturating_add(1);
                    } else {
                        self.static_enter_count = 0;
                    }
                    if self.static_enter_count >= self.config.zupt.enter_frames.max(1) {
                        is_static = true;
                        self.static_enter_count = 0;
                    }
                }

                self.apply_static_transition(is_static, gyro_norm, accel_norm);
                if is_static {
                    self.apply_smooth_static(dt, accel_lin, sample.timestamp_ms);
                }
            }
        }
    }

    fn apply_static_transition(&mut self, is_static: bool, gyro_norm: f64, accel_norm: f64) {
        if self.last_is_static == Some(is_static) {
            return;
        }

        if is_static {
            // 运动→静止：执行 backward correction（回溯修正）
            if self.config.zupt.backward_correction {
                if let Some(start_time) = self.swing_start_time {
                    let swing_duration_s =
                        self.nav_state.timestamp_ms.saturating_sub(start_time) as f64 / 1000.0;
                    if swing_duration_s > 0.0 {
                        let v_residual = self.nav_state.velocity;
                        let pos_correction = v_residual * (swing_duration_s / 2.0);
                        self.nav_state.position -= pos_correction;
                        self.diag_backward_triggered = true;
                        self.diag_backward_correction_mag = pos_correction.length();
                        tracing::info!(
                            "ZUPT backward correction | swing={:.3}s | v_residual=[{:.3}, {:.3}, {:.3}] | pos_corr=[{:.4}, {:.4}, {:.4}]",
                            swing_duration_s,
                            v_residual.x, v_residual.y, v_residual.z,
                            pos_correction.x, pos_correction.y, pos_correction.z
                        );
                    }
                }
            }
            self.swing_start_time = None;
            self.swing_start_position = None;
            self.static_position = Some(self.nav_state.position);
            tracing::info!(
                "ZUPT: 进入静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s² | vel=[{:.3}, {:.3}, {:.3}]",
                gyro_norm,
                accel_norm,
                self.nav_state.velocity.x,
                self.nav_state.velocity.y,
                self.nav_state.velocity.z
            );
        } else {
            // 静止→运动：记录运动段起点
            self.swing_start_time = Some(self.nav_state.timestamp_ms);
            self.swing_start_position = Some(self.nav_state.position);
            self.static_position = None;
            tracing::info!(
                "ZUPT: 退出静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s²",
                gyro_norm,
                accel_norm
            );
        }
        self.last_is_static = Some(is_static);
    }

    fn apply_hard_lock(&mut self, accel_lin: DVec3, timestamp_ms: u64) {
        let vel_before = self.nav_state.velocity;
        let pos_before = self.nav_state.position;
        self.nav_state.velocity = DVec3::ZERO;
        if let Some(static_position) = self.static_position {
            self.nav_state.position = static_position;
        }

        if timestamp_ms % 1000 < 4 {
            tracing::info!(
                "ZUPT 硬修正 | vel_before=[{:.3}, {:.3}, {:.3}] → [0, 0, 0] | pos_before=[{:.3}, {:.3}, {:.3}] | pos_locked=[{:.3}, {:.3}, {:.3}] | a_lin=[{:.3}, {:.3}, {:.3}]",
                vel_before.x,
                vel_before.y,
                vel_before.z,
                pos_before.x,
                pos_before.y,
                pos_before.z,
                self.nav_state.position.x,
                self.nav_state.position.y,
                self.nav_state.position.z,
                accel_lin.x,
                accel_lin.y,
                accel_lin.z
            );
        }
    }

    fn apply_smooth_static(&mut self, dt: f64, accel_lin: DVec3, timestamp_ms: u64) {
        let vel_before = self.nav_state.velocity;
        let pos_before = self.nav_state.position;

        let tau_v_s = (self.config.zupt.vel_decay_tau_ms.max(1.0)) / 1000.0;
        let alpha_v = 1.0 - f64::exp(-dt / tau_v_s);
        self.nav_state.velocity *= 1.0 - alpha_v;
        if self.nav_state.velocity.length() < self.config.zupt.vel_zero_eps {
            self.nav_state.velocity = DVec3::ZERO;
        }

        if let Some(static_position) = self.static_position {
            let tau_p_s = (self.config.zupt.pos_lock_tau_ms.max(1.0)) / 1000.0;
            let alpha_p = 1.0 - f64::exp(-dt / tau_p_s);
            self.nav_state.position += (static_position - self.nav_state.position) * alpha_p;
        }

        if timestamp_ms % 1000 < 4 {
            tracing::info!(
                "ZUPT 平滑修正 | vel_before=[{:.3}, {:.3}, {:.3}] | vel_after=[{:.3}, {:.3}, {:.3}] | pos_before=[{:.3}, {:.3}, {:.3}] | pos_after=[{:.3}, {:.3}, {:.3}] | a_lin=[{:.3}, {:.3}, {:.3}]",
                vel_before.x,
                vel_before.y,
                vel_before.z,
                self.nav_state.velocity.x,
                self.nav_state.velocity.y,
                self.nav_state.velocity.z,
                pos_before.x,
                pos_before.y,
                pos_before.z,
                self.nav_state.position.x,
                self.nav_state.position.y,
                self.nav_state.position.z,
                accel_lin.x,
                accel_lin.y,
                accel_lin.z
            );
        }
    }
}

/// 将毫秒间隔钳位到 `[dt_min_ms, dt_max_ms]` 范围并转换为秒。
fn clamp_dt_s(delta_ms: u64, dt_min_ms: u64, dt_max_ms: u64) -> f64 {
    let lower = dt_min_ms.max(1);
    let upper = dt_max_ms.max(lower);
    let clamped = delta_ms.clamp(lower, upper);
    clamped as f64 / 1000.0
}
