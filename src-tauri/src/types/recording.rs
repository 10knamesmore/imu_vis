use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RecordingStatus {
    pub recording: bool,
    pub session_id: Option<i64>,
    pub db_path: Option<String>,
    pub sample_count: Option<u64>,
    pub started_at_ms: Option<i64>,
    pub name: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingMeta {
    pub id: i64,
    pub started_at_ms: i64,
    pub stopped_at_ms: Option<i64>,
    pub sample_count: i64,
    pub name: Option<String>,
    pub tags: Vec<String>,
}
