//! 姿态融合模块导出。

/// Mahony/互补滤波实现。
pub mod mahony;
/// Madgwick 实现。
pub mod madgwick;
/// 姿态融合类型定义。
pub mod types;

use crate::processor::attitude_fusion::mahony::MahonyFusion;
use crate::processor::filter::ImuSampleFiltered;
use math_f64::DQuat;

/// 统一姿态融合入口。
pub struct AttitudeFusion {
    inner: MahonyFusion,
    passby: bool,
}

impl AttitudeFusion {
    /// 创建姿态融合器。
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            inner: MahonyFusion::new(config),
            passby: config.passby,
        }
    }

    /// 更新姿态融合结果。
    pub fn update(
        &mut self,
        sample: &ImuSampleFiltered,
        raw_quat: Option<DQuat>,
    ) -> AttitudeEstimate {
        if self.passby {
            let quat = raw_quat.unwrap_or(DQuat::IDENTITY);
            return AttitudeEstimate {
                timestamp_ms: sample.timestamp_ms,
                quat,
                euler: math_f64::DVec3::ZERO,
            };
        }

        self.inner.update(sample)
    }
}

/// 对外导出的姿态融合类型。
pub use types::{AttitudeEstimate, AttitudeFusionConfig};
