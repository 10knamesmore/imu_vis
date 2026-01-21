use crate::processor::output::types::{CalculatedData, OutputFrame};
use crate::types::outputs::ResponseData;

pub struct OutputBuilder;

impl OutputBuilder {
    pub fn build(frame: &OutputFrame) -> ResponseData {
        // 输出统一通过 ResponseData 发送给上下游
        let calculated = CalculatedData::from_nav(&frame.nav);
        ResponseData::from_parts(&frame.raw, &calculated)
    }
}
