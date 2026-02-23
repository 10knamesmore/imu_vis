//! IMU 处理管线实现。

use std::{
    path::{Path, PathBuf},
    time::{Instant, SystemTime},
};

use anyhow::Context;
use serde::Serialize;
use serde_json::{json, Value};

use crate::{
    processor::{
        calibration::{AxisCalibration, Calibration, CorrectionRequest},
        filter::LowPassFilter,
        navigator::{Navigator, NavigatorConfig},
        output::{OutputBuilder, OutputFrame},
        parser::{ImuParser, ImuSampleRaw},
        pipeline::types::ProcessorPipelineConfig,
    },
    types::{
        debug::{
            DebugStageSnapshot, STAGE_AXIS_CALIBRATION, STAGE_CALIBRATION, STAGE_FILTER,
            STAGE_NAVIGATOR, STAGE_OUTPUT_BUILDER,
        },
        outputs::ResponseData,
    },
};

/// IMU 处理管线。
pub struct ProcessorPipeline {
    axis_calibration: AxisCalibration,
    calibration: Calibration,
    filter: LowPassFilter,
    navigator: Navigator,
    latest_raw: Option<ImuSampleRaw>,
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
    pub fn new(config: ProcessorPipelineConfig) -> Self {
        let ProcessorPipelineConfig {
            global,
            calibration,
            filter,
            trajectory,
            zupt,
        } = config;
        Self {
            axis_calibration: AxisCalibration::new(),
            calibration: Calibration::new(calibration),
            filter: LowPassFilter::new(filter),
            navigator: Navigator::new(NavigatorConfig {
                trajectory,
                zupt,
                gravity: global.gravity,
            }),
            latest_raw: None,
        }
    }

    /// 重置并应用新的配置。
    /// 并自动执行一次姿态零位校准。
    pub fn reset_with_config(&mut self, config: ProcessorPipelineConfig) {
        let last_raw = self.latest_raw;
        *self = Self::new(config);
        if let Some(raw) = last_raw {
            self.axis_calibration.update_from_raw(&raw);
            self.navigator
                .set_gravity_reference(self.axis_calibration.quat_offset);
        }
    }

    /// 处理单个原始数据包并输出响应，同时返回 Debug 阶段快照。
    pub fn process_packet(
        &mut self,
        packet: &[u8],
    ) -> Option<(ResponseData, Vec<DebugStageSnapshot>, u64)> {
        // 解析原始蓝牙包
        let mut raw = match ImuParser::parse(packet) {
            Ok(sample) => sample,
            Err(e) => {
                tracing::warn!("IMU 数据解析失败: {:?}", e);
                return None;
            }
        };

        let mut stages = Vec::with_capacity(5);
        self.latest_raw = Some(raw);

        // Stage axis_calibration:
        // input/output 均为 ImuSampleRaw JSON 结构，区别是 output 已应用零位校正。
        let axis_input = raw;
        let axis_started_at = Instant::now();
        self.axis_calibration.apply(&mut raw);
        stages.push(build_stage_snapshot(
            STAGE_AXIS_CALIBRATION,
            &axis_input,
            &raw,
            axis_started_at,
        ));

        // 处理链：标定 -> 滤波 -> 导航融合 -> 输出
        // Stage calibration:
        // input: ImuSampleRaw JSON；output: ImuSampleCalibrated JSON。
        let calibration_input = raw;
        let calibration_started_at = Instant::now();
        let calibrated = self.calibration.update(&calibration_input);
        stages.push(build_stage_snapshot(
            STAGE_CALIBRATION,
            &calibration_input,
            &calibrated,
            calibration_started_at,
        ));

        // Stage filter:
        // input: ImuSampleCalibrated JSON；output: ImuSampleFiltered JSON。
        let filter_input = calibrated;
        let filter_started_at = Instant::now();
        let filtered = self.filter.apply(&filter_input);
        stages.push(build_stage_snapshot(
            STAGE_FILTER,
            &filter_input,
            &filtered,
            filter_started_at,
        ));

        // Stage navigator:
        // input: { attitude, filtered }；output: NavState JSON。
        let navigator_input = json!({
            "attitude": raw.quat,
            "filtered": to_debug_value(&filtered),
        });
        let navigator_started_at = Instant::now();
        let nav = self.navigator.update(raw.quat, &filtered);
        stages.push(DebugStageSnapshot::new(
            STAGE_NAVIGATOR.to_string(),
            navigator_input,
            to_debug_value(&nav),
            Some(duration_us(navigator_started_at)),
        ));

        // Stage output_builder:
        // input: { raw, nav }；output: ResponseData JSON。
        let output_input = json!({
            "raw": to_debug_value(&raw),
            "nav": to_debug_value(&nav),
        });
        let output_started_at = Instant::now();
        let frame = OutputFrame { raw, nav };
        let response = OutputBuilder::build(&frame);
        stages.push(DebugStageSnapshot::new(
            STAGE_OUTPUT_BUILDER.to_string(),
            output_input,
            to_debug_value(&response),
            Some(duration_us(output_started_at)),
        ));
        Some((response, stages, raw.timestamp_ms))
    }

    /// 重置内部状态
    pub fn reset(&mut self) {
        self.axis_calibration.reset();
        self.calibration.reset();
        self.filter.reset();
        self.navigator.reset();
        self.latest_raw = None;
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
    /// 返回 pipeline 配置文件的固定路径（当前工作目录）。
    pub fn default_config_path() -> PathBuf {
        PathBuf::from("processor.toml")
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

fn build_stage_snapshot<TIn: Serialize, TOut: Serialize>(
    stage_name: &str,
    input: &TIn,
    output: &TOut,
    started_at: Instant,
) -> DebugStageSnapshot {
    DebugStageSnapshot::new(
        stage_name.to_string(),
        to_debug_value(input),
        to_debug_value(output),
        Some(duration_us(started_at)),
    )
}

fn to_debug_value<T: Serialize>(data: &T) -> Value {
    match serde_json::to_value(data) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!("序列化 Debug Stage JSON 失败: {error:#}");
            Value::Null
        }
    }
}

fn duration_us(started_at: Instant) -> u64 {
    let elapsed = started_at.elapsed().as_micros();
    elapsed.min(u128::from(u64::MAX)) as u64
}
