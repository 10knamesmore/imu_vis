//! ZUPT 模块导出。
//!
//! 目的：在静止阶段抑制速度漂移。
//! 原理：静止检测满足阈值时，将速度置零并做偏置回归。
//! 常见判据：
//! - ||w|| < w_thresh
//! - ||a_lin|| < a_thresh
//! 满足则认为静止，可执行 ZUPT 更新。

/// ZUPT 类型定义。
pub mod types;
/// ZUPT 逻辑实现。
pub mod logic;

/// ZUPT 相关类型。
pub use types::{ZuptConfig, ZuptObservation};
/// ZUPT 检测器。
pub use logic::ZuptDetector;
