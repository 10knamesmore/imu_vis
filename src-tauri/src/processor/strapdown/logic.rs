//! 捷联惯导传播实现。

use math_f64::DVec3;

use crate::processor::attitude_fusion::AttitudeEstimate;
use crate::processor::filter::ImuSampleFiltered;
use crate::processor::strapdown::types::{NavState, StrapdownConfig};

/// 捷联惯导传播器。
pub struct Strapdown {
    config: StrapdownConfig,
    nav_state: NavState,
    last_timestamp_ms: Option<u64>,
}

impl Strapdown {
    /// 创建捷联惯导传播器。
    pub fn new(config: StrapdownConfig) -> Self {
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

    /// 传播导航状态。
    pub fn propagate(
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
}
