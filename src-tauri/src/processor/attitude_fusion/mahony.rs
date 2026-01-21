//! Mahony/互补滤波姿态融合实现。

use math_f64::{DQuat, DVec3};

use crate::processor::attitude_fusion::types::{AttitudeEstimate, AttitudeFusionConfig};
use crate::processor::filter::ImuSampleFiltered;

const EPSILON: f64 = 1e-6;

/// 基于 Mahony/互补策略的姿态融合器。
pub struct MahonyFusion {
    config: AttitudeFusionConfig,
    quat: DQuat,
    last_timestamp_ms: Option<u64>,
}

impl MahonyFusion {
    /// 创建姿态融合器。
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            config,
            quat: DQuat::IDENTITY,
            last_timestamp_ms: None,
        }
    }

    /// 根据滤波后的 IMU 样本更新姿态。
    pub fn update(&mut self, sample: &ImuSampleFiltered) -> AttitudeEstimate {
        let dt = self
            .last_timestamp_ms
            .map(|ts| (sample.timestamp_ms.saturating_sub(ts)) as f64 / 1000.0)
            .unwrap_or(0.0);
        self.last_timestamp_ms = Some(sample.timestamp_ms);

        if dt > 0.0 {
            // 角速度积分更新姿态
            let delta = DQuat::from_scaled_axis(sample.gyro_lp * dt);
            self.quat = (self.quat * delta).normalize();
        }

        let accel_norm = normalize_or_zero(sample.accel_lp);
        if accel_norm.length_squared() > EPSILON {
            // 用加速度方向修正重力朝向
            let g_world = DVec3::new(0.0, 0.0, -1.0);
            let v = accel_norm.cross(g_world);
            let s = ((1.0 + accel_norm.dot(g_world)) * 2.0).sqrt();
            if s > EPSILON {
                let q_acc = DQuat::new(v.x / s, v.y / s, v.z / s, s * 0.5).normalize();
                let corrected = q_acc * self.quat;
                self.quat = self.quat.slerp(corrected, self.config.beta);
            }
        }

        AttitudeEstimate {
            timestamp_ms: sample.timestamp_ms,
            quat: self.quat,
            euler: DVec3::ZERO,
        }
    }
}

fn normalize_or_zero(v: DVec3) -> DVec3 {
    let len = v.length();
    if len <= EPSILON {
        DVec3::ZERO
    } else {
        v / len
    }
}
