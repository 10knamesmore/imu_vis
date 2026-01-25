//! IMU 处理管线实现。

use std::{
    path::{Path, PathBuf},
    time::SystemTime,
};

use crate::{
    processor::{
        attitude_fusion::AttitudeFusion,
        calibration::{AxisCalibration, AxisCalibrationRequest, Calibration},
        ekf::EkfProcessor,
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
    attitude_fusion: AttitudeFusion,
    trajectory: TrajectoryCalculator,
    zupt: ZuptDetector,
    ekf: EkfProcessor,
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
            attitude_fusion: AttitudeFusion::new(config.attitude_fusion),
            trajectory: TrajectoryCalculator::new(config.trajectory),
            zupt: ZuptDetector::new(config.zupt),
            ekf: EkfProcessor::new(config.ekf),
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

        // 处理链：标定 -> 滤波 -> 姿态融合 -> 轨迹计算 -> ZUPT -> EKF -> 输出
        let calibrated = self.calibration.update(&raw);
        let filtered = self.filter.apply(&calibrated);
        let attitude = self.attitude_fusion.update(&filtered, Some(raw.quat));
        let nav = self.trajectory.calculate(&attitude, &filtered);
        let (nav, obs) = self.zupt.apply(nav, &filtered);
        let nav = self.ekf.update(nav, &obs);

        let frame = OutputFrame { raw, nav };
        Some(OutputBuilder::build(&frame))
    }

    /// 重置内部状态
    pub fn reset(&mut self) {
        self.axis_calibration.reset();
        self.calibration.reset();
        self.filter.reset();
        self.attitude_fusion.reset();
        self.trajectory.reset();
        self.zupt.reset();
        self.ekf.reset();
        self.latest_raw = None;
    }

    /// 响应姿态零位校准请求。
    pub fn handle_calibration_request(&mut self, request: AxisCalibrationRequest) {
        match request {
            AxisCalibrationRequest::SetAxis { respond_to } => {
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
        }
    }
}

impl ProcessorPipelineConfig {
    /// 从默认路径加载配置与修改时间。
    pub fn load_from_default_paths_with_modified() -> Option<PipelineConfigSnapshot> {
        let candidates = [
            "processor.toml",
            "src-tauri/processor.toml",
            "../processor.toml",
        ];
        for path in candidates {
            if let Some((config, modified)) = read_config_with_modified(Path::new(path)) {
                let source = PathBuf::from(path)
                    .canonicalize()
                    .unwrap_or(PathBuf::from(path));

                return Some(PipelineConfigSnapshot {
                    config,
                    source,
                    modified,
                });
            }
        }
        None
    }
}

fn read_config_with_modified(path: &Path) -> Option<(ProcessorPipelineConfig, SystemTime)> {
    let content = std::fs::read_to_string(path).ok()?;
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    match toml::from_str::<ProcessorPipelineConfig>(&content) {
        Ok(config) => Some((config, modified)),
        Err(err) => {
            tracing::warn!("读取配置失败 {:?}: {}", path, err);
            None
        }
    }
}
