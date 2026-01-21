//! 滤波模块导出。
//!
//! 滤波的目的很直白：让噪声小一点、曲线更平滑，降低抖动对姿态/速度的影响。
//! 这里采用一阶低通（IIR）足够轻量，适合 250Hz 数据流。
//!
//! 递推关系：
//! x_lp[k] = alpha * x_lp[k-1] + (1 - alpha) * x[k]
//!
//! alpha 越大越平滑，但响应更慢；alpha 越小越灵敏，但噪声更大。

/// 低通滤波逻辑。
pub mod logic;
/// 滤波类型定义。
pub mod types;

/// 低通滤波器。
pub use logic::LowPassFilter;
/// 滤波样本与配置类型。
pub use types::{ImuSampleFiltered, LowPassFilterConfig};
