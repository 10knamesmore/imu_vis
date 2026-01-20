use crate::{
    app_state::{AppState, ImuCalibration}, commands::response::Response as IpcResponse,
    types::bluetooth::PeripheralInfo,
};
use tauri::State;

type Response<T> = Result<IpcResponse<T>, ()>;

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 开始扫描
pub async fn start_scan(state: State<'_, AppState>) -> Response<()> {
    Ok(state.client().await.start_scan().await.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 停止扫描
pub async fn stop_scan(state: State<'_, AppState>) -> Response<()> {
    Ok(state.client().await.stop_scan().await.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 主动请求获取设备列表
pub async fn list_peripherals(state: State<'_, AppState>) -> Response<Vec<PeripheralInfo>> {
    // use Result to make tauri happy
    let client = state.client().await;
    Ok(client.list_peripherals().await.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 连接到设备
///
/// * `device_name`: 目标设备的部分名称
pub async fn connect_peripheral(
    state: State<'_, AppState>,
    target_uuid: &str,
) -> Response<PeripheralInfo> {
    Ok(state.client().await.connect(target_uuid).await.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 断开与设备的连接
pub async fn disconnect_peripheral(state: State<'_, AppState>) -> Response<PeripheralInfo> {
    Ok(state.client().await.disconnect().await.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 设置姿态矫正值（按当前姿态作为零位）
pub async fn set_axis_calibration(state: State<'_, AppState>) -> Response<()> {
    // 从处理线程保存的“最新原始姿态”中取当前姿态
    let latest = state.imu_latest_raw.lock().ok().and_then(|guard| *guard);
    if let Some(raw) = latest {
        if let Ok(mut guard) = state.imu_calibration.lock() {
            // 角度偏移直接使用当前角度；四元数偏移取当前四元数的逆
            *guard = ImuCalibration {
                angle_offset: raw.angle_offset,
                quat_offset: raw.quat_offset.inverse(),
            };
            return Ok(IpcResponse::success(()));
        }
    }

    Ok(IpcResponse::error("Failed to update axis calibration"))
}
