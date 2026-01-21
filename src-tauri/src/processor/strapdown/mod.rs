//! 捷联惯导模块导出。
//!
//! 目标是根据姿态传播速度与位置，形成基础惯导轨迹。
//! 核心思路：机体系加速度先旋转到世界系，再去除重力，最后积分。
//! 直观公式：
//! - a_world = R(q) * a_body
//! - a_lin = a_world - g_world * g
//! - v_k = v_{k-1} + a_lin * dt
//! - p_k = p_{k-1} + v_k * dt

/// 捷联传播逻辑。
pub mod logic;
/// 捷联相关类型。
pub mod types;

/// 捷联惯导传播器。
pub use logic::Strapdown;
/// 捷联类型导出。
pub use types::{NavState, StrapdownConfig};
