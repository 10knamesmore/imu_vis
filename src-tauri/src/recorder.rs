//! 录制线程与 SQLite 写入逻辑。

use std::{path::PathBuf, thread, time::Duration};

use anyhow::{Context, Result};
use flume::{Receiver, Sender};
use rusqlite::{params, Connection};

use crate::types::{outputs::ResponseData, recording::RecordingStatus};

/// 录制控制命令。
pub enum RecorderCommand {
    /// 开始录制。
    Start {
        /// 数据库路径。
        db_path: PathBuf,
        /// 设备 ID。
        device_id: Option<String>,
        /// 录制名称。
        name: Option<String>,
        /// 标签列表。
        tags: Option<Vec<String>>,
        /// 返回通道。
        reply: Sender<anyhow::Result<RecordingStatus>>,
    },
    /// 停止录制。
    Stop {
        /// 返回通道。
        reply: Sender<anyhow::Result<RecordingStatus>>,
    },
}

struct ActiveSession {
    conn: Connection,
    session_id: i64,
    db_path: PathBuf,
    sample_count: u64,
}

/// 启动录制线程。
pub fn spawn_recorder(data_rx: Receiver<ResponseData>, control_rx: Receiver<RecorderCommand>) {
    thread::Builder::new()
        .name("IMUSqliteRecorderThread".into())
        .spawn(move || {
            let mut active: Option<ActiveSession> = None;
            loop {
                if let Ok(command) = control_rx.try_recv() {
                    handle_command(command, &mut active);
                    continue;
                }

                match data_rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(data) => {
                        if let Some(session) = active.as_mut() {
                            if let Err(error) = insert_sample(session, &data) {
                                tracing::error!("Recorder insert failed: {error:#}");
                            }
                        }
                    }
                    Err(flume::RecvTimeoutError::Timeout) => {}
                    Err(flume::RecvTimeoutError::Disconnected) => break,
                }
            }
        })
        .unwrap_or_else(|e| panic!("error while creating recorder thread : {}", e));
}

fn handle_command(command: RecorderCommand, active: &mut Option<ActiveSession>) {
    match command {
        RecorderCommand::Start {
            db_path,
            device_id,
            name,
            tags,
            reply,
        } => {
            if let Some(session) = active.take() {
                if let Err(error) = stop_session(session) {
                    tracing::error!("Recorder stop failed while restarting: {error:#}");
                }
            }
            match start_session(db_path, device_id, name, tags) {
                Ok((session, status)) => {
                    *active = Some(session);
                    let _ = reply.send(Ok(status));
                }
                Err(error) => {
                    let _ = reply.send(Err(error));
                }
            }
        }
        RecorderCommand::Stop { reply } => {
            let status = if let Some(session) = active.take() {
                stop_session(session)
            } else {
                Ok(RecordingStatus {
                    recording: false,
                    session_id: None,
                    db_path: None,
                    sample_count: None,
                    started_at_ms: None,
                    name: None,
                    tags: None,
                })
            };
            let _ = reply.send(status);
        }
    }
}

fn start_session(
    db_path: PathBuf,
    device_id: Option<String>,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(ActiveSession, RecordingStatus)> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).context("create sqlite directory")?;
    }

    let conn = Connection::open(&db_path).context("open sqlite database")?;
    ensure_schema(&conn)?;

    let started_at_ms = now_ms();
    let tags_json = tags
        .as_ref()
        .map(|value| serde_json::to_string(value).unwrap_or_default());
    conn.execute(
        "INSERT INTO recording_sessions (started_at_ms, device_id, name, tags)
         VALUES (?1, ?2, ?3, ?4)",
        params![started_at_ms, device_id, name, tags_json],
    )
    .context("insert recording session")?;

    let session_id = conn.last_insert_rowid();
    let status = RecordingStatus {
        recording: true,
        session_id: Some(session_id),
        db_path: Some(db_path.to_string_lossy().to_string()),
        sample_count: Some(0),
        started_at_ms: Some(started_at_ms),
        name,
        tags,
    };

    Ok((
        ActiveSession {
            conn,
            session_id,
            db_path,
            sample_count: 0,
        },
        status,
    ))
}

fn stop_session(session: ActiveSession) -> Result<RecordingStatus> {
    let stopped_at_ms = now_ms();
    session
        .conn
        .execute(
            "UPDATE recording_sessions
             SET stopped_at_ms = ?1, sample_count = ?2
             WHERE id = ?3",
            params![
                stopped_at_ms,
                session.sample_count as i64,
                session.session_id
            ],
        )
        .context("update recording session")?;

    Ok(RecordingStatus {
        recording: false,
        session_id: Some(session.session_id),
        db_path: Some(session.db_path.to_string_lossy().to_string()),
        sample_count: Some(session.sample_count),
        started_at_ms: None,
        name: None,
        tags: None,
    })
}

