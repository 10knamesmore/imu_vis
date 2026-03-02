//! 输出数据类型。

use math_f64::{DQuat, DVec3};
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
/// 前端响应数据，扁平化结构，仅包含展示所需字段
pub struct ResponseData {
    /// 时间戳（毫秒）
    pub timestamp_ms: u64,
    /// 去重力加速度（m/s²）
    pub accel: DVec3,
    /// 含重力加速度（m/s²，用于标定向导）
    pub accel_with_g: DVec3,
    /// 姿态四元数（计算值）
    pub attitude: DQuat,
    /// 速度（m/s，计算值）
    pub velocity: DVec3,
    /// 位置（m，计算值）
    pub position: DVec3,
}
