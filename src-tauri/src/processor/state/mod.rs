use attitude::Attitude;
use math_f64::DQuat;
use position::Position;
use velocity::Velocity;

use crate::processor::parser::data::IMUData;

pub mod attitude;
pub mod position;
pub mod velocity;

/// [TODO:description]
///
/// * `attitude`: [TODO:parameter]
/// * `velocity`: [TODO:parameter]
/// * `position`: [TODO:parameter]
/// * `timestamp_ms`: [TODO:parameter]
#[derive(Clone, Copy)]
pub struct State {
    pub attitude: Attitude,
    pub velocity: Velocity,
    pub position: Position,
    pub timestamp_ms: u64,
}

impl State {
    pub fn new(attitude: DQuat, timestamp_ms: u64) -> Self {
        State {
            attitude: Attitude::new(attitude),
            velocity: Velocity::default(),
            position: Position::default(),
            timestamp_ms,
        }
    }

    pub fn update(&mut self, imu_data: &IMUData) {
        // OPTIM: 目前只是MVP版本
        let delta_time_ms = imu_data.timestamp_ms - self.timestamp_ms;

        self.attitude.set(imu_data.quat); // 目前的姿态完全采用IMU输出
        self.velocity.update(&imu_data.accel_no_g, delta_time_ms);
        self.position.update(&self.velocity, delta_time_ms);

        self.timestamp_ms = imu_data.timestamp_ms;
    }
}
