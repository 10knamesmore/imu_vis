//! 输出相关类型。

use crate::processor::navigator::NavState;
use crate::processor::parser::ImuSampleRaw;

#[derive(Debug, Clone, Copy)]
/// 输出帧数据。
pub struct OutputFrame {
    /// 原始样本。
    pub raw: ImuSampleRaw,
    /// 导航状态。
    pub nav: NavState,
}
