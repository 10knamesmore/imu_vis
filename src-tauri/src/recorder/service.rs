//! 录制业务逻辑。

use std::path::PathBuf;

use anyhow::Context;
use flume::{Receiver, Sender};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};

use crate::{
    recorder::{db, models},
    types::{
        outputs::ResponseData,
        recording::{RecordingMeta, RecordingStatus},
    },
};

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

/// 开始录制参数。
pub struct RecordingStartInput {
    /// 设备 ID。
    pub device_id: Option<String>,
    /// 录制名称。
    pub name: Option<String>,
    /// 标签列表。
    pub tags: Option<Vec<String>>,
}

struct ActiveSession {
    db: sea_orm::DatabaseConnection,
    session_id: i64,
    db_path: PathBuf,
    sample_count: u64,
}

/// 启动录制任务。
pub fn spawn_recorder(data_rx: Receiver<ResponseData>, control_rx: Receiver<RecorderCommand>) {
    tauri::async_runtime::spawn(async move {
        let mut active: Option<ActiveSession> = None;
        loop {
            tokio::select! {
                biased;
                command = control_rx.recv_async() => {
                    match command {
                        Ok(command) => handle_command(command, &mut active).await,
                        Err(_) => {
                            if active.is_none() {
                                break;
                            }
                        }
                    }
                }
                data = data_rx.recv_async() => {
                    match data {
                        Ok(data) => {
                            if let Some(session) = active.as_mut() {
                                if let Err(error) = insert_sample(session, &data).await {
                                    tracing::error!("Recorder insert failed: {error:#}");
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });
}

/// 通过录制通道启动录制。
pub async fn start_recording(
    recorder_tx: &flume::Sender<RecorderCommand>,
    input: RecordingStartInput,
) -> anyhow::Result<RecordingStatus> {
    let db_path = db::recording_db_path()?;
    let (reply_tx, reply_rx) = flume::bounded(1);
    recorder_tx
        .send(RecorderCommand::Start {
            db_path,
            device_id: input.device_id,
            name: input.name,
            tags: input.tags,
            reply: reply_tx,
        })
        .context("recorder thread not available")?;
    reply_rx
        .recv_async()
        .await
        .context("recorder reply channel closed")?
}

/// 通过录制通道停止录制。
pub async fn stop_recording(
    recorder_tx: &flume::Sender<RecorderCommand>,
) -> anyhow::Result<RecordingStatus> {
    let (reply_tx, reply_rx) = flume::bounded(1);
    recorder_tx
        .send(RecorderCommand::Stop { reply: reply_tx })
        .context("recorder thread not available")?;
    reply_rx
        .recv_async()
        .await
        .context("recorder reply channel closed")?
}

async fn handle_command(command: RecorderCommand, active: &mut Option<ActiveSession>) {
    match command {
        RecorderCommand::Start {
            db_path,
            device_id,
            name,
            tags,
            reply,
        } => {
            if let Some(session) = active.take() {
                if let Err(error) = stop_session(session).await {
                    tracing::error!("Recorder stop failed while restarting: {error:#}");
                }
            }
            match start_session(db_path, device_id, name, tags).await {
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
                stop_session(session).await
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

async fn start_session(
    db_path: PathBuf,
    device_id: Option<String>,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> anyhow::Result<(ActiveSession, RecordingStatus)> {
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    let started_at_ms = now_ms();
    let tags_json = tags
        .as_ref()
        .map(|value| serde_json::to_string(value).unwrap_or_default());

    let session = models::recording_sessions::ActiveModel {
        started_at_ms: Set(started_at_ms),
        stopped_at_ms: Set(None),
        device_id: Set(device_id.clone()),
        name: Set(name.clone()),
        tags: Set(tags_json),
        sample_count: Set(0),
        ..Default::default()
    };
    let insert = session
        .insert(&db)
        .await
        .context("insert recording session")?;

    let status = RecordingStatus {
        recording: true,
        session_id: Some(insert.id),
        db_path: Some(db_path.to_string_lossy().to_string()),
        sample_count: Some(0),
        started_at_ms: Some(started_at_ms),
        name,
        tags,
    };

    Ok((
        ActiveSession {
            db,
            session_id: insert.id,
            db_path,
            sample_count: 0,
        },
        status,
    ))
}

async fn stop_session(session: ActiveSession) -> anyhow::Result<RecordingStatus> {
    let stopped_at_ms = now_ms();
    let update = models::recording_sessions::ActiveModel {
        id: Set(session.session_id),
        stopped_at_ms: Set(Some(stopped_at_ms)),
        sample_count: Set(session.sample_count as i64),
        ..Default::default()
    };
    update
        .update(&session.db)
        .await
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

async fn insert_sample(session: &mut ActiveSession, data: &ResponseData) -> anyhow::Result<()> {
    let raw = &data.raw_data;
    let calc = &data.calculated_data;

    let attitude = calc.attitude;
    let velocity = calc.velocity;
    let position = calc.position;

    let sample = models::imu_samples::ActiveModel {
        session_id: Set(session.session_id),
        timestamp_ms: Set(raw.timestamp_ms as i64),
        accel_no_g_x: Set(raw.accel_no_g.x),
        accel_no_g_y: Set(raw.accel_no_g.y),
        accel_no_g_z: Set(raw.accel_no_g.z),
        accel_with_g_x: Set(raw.accel_with_g.x),
        accel_with_g_y: Set(raw.accel_with_g.y),
        accel_with_g_z: Set(raw.accel_with_g.z),
        gyro_x: Set(raw.gyro.x),
        gyro_y: Set(raw.gyro.y),
        gyro_z: Set(raw.gyro.z),
        quat_w: Set(raw.quat.w),
        quat_x: Set(raw.quat.x),
        quat_y: Set(raw.quat.y),
        quat_z: Set(raw.quat.z),
        angle_x: Set(raw.angle.x),
        angle_y: Set(raw.angle.y),
        angle_z: Set(raw.angle.z),
        offset_x: Set(raw.offset.x),
        offset_y: Set(raw.offset.y),
        offset_z: Set(raw.offset.z),
        accel_nav_x: Set(raw.accel_nav.x),
        accel_nav_y: Set(raw.accel_nav.y),
        accel_nav_z: Set(raw.accel_nav.z),
        calc_attitude_w: Set(attitude.w),
        calc_attitude_x: Set(attitude.x),
        calc_attitude_y: Set(attitude.y),
        calc_attitude_z: Set(attitude.z),
        calc_velocity_x: Set(velocity.x),
        calc_velocity_y: Set(velocity.y),
        calc_velocity_z: Set(velocity.z),
        calc_position_x: Set(position.x),
        calc_position_y: Set(position.y),
        calc_position_z: Set(position.z),
        calc_timestamp_ms: Set(calc.timestamp_ms as i64),
        ..Default::default()
    };

    sample
        .insert(&session.db)
        .await
        .context("insert imu sample")?;

    session.sample_count += 1;
    Ok(())
}

/// 列出录制会话。
pub async fn list_recordings() -> anyhow::Result<Vec<RecordingMeta>> {
    let db_path = db::recording_db_path()?;
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    let sessions = models::recording_sessions::Entity::find()
        .order_by_desc(models::recording_sessions::Column::StartedAtMs)
        .all(&db)
        .await
        .context("query recording sessions")?;

    let list = sessions
        .into_iter()
        .map(|session| RecordingMeta {
            id: session.id,
            started_at_ms: session.started_at_ms,
            stopped_at_ms: session.stopped_at_ms,
            sample_count: session.sample_count,
            name: session.name,
            tags: parse_tags(session.tags),
        })
        .collect();

    Ok(list)
}

/// 更新录制会话元信息。
pub async fn update_recording_meta(
    session_id: i64,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> anyhow::Result<RecordingMeta> {
    let db_path = db::recording_db_path()?;
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    let tags_json = tags
        .as_ref()
        .map(|value| serde_json::to_string(value).unwrap_or_default());

    let update = models::recording_sessions::ActiveModel {
        id: Set(session_id),
        name: Set(name),
        tags: Set(tags_json),
        ..Default::default()
    };
    update
        .update(&db)
        .await
        .context("update recording metadata")?;

    let session = models::recording_sessions::Entity::find_by_id(session_id)
        .one(&db)
        .await
        .context("fetch updated recording metadata")?
        .context("recording session not found")?;

    Ok(RecordingMeta {
        id: session.id,
        started_at_ms: session.started_at_ms,
        stopped_at_ms: session.stopped_at_ms,
        sample_count: session.sample_count,
        name: session.name,
        tags: parse_tags(session.tags),
    })
}

/// 获取录制样本。
pub async fn get_recording_samples(session_id: i64) -> anyhow::Result<Vec<ResponseData>> {
    let db_path = db::recording_db_path()?;
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    let samples = models::imu_samples::Entity::find()
        .filter(models::imu_samples::Column::SessionId.eq(session_id))
        .order_by_asc(models::imu_samples::Column::TimestampMs)
        .all(&db)
        .await
        .context("query recording samples")?;

    let data = samples.into_iter().map(sample_to_response_data).collect();
    Ok(data)
}

fn parse_tags(tags_json: Option<String>) -> Vec<String> {
    tags_json
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn sample_to_response_data(sample: models::imu_samples::Model) -> ResponseData {
    use crate::processor::{parser::ImuSampleRaw, CalculatedData};
    use math_f64::{DQuat, DVec3};

    let raw = ImuSampleRaw {
        timestamp_ms: sample.timestamp_ms as u64,
        accel_no_g: DVec3::new(
            sample.accel_no_g_x,
            sample.accel_no_g_y,
            sample.accel_no_g_z,
        ),
        accel_with_g: DVec3::new(
            sample.accel_with_g_x,
            sample.accel_with_g_y,
            sample.accel_with_g_z,
        ),
        gyro: DVec3::new(sample.gyro_x, sample.gyro_y, sample.gyro_z),
        quat: DQuat::from_xyzw(sample.quat_x, sample.quat_y, sample.quat_z, sample.quat_w),
        angle: DVec3::new(sample.angle_x, sample.angle_y, sample.angle_z),
        offset: DVec3::new(sample.offset_x, sample.offset_y, sample.offset_z),
        accel_nav: DVec3::new(sample.accel_nav_x, sample.accel_nav_y, sample.accel_nav_z),
    };

    let calc = CalculatedData {
        attitude: DQuat::from_xyzw(
            sample.calc_attitude_x,
            sample.calc_attitude_y,
            sample.calc_attitude_z,
            sample.calc_attitude_w,
        ),
        velocity: DVec3::new(
            sample.calc_velocity_x,
            sample.calc_velocity_y,
            sample.calc_velocity_z,
        ),
        position: DVec3::new(
            sample.calc_position_x,
            sample.calc_position_y,
            sample.calc_position_z,
        ),
        timestamp_ms: sample.calc_timestamp_ms as u64,
    };

    ResponseData::from_parts(&raw, &calc)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
