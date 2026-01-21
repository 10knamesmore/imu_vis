//! 管线模块导出。

/// 管线逻辑。
pub mod pipeline;
/// 管线配置类型。
pub mod types;

/// 处理管线。
pub use pipeline::ProcessorPipeline;
/// 处理管线配置。
pub use types::ProcessorPipelineConfig;
