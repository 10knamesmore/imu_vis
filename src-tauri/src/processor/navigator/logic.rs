//! 导航融合实现。

use math_f64::{DQuat, DVec3};

use crate::processor::{
    filter::ImuSampleFiltered,
    navigator::types::{NavState, NavigatorConfig},
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
    last_timestamp_ms: Option<u64>,
    last_is_static: Option<bool>,
    static_position: Option<DVec3>,
}

impl Navigator {
    /// 创建导航融合器。
    pub fn new(config: NavigatorConfig) -> Self {
        Self {
            config,
            nav_state: NavState {
                timestamp_ms: 0,
                position: DVec3::ZERO,
                velocity: DVec3::ZERO,
                attitude: DQuat::IDENTITY,
            },
            last_timestamp_ms: None,
            last_is_static: None,
            static_position: None,
        }
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
        self.last_timestamp_ms = None;
        self.last_is_static = None;
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
            .map(|ts| (sample.timestamp_ms.saturating_sub(ts)) as f64 / 1000.0)
            .unwrap_or(0.0);
        self.last_timestamp_ms = Some(sample.timestamp_ms);

        if dt > 0.0 {
            let a_world = attitude.rotate_vec3(sample.accel_lp);
            let g_world = DVec3::new(0.0, 0.0, self.config.gravity);
            let a_lin = a_world - g_world;

            self.nav_state.velocity += a_lin * dt;
            self.nav_state.position += self.nav_state.velocity * dt;
        }
    }

    fn apply_zupt(&mut self, sample: &ImuSampleFiltered) {
        if self.config.zupt.passby {
            return;
        }

        let gyro_norm = sample.gyro_lp.length();
        let g_world = DVec3::new(0.0, 0.0, self.config.gravity);
        let accel_world = self.nav_state.attitude.rotate_vec3(sample.accel_lp);
        let accel_lin = accel_world - g_world;
        let accel_norm = accel_lin.length();
        let is_static =
            gyro_norm < self.config.zupt.gyro_thresh && accel_norm < self.config.zupt.accel_thresh;

        if self.last_is_static != Some(is_static) {
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

        if is_static {
            let vel_before = self.nav_state.velocity;
            let pos_before = self.nav_state.position;
            self.nav_state.velocity = DVec3::ZERO;
            if let Some(static_position) = self.static_position {
                self.nav_state.position = static_position;
            }

            if sample.timestamp_ms % 1000 < 4 {
                tracing::info!(
                    "ZUPT 静止修正 | vel_before=[{:.3}, {:.3}, {:.3}] → [0, 0, 0] | pos_before=[{:.3}, {:.3}, {:.3}] | pos_locked=[{:.3}, {:.3}, {:.3}] | a_lin=[{:.3}, {:.3}, {:.3}]",
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
    }
}

#[cfg(test)]
mod tests {
    use math_f64::{DQuat, DVec3};

    use crate::processor::{
        filter::ImuSampleFiltered,
        navigator::{Navigator, NavigatorConfig, TrajectoryConfig, ZuptConfig},
    };

    #[test]
    fn static_state_keeps_position_stable_even_with_small_noise() {
        let gravity = 9.80665;
        let mut navigator = Navigator::new(NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig { passby: false },
            zupt: ZuptConfig {
                passby: false,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
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
            trajectory: TrajectoryConfig { passby: false },
            zupt: ZuptConfig {
                passby: false,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
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
}
