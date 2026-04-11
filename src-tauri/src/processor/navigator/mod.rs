//! 导航融合模块。
//!
//! 提供两种导航器实现，可通过配置 `navigator_impl` 切换：
//! - `legacy`：传统直接积分 + ZUPT 硬/平滑修正
//! - `eskf`：15-state 误差状态卡尔曼滤波（推荐）

/// ESKF（误差状态卡尔曼滤波）导航器。
pub mod eskf;
/// 传统导航融合器（直接积分 + ZUPT）。
pub mod legacy;
/// 导航融合包装器（enum dispatch）。
pub mod logic;
/// 导航融合配置与类型。
pub mod types;

/// 导航融合器（根据配置自动选择实现）。
pub use logic::Navigator;
/// 导航融合相关类型导出。
pub use types::{
    EskfConfig, NavState, NavigatorConfig, NavigatorImplType, TrajectoryConfig, ZuptConfig,
};
