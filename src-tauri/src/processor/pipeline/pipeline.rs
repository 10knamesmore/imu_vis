use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};

use crate::app_state::ImuCalibration;
use crate::processor::attitude_fusion::AttitudeFusion;
use crate::processor::calibration::Calibration;
use crate::processor::ekf::EkfProcessor;
use crate::processor::filter::LowPassFilter;
use crate::processor::output::{OutputBuilder, OutputFrame};
use crate::processor::parser::ImuParser;
use crate::processor::pipeline::types::ProcessorPipelineConfig;
use crate::processor::strapdown::Strapdown;
use crate::processor::zupt::ZuptDetector;
use crate::types::outputs::ResponseData;

pub struct ProcessorPipeline {
    calibration: Calibration,
    filter: LowPassFilter,
    attitude_fusion: AttitudeFusion,
    strapdown: Strapdown,
    zupt: ZuptDetector,
    ekf: EkfProcessor,
}

impl ProcessorPipeline {
    pub fn new(config: ProcessorPipelineConfig) -> Self {
        Self {
            calibration: Calibration::new(config.calibration),
            filter: LowPassFilter::new(config.filter),
            attitude_fusion: AttitudeFusion::new(config.attitude_fusion),
            strapdown: Strapdown::new(config.strapdown),
            zupt: ZuptDetector::new(config.zupt),
            ekf: EkfProcessor::new(config.ekf),
        }
    }

    pub fn process_packet(
        &mut self,
        packet: &[u8],
        imu_calibration: &Arc<StdMutex<ImuCalibration>>,
        imu_latest_raw: &Arc<StdMutex<Option<ImuCalibration>>>,
    ) -> Option<ResponseData> {
        let raw = match ImuParser::parse(packet) {
            Ok(sample) => sample,
            Err(e) => {
                tracing::warn!("IMU 数据解析失败: {}", e);
                return None;
            }
        };

        if let Ok(mut latest_raw) = imu_latest_raw.lock() {
            *latest_raw = Some(ImuCalibration {
                angle_offset: raw.angle,
                quat_offset: raw.quat,
            });
        }

        let mut raw = raw;
        if let Ok(calibration) = imu_calibration.lock() {
            raw.angle = raw.angle - calibration.angle_offset;
            raw.quat = calibration.quat_offset * raw.quat;
        }

        let calibrated = self.calibration.update(&raw);
        let filtered = self.filter.apply(&calibrated);
        let attitude = self.attitude_fusion.update(&filtered);
        let nav = self.strapdown.propagate(&attitude, &filtered);
        let (nav, obs) = self.zupt.apply(nav, &filtered);
        let nav = self.ekf.update(nav, &obs);

        let frame = OutputFrame { raw, nav };
        Some(OutputBuilder::build(&frame))
    }
}

impl ProcessorPipelineConfig {
    pub fn load_from_default_paths() -> Self {
        let candidates = ["processor.toml", "src-tauri/processor.toml", "../processor.toml"];
        for path in candidates {
            if let Some(config) = read_config(Path::new(path)) {
                return config;
            }
        }

        tracing::warn!("未找到 processor.toml，使用默认参数配置");
        ProcessorPipelineConfig::default()
    }
}

fn read_config(path: &Path) -> Option<ProcessorPipelineConfig> {
    let content = std::fs::read_to_string(path).ok()?;
    match toml::from_str::<ProcessorPipelineConfig>(&content) {
        Ok(config) => Some(config),
        Err(err) => {
            tracing::warn!("读取配置失败 {:?}: {}", path, err);
            None
        }
    }
}
