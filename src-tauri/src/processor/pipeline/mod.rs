//! 管线模块导出。
//!
//! 目的：把 parse -> calibrate -> filter -> attitude -> trajectory -> zupt -> ekf -> output
//! 串成单线程处理链，保持外部接口不变。
//! 原理：同一帧按固定顺序流过各模块，输出 ResponseData。

/// 管线逻辑。
pub mod logic;
/// 管线配置类型。
pub mod types;

/// 处理管线。
pub use logic::ProcessorPipeline;
/// 处理管线配置。
pub use types::{PipelineConfigRequest, ProcessorPipelineConfig};
