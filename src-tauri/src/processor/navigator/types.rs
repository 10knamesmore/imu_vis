//! 导航融合相关类型。

use crate::processor::{trajectory::TrajectoryConfig, zupt::ZuptConfig};

#[derive(Debug, Clone, Copy)]
/// 导航融合配置。
pub struct NavigatorConfig {
    /// 轨迹积分配置。
    pub trajectory: TrajectoryConfig,
    /// ZUPT 约束配置。
    pub zupt: ZuptConfig,
    /// 重力加速度（m/s²）。
    pub gravity: f64,
}

