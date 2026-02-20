//! 标定模块导出。
//!
//! 标定的目标是把“传感器原始输出”转成“更接近真实物理量的测量”。
//! 通常需要做两件事：去偏置 + 比例/非正交修正。
//! 直观理解：先把零点拉回去，再把坐标轴拉正、尺度拉准。
//!
//! 常用模型：
//! - w_cal = M_g * (w_m - b_g)
//! - a_cal = M_a * (a_m - b_a)
//!
//! 其中 M_* 是 3x3 标定矩阵，b_* 是偏置。这里不做在线自标定，
//! 只读取配置并做一次性修正，保证后续处理链输入一致。

/// 标定逻辑。
pub mod logic;
/// 标定类型定义。
pub mod types;

/// 标定处理器。
pub use logic::Calibration;
/// 标定类型导出。
pub use types::{
    AxisCalibration, CorrectionRequest, ImuCalibrationConfig, ImuSampleCalibrated,
};
