use serde::Serialize;

use crate::processor::{parser::data::IMUData, CalculatedData};

#[derive(Debug, Clone, Copy, Serialize)]
/// 响应数据结构，包含原始 IMU 数据和计算后的数据
pub struct ResponseData {
    /// 原始 IMU 数据（加速度、角速度、四元数等）
    pub raw_data: IMUData,
    /// 计算后的数据（速度、位置、姿态等）
    pub calculated_data: CalculatedData,
}

impl ResponseData {
    /// 从原始数据和计算数据构建响应数据
    pub fn from_parts(raw_data: &IMUData, calculated_data: &CalculatedData) -> Self {
        Self {
            raw_data: *raw_data,
            calculated_data: *calculated_data,
        }
    }
}
