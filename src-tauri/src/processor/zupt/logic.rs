//! ZUPT 静止检测与更新实现。

use math_f64::DVec3;

use crate::processor::filter::ImuSampleFiltered;
use crate::processor::trajectory::NavState;
use crate::processor::zupt::types::ZuptConfig;

/// ZUPT 静止检测器。
pub struct ZuptDetector {
    config: ZuptConfig,
    gravity: f64,
    last_is_static: Option<bool>,
}

impl ZuptDetector {
    /// 创建 ZUPT 检测器。
    pub fn new(config: ZuptConfig, gravity: f64) -> Self {
        Self {
            config,
            gravity,
            last_is_static: None,
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
                tracing::info!(
                    "ZUPT: 进入静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s² | vel=[{:.3}, {:.3}, {:.3}]",
                    gyro_norm, accel_norm,
                    nav.velocity.x, nav.velocity.y, nav.velocity.z
                );
            } else {
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
            nav.velocity = DVec3::ZERO;

            // 每秒打印一次详细状态（仅在静止时）
            if sample.timestamp_ms % 1000 < 4 {
                tracing::info!(
                    "ZUPT 静止修正 | vel_before=[{:.3}, {:.3}, {:.3}] → [0, 0, 0] | a_lin=[{:.3}, {:.3}, {:.3}]",
                    vel_before.x, vel_before.y, vel_before.z,
                    accel_lin.x, accel_lin.y, accel_lin.z
                );
            }
        }

        nav
    }

    /// 重置 ZUPT 状态。
    pub fn reset(&mut self) {
        self.last_is_static = None;
    }
}
