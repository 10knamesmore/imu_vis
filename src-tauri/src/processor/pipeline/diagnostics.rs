//! 管线诊断数据采集。
//!
//! 提供 [`PipelineDiagnostics`] 结构体，捕获每帧处理管线各阶段的中间值和性能指标。
//! 仅在诊断开关开启时采集，关闭时通过 [`AtomicBool`] 门控实现零开销。

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use math_f64::DVec3;
use serde::Serialize;

/// 诊断开关标记，跨线程共享。
///
/// 使用 `Relaxed` 语序即可——只需最终可见性，无需与其他内存操作同步。
pub type DiagnosticsFlag = Arc<AtomicBool>;

/// Pipeline 诊断快照，每帧一份。
///
/// 仅在诊断开关开启时由 [`super::ProcessorPipeline::process_packet`] 填充并发送。
/// 包含三类信息：
/// 1. **各阶段中间值**：标定前后、滤波前后、ZUPT 状态、ESKF 内部状态
/// 2. **性能指标**：处理耗时、通道队列深度、蓝牙收包间隔
/// 3. **事件标记**：后向修正触发
#[derive(Debug, Clone, Serialize)]
pub struct PipelineDiagnostics {
    /// 帧时间戳 (ms)，与主数据路径一致。
    pub timestamp_ms: u64,

    // —— 标定阶段 ——
    /// 当前加速度计偏置 (m/s²)。
    pub cal_accel_bias: DVec3,
    /// 当前陀螺仪偏置 (rad/s)，含在线 EMA 更新。
    pub cal_gyro_bias: DVec3,
    /// 标定前加速度 (m/s²)，即含重力原始值。
    pub cal_accel_pre: DVec3,
    /// 标定后加速度 (m/s²)，经偏置去除 + 矩阵修正。
    pub cal_accel_post: DVec3,
    /// 标定前角速度 (deg/s)，IMU 原始输出。
    pub cal_gyro_pre: DVec3,
    /// 标定后角速度 (rad/s)，经单位转换 + 偏置去除 + 矩阵修正。
    pub cal_gyro_post: DVec3,

    // —— 滤波阶段 ——
    /// 滤波前加速度 (m/s²)。
    pub filt_accel_pre: DVec3,
    /// 滤波后加速度 (m/s²)。
    pub filt_accel_post: DVec3,
    /// 滤波前角速度 (rad/s)。
    pub filt_gyro_pre: DVec3,
    /// 滤波后角速度 (rad/s)。
    pub filt_gyro_post: DVec3,

    // —— ZUPT 阶段 ——
    /// 是否处于静止状态。
    pub zupt_is_static: bool,
    /// ZUPT 检测用的陀螺仪范数 (rad/s)。
    pub zupt_gyro_norm: f64,
    /// ZUPT 检测用的线性加速度范数 (m/s²)。
    pub zupt_accel_norm: f64,
    /// 迟滞进入计数器。
    pub zupt_enter_count: u32,
    /// 迟滞退出计数器。
    pub zupt_exit_count: u32,

    // —— 导航阶段 ——
    /// 积分时间步长 (s)。
    pub nav_dt: f64,
    /// 世界系线性加速度 (m/s²)，去重力后。
    pub nav_linear_accel: DVec3,

    // —— ESKF 专属（Legacy 模式下为 None）——
    /// 协方差对角线（15 个值：att\[3\], vel\[3\], pos\[3\], bg\[3\], ba\[3\]）。
    pub eskf_cov_diag: Option<[f64; 15]>,
    /// ESKF 估计的陀螺偏差 (rad/s)。
    pub eskf_bias_gyro: Option<DVec3>,
    /// ESKF 估计的加速度计偏差 (m/s²)。
    pub eskf_bias_accel: Option<DVec3>,
    /// ZUPT 更新时的创新向量（仅更新帧有值）。
    pub eskf_innovation: Option<DVec3>,

    // —— 后向修正 ——
    /// 本帧是否触发了后向修正。
    pub backward_triggered: bool,
    /// 后向修正量 (m)。
    pub backward_correction_mag: f64,

    // —— 性能指标 ——
    /// 本帧 `process_packet` 处理耗时 (μs)。
    pub perf_process_us: u64,
    /// 上游通道（蓝牙 → 处理器）当前队列深度。
    pub perf_upstream_queue_len: u32,
    /// 下游通道（处理器 → 前端）当前队列深度。
    pub perf_downstream_queue_len: u32,
    /// 录制通道当前队列深度。
    pub perf_record_queue_len: u32,
    /// 蓝牙收包间隔 (ms)，即本帧与上帧的时间戳差值。
    pub perf_ble_interval_ms: f64,
}

/// 通道队列深度探针，用于在诊断中读取各通道的当前排队长度。
///
/// 持有各 flume 通道的引用（通过 clone 得到的轻量句柄），
/// 调用 `.len()` 获取当前队列深度，O(1) 开销。
pub struct QueueProbe {
    upstream: flume::Receiver<crate::processor::RawImuData>,
    downstream: flume::Sender<crate::types::outputs::ResponseData>,
    record: flume::Sender<crate::processor::output::OutputFrame>,
}

impl QueueProbe {
    /// 创建队列探针。
    pub fn new(
        upstream: flume::Receiver<crate::processor::RawImuData>,
        downstream: flume::Sender<crate::types::outputs::ResponseData>,
        record: flume::Sender<crate::processor::output::OutputFrame>,
    ) -> Self {
        Self {
            upstream,
            downstream,
            record,
        }
    }

    /// 读取上游通道队列深度。
    pub fn upstream_len(&self) -> usize {
        self.upstream.len()
    }

    /// 读取下游通道队列深度。
    pub fn downstream_len(&self) -> usize {
        self.downstream.len()
    }

    /// 读取录制通道队列深度。
    pub fn record_len(&self) -> usize {
        self.record.len()
    }

    /// 克隆上游通道接收端句柄（用于 reset_with_config 重建）。
    pub fn upstream_rx(&self) -> flume::Receiver<crate::processor::RawImuData> {
        self.upstream.clone()
    }

    /// 克隆下游通道发送端句柄。
    pub fn downstream_tx(&self) -> flume::Sender<crate::types::outputs::ResponseData> {
        self.downstream.clone()
    }

    /// 克隆录制通道发送端句柄。
    pub fn record_tx(&self) -> flume::Sender<crate::processor::output::OutputFrame> {
        self.record.clone()
    }
}

/// 检查诊断开关是否开启。
///
/// 使用 `Relaxed` 语序，编译为单条内存加载指令，约 1ns。
#[inline]
pub fn is_diagnostics_enabled(flag: &DiagnosticsFlag) -> bool {
    flag.load(Ordering::Relaxed)
}
