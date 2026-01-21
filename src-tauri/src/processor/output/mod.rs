//! 输出模块导出。

/// 输出构建逻辑。
pub mod logic;
/// 输出类型定义。
pub mod types;

/// 输出构建器。
pub use logic::OutputBuilder;
/// 输出类型导出。
pub use types::{CalculatedData, OutputFrame};
