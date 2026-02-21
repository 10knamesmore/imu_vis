//! ZUPT 静止检测与更新实现。

use math_f64::DVec3;

use crate::processor::filter::ImuSampleFiltered;
use crate::processor::trajectory::NavState;
use crate::processor::zupt::types::ZuptConfig;

/// ZUPT 静止检测器。
#[allow(dead_code)]
pub struct ZuptDetector {
    config: ZuptConfig,
    gravity: f64,
    last_is_static: Option<bool>,
    static_position: Option<DVec3>,
}

#[allow(dead_code)]
impl ZuptDetector {
    /// 创建 ZUPT 检测器。
    pub fn new(config: ZuptConfig, gravity: f64) -> Self {
        Self {
            config,
            gravity,
            last_is_static: None,
            static_position: None,
        }
    }

    /// 应用 ZUPT 并返回观测。
    ///
    /// 参数:
    /// - `nav`: 当前导航状态（会被更新后返回）。
    /// - `sample`: 滤波后的 IMU 样本。
    ///
    /// 返回:
    /// - 更新后的导航状态。
    ///
    /// 公式:
    /// - `a_lin = R(q) * a_lp - g * 9.80665`
    /// - `is_static = |w| < gyro_thresh && |a_lin| < accel_thresh`
    /// - `v = 0`, `b_a = b_a + a_lin * gain` (静止时)
    pub fn apply(&mut self, mut nav: NavState, sample: &ImuSampleFiltered) -> NavState {
        if self.config.passby {
            return nav;
        }

        let gyro_norm = sample.gyro_lp.length();
        // 重力向量：世界系中向下（正 Z 方向），幅值为重力加速度
        let g_world = DVec3::new(0.0, 0.0, self.gravity);
        let accel_world = nav.attitude.rotate_vec3(sample.accel_lp);
        let accel_lin = accel_world - g_world;
        let accel_norm = accel_lin.length();

        // 静止检测：角速度和线加速度同时低于阈值
        let is_static =
            gyro_norm < self.config.gyro_thresh && accel_norm < self.config.accel_thresh;

        // 仅在状态切换时记录日志
        if self.last_is_static != Some(is_static) {
            if is_static {
                self.static_position = Some(nav.position);
                tracing::info!(
                    "ZUPT: 进入静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s² | vel=[{:.3}, {:.3}, {:.3}]",
                    gyro_norm, accel_norm,
                    nav.velocity.x, nav.velocity.y, nav.velocity.z
                );
            } else {
                self.static_position = None;
                tracing::info!(
                    "ZUPT: 退出静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s²",
                    gyro_norm, accel_norm
                );
            }
            self.last_is_static = Some(is_static);
        }

        if is_static {
            // 静止时速度归零
            let vel_before = nav.velocity;
            let pos_before = nav.position;
            nav.velocity = DVec3::ZERO;
            if let Some(static_position) = self.static_position {
                nav.position = static_position;
            }

            // 每秒打印一次详细状态（仅在静止时）
            if sample.timestamp_ms % 1000 < 4 {
                tracing::info!(
                    "ZUPT 静止修正 | vel_before=[{:.3}, {:.3}, {:.3}] → [0, 0, 0] | pos_before=[{:.3}, {:.3}, {:.3}] | pos_locked=[{:.3}, {:.3}, {:.3}] | a_lin=[{:.3}, {:.3}, {:.3}]",
                    vel_before.x, vel_before.y, vel_before.z,
                    pos_before.x, pos_before.y, pos_before.z,
                    nav.position.x, nav.position.y, nav.position.z,
                    accel_lin.x, accel_lin.y, accel_lin.z
                );
            }
        }

        nav
    }

    /// 重置 ZUPT 状态。
    pub fn reset(&mut self) {
        self.last_is_static = None;
        self.static_position = None;
    }
}

#[cfg(test)]
mod tests {
    use math_f64::{DQuat, DVec3};

    use crate::processor::{
        filter::ImuSampleFiltered,
        trajectory::NavState,
        zupt::{ZuptConfig, ZuptDetector},
    };

    #[test]
    fn static_state_locks_position_and_zeroes_velocity() {
        let mut detector = ZuptDetector::new(
            ZuptConfig {
                passby: false,
                gyro_thresh: 0.2,
                accel_thresh: 0.2,
            },
            9.80665,
        );

        let static_sample = ImuSampleFiltered {
            timestamp_ms: 100,
            accel_lp: DVec3::new(0.0, 0.0, 9.80665),
            gyro_lp: DVec3::ZERO,
        };

        let nav_1 = NavState {
            timestamp_ms: 100,
            attitude: DQuat::IDENTITY,
            velocity: DVec3::new(0.3, -0.1, 0.2),
            position: DVec3::new(1.0, 2.0, 3.0),
        };
        let corrected_1 = detector.apply(nav_1, &static_sample);
        assert!(corrected_1.velocity.length() < 1e-12);

        let nav_2 = NavState {
            timestamp_ms: 104,
            attitude: DQuat::IDENTITY,
            velocity: DVec3::new(1.0, 1.0, 1.0),
            position: DVec3::new(5.0, 6.0, 7.0),
        };
        let corrected_2 = detector.apply(nav_2, &static_sample);
        assert!(corrected_2.velocity.length() < 1e-12);
        assert!((corrected_2.position.x - corrected_1.position.x).abs() < 1e-12);
        assert!((corrected_2.position.y - corrected_1.position.y).abs() < 1e-12);
        assert!((corrected_2.position.z - corrected_1.position.z).abs() < 1e-12);
    }
}
