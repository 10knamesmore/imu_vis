//! 误差状态 EKF 处理器。

use crate::processor::ekf::types::EkfConfig;
use crate::processor::trajectory::NavState;
use crate::processor::zupt::ZuptObservation;

/// EKF 处理器。
pub struct EkfProcessor {
    config: EkfConfig,
}

impl EkfProcessor {
    /// 创建 EKF 处理器。
    pub fn new(config: EkfConfig) -> Self {
        Self { config }
    }

    /// 根据观测更新导航状态。
    ///
    /// 参数:
    /// - `nav`: 当前导航状态。
    /// - `obs`: ZUPT 观测（当前未使用）。
    ///
    /// 返回:
    /// - 更新后的导航状态（当前透传或占位）。
    ///
    /// 公式:
    /// - `passby || !enabled`: `nav_out = nav_in`
    /// - TODO: `x_k = f(x_{k-1}, u_k)`, `K = P H^T (H P H^T + R)^{-1}`, `x_k = x_k + K * y`
    pub fn update(&mut self, nav: NavState, _obs: &ZuptObservation) -> NavState {
        if self.config.passby {
            return nav;
        }

        if !self.config.enabled {
            // 关闭 EKF 时直接透传
            return nav;
        }

        // TODO: 误差状态 EKF 传播与更新
        nav
    }

    /// 重置 EKF 状态（当前无内部状态）。
    pub fn reset(&mut self) {}
}
