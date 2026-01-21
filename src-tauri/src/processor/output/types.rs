use math_f64::{DQuat, DVec3};
use serde::Serialize;

use crate::processor::parser::ImuSampleRaw;
use crate::processor::strapdown::NavState;

#[derive(Debug, Clone, Copy, Serialize)]
/// 计算后的状态数据
pub struct CalculatedData {
    /// 姿态
    pub attitude: DQuat,
    /// 速度
    pub velocity: DVec3,
    /// 位置
    pub position: DVec3,
    /// 时间戳（毫秒）
    pub timestamp_ms: u64,
}

impl CalculatedData {
    pub fn from_nav(nav: &NavState) -> Self {
        CalculatedData {
            attitude: nav.attitude,
            velocity: nav.velocity,
            position: nav.position,
            timestamp_ms: nav.timestamp_ms,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct OutputFrame {
    pub raw: ImuSampleRaw,
    pub nav: NavState,
}
