//! 输出相关类型。

use math_f64::{DQuat, DVec3};
use serde::Serialize;

use crate::processor::parser::ImuSampleRaw;
use crate::processor::strapdown::NavState;

#[derive(Debug, Clone, Copy, Serialize)]
/// 计算后的状态数据。
pub struct CalculatedData {
    /// 姿态。
    pub attitude: DQuat,
    /// 速度。
    pub velocity: DVec3,
    /// 位置。
    pub position: DVec3,
    /// 时间戳（毫秒）。
    pub timestamp_ms: u64,
}

impl CalculatedData {
    /// 从导航状态构建计算结果。
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
/// 输出帧数据。
pub struct OutputFrame {
    /// 原始样本。
    pub raw: ImuSampleRaw,
    /// 导航状态。
    pub nav: NavState,
}
