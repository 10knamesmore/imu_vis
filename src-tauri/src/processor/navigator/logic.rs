//! 导航融合实现。

use math_f64::{DQuat, DVec3};

use crate::processor::{
    filter::ImuSampleFiltered,
    navigator::types::{IntegratorImpl, NavState, NavigatorConfig, ZuptImpl},
};

/// 导航融合器。
///
/// 单模块维护同一份导航状态，按固定顺序执行：
/// 1) 预测（轨迹积分）
/// 2) 约束（ZUPT 静止修正）
/// 3) 提交（写回内部状态）
pub struct Navigator {
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
}

impl Navigator {
    /// 创建导航融合器。
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
        }
    }

    /// 设置姿态零位校准后的重力参考向量。
    ///
    /// `quat_offset` 为姿态零位校准使用的左乘四元数，导航中应使用同一参考系
    /// 下的重力向量，避免静止时出现伪线加速度积分。
    pub fn set_gravity_reference(&mut self, quat_offset: DQuat) {
        let gravity_world = DVec3::new(0.0, 0.0, self.config.gravity);
        self.gravity_ref = quat_offset.rotate_vec3(gravity_world);
        tracing::info!(
            "重力参考更新 | g_ref=[{:.3}, {:.3}, {:.3}]",
            self.gravity_ref.x,
            self.gravity_ref.y,
            self.gravity_ref.z
        );
    }

    /// 更新一帧导航状态。
    pub fn update(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) -> NavState {
        self.predict(attitude, sample);
        self.apply_zupt(sample);
        self.nav_state
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
        self.last_timestamp_ms = None;
        self.current_dt_s = 0.0;
        self.last_accel_lin = None;
        self.last_is_static = None;
        self.static_enter_count = 0;
        self.static_exit_count = 0;
        self.static_position = None;
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
        let a_lin = a_world - self.gravity_ref;

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

fn clamp_dt_s(delta_ms: u64, dt_min_ms: u64, dt_max_ms: u64) -> f64 {
    let lower = dt_min_ms.max(1);
    let upper = dt_max_ms.max(lower);
    let clamped = delta_ms.clamp(lower, upper);
    clamped as f64 / 1000.0
}

#[cfg(test)]
mod tests {
    use math_f64::{DQuat, DVec3};

    use crate::processor::{
        filter::ImuSampleFiltered,
        navigator::{
            types::{IntegratorImpl, ZuptImpl},
            Navigator, NavigatorConfig, TrajectoryConfig, ZuptConfig,
        },
    };

    #[test]
    fn static_state_keeps_position_stable_even_with_small_noise() {
        let gravity = 9.80665;
        let mut navigator = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_max_ms: 1000,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: false,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
                impl_type: ZuptImpl::LegacyHardLock,
                ..ZuptConfig::default()
            },
        });

        let attitude = DQuat::IDENTITY;
        let moving_0 = ImuSampleFiltered {
            timestamp_ms: 0,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 1.0),
            gyro_lp: DVec3::new(0.0, 0.0, 0.3),
        };
        let moving_1 = ImuSampleFiltered {
            timestamp_ms: 100,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 1.0),
            gyro_lp: DVec3::new(0.0, 0.0, 0.3),
        };
        let static_0 = ImuSampleFiltered {
            timestamp_ms: 200,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 0.05),
            gyro_lp: DVec3::new(0.01, 0.01, 0.01),
        };
        let static_1 = ImuSampleFiltered {
            timestamp_ms: 300,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 0.05),
            gyro_lp: DVec3::new(0.01, 0.01, 0.01),
        };

        let _ = navigator.update(attitude, &moving_0);
        let nav_moving = navigator.update(attitude, &moving_1);
        assert!(nav_moving.velocity.z > 0.09);

        let nav_static_0 = navigator.update(attitude, &static_0);
        assert!(nav_static_0.velocity.length() < 1e-12);

        let nav_static_1 = navigator.update(attitude, &static_1);
        assert!(nav_static_1.velocity.length() < 1e-12);
        assert!((nav_static_1.position.z - nav_static_0.position.z).abs() < 1e-12);
    }

    #[test]
    fn set_position_updates_static_lock_point_when_stationary() {
        let gravity = 9.80665;
        let mut navigator = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_max_ms: 1000,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: false,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
                impl_type: ZuptImpl::LegacyHardLock,
                ..ZuptConfig::default()
            },
        });

        let attitude = DQuat::IDENTITY;
        let static_0 = ImuSampleFiltered {
            timestamp_ms: 0,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 0.01),
            gyro_lp: DVec3::new(0.01, 0.01, 0.01),
        };
        let static_1 = ImuSampleFiltered {
            timestamp_ms: 20,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 0.01),
            gyro_lp: DVec3::new(0.01, 0.01, 0.01),
        };

        let _ = navigator.update(attitude, &static_0);
        let _ = navigator.update(attitude, &static_1);

        navigator.set_position(DVec3::ZERO);

        let static_2 = ImuSampleFiltered {
            timestamp_ms: 40,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 0.01),
            gyro_lp: DVec3::new(0.01, 0.01, 0.01),
        };
        let nav = navigator.update(attitude, &static_2);

        assert!(nav.velocity.length() < 1e-12);
        assert!(nav.position.length() < 1e-12);
    }

    #[test]
    fn gravity_reference_keeps_static_velocity_zero_after_axis_alignment() {
        let gravity = 9.80665;
        let mut navigator = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_max_ms: 1000,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: true,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
                ..ZuptConfig::default()
            },
        });

        // 姿态零位：绕 X 轴 90°，用于模拟“校准时设备未水平放置”。
        let q_raw_ref = DQuat {
            w: std::f64::consts::FRAC_1_SQRT_2,
            x: std::f64::consts::FRAC_1_SQRT_2,
            y: 0.0,
            z: 0.0,
        };
        let q_offset = q_raw_ref.inverse();
        navigator.set_gravity_reference(q_offset);

        // 校准后姿态应为单位四元数。
        let attitude = DQuat::IDENTITY;
        // 静止时加速度（含重力）在校准参考系下应与 gravity_ref 一致。
        let accel_static = q_offset.rotate_vec3(DVec3::new(0.0, 0.0, gravity));

        let sample_0 = ImuSampleFiltered {
            timestamp_ms: 0,
            accel_lp: accel_static,
            gyro_lp: DVec3::ZERO,
        };
        let sample_1 = ImuSampleFiltered {
            timestamp_ms: 20,
            accel_lp: accel_static,
            gyro_lp: DVec3::ZERO,
        };

        let _ = navigator.update(attitude, &sample_0);
        let nav = navigator.update(attitude, &sample_1);

        assert!(nav.velocity.length() < 1e-12);
        assert!(nav.position.length() < 1e-12);
    }

    #[test]
    fn rk4_position_differs_from_trapezoid_under_varying_accel() {
        let gravity = 9.80665;
        let mut nav_trapezoid = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_min_ms: 1000,
                dt_max_ms: 1000,
                integrator: IntegratorImpl::Trapezoid,
            },
            zupt: ZuptConfig {
                passby: true,
                ..ZuptConfig::default()
            },
        });
        let mut nav_rk4 = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_min_ms: 1000,
                dt_max_ms: 1000,
                integrator: IntegratorImpl::Rk4,
            },
            zupt: ZuptConfig {
                passby: true,
                ..ZuptConfig::default()
            },
        });

        let attitude = DQuat::IDENTITY;
        // 第 1 帧: a=0；第 2 帧: a=1m/s²（世界系 z 轴），构造变加速度步进。
        let s0 = ImuSampleFiltered {
            timestamp_ms: 0,
            accel_lp: DVec3::new(0.0, 0.0, gravity),
            gyro_lp: DVec3::ZERO,
        };
        let s1 = ImuSampleFiltered {
            timestamp_ms: 1000,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 1.0),
            gyro_lp: DVec3::ZERO,
        };

        let _ = nav_trapezoid.update(attitude, &s0);
        let _ = nav_rk4.update(attitude, &s0);

        let out_trapezoid = nav_trapezoid.update(attitude, &s1);
        let out_rk4 = nav_rk4.update(attitude, &s1);

        // 两者速度相同（线性插值加速度下都为 0.5 m/s），位置应不同：
        // 梯形: 0.25m，RK4: 1/6m。
        assert!((out_trapezoid.velocity.z - 0.5).abs() < 1e-12);
        assert!((out_rk4.velocity.z - 0.5).abs() < 1e-12);
        assert!((out_trapezoid.position.z - 0.25).abs() < 1e-12);
        assert!((out_rk4.position.z - (1.0 / 6.0)).abs() < 1e-12);
        assert!((out_trapezoid.position.z - out_rk4.position.z).abs() > 1e-6);
    }
}
