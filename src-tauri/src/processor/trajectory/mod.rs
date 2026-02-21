//! 三维轨迹计算模块。
//!
//! 目标是根据姿态和加速度积分计算世界坐标系中的三维运动轨迹。
//! 核心思路：机体系加速度先旋转到世界系，再去除重力，最后积分。
//! 直观公式：
//! - a_world = R(q) * a_body
//! - a_lin = a_world - g_world * g
//! - v_k = v_{k-1} + a_lin * dt
//! - p_k = p_{k-1} + v_k * dt

/// 轨迹计算逻辑。
pub mod logic;
/// 轨迹相关类型。
pub mod types;

/// 轨迹计算器。
#[allow(unused_imports)]
pub use logic::TrajectoryCalculator;
/// 轨迹类型导出。
pub use types::{NavState, TrajectoryConfig};
