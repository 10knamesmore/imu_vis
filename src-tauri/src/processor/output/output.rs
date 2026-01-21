//! 输出构建逻辑。

use crate::processor::output::types::{CalculatedData, OutputFrame};
use crate::types::outputs::ResponseData;

/// 输出构建器。
pub struct OutputBuilder;

impl OutputBuilder {
    /// 构建响应数据。
    pub fn build(frame: &OutputFrame) -> ResponseData {
        // 输出统一通过 ResponseData 发送给上下游
        let calculated = CalculatedData::from_nav(&frame.nav);
        ResponseData::from_parts(&frame.raw, &calculated)
    }
}
