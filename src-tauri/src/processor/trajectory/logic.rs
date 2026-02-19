//! 三维轨迹计算实现。

use math_f64::DVec3;

use crate::processor::attitude_fusion::AttitudeEstimate;
use crate::processor::filter::ImuSampleFiltered;
use crate::processor::trajectory::types::{NavState, TrajectoryConfig};

/// 三维轨迹计算器。
pub struct TrajectoryCalculator {
    config: TrajectoryConfig,
    gravity: f64,
    nav_state: NavState,
    last_timestamp_ms: Option<u64>,
}

impl TrajectoryCalculator {
    /// 创建轨迹计算器。
    pub fn new(config: TrajectoryConfig, gravity: f64) -> Self {
        Self {
            config,
            gravity,
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
            // 重力向量：世界系中向下（正 Z 方向），幅值为重力加速度
            let g_world = DVec3::new(0.0, 0.0, self.gravity);
            let a_lin = a_world - g_world;

            // IMU数据包为255hz
            if sample.timestamp_ms % 1000 < 4 {
                tracing::info!(
                    "Trajectory Debug | dt={:.4}s | accel_lp=[{:.3}, {:.3}, {:.3}] | a_world=[{:.3}, {:.3}, {:.3}] | a_lin=[{:.3}, {:.3}, {:.3}] | vel=[{:.3}, {:.3}, {:.3}] | pos=[{:.3}, {:.3}, {:.3}]",
                    dt,
                    sample.accel_lp.x, sample.accel_lp.y, sample.accel_lp.z,
                    a_world.x, a_world.y, a_world.z,
                    a_lin.x, a_lin.y, a_lin.z,
                    self.nav_state.velocity.x, self.nav_state.velocity.y, self.nav_state.velocity.z,
                    self.nav_state.position.x, self.nav_state.position.y, self.nav_state.position.z
                );
            }

            // 速度/位置积分
            self.nav_state.velocity += a_lin * dt;
            self.nav_state.position += self.nav_state.velocity * dt;
        }

        self.nav_state.timestamp_ms = sample.timestamp_ms;
        self.nav_state
    }

    /// 同步外部修正后的状态（用于 ZUPT、EKF 等反馈）。
    ///
    /// 重要：下游模块（ZUPT/EKF）修改状态后，必须调用此方法同步回来。
    pub fn sync_state(&mut self, nav: &NavState) {
        // 检测是否有显著修正（用于调试）
        let vel_diff = (nav.velocity - self.nav_state.velocity).length();
        if vel_diff > 0.01 {
            tracing::debug!(
                "Trajectory 状态同步 | vel_before=[{:.3}, {:.3}, {:.3}] | vel_after=[{:.3}, {:.3}, {:.3}] | diff={:.4}",
                self.nav_state.velocity.x, self.nav_state.velocity.y, self.nav_state.velocity.z,
                nav.velocity.x, nav.velocity.y, nav.velocity.z,
                vel_diff
            );
        }

        self.nav_state.velocity = nav.velocity;
        self.nav_state.position = nav.position;
        self.nav_state.bias_a = nav.bias_a;
        self.nav_state.bias_g = nav.bias_g;
    }

    /// 强制设置位置（用于手动校正）。
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
