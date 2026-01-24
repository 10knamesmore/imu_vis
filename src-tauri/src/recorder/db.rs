//! 数据库连接与表结构维护。

use std::path::{Path, PathBuf};

use anyhow::Context;
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, Schema, Statement};

use crate::recorder::models;

/// 录制数据库默认路径。
pub fn recording_db_path() -> anyhow::Result<PathBuf> {
    let mut base_dir = std::env::current_dir().context("resolve current directory")?;
    if base_dir.file_name().is_some_and(|name| name == "src-tauri") {
        if let Some(parent) = base_dir.parent() {
            base_dir = parent.to_path_buf();
        }
    }
    std::fs::create_dir_all(&base_dir).context("ensure project directory exists")?;
    Ok(base_dir.join("imu_recordings.sqlite"))
}

/// 连接数据库。
pub async fn connect(path: &Path) -> anyhow::Result<DatabaseConnection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("create sqlite directory")?;
    }
    let url = format!("sqlite://{}?mode=rwc", path.to_string_lossy());
    Database::connect(url).await.context("open sqlite database")
}

/// 确保数据库表结构存在。
pub async fn ensure_schema(conn: &DatabaseConnection) -> anyhow::Result<()> {
    let db_backend = conn.get_database_backend();
    conn.execute(Statement::from_string(
        db_backend,
        "PRAGMA journal_mode=WAL;",
    ))
    .await
    .context("set sqlite journal mode")?;
    conn.execute(Statement::from_string(
        db_backend,
        "PRAGMA synchronous=NORMAL;",
    ))
    .await
    .context("set sqlite synchronous")?;

    let schema = Schema::new(db_backend);
    let mut create_sessions = schema.create_table_from_entity(models::recording_sessions::Entity);
    create_sessions.if_not_exists();
    conn.execute(db_backend.build(&create_sessions))
        .await
        .context("create recording_sessions table")?;

    let mut create_samples = schema.create_table_from_entity(models::imu_samples::Entity);
    create_samples.if_not_exists();
    conn.execute(db_backend.build(&create_samples))
        .await
        .context("create imu_samples table")?;

    conn.execute(Statement::from_string(
        db_backend,
        "CREATE INDEX IF NOT EXISTS idx_imu_samples_session_time
         ON imu_samples(session_id, timestamp_ms);",
    ))
    .await
    .context("create imu_samples index")?;

    let _ = conn
        .execute(Statement::from_string(
            db_backend,
            "ALTER TABLE recording_sessions ADD COLUMN name TEXT;",
        ))
        .await;
    let _ = conn
        .execute(Statement::from_string(
            db_backend,
            "ALTER TABLE recording_sessions ADD COLUMN tags TEXT;",
        ))
        .await;

    Ok(())
}
