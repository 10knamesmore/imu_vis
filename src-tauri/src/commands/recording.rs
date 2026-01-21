//! 录制相关命令。

use crate::{
    app_state::AppState,
    commands::response::Response as IpcResponse,
    recorder::{ensure_schema, RecorderCommand},
    types::{
        outputs,
        recording::{RecordingMeta, RecordingStatus},
    },
};
use anyhow::Context;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, State};

type Response<T> = std::result::Result<IpcResponse<T>, ()>;

#[derive(Debug, Clone, Deserialize, Serialize)]
/// 开始录制参数。
pub struct RecordingStartOptions {
    /// 录制名称。
    pub name: Option<String>,
    /// 录制标签。
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 开始录制。
pub async fn start_recording(
    _app: AppHandle,
    state: State<'_, AppState>,
    options: Option<RecordingStartOptions>,
) -> Response<RecordingStatus> {
    let result: anyhow::Result<RecordingStatus> = async {
        let db_path = recording_db_path()?;
        let (reply_tx, reply_rx) = flume::bounded(1);
        let (name, tags) = options
            .map(|opt| (opt.name, opt.tags))
            .unwrap_or((None, None));
        state
            .recorder_tx
            .send(RecorderCommand::Start {
                db_path,
                device_id: None,
                name,
                tags,
                reply: reply_tx,
            })
            .context("recorder thread not available")?;
        reply_rx
            .recv_async()
            .await
            .context("recorder reply channel closed")?
    }
    .await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 停止录制。
pub async fn stop_recording(state: State<'_, AppState>) -> Response<RecordingStatus> {
    let result: anyhow::Result<RecordingStatus> = async {
        let (reply_tx, reply_rx) = flume::bounded(1);
        state
            .recorder_tx
            .send(RecorderCommand::Stop { reply: reply_tx })
            .context("recorder thread not available")?;
        reply_rx
            .recv_async()
            .await
            .context("recorder reply channel closed")?
    }
    .await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 列出录制会话。
pub async fn list_recordings() -> Response<Vec<RecordingMeta>> {
    let result: anyhow::Result<Vec<RecordingMeta>> = async {
        let db_path = recording_db_path()?;
        let conn = Connection::open(&db_path).context("open sqlite database")?;
        ensure_schema(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT id, started_at_ms, stopped_at_ms, sample_count, name, tags
             FROM recording_sessions
             ORDER BY started_at_ms DESC",
        )?;
        let rows = stmt
            .query_map([], row_to_meta)
            .context("query recording sessions")?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        tracing::info!("found sessions: {:?}", list);
        Ok(list)
    }
    .await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 更新录制会话元信息。
pub async fn update_recording_meta(
    session_id: i64,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> Response<RecordingMeta> {
    let result: anyhow::Result<RecordingMeta> = async {
        let db_path = recording_db_path()?;
        let conn = Connection::open(&db_path).context("open sqlite database")?;
        ensure_schema(&conn)?;
        let tags_json = tags
            .as_ref()
            .map(|value| serde_json::to_string(value).unwrap_or_default());
        conn.execute(
            "UPDATE recording_sessions SET name = ?1, tags = ?2 WHERE id = ?3",
            params![name, tags_json, session_id],
        )
        .context("update recording metadata")?;

        let mut stmt = conn.prepare(
            "SELECT id, started_at_ms, stopped_at_ms, sample_count, name, tags
             FROM recording_sessions
             WHERE id = ?1",
        )?;
        let meta = stmt
            .query_row(params![session_id], row_to_meta)
            .context("fetch updated recording metadata")?;
        Ok(meta)
    }
    .await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 获取录制样本。
pub async fn get_recording_samples(session_id: i64) -> Response<Vec<outputs::ResponseData>> {
    let result: anyhow::Result<Vec<outputs::ResponseData>> = async {
        let db_path = recording_db_path()?;
        let conn = Connection::open(&db_path).context("open sqlite database")?;
        ensure_schema(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT
                timestamp_ms,
                accel_no_g_x, accel_no_g_y, accel_no_g_z,
                accel_with_g_x, accel_with_g_y, accel_with_g_z,
                gyro_x, gyro_y, gyro_z,
                quat_w, quat_x, quat_y, quat_z,
                angle_x, angle_y, angle_z,
                offset_x, offset_y, offset_z,
                accel_nav_x, accel_nav_y, accel_nav_z,
                calc_attitude_w, calc_attitude_x, calc_attitude_y, calc_attitude_z,
                calc_velocity_x, calc_velocity_y, calc_velocity_z,
                calc_position_x, calc_position_y, calc_position_z,
                calc_timestamp_ms
             FROM imu_samples
             WHERE session_id = ?1
             ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt
            .query_map(params![session_id], row_to_response_data)
            .context("query recording samples")?;
        let mut samples = Vec::new();
        for row in rows {
            samples.push(row?);
        }
        Ok(samples)
    }
    .await;

    Ok(result.into())
}

fn row_to_meta(row: &Row<'_>) -> rusqlite::Result<RecordingMeta> {
    let tags_json: Option<String> = row.get(5)?;
    let tags = tags_json
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default();
    Ok(RecordingMeta {
        id: row.get(0)?,
        started_at_ms: row.get(1)?,
        stopped_at_ms: row.get(2)?,
        sample_count: row.get(3)?,
        name: row.get(4)?,
        tags,
    })
}

fn row_to_response_data(row: &Row<'_>) -> rusqlite::Result<outputs::ResponseData> {
    use crate::processor::{parser::ImuSampleRaw, CalculatedData};
    use math_f64::{DQuat, DVec3};

    let raw = ImuSampleRaw {
        timestamp_ms: row.get::<_, i64>(0)? as u64,
        accel_no_g: DVec3::new(row.get(1)?, row.get(2)?, row.get(3)?),
        accel_with_g: DVec3::new(row.get(4)?, row.get(5)?, row.get(6)?),
        gyro: DVec3::new(row.get(7)?, row.get(8)?, row.get(9)?),
        quat: DQuat::from_xyzw(row.get(11)?, row.get(12)?, row.get(13)?, row.get(10)?),
        angle: DVec3::new(row.get(14)?, row.get(15)?, row.get(16)?),
        offset: DVec3::new(row.get(17)?, row.get(18)?, row.get(19)?),
        accel_nav: DVec3::new(row.get(20)?, row.get(21)?, row.get(22)?),
    };

    let calc = CalculatedData {
        attitude: DQuat::from_xyzw(row.get(24)?, row.get(25)?, row.get(26)?, row.get(23)?),
        velocity: DVec3::new(row.get(27)?, row.get(28)?, row.get(29)?),
        position: DVec3::new(row.get(30)?, row.get(31)?, row.get(32)?),
        timestamp_ms: row.get::<_, i64>(33)? as u64,
    };

    Ok(outputs::ResponseData::from_parts(&raw, &calc))
}

fn recording_db_path() -> anyhow::Result<PathBuf> {
    let mut base_dir = std::env::current_dir().context("resolve current directory")?;
    if base_dir.file_name().is_some_and(|name| name == "src-tauri") {
        if let Some(parent) = base_dir.parent() {
            base_dir = parent.to_path_buf();
        }
    }
    std::fs::create_dir_all(&base_dir).context("ensure project directory exists")?;
    Ok(base_dir.join("imu_recordings.sqlite"))
}
