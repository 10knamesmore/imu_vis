//! Madgwick 姿态融合占位实现。

use crate::processor::attitude_fusion::types::{AttitudeEstimate, AttitudeFusionConfig};
use crate::processor::filter::ImuSampleFiltered;
use math_f64::DQuat;

/// Madgwick 融合器（待实现）。
pub struct MadgwickFusion {
    #[allow(dead_code)]
    config: AttitudeFusionConfig,
    quat: DQuat,
}

impl MadgwickFusion {
    /// 创建 Madgwick 融合器。
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            config,
            quat: DQuat::IDENTITY,
        }
    }

    /// 更新姿态（当前为占位返回）。
    ///
    /// 参数:
    /// - `sample`: 滤波后的 IMU 样本。
    /// 返回:
    /// - 姿态估计（当前占位返回常量）。
    /// 公式:
    /// - `q_out = q_prev` (占位)
    pub fn update(&mut self, sample: &ImuSampleFiltered) -> AttitudeEstimate {
        // TODO: 实现 Madgwick 融合更新（当前仅返回恒定姿态）。
        AttitudeEstimate {
            timestamp_ms: sample.timestamp_ms,
            quat: self.quat,
            euler: math_f64::DVec3::ZERO,
        }
    }
}
