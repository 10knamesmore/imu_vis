//! IMU 处理管线实现。

use std::{
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::{Instant, SystemTime},
};

use anyhow::Context;

use crate::processor::{
    calibration::{AxisCalibration, Calibration, CorrectionRequest},
    filter::LowPassFilter,
    navigator::{Navigator, NavigatorConfig},
    output::{is_accel_saturated, OutputFrame},
    parser::{ImuParser, ImuSampleRaw},
    pipeline::{
        diagnostics::{DiagnosticsFlag, PipelineDiagnostics, QueueProbe},
        types::ProcessorPipelineConfig,
    },
};

/// IMU 处理管线。
pub struct ProcessorPipeline {
    axis_calibration: AxisCalibration,
    calibration: Calibration,
    filter: LowPassFilter,
    navigator: Navigator,
    latest_raw: Option<ImuSampleRaw>,
    /// 上一帧主机接收时刻（用于计算真实 BLE 收包间隔）。
    prev_receive_instant: Option<Instant>,
    /// 诊断开关。
    diagnostics_flag: DiagnosticsFlag,
    /// 诊断数据发送通道。
    diagnostics_tx: flume::Sender<PipelineDiagnostics>,
    /// 通道队列深度探针。
    queue_probe: QueueProbe,
}

/// 处理管线配置快照。
pub struct PipelineConfigSnapshot {
    /// 解析后的配置。
    pub config: ProcessorPipelineConfig,
    /// 配置来源路径。
    pub source: PathBuf,
    /// 配置文件最后修改时间。
    pub modified: SystemTime,
}

impl ProcessorPipeline {
    /// 创建处理管线。
    pub fn new(
        config: ProcessorPipelineConfig,
        diagnostics_flag: DiagnosticsFlag,
        diagnostics_tx: flume::Sender<PipelineDiagnostics>,
        queue_probe: QueueProbe,
    ) -> Self {
        let ProcessorPipelineConfig {
            global,
            calibration,
            filter,
            trajectory,
            zupt,
            navigator_impl,
            eskf,
        } = config;
        Self {
            axis_calibration: AxisCalibration::new(),
            calibration: Calibration::new(calibration),
            filter: LowPassFilter::new(filter),
            navigator: Navigator::new(NavigatorConfig {
                trajectory,
                zupt,
                gravity: global.gravity,
                navigator_impl,
                eskf,
            }),
            latest_raw: None,
            prev_receive_instant: None,
            diagnostics_flag,
            diagnostics_tx,
            queue_probe,
        }
    }

    /// 重置并应用新的配置。
    /// 并自动执行一次姿态零位校准。
    pub fn reset_with_config(&mut self, config: ProcessorPipelineConfig) {
        let last_raw = self.latest_raw;
        let diag_flag = self.diagnostics_flag.clone();
        let diag_tx = self.diagnostics_tx.clone();
        // QueueProbe 内部是 flume 的 clone 句柄，创建新的
        let queue_probe = QueueProbe::new(
            self.queue_probe.upstream_rx(),
            self.queue_probe.downstream_tx(),
            self.queue_probe.record_tx(),
        );
        *self = Self::new(config, diag_flag, diag_tx, queue_probe);
        if let Some(raw) = last_raw {
            self.axis_calibration.update_from_raw(&raw);
            self.navigator
                .set_gravity_reference(self.axis_calibration.quat_offset);
        }
    }

    /// 处理单个原始数据包并输出帧。
    pub fn process_packet(&mut self, packet: &[u8]) -> Option<OutputFrame> {
        // 解析原始蓝牙包
        let raw = match ImuParser::parse(packet) {
            Ok(sample) => sample,
            Err(e) => {
                tracing::warn!("IMU 数据解析失败: {:?}", e);
                return None;
            }
        };
        self.process_sample_raw(raw)
    }

