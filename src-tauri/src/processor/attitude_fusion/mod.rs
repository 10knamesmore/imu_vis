//! 姿态融合模块导出。

/// Mahony/互补滤波实现。
pub mod mahony;
/// Madgwick 实现。
pub mod madgwick;
/// 姿态融合类型定义。
pub mod types;

use crate::processor::attitude_fusion::mahony::MahonyFusion;
use crate::processor::filter::ImuSampleFiltered;

/// 统一姿态融合入口。
pub struct AttitudeFusion {
    inner: MahonyFusion,
}

impl AttitudeFusion {
    /// 创建姿态融合器。
    pub fn new(config: AttitudeFusionConfig) -> Self {
        Self {
            inner: MahonyFusion::new(config),
        }
    }

    /// 更新姿态融合结果。
    pub fn update(&mut self, sample: &ImuSampleFiltered) -> AttitudeEstimate {
        self.inner.update(sample)
    }
}

/// 对外导出的姿态融合类型。
pub use types::{AttitudeEstimate, AttitudeFusionConfig};
