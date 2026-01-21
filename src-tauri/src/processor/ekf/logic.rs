//! 误差状态 EKF 处理器。

use crate::processor::ekf::types::EkfConfig;
use crate::processor::strapdown::NavState;
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
}
