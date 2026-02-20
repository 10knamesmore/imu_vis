//! IMU 处理管线实现。

use std::{
    path::{Path, PathBuf},
    time::SystemTime,
};

use anyhow::Context;

use crate::{
    processor::{
        calibration::{AxisCalibration, Calibration, CorrectionRequest},
        filter::LowPassFilter,
        output::{OutputBuilder, OutputFrame},
        parser::{ImuParser, ImuSampleRaw},
        pipeline::types::ProcessorPipelineConfig,
        trajectory::TrajectoryCalculator,
        zupt::ZuptDetector,
    },
    types::outputs::ResponseData,
};

/// IMU 处理管线。
pub struct ProcessorPipeline {
    axis_calibration: AxisCalibration,
    calibration: Calibration,
    filter: LowPassFilter,
    trajectory: TrajectoryCalculator,
    zupt: ZuptDetector,
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
        Self {
            axis_calibration: AxisCalibration::new(),
            calibration: Calibration::new(config.calibration),
            filter: LowPassFilter::new(config.filter),
            trajectory: TrajectoryCalculator::new(config.trajectory, config.global.gravity),
            zupt: ZuptDetector::new(config.zupt, config.global.gravity),
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
        }
    }

    /// 处理单个原始数据包并输出响应。
    pub fn process_packet(&mut self, packet: &[u8]) -> Option<ResponseData> {
        // 解析原始蓝牙包
        let mut raw = match ImuParser::parse(packet) {
            Ok(sample) => sample,
            Err(e) => {
                tracing::warn!("IMU 数据解析失败: {:?}", e);
                return None;
            }
        };

        self.latest_raw = Some(raw);
        self.axis_calibration.apply(&mut raw);

        // 处理链：标定 -> 滤波 -> 轨迹计算 -> ZUPT -> 输出
        let calibrated = self.calibration.update(&raw);
        let filtered = self.filter.apply(&calibrated);
        let nav = self.trajectory.calculate(raw.quat, &filtered);
        let nav = self.zupt.apply(nav, &filtered);

        let frame = OutputFrame { raw, nav };
        Some(OutputBuilder::build(&frame))
    }

    /// 重置内部状态
    pub fn reset(&mut self) {
        self.axis_calibration.reset();
        self.calibration.reset();
        self.filter.reset();
        self.trajectory.reset();
        self.zupt.reset();
        self.latest_raw = None;
    }

    /// 响应姿态零位校准请求。
    pub fn handle_calibration_request(&mut self, request: CorrectionRequest) {
        match request {
            CorrectionRequest::SetAxis { respond_to } => {
                let result = match self.latest_raw {
                    Some(raw) => {
                        self.axis_calibration.update_from_raw(&raw);
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
                self.trajectory.set_position(position);
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
    let absolute_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    tracing::info!(
        "读取 processor 配置文件 | path: {} | content:\n{}",
        absolute_path.display(),
        content
    );
    let config = toml::from_str::<ProcessorPipelineConfig>(&content)
        .with_context(|| format!("解析 TOML 配置失败: {}", path.display()))?;
    Ok((config, modified))
}
