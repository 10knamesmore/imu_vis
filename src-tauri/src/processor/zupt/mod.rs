//! ZUPT 模块导出。
//!
//! 目的：在静止阶段抑制速度漂移。
//! 原理：静止检测满足阈值时，将速度置零。
//! 常见判据：
//! - ||w|| < w_thresh
//! - ||a_lin|| < a_thresh
//! 满足则认为静止，可执行 ZUPT 修正。

/// ZUPT 类型定义。
pub mod types;
/// ZUPT 逻辑实现。
pub mod logic;

/// ZUPT 相关类型。
pub use types::ZuptConfig;
/// ZUPT 检测器。
#[allow(unused_imports)]
pub use logic::ZuptDetector;
