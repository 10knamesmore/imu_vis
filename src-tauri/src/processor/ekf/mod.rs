//! EKF 模块导出。
//!
//! 目的：用误差状态滤波进一步抑制漂移与噪声。
//! 思路：名义状态传播 + 误差状态线性化 + 量测更新。
//! 简化表达：
//! - P = F * P * F^T + Q
//! - K = P * H^T * (H * P * H^T + R)^{-1}
//! - x = x + K * (z - Hx)

/// EKF 逻辑实现。
pub mod logic;
/// EKF 类型定义。
pub mod types;

/// EKF 处理器。
pub use logic::EkfProcessor;
/// EKF 类型导出。
pub use types::{EkfConfig, EkfState, ErrorState};
