//! 导航融合器包装层（enum dispatch）。
//!
//! 根据 [`NavigatorImplType`] 配置在运行时选择导航器实现：
//! - [`Legacy`](LegacyNavigator)：传统积分 + ZUPT 修正
//! - [`Eskf`](EskfNavigator)：15-state 误差状态卡尔曼滤波
//!
//! 使用 enum dispatch 而非 trait object，零运行时开销。

use math_f64::{DQuat, DVec3};

use crate::processor::{
    filter::ImuSampleFiltered,
    navigator::{
        eskf::EskfNavigator,
        legacy::LegacyNavigator,
        types::{NavState, NavigatorConfig, NavigatorImplType},
    },
};

/// 导航器内部实现枚举。
enum NavigatorInner {
    /// 传统积分 + ZUPT 修正。
    Legacy(LegacyNavigator),
    /// 15-state 误差状态卡尔曼滤波。
    Eskf(EskfNavigator),
}

/// 导航融合器。
///
/// 对外提供统一接口，内部根据配置 `navigator_impl` 分发到
/// [`LegacyNavigator`] 或 [`EskfNavigator`]。
///
/// # 配置切换
///
/// 在 `processor.toml` 中设置：
/// ```toml
/// navigator_impl = "legacy"   # 或 "eskf"
/// ```
pub struct Navigator {
    inner: NavigatorInner,
}

impl Navigator {
    /// 创建导航融合器。根据 `config.navigator_impl` 选择实现。
    pub fn new(config: NavigatorConfig) -> Self {
        let inner = match config.navigator_impl {
            NavigatorImplType::Legacy => NavigatorInner::Legacy(LegacyNavigator::new(config)),
            NavigatorImplType::Eskf => NavigatorInner::Eskf(EskfNavigator::new(config)),
        };
        Self { inner }
    }

    /// 更新一帧导航状态。
    pub fn update(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) -> NavState {
        match &mut self.inner {
            NavigatorInner::Legacy(n) => n.update(attitude, sample),
            NavigatorInner::Eskf(n) => n.update(attitude, sample),
        }
    }

    /// 返回当前是否处于 ZUPT 静止状态。
    pub fn is_static(&self) -> bool {
        match &self.inner {
            NavigatorInner::Legacy(n) => n.is_static(),
            NavigatorInner::Eskf(n) => n.is_static(),
        }
    }

    /// 设置姿态零位校准后的重力参考向量。
    pub fn set_gravity_reference(&mut self, quat_offset: DQuat) {
        match &mut self.inner {
            NavigatorInner::Legacy(n) => n.set_gravity_reference(quat_offset),
            NavigatorInner::Eskf(n) => n.set_gravity_reference(quat_offset),
        }
    }

    /// 手动设置位置（用于校正）。
    pub fn set_position(&mut self, position: DVec3) {
        match &mut self.inner {
            NavigatorInner::Legacy(n) => n.set_position(position),
            NavigatorInner::Eskf(n) => n.set_position(position),
        }
    }

    /// 重置内部状态。
    pub fn reset(&mut self) {
        match &mut self.inner {
            NavigatorInner::Legacy(n) => n.reset(),
            NavigatorInner::Eskf(n) => n.reset(),
        }
    }
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

    /// 构造默认配置的辅助函数（Legacy 模式）。
    fn default_config(gravity: f64) -> NavigatorConfig {
        NavigatorConfig {
            gravity,
            trajectory: TrajectoryConfig::default(),
            zupt: ZuptConfig::default(),
            navigator_impl: Default::default(),
            eskf: Default::default(),
        }
    }

    #[test]
    fn static_state_keeps_position_stable_even_with_small_noise() {
        let gravity = 9.80665;
        let mut navigator = Navigator::new(NavigatorConfig {
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
            ..default_config(gravity)
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
            ..default_config(gravity)
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
            ..default_config(gravity)
        });

        let q_raw_ref = DQuat {
            w: std::f64::consts::FRAC_1_SQRT_2,
            x: std::f64::consts::FRAC_1_SQRT_2,
            y: 0.0,
            z: 0.0,
        };
        let q_offset = q_raw_ref.inverse();
        navigator.set_gravity_reference(q_offset);

        let attitude = DQuat::IDENTITY;
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
            trajectory: TrajectoryConfig {
                passby: false,
                dt_min_ms: 1000,
                dt_max_ms: 1000,
                integrator: IntegratorImpl::Trapezoid,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: true,
                ..ZuptConfig::default()
            },
            ..default_config(gravity)
        });
        let mut nav_rk4 = Navigator::new(NavigatorConfig {
            trajectory: TrajectoryConfig {
                passby: false,
                dt_min_ms: 1000,
                dt_max_ms: 1000,
                integrator: IntegratorImpl::Rk4,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: true,
                ..ZuptConfig::default()
            },
            ..default_config(gravity)
        });

        let attitude = DQuat::IDENTITY;
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

        assert!((out_trapezoid.velocity.z - 0.5).abs() < 1e-12);
        assert!((out_rk4.velocity.z - 0.5).abs() < 1e-12);
        assert!((out_trapezoid.position.z - 0.25).abs() < 1e-12);
        assert!((out_rk4.position.z - (1.0 / 6.0)).abs() < 1e-12);
        assert!((out_trapezoid.position.z - out_rk4.position.z).abs() > 1e-6);
    }
}
