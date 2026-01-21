//! 录制相关类型。

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
/// 录制状态。
pub struct RecordingStatus {
    /// 是否正在录制。
    pub recording: bool,
    /// 会话 ID。
    pub session_id: Option<i64>,
    /// 数据库路径。
    pub db_path: Option<String>,
    /// 采样数量。
    pub sample_count: Option<u64>,
    /// 开始时间戳（毫秒）。
    pub started_at_ms: Option<i64>,
    /// 名称。
    pub name: Option<String>,
    /// 标签列表。
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
/// 录制会话元信息。
pub struct RecordingMeta {
    /// 会话 ID。
    pub id: i64,
    /// 开始时间戳（毫秒）。
    pub started_at_ms: i64,
    /// 结束时间戳（毫秒）。
    pub stopped_at_ms: Option<i64>,
    /// 采样数量。
    pub sample_count: i64,
    /// 名称。
    pub name: Option<String>,
    /// 标签列表。
    pub tags: Vec<String>,
}
