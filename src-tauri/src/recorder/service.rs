//! 录制业务逻辑。

use std::path::PathBuf;

use anyhow::Context;
use flume::{Receiver, Sender};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};

use crate::{
    processor::output::{is_accel_saturated, OutputFrame},
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
///
/// 使用独立的 OS 线程 + 专属单线程 tokio runtime，与 Tauri IPC runtime 完全隔离。
/// 这样可以避免 IPC 负载（序列化、前端推送）占用 runtime worker，导致录制消费
/// 延迟进而反压 pipeline 线程的 `record_tx.send()`。
pub fn spawn_recorder(data_rx: Receiver<OutputFrame>, control_rx: Receiver<RecorderCommand>) {
    std::thread::Builder::new()
        .name("imu-recorder".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("recorder runtime build failed");
            rt.block_on(async move {
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
        })
        .expect("failed to spawn recorder thread");
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

async fn insert_sample(session: &mut ActiveSession, frame: &OutputFrame) -> anyhow::Result<()> {
    let raw = &frame.raw;
    let nav = &frame.nav;

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
        calc_attitude_w: Set(nav.attitude.w),
        calc_attitude_x: Set(nav.attitude.x),
        calc_attitude_y: Set(nav.attitude.y),
        calc_attitude_z: Set(nav.attitude.z),
        calc_velocity_x: Set(nav.velocity.x),
        calc_velocity_y: Set(nav.velocity.y),
        calc_velocity_z: Set(nav.velocity.z),
        calc_position_x: Set(nav.position.x),
        calc_position_y: Set(nav.position.y),
        calc_position_z: Set(nav.position.z),
        calc_timestamp_ms: Set(nav.timestamp_ms as i64),
        ..Default::default()
    };

    sample
        .insert(&session.db)
        .await
        .context("insert imu sample")?;

    session.sample_count += 1;
    Ok(())
}

/// 删除指定录制会话及其所有样本数据。
pub async fn delete_recording(session_id: i64) -> anyhow::Result<()> {
    let db_path = db::recording_db_path()?;
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    // 先删子表（外键约束），再删主记录
    models::imu_samples::Entity::delete_many()
        .filter(models::imu_samples::Column::SessionId.eq(session_id))
        .exec(&db)
        .await
        .context("delete imu samples")?;

    models::recording_sessions::Entity::delete_by_id(session_id)
        .exec(&db)
        .await
        .context("delete recording session")?;

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

/// 将指定会话的样本导出为 CSV 文件，返回导出的文件路径。
pub async fn export_session_csv(session_id: i64) -> anyhow::Result<std::path::PathBuf> {
    use std::fmt::Write as FmtWrite;

    let db_path = db::recording_db_path()?;
    let db = db::connect(&db_path).await?;
    db::ensure_schema(&db).await?;

    let session = models::recording_sessions::Entity::find()
        .filter(models::recording_sessions::Column::Id.eq(session_id))
        .one(&db)
        .await
        .context("query reqcording session")?
        .context("no session found")?;

    let samples = models::imu_samples::Entity::find()
        .filter(models::imu_samples::Column::SessionId.eq(session_id))
        .order_by_asc(models::imu_samples::Column::TimestampMs)
        .all(&db)
        .await
        .context("query recording samples")?;

    let export_dir = db_path
        .parent()
        .context("db path has no parent")?
        .join("exports");
    std::fs::create_dir_all(&export_dir).context("create exports directory")?;

    let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let file_path = export_dir.join(if let Some(name) = session.name {
        format!("imu_{}.csv", name)
    } else {
        format!("imu_{now}.csv")
    });

    let mut csv = String::new();
    writeln!(
        csv,
        "timestamp_ms,calc_position_x,calc_position_y,calc_position_z,\
         calc_velocity_x,calc_velocity_y,calc_velocity_z,\
         calc_attitude_w,calc_attitude_x,calc_attitude_y,calc_attitude_z"
    )?;
    for s in samples {
        writeln!(
            csv,
            "{},{},{},{},{},{},{},{},{},{},{}",
            s.timestamp_ms,
            s.calc_position_x,
            s.calc_position_y,
            s.calc_position_z,
            s.calc_velocity_x,
            s.calc_velocity_y,
            s.calc_velocity_z,
            s.calc_attitude_w,
            s.calc_attitude_x,
            s.calc_attitude_y,
            s.calc_attitude_z,
        )?;
    }

    tokio::fs::write(&file_path, csv)
        .await
        .context("write csv file")?;
    Ok(file_path)
}

fn parse_tags(tags_json: Option<String>) -> Vec<String> {
    tags_json
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn sample_to_response_data(sample: models::imu_samples::Model) -> ResponseData {
    use math_f64::{DQuat, DVec3};

    let accel_with_g = DVec3::new(
        sample.accel_with_g_x,
        sample.accel_with_g_y,
        sample.accel_with_g_z,
    );
    ResponseData {
        timestamp_ms: sample.timestamp_ms as u64,
        accel: DVec3::new(
            sample.accel_no_g_x,
            sample.accel_no_g_y,
            sample.accel_no_g_z,
        ),
        accel_with_g,
        gyro: DVec3::new(sample.gyro_x, sample.gyro_y, sample.gyro_z),
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
        // 回放场景也标记饱和段：用与实时路径相同的阈值 helper
        accel_saturated: is_accel_saturated(accel_with_g),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
