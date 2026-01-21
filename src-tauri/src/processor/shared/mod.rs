//! 共享类型模块导出。
//!
//! 目的：在各模块之间共享基础类型，减少循环依赖。
//! 说明：这里仅做类型别名，不引入业务逻辑。

/// 共享类型定义。
pub mod types;

/// 共享类型别名导出。
pub use types::{ImuQuat, ImuVec3, TimestampMs};
