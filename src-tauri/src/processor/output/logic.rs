//! 输出构建逻辑。

use crate::processor::output::types::OutputFrame;
use crate::types::outputs::ResponseData;

/// 输出构建器。
pub struct OutputBuilder;

impl OutputBuilder {
    /// 从输出帧构建前端响应数据。
    pub fn build(frame: &OutputFrame) -> ResponseData {
        ResponseData {
            timestamp_ms: frame.raw.timestamp_ms,
            accel: frame.raw.accel_no_g,
            accel_with_g: frame.raw.accel_with_g,
            gyro: frame.raw.gyro,
            attitude: frame.nav.attitude,
            velocity: frame.nav.velocity,
            position: frame.nav.position,
        }
    }
}
