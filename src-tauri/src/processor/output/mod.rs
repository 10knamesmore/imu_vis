//! 输出模块导出。
//!
//! 目的：把处理链的中间状态整理成统一的 ResponseData。
//! 原理：将 NavState/原始样本合并为对外结构，保持接口稳定。
//! 这里不做数值处理，只做组装与格式化。

/// 输出构建逻辑。
pub mod logic;
/// 输出类型定义。
pub mod types;

/// 输出构建器。
pub use logic::OutputBuilder;
/// 饱和检测阈值常量。
pub use logic::ACCEL_SATURATION_THRESHOLD_MS2;
/// 饱和检测 helper。
pub use logic::is_accel_saturated;
/// 输出帧类型导出。
pub use types::OutputFrame;