fn insert_sample(session: &mut ActiveSession, data: &ResponseData) -> Result<()> {
    let raw = &data.raw_data;
    let calc = &data.calculated_data;

    let attitude = calc.attitude;
    let velocity = calc.velocity;
    let position = calc.position;

    session
        .conn
        .execute(
            "INSERT INTO imu_samples (
                session_id,
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
            ) VALUES (
                ?1, ?2,
                ?3, ?4, ?5,
                ?6, ?7, ?8,
                ?9, ?10, ?11,
                ?12, ?13, ?14, ?15,
                ?16, ?17, ?18,
                ?19, ?20, ?21,
                ?22, ?23, ?24,
                ?25, ?26, ?27, ?28,
                ?29, ?30, ?31,
                ?32, ?33, ?34,
                ?35
            )",
            params![
                session.session_id,
                raw.timestamp_ms as i64,
                raw.accel_no_g.x,
                raw.accel_no_g.y,
                raw.accel_no_g.z,
                raw.accel_with_g.x,
                raw.accel_with_g.y,
                raw.accel_with_g.z,
                raw.gyro.x,
                raw.gyro.y,
                raw.gyro.z,
                raw.quat.w,
                raw.quat.x,
                raw.quat.y,
                raw.quat.z,
                raw.angle.x,
                raw.angle.y,
                raw.angle.z,
                raw.offset.x,
                raw.offset.y,
                raw.offset.z,
                raw.accel_nav.x,
                raw.accel_nav.y,
                raw.accel_nav.z,
                attitude.w,
                attitude.x,
                attitude.y,
                attitude.z,
                velocity.x,
                velocity.y,
                velocity.z,
                position.x,
                position.y,
                position.z,
                calc.timestamp_ms as i64,
            ],
        )
        .context("insert imu sample")?;

    session.sample_count += 1;
    Ok(())
}

/// 确保数据库表结构存在。
pub fn ensure_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;

         CREATE TABLE IF NOT EXISTS recording_sessions (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             started_at_ms INTEGER NOT NULL,
             stopped_at_ms INTEGER,
             device_id TEXT,
             name TEXT,
             tags TEXT,
             sample_count INTEGER DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS imu_samples (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             session_id INTEGER NOT NULL,
             timestamp_ms INTEGER NOT NULL,
             accel_no_g_x REAL NOT NULL,
             accel_no_g_y REAL NOT NULL,
             accel_no_g_z REAL NOT NULL,
             accel_with_g_x REAL NOT NULL,
             accel_with_g_y REAL NOT NULL,
             accel_with_g_z REAL NOT NULL,
             gyro_x REAL NOT NULL,
             gyro_y REAL NOT NULL,
             gyro_z REAL NOT NULL,
             quat_w REAL NOT NULL,
             quat_x REAL NOT NULL,
             quat_y REAL NOT NULL,
             quat_z REAL NOT NULL,
             angle_x REAL NOT NULL,
             angle_y REAL NOT NULL,
             angle_z REAL NOT NULL,
             offset_x REAL NOT NULL,
             offset_y REAL NOT NULL,
             offset_z REAL NOT NULL,
             accel_nav_x REAL NOT NULL,
             accel_nav_y REAL NOT NULL,
             accel_nav_z REAL NOT NULL,
             calc_attitude_w REAL NOT NULL,
             calc_attitude_x REAL NOT NULL,
             calc_attitude_y REAL NOT NULL,
             calc_attitude_z REAL NOT NULL,
             calc_velocity_x REAL NOT NULL,
             calc_velocity_y REAL NOT NULL,
             calc_velocity_z REAL NOT NULL,
             calc_position_x REAL NOT NULL,
             calc_position_y REAL NOT NULL,
             calc_position_z REAL NOT NULL,
             calc_timestamp_ms INTEGER NOT NULL,
             FOREIGN KEY(session_id) REFERENCES recording_sessions(id)
         );

         CREATE INDEX IF NOT EXISTS idx_imu_samples_session_time
         ON imu_samples(session_id, timestamp_ms);",
    )
    .context("initialize sqlite schema")?;
    let _ = conn.execute("ALTER TABLE recording_sessions ADD COLUMN name TEXT", []);
    let _ = conn.execute("ALTER TABLE recording_sessions ADD COLUMN tags TEXT", []);
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
