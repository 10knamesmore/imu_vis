//! ZUPT 模块导出。

/// ZUPT 类型定义。
pub mod types;
/// ZUPT 逻辑实现。
pub mod zupt;

/// ZUPT 相关类型。
pub use types::{ZuptConfig, ZuptObservation};
/// ZUPT 检测器。
pub use zupt::ZuptDetector;
