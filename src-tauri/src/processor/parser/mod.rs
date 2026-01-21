//! IMU 解析模块导出。

/// 解析实现。
pub mod logic;
/// 原始样本类型。
pub mod types;

/// 原始数据解析器。
pub use logic::ImuParser;
/// 原始样本类型与兼容别名。
pub use types::{ImuSampleRaw, IMUData};
