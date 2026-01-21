use crate::processor::ekf::types::EkfConfig;
use crate::processor::strapdown::NavState;
use crate::processor::zupt::ZuptObservation;

pub struct EkfProcessor {
    config: EkfConfig,
}

impl EkfProcessor {
    pub fn new(config: EkfConfig) -> Self {
        Self { config }
    }

    pub fn update(&mut self, nav: NavState, _obs: &ZuptObservation) -> NavState {
        if !self.config.enabled {
            // 关闭 EKF 时直接透传
            return nav;
        }

        // TODO: 误差状态 EKF 传播与更新
        nav
    }
}
