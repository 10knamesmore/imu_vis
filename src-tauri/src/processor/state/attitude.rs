use std::ops::Deref;

use glam::DQuat;
use serde::Serialize;

/// 姿态 四元数表示
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Attitude(DQuat);

impl Attitude {
    pub fn new(quat: DQuat) -> Self {
        Attitude(quat)
    }

    pub fn _update(&mut self) {
        todo!()
    }

    pub fn set(&mut self, attitude: DQuat) {
        self.0 = attitude
    }
}

impl Deref for Attitude {
    type Target = DQuat;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
