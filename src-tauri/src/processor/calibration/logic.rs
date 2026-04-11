//! 标定逻辑实现。

use math_f64::DVec3;

use crate::processor::{
    calibration::types::{
        AxisCalibration, CalibrationState, ImuCalibrationConfig, ImuSampleCalibrated,
    },
    parser::ImuSampleRaw,
};

const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;

/// 标定处理器。
pub struct Calibration {
    config: ImuCalibrationConfig,
    state: CalibrationState,
}

impl Calibration {
    /// 创建标定处理器。
    pub fn new(config: ImuCalibrationConfig) -> Self {
        let state = CalibrationState::new(&config);
        Self { config, state }
    }

    /// 将原始样本转换为标定后的样本。
    ///
    /// 参数:
    /// - `raw`: 原始 IMU 样本（未标定）。
    ///
    /// 返回:
    /// - 标定后的样本（去偏置 + 标定矩阵 + 角速度转弧度）。
    ///
    /// 公式:
    /// - `a = M_a * (a_raw - b_a)`
    /// - `w = M_g * ((gyro_deg * deg_to_rad) - b_g)`
    pub fn update(&mut self, raw: &ImuSampleRaw) -> ImuSampleCalibrated {
        if self.config.passby {
            return ImuSampleCalibrated {
                timestamp_ms: raw.timestamp_ms,
                accel: raw.accel_with_g,
                gyro: raw.gyro,
            };
        }

        // 先去偏置再做矩阵标定，并将角速度转为 rad/s
        let accel = apply_matrix(
            self.config.accel_matrix,
            raw.accel_with_g - self.state.bias_a,
        );
        let gyro_rad = raw.gyro * DEG_TO_RAD;
        let gyro = apply_matrix(self.config.gyro_matrix, gyro_rad - self.state.bias_g);

        ImuSampleCalibrated {
            timestamp_ms: raw.timestamp_ms,
            accel,
            gyro,
        }
    }

    /// 重置标定状态。
    pub fn reset(&mut self) {
        self.state = CalibrationState::new(&self.config);
    }

    /// 返回加速度计偏置（passby 模式下返回零）。
    ///
    /// 用于在 pipeline 中对 `accel_no_g` 做单独偏置修正。
    pub fn accel_bias(&self) -> DVec3 {
        if self.config.passby {
            DVec3::ZERO
        } else {
            self.config.accel_bias
        }
    }

    /// 在线更新陀螺仪零偏估计。
    ///
    /// 当 ZUPT 检测到静止状态时调用，使用 EMA 平滑更新陀螺零偏。
    /// `gyro_raw_rad` 为标定后的角速度（rad/s），静止时应接近零偏。
    pub fn update_gyro_bias_online(&mut self, gyro_raw_rad: DVec3) {
        if self.config.passby {
            return;
        }
        // EMA 平滑因子：0.01 意味着约 100 帧（~400ms@250Hz）收敛到新值
        const ALPHA: f64 = 0.01;
        self.state.bias_g = self.state.bias_g * (1.0 - ALPHA) + gyro_raw_rad * ALPHA;
    }
}

impl AxisCalibration {
    /// 创建姿态零位校准状态。
    pub fn new() -> Self {
        Self::default()
    }

    /// 应用姿态零位校准（角度减偏移，四元数左乘偏移）。
    ///
    /// 参数:
    /// - `raw`: 原始 IMU 样本（会被就地修改）。
    ///
    /// 公式:
    /// - `angle' = angle - angle_offset`
    /// - `quat' = quat_offset * quat`
    pub fn apply(&self, raw: &mut ImuSampleRaw) {
        raw.angle -= self.angle_offset;
        raw.quat = self.quat_offset * raw.quat;
    }

    /// 以当前原始姿态更新零位校准参数。
    pub fn update_from_raw(&mut self, raw: &ImuSampleRaw) {
        self.angle_offset = raw.angle;
        self.quat_offset = raw.quat.inverse();
    }

    /// 清空姿态零位校准。
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

fn apply_matrix(matrix: [[f64; 3]; 3], v: DVec3) -> DVec3 {
    // 3x3 矩阵乘向量
    let x = matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z;
    let y = matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z;
    let z = matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z;
    DVec3 { x, y, z }
}
