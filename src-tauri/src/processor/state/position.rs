use std::ops::Deref;

use glam::DVec3;
use serde::Serialize;

use crate::processor::state::velocity::Velocity;

/// 位置 单位 m
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Position(DVec3);

impl Position {
    /// 更新坐标 返回 **更新前的坐标**
    ///
    /// * `velocity`: 速度 m/s 地面参考参考系
    /// * `time_delta_ms`: \delta t
    pub fn update(&mut self, velocity: &Velocity, delta_time_ms: u64) -> Self {
        // OPTIM: 目前只是单纯积分, 考虑优化
        let old_pos = self.0;
        self.0 = old_pos + velocity * (delta_time_ms as f64 / 1000.0);
        Position(old_pos)
    }
}

impl Default for Position {
    fn default() -> Self {
        Self(DVec3::ZERO)
    }
}

impl Deref for Position {
    type Target = DVec3;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
