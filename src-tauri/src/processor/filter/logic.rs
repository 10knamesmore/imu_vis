//! 低通滤波逻辑。

use math_f64::DVec3;

use crate::processor::calibration::ImuSampleCalibrated;
use crate::processor::filter::types::{ImuSampleFiltered, LowPassFilterConfig};

/// 一阶低通滤波器。
pub struct LowPassFilter {
    config: LowPassFilterConfig,
    prev_accel: Option<DVec3>,
    prev_gyro: Option<DVec3>,
}

impl LowPassFilter {
    /// 创建低通滤波器。
    pub fn new(config: LowPassFilterConfig) -> Self {
        Self {
            config,
            prev_accel: None,
            prev_gyro: None,
        }
    }

    /// 应用滤波并输出低通样本。
    ///
    /// 参数:
    /// - `sample`: 标定后的 IMU 样本（加速度/角速度）。
    ///
    /// 返回:
    /// - 低通滤波后的样本。
    ///
    /// 公式: `y_t = alpha * y_{t-1} + (1 - alpha) * x_t`
    pub fn apply(&mut self, sample: &ImuSampleCalibrated) -> ImuSampleFiltered {
        // 一阶低通滤波
        if self.config.passby {
            return ImuSampleFiltered {
                timestamp_ms: sample.timestamp_ms,
                accel_lp: sample.accel,
                gyro_lp: sample.gyro,
            };
        }
        let alpha = self.config.alpha;

        let accel_lp = match self.prev_accel {
            Some(prev) => prev * alpha + sample.accel * (1.0 - alpha),
            None => sample.accel,
        };
        let gyro_lp = match self.prev_gyro {
            Some(prev) => prev * alpha + sample.gyro * (1.0 - alpha),
            None => sample.gyro,
        };

        self.prev_accel = Some(accel_lp);
        self.prev_gyro = Some(gyro_lp);

        ImuSampleFiltered {
            timestamp_ms: sample.timestamp_ms,
            accel_lp,
            gyro_lp,
        }
    }

    /// 重置滤波状态。
    pub fn reset(&mut self) {
        self.prev_accel = None;
        self.prev_gyro = None;
    }
}