    /// 处理已解析的原始样本并输出帧。
    ///
    /// 与 [`process_packet`](Self::process_packet) 共享全部后续流水线，
    /// 但跳过蓝牙字节解析。供离线 replay CLI 使用，以便从 SQLite 中读取
    /// 已存储的 [`ImuSampleRaw`] 重跑管线。
    pub fn process_sample_raw(&mut self, mut raw: ImuSampleRaw) -> Option<OutputFrame> {
        let diag_enabled = self.diagnostics_flag.load(Ordering::Relaxed);
        let t_start = if diag_enabled {
            Some(Instant::now())
        } else {
            None
        };

        self.latest_raw = Some(raw);

        self.axis_calibration.apply(&mut raw);

        // 对 accel_no_g 应用加速度计偏置修正（IMU 固件输出的去重力加速度仍含偏置）
        raw.accel_no_g -= self.calibration.accel_bias();

        // 处理链：标定 -> 滤波 -> 导航融合 -> 输出
        let calibrated = self.calibration.update(&raw);

        let filtered = self.filter.apply(&calibrated);

        let nav = self.navigator.update(raw.quat, &filtered);

        // 在线陀螺零偏估计：静止时用标定后的角速度更新零偏
        if self.navigator.is_static() {
            self.calibration
                .update_gyro_bias_online(calibrated.gyro);
        }

        // —— 诊断采集：仅当开关开启时执行 ——
        if let Some(t_start) = t_start {
            let diag = PipelineDiagnostics {
                timestamp_ms: raw.timestamp_ms,
                // 标定阶段
                cal_accel_bias: self.calibration.accel_bias(),
                cal_gyro_bias: self.calibration.gyro_bias(),
                cal_accel_pre: raw.accel_with_g,
                cal_accel_post: calibrated.accel,
                cal_gyro_pre: raw.gyro,
                cal_gyro_post: calibrated.gyro,
                // 滤波阶段
                filt_accel_pre: calibrated.accel,
                filt_accel_post: filtered.accel_lp,
                filt_gyro_pre: calibrated.gyro,
                filt_gyro_post: filtered.gyro_lp,
                // ZUPT 阶段
                zupt_is_static: self.navigator.is_static(),
                zupt_gyro_norm: self.navigator.zupt_gyro_norm(),
                zupt_accel_norm: self.navigator.zupt_accel_norm(),
                zupt_enter_count: self.navigator.zupt_enter_count(),
                zupt_exit_count: self.navigator.zupt_exit_count(),
                // 导航阶段
                nav_dt: self.navigator.current_dt(),
                nav_linear_accel: self.navigator.last_linear_accel(),
                // 饱和检测：IM948 量程 ±16g，超过 152 m/s² 视为截断
                accel_saturated: is_accel_saturated(raw.accel_with_g),
                // ESKF 专属
                eskf_cov_diag: self.navigator.eskf_cov_diag(),
                eskf_bias_gyro: self.navigator.eskf_bias_gyro(),
                eskf_bias_accel: self.navigator.eskf_bias_accel(),
                eskf_innovation: self.navigator.take_last_innovation(),
                // 后向修正
                backward_triggered: self.navigator.backward_triggered(),
                backward_correction_mag: self.navigator.backward_correction_mag(),
                // 性能指标
                perf_process_us: t_start.elapsed().as_micros() as u64,
                perf_upstream_queue_len: self.queue_probe.upstream_len() as u32,
                perf_downstream_queue_len: self.queue_probe.downstream_len() as u32,
                perf_record_queue_len: self.queue_probe.record_len() as u32,
                perf_ble_interval_ms: self
                    .prev_receive_instant
                    .map(|prev| t_start.duration_since(prev).as_secs_f64() * 1000.0)
                    .unwrap_or(0.0),
            };
            let _ = self.diagnostics_tx.try_send(diag);
        }

        self.prev_receive_instant = Some(Instant::now());
        Some(OutputFrame { raw, nav })
    }

    /// 重置内部状态
    pub fn reset(&mut self) {
        self.axis_calibration.reset();
        self.calibration.reset();
        self.filter.reset();
        self.navigator.reset();
        self.latest_raw = None;
        self.prev_receive_instant = None;
    }

    /// 响应姿态零位校准请求。
    pub fn handle_calibration_request(&mut self, request: CorrectionRequest) {
        match request {
            CorrectionRequest::SetAxis { respond_to } => {
                let result = match self.latest_raw {
                    Some(raw) => {
                        self.axis_calibration.update_from_raw(&raw);
                        self.navigator
                            .set_gravity_reference(self.axis_calibration.quat_offset);
                        Ok(())
                    }
                    None => Err("在前未接收到任何原始数据包，无法进行校准"),
                };
                if respond_to.send(result).is_err() {
                    tracing::error!("标定 response 接受端在发送前已被丢弃");
                };
            }
            CorrectionRequest::SetPosition {
                position,
                respond_to,
            } => {
                self.navigator.set_position(position);
                if respond_to.send(Ok(())).is_err() {
                    tracing::error!("位置校正 response 接受端在发送前已被丢弃");
                };
            }
        }
    }
}

impl ProcessorPipelineConfig {
    /// 返回 pipeline 配置文件路径。
    ///
    /// 优先查找当前目录下的 `processor.toml`，若不存在则查找父目录。
    /// 这样无论工作目录是 `src-tauri/` 还是项目根目录都能正确找到。
    pub fn default_config_path() -> PathBuf {
        let local = PathBuf::from("processor.toml");
        if local.exists() {
            return local;
        }
        let parent = PathBuf::from("../processor.toml");
        if parent.exists() {
            return parent;
        }
        // 回退到当前目录（让后续读取产生有意义的错误信息）
        local
    }

    /// 从默认路径加载配置与修改时间。
    pub fn load_from_default_paths_with_modified() -> anyhow::Result<PipelineConfigSnapshot> {
        let path = Self::default_config_path();
        let (config, modified) = read_config_with_modified(&path)?;
        let source = path.canonicalize().unwrap_or(path);

        Ok(PipelineConfigSnapshot {
            config,
            source,
            modified,
        })
    }
}

fn read_config_with_modified(path: &Path) -> anyhow::Result<(ProcessorPipelineConfig, SystemTime)> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("读取配置文件内容失败: {}", path.display()))?;
    let modified = std::fs::metadata(path)
        .with_context(|| format!("读取文件元数据失败: {}", path.display()))?
        .modified()
        .with_context(|| format!("读取文件修改时间失败: {}", path.display()))?;
    let config = toml::from_str::<ProcessorPipelineConfig>(&content)
        .with_context(|| format!("解析 TOML 配置失败: {}", path.display()))?;
    Ok((config, modified))
}
