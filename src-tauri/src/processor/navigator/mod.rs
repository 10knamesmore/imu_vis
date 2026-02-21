//! 导航融合模块导出。
//!
//! 目标：把轨迹积分与 ZUPT 约束放到单一状态机中，统一提交状态。

/// 导航融合逻辑。
pub mod logic;
/// 导航融合配置与类型。
pub mod types;

/// 导航融合器。
pub use logic::Navigator;
/// 导航融合配置。
pub use types::NavigatorConfig;

