//! IMU 原始样本类型定义。

use math_f64::{DQuat, DVec3};
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
/// 从蓝牙数据包中解析出的原始数据体, 保证数据均为有效值
pub struct ImuSampleRaw {
    /// 运行时间ms
    pub timestamp_ms: u64,
    /// 没有G的重力加速度 m/s^2
    pub accel_no_g: DVec3,
    /// 有G的重力加速度 m/s^2
    pub accel_with_g: DVec3,
    /// 角速度 度/s (原始输出)
    pub gyro: DVec3,
    /// 四元数
    pub quat: DQuat,
    /// 欧拉角 度
    pub angle: DVec3,
    /// 位置偏移 m
    pub offset: DVec3,
    /// 导航系加速度
    pub accel_nav: DVec3,
}

/// 与历史接口兼容的原始样本别名。
pub type IMUData = ImuSampleRaw;
