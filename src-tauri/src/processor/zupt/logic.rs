//! ZUPT 静止检测与更新实现。

use math_f64::DVec3;

use crate::processor::filter::ImuSampleFiltered;
use crate::processor::strapdown::NavState;
use crate::processor::zupt::types::{ZuptConfig, ZuptObservation};

/// ZUPT 静止检测器。
pub struct ZuptDetector {
    config: ZuptConfig,
    last_is_static: Option<bool>,
}

impl ZuptDetector {
    /// 创建 ZUPT 检测器。
    pub fn new(config: ZuptConfig) -> Self {
        Self {
            config,
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
    /// - 更新后的导航状态与静止观测。
    ///
    /// 公式:
    /// - `a_lin = R(q) * a_lp - g * 9.80665`
    /// - `is_static = |w| < gyro_thresh && |a_lin| < accel_thresh`
    /// - `v = 0`, `b_a = b_a + a_lin * gain` (静止时)
    pub fn apply(
        &mut self,
        mut nav: NavState,
        sample: &ImuSampleFiltered,
    ) -> (NavState, ZuptObservation) {
        if self.config.passby {
            return (nav, ZuptObservation { is_static: false });
        }

        let gyro_norm = sample.gyro_lp.length();
        let g_world = DVec3::new(0.0, 0.0, -1.0);
        let accel_world = nav.attitude.rotate_vec3(sample.accel_lp);
        let accel_lin = accel_world - g_world * 9.80665;
        let accel_norm = accel_lin.length();

        // 静止检测：角速度和线加速度同时低于阈值
        let is_static =
            gyro_norm < self.config.gyro_thresh && accel_norm < self.config.accel_thresh;

        // 仅在状态切换时记录日志
        if self.last_is_static != Some(is_static) {
            if is_static {
                tracing::info!("ZUPT: 进入静止状态");
            } else {
                tracing::info!("ZUPT: 退出静止状态");
            }
            self.last_is_static = Some(is_static);
        }

        if is_static {
            // 静止时速度归零，并做偏置回归
            nav.velocity = DVec3::ZERO;
            nav.bias_a += accel_lin * self.config.bias_correction_gain;
        }

        (nav, ZuptObservation { is_static })
    }

    /// 重置 ZUPT 状态。
    pub fn reset(&mut self) {
        self.last_is_static = None;
    }
}
