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
/// 输出类型导出。
pub use types::{CalculatedData, OutputFrame};
