//! IMU 处理管线实现。

use std::{
    path::Path,
    sync::{Arc, Mutex as StdMutex},
};

use crate::{
    app_state::ImuCalibration,
    processor::{
        attitude_fusion::AttitudeFusion,
        calibration::Calibration,
        ekf::EkfProcessor,
        filter::LowPassFilter,
        output::{OutputBuilder, OutputFrame},
        parser::ImuParser,
        pipeline::types::ProcessorPipelineConfig,
        strapdown::Strapdown,
        zupt::ZuptDetector,
    },
    types::outputs::ResponseData,
};

/// IMU 处理管线。
pub struct ProcessorPipeline {
    calibration: Calibration,
    filter: LowPassFilter,
    attitude_fusion: AttitudeFusion,
    strapdown: Strapdown,
    zupt: ZuptDetector,
    ekf: EkfProcessor,
}

impl ProcessorPipeline {
    /// 创建处理管线。
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

    /// 处理单个原始数据包并输出响应。
    pub fn process_packet(
        &mut self,
        packet: &[u8],
        imu_calibration: &Arc<StdMutex<ImuCalibration>>,
        imu_latest_raw: &Arc<StdMutex<Option<ImuCalibration>>>,
    ) -> Option<ResponseData> {
        // 解析原始蓝牙包
        let raw = match ImuParser::parse(packet) {
            Ok(sample) => sample,
            Err(e) => {
                tracing::warn!("IMU 数据解析失败: {}", e);
                return None;
            }
        };

        // 保存最新原始姿态，供“校准”命令读取
        if let Ok(mut latest_raw) = imu_latest_raw.lock() {
            *latest_raw = Some(ImuCalibration {
                angle_offset: raw.angle,
                quat_offset: raw.quat,
            });
        }

        // 应用姿态矫正：角度减偏移、四元数左乘偏移
        let mut raw = raw;
        if let Ok(calibration) = imu_calibration.lock() {
            raw.angle -= calibration.angle_offset;
            raw.quat = calibration.quat_offset * raw.quat;
        }

        // 处理链：标定 -> 滤波 -> 姿态融合 -> 捷联 -> ZUPT -> EKF -> 输出
        let calibrated = self.calibration.update(&raw);
        let filtered = self.filter.apply(&calibrated);
        let attitude = self.attitude_fusion.update(&filtered, Some(raw.quat));
        let nav = self.strapdown.propagate(&attitude, &filtered);
        let (nav, obs) = self.zupt.apply(nav, &filtered);
        let nav = self.ekf.update(nav, &obs);

        let frame = OutputFrame { raw, nav };
        Some(OutputBuilder::build(&frame))
    }
}

impl ProcessorPipelineConfig {
    /// 从默认路径加载配置文件。
    pub fn load_from_default_paths() -> Self {
        // 按常见路径查找配置文件
        let candidates = [
            "processor.toml",
            "src-tauri/processor.toml",
            "../processor.toml",
        ];
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
