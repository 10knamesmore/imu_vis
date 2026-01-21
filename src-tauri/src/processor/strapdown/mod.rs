//! 捷联惯导模块导出。

/// 捷联传播逻辑。
pub mod logic;
/// 捷联相关类型。
pub mod types;

/// 捷联惯导传播器。
pub use logic::Strapdown;
/// 捷联类型导出。
pub use types::{NavState, StrapdownConfig};
