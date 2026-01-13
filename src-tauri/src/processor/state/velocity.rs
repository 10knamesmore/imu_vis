use std::ops::{Deref, Mul};

use math_f64::DVec3;
use serde::Serialize;

/// 速度 单位 m / s
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Velocity(DVec3);

impl Velocity {
    /// 更新速度, 返回更新前速度
    ///
    /// * `accel_no_g`: 无G的加速度 m / s ^ 2, 地面参考系
    /// * `time_delta_ms`: \delta t
    pub fn update(&mut self, accel_no_g: &DVec3, delta_time_ms: u64) -> Self {
        // OPTIM: 目前只是单纯积分, 考虑优化
        let old_v = self.0;
        self.0 = old_v + accel_no_g * (delta_time_ms as f64 / 1000.0);
        Velocity(old_v)
    }

    pub fn set(&mut self, v: DVec3) {
        self.0 = v;
    }
}

impl Default for Velocity {
    fn default() -> Self {
        Self(DVec3::ZERO)
    }
}

impl Deref for Velocity {
    type Target = DVec3;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Mul<f64> for &Velocity {
    type Output = DVec3;

    fn mul(self, rhs: f64) -> Self::Output {
        self.0 * rhs
    }
}
