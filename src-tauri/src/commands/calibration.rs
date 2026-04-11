//! 设备标定相关命令。

use anyhow::Context;
use sea_orm::{ConnectionTrait, EntityTrait, Statement};
use serde::{Deserialize, Serialize};

use crate::{commands::response::Response as IpcResponse, recorder::db, recorder::models};

type Response<T> = std::result::Result<IpcResponse<T>, ()>;

/// 设备标定数据（供前端序列化）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCalibrationData {
    /// 蓝牙设备 ID。
    pub device_id: String,
    /// 加速度计偏置 [x, y, z]（m/s²）。
    pub accel_bias: [f64; 3],
    /// 加速度计比例因子 [x, y, z]。
    pub accel_scale: [f64; 3],
    /// 陀螺仪零偏 [x, y, z]（rad/s）。
    pub gyro_bias: [f64; 3],
    /// 标定质量误差（m/s²）。
    pub quality_error: f64,
    /// 标定时间戳（ms）。
    pub created_at_ms: i64,
}

/// 保存设备标定结果到 SQLite。
#[tauri::command]
#[tracing::instrument(level = "debug")]
pub async fn save_device_calibration(
    device_id: String,
    accel_bias: [f64; 3],
    accel_scale: [f64; 3],
    gyro_bias: [f64; 3],
    quality_error: f64,
) -> Response<()> {
    let result: anyhow::Result<()> = async {
        let key = device_id.clone();
        let db_path = db::recording_db_path()?;
        let conn = db::connect(&db_path).await?;
        db::ensure_schema(&conn).await?;

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or_default();

        let db_backend = conn.get_database_backend();
        conn.execute(Statement::from_sql_and_values(
            db_backend,
            "INSERT OR REPLACE INTO device_calibrations
                (device_id, accel_bias_x, accel_bias_y, accel_bias_z,
                 accel_scale_x, accel_scale_y, accel_scale_z,
                 gyro_bias_x, gyro_bias_y, gyro_bias_z,
                 quality_error, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                device_id.into(),
                accel_bias[0].into(),
                accel_bias[1].into(),
                accel_bias[2].into(),
                accel_scale[0].into(),
                accel_scale[1].into(),
                accel_scale[2].into(),
                gyro_bias[0].into(),
                gyro_bias[1].into(),
                gyro_bias[2].into(),
                quality_error.into(),
                now_ms.into(),
            ],
        ))
        .await
        .context("save device calibration")?;
        tracing::info!("device calibration saved | key={}", key);

        Ok(())
    }
    .await;

    Ok(result.into())
}

/// 查询设备历史标定数据。
#[tauri::command]
#[tracing::instrument(level = "debug")]
pub async fn get_device_calibration(
    device_id: String,
) -> Response<Option<DeviceCalibrationData>> {
    let result: anyhow::Result<Option<DeviceCalibrationData>> = async {
        let key = device_id.clone();
        let db_path = db::recording_db_path()?;
        let conn = db::connect(&db_path).await?;
        db::ensure_schema(&conn).await?;

        let model = models::device_calibrations::Entity::find_by_id(device_id)
            .one(&conn)
            .await
            .context("query device calibration")?;

        if model.is_some() {
            tracing::info!("device calibration hit | key={}", key);
        } else {
            tracing::info!("device calibration miss | key={}", key);
        }

        Ok(model.map(|m| DeviceCalibrationData {
            device_id: m.device_id,
            accel_bias: [m.accel_bias_x, m.accel_bias_y, m.accel_bias_z],
            accel_scale: [m.accel_scale_x, m.accel_scale_y, m.accel_scale_z],
            gyro_bias: [m.gyro_bias_x, m.gyro_bias_y, m.gyro_bias_z],
            quality_error: m.quality_error,
            created_at_ms: m.created_at_ms,
        }))
    }
    .await;

    Ok(result.into())
}
