//! 姿态融合模块导出。
//!
//! 目标是得到“稳定且不过分漂移”的姿态四元数。
//! - 陀螺积分能跟得上快速运动，但会累积漂移。
//! - 加速度给出重力方向，但在运动时会被线加速度污染。
//! 因此采用互补/修正策略：陀螺负责短时动态，加速度负责慢速纠偏。
//!
//! 常见形式：
//! - q_dot = 0.5 * Omega(w) * q
//! - q_gyro = normalize(q + q_dot * dt)
//! - 构造 q_acc 使 g_body -> g_world
//! - q = slerp(q_gyro, q_acc * q_gyro, beta)
//!
//! beta 控制纠偏强度，越大越依赖加速度，越小越依赖陀螺。

/// Madgwick 实现。
pub mod madgwick;
/// Mahony/互补滤波实现。
pub mod mahony;
/// 姿态融合类型定义。
pub mod types;

use crate::processor::{attitude_fusion::mahony::MahonyFusion, filter::ImuSampleFiltered};
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
    ///
    /// 参数:
    /// - `sample`: 滤波后的 IMU 样本。
    /// - `raw_quat`: 透传模式下的原始四元数（可选）。
    ///
    /// 返回:
    /// - 融合后的姿态估计。
    ///
    /// 公式:
    /// - `passby`: `q_out = raw_quat` (缺省 `IDENTITY`)
    /// - 否则: `q_out = Mahony.update(sample)`
    pub fn update(
        &mut self,
        sample: &ImuSampleFiltered,
        raw_quat: Option<DQuat>,
    ) -> AttitudeEstimate {
        if self.passby {
            let quat = raw_quat.unwrap_or(DQuat::IDENTITY);
            return AttitudeEstimate { quat };
        }

        self.inner.update(sample)
    }

    /// 重置姿态融合状态。
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

/// 对外导出的姿态融合类型。
pub use types::{AttitudeEstimate, AttitudeFusionConfig};
