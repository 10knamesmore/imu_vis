//! 输出构建逻辑。

use math_f64::DVec3;

use crate::processor::output::types::OutputFrame;
use crate::types::outputs::ResponseData;

/// IMU 加速度量程饱和检测阈值（m/s²）。
///
/// IM948 加速度计 16-bit 量化上限 ±156.78 m/s²（±16g），留 0.5g 余量为 152.0 m/s²。
/// 超过此值认为该帧加速度被 ADC 截断，后续位置/速度积分发散。
/// 详见 `docs/imu_saturation_research.md`。
pub const ACCEL_SATURATION_THRESHOLD_MS2: f64 = 152.0;

/// 判断一帧含重力加速度是否触发饱和（任一轴越界即为饱和）。
#[inline]
pub fn is_accel_saturated(accel_with_g: DVec3) -> bool {
    accel_with_g.x.abs() > ACCEL_SATURATION_THRESHOLD_MS2
        || accel_with_g.y.abs() > ACCEL_SATURATION_THRESHOLD_MS2
        || accel_with_g.z.abs() > ACCEL_SATURATION_THRESHOLD_MS2
}

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
            accel_saturated: is_accel_saturated(frame.raw.accel_with_g),
        }
    }
}
