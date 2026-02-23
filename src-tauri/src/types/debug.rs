//! Debug 双流数据类型。

use serde::Serialize;
use serde_json::Value;

use crate::types::outputs::ResponseData;

/// Debug 实时流中的单个 stage 快照。
#[derive(Debug, Clone, Serialize)]
pub struct DebugStageSnapshot {
    /// Stage 名称，固定枚举字符串。
    pub name: String,
    /// Stage 输入数据（JSON Value）。
    pub input: Value,
    /// Stage 输出数据（JSON Value）。
    pub output: Value,
    /// Stage 处理耗时（微秒）。
    pub duration_us: Option<u64>,
}

impl DebugStageSnapshot {
    /// 构建 stage 快照。
    pub fn new(name: String, input: Value, output: Value, duration_us: Option<u64>) -> Self {
        Self {
            name,
            input,
            output,
            duration_us,
        }
    }
}

/// Debug 实时流帧。
#[derive(Debug, Clone, Serialize)]
pub struct DebugRealtimeFrame {
    /// 单调递增序号。
    pub seq: u64,
    /// 设备时间戳（毫秒）。
    pub device_timestamp_ms: u64,
    /// 主机时间戳（毫秒）。
    pub host_timestamp_ms: u64,
    /// 各处理阶段快照。
    pub stages: Vec<DebugStageSnapshot>,
    /// 最终输出帧（与普通输出流一致）。
    pub output: ResponseData,
    /// 预留扩展字段。
    pub ext: Option<Value>,
}

/// 通道队列深度。
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct QueueDepth {
    /// 上游输入队列深度。
    pub upstream: u64,
    /// 下游输出队列深度。
    pub downstream: u64,
    /// 录制队列深度。
    pub record: u64,
}

/// Debug 监控流（1 秒周期）数据。
#[derive(Debug, Clone, Serialize)]
pub struct DebugMonitorTick {
    /// 监控采样时间戳（毫秒）。
    pub ts_ms: u64,
    /// 输入速率（Hz）。
    pub input_hz: f64,
    /// Pipeline 处理速率（Hz）。
    pub pipeline_hz: f64,
    /// 输出速率（Hz）。
    pub output_hz: f64,
    /// 前端接收速率（Hz）。
    pub frontend_rx_hz: f64,
    /// 当前队列深度。
    pub queue_depth: QueueDepth,
    /// 最近 1 秒队列峰值。
    pub queue_peak: QueueDepth,
    /// 预留扩展字段。
    pub ext: Option<Value>,
}

/// Stage: `axis_calibration`
///
/// input JSON:
/// {
///   "timestamp_ms": u64,
///   "accel_no_g": {"x": f64, "y": f64, "z": f64},
///   "accel_with_g": {"x": f64, "y": f64, "z": f64},
///   "gyro": {"x": f64, "y": f64, "z": f64},
///   "quat": {"w": f64, "x": f64, "y": f64, "z": f64},
///   "angle": {"x": f64, "y": f64, "z": f64},
///   "offset": {"x": f64, "y": f64, "z": f64},
///   "accel_nav": {"x": f64, "y": f64, "z": f64}
/// }
///
/// output JSON: 同 input 结构，表示应用零位校正后的 raw 样本。
pub const STAGE_AXIS_CALIBRATION: &str = "axis_calibration";

/// Stage: `calibration`
///
/// input JSON: `axis_calibration` 输出结构。
///
/// output JSON:
/// {
///   "timestamp_ms": u64,
///   "accel": {"x": f64, "y": f64, "z": f64},
///   "gyro": {"x": f64, "y": f64, "z": f64}
/// }
///
/// 说明：`gyro` 单位为 rad/s。
pub const STAGE_CALIBRATION: &str = "calibration";

/// Stage: `filter`
///
/// input JSON:
/// {
///   "timestamp_ms": u64,
///   "accel": {"x": f64, "y": f64, "z": f64},
///   "gyro": {"x": f64, "y": f64, "z": f64}
/// }
///
/// output JSON:
/// {
///   "timestamp_ms": u64,
///   "accel_lp": {"x": f64, "y": f64, "z": f64},
///   "gyro_lp": {"x": f64, "y": f64, "z": f64}
/// }
pub const STAGE_FILTER: &str = "filter";

/// Stage: `navigator`
///
/// input JSON:
/// {
///   "attitude": {"w": f64, "x": f64, "y": f64, "z": f64},
///   "filtered": {
///     "timestamp_ms": u64,
///     "accel_lp": {"x": f64, "y": f64, "z": f64},
///     "gyro_lp": {"x": f64, "y": f64, "z": f64}
///   }
/// }
///
/// output JSON:
/// {
///   "timestamp_ms": u64,
///   "attitude": {"w": f64, "x": f64, "y": f64, "z": f64},
///   "velocity": {"x": f64, "y": f64, "z": f64},
///   "position": {"x": f64, "y": f64, "z": f64}
/// }
pub const STAGE_NAVIGATOR: &str = "navigator";

/// Stage: `output_builder`
///
/// input JSON:
/// {
///   "raw": { ... `axis_calibration` 输出结构 ... },
///   "nav": { ... `navigator` 输出结构 ... }
/// }
///
/// output JSON:
/// {
///   "raw_data": { ... raw sample ... },
///   "calculated_data": {
///     "attitude": {"w": f64, "x": f64, "y": f64, "z": f64},
///     "velocity": {"x": f64, "y": f64, "z": f64},
///     "position": {"x": f64, "y": f64, "z": f64},
///     "timestamp_ms": u64
///   }
/// }
pub const STAGE_OUTPUT_BUILDER: &str = "output_builder";
