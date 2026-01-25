//! 三维轨迹计算实现。

use math_f64::DVec3;

use crate::processor::attitude_fusion::AttitudeEstimate;
use crate::processor::filter::ImuSampleFiltered;
use crate::processor::trajectory::types::{NavState, TrajectoryConfig};

/// 三维轨迹计算器。
pub struct TrajectoryCalculator {
    config: TrajectoryConfig,
    nav_state: NavState,
    last_timestamp_ms: Option<u64>,
}

impl TrajectoryCalculator {
    /// 创建轨迹计算器。
    pub fn new(config: TrajectoryConfig) -> Self {
        Self {
            config,
            nav_state: NavState {
                timestamp_ms: 0,
                position: DVec3::ZERO,
                velocity: DVec3::ZERO,
                attitude: math_f64::DQuat::IDENTITY,
                bias_g: DVec3::ZERO,
                bias_a: DVec3::ZERO,
            },
            last_timestamp_ms: None,
        }
    }

    /// 根据姿态和加速度计算三维轨迹。
    ///
    /// 参数:
    /// - `attitude`: 姿态估计（四元数）。
    /// - `sample`: 滤波后的加速度和角速度数据。
    ///
    /// 返回:
    /// - 更新后的导航状态（包含世界坐标系中的位置和速度）。
    pub fn calculate(
        &mut self,
        attitude: &AttitudeEstimate,
        sample: &ImuSampleFiltered,
    ) -> NavState {
        if self.config.passby {
            self.nav_state.attitude = attitude.quat;
            self.nav_state.timestamp_ms = sample.timestamp_ms;
            return self.nav_state;
        }

        let dt = self
            .last_timestamp_ms
            .map(|ts| (sample.timestamp_ms.saturating_sub(ts)) as f64 / 1000.0)
            .unwrap_or(0.0);
        self.last_timestamp_ms = Some(sample.timestamp_ms);

        self.nav_state.attitude = attitude.quat;

        if dt > 0.0 {
            // 将加速度转到世界系并去重力
            let a_world = attitude.quat.rotate_vec3(sample.accel_lp);
            let g_world = DVec3::new(0.0, 0.0, -1.0);
            let a_lin = a_world - g_world * self.config.gravity;
            // 速度/位置积分
            self.nav_state.velocity += a_lin * dt;
            self.nav_state.position += self.nav_state.velocity * dt;
        }

        self.nav_state.timestamp_ms = sample.timestamp_ms;
        self.nav_state
    }

    /// 重置轨迹状态（清空位置、速度、时间戳）。
    pub fn reset(&mut self) {
        self.nav_state = NavState {
            timestamp_ms: 0,
            position: DVec3::ZERO,
            velocity: DVec3::ZERO,
            attitude: math_f64::DQuat::IDENTITY,
            bias_g: DVec3::ZERO,
            bias_a: DVec3::ZERO,
        };
        self.last_timestamp_ms = None;
    }
}
