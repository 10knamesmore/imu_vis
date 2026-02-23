use crate::{
    app_state::AppState, commands::response::Response as IpcResponse,
    processor::pipeline::ProcessorPipelineConfig, types::bluetooth::PeripheralInfo,
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
/// 设置姿态校正值（按当前姿态作为零位）
pub async fn set_axis_calibration(state: State<'_, AppState>) -> Response<()> {
    match state.request_axis_calibration().await {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(err) => Ok(IpcResponse::error(err)),
    }
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 设置位置（手动校正）
pub async fn set_position(state: State<'_, AppState>, x: f64, y: f64, z: f64) -> Response<()> {
    match state.request_set_position(x, y, z).await {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(err) => Ok(IpcResponse::error(err)),
    }
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 获取当前生效的 pipeline 配置。
pub async fn get_pipeline_config(state: State<'_, AppState>) -> Response<ProcessorPipelineConfig> {
    match state.get_pipeline_config().await {
        Ok(config) => Ok(IpcResponse::success(config)),
        Err(err) => Ok(IpcResponse::error(err)),
    }
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state, config))]
/// 更新 pipeline 配置并立即生效。
pub async fn update_pipeline_config(
    state: State<'_, AppState>,
    config: ProcessorPipelineConfig,
) -> Response<()> {
    match state.update_pipeline_config(config).await {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(err) => Ok(IpcResponse::error(err)),
    }
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 将当前生效的 pipeline 配置保存到 processor.toml。
pub async fn save_pipeline_config(state: State<'_, AppState>) -> Response<()> {
    match state.save_pipeline_config_to_file().await {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(err) => Ok(IpcResponse::error(err)),
    }
}
