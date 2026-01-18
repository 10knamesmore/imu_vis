use crate::{
    app_state::AppState, commands::response::Response as IpcResponse,
    types::bluetooth::PeripheralInfo,
};
use tauri::State;

type Response<T> = Result<IpcResponse<T>, ()>;

#[tauri::command]
/// 开始扫描
pub async fn start_scan(state: State<'_, AppState>) -> Response<()> {
    Ok(state.client().await.start_scan().await.into())
}

#[tauri::command]
/// 停止扫描
pub async fn stop_scan(state: State<'_, AppState>) -> Response<()> {
    Ok(state.client().await.stop_scan().await.into())
}

#[tauri::command]
/// 主动请求获取设备列表
pub async fn list_peripherals(state: State<'_, AppState>) -> Response<Vec<PeripheralInfo>> {
    // use Result to make tauri happy
    let client = state.client().await;
    Ok(client.list_peripherals().await.into())
}

#[tauri::command]
/// 连接到设备
///
/// * `device_name`: 目标设备的部分名称
pub async fn connect_peripheral(
    state: State<'_, AppState>,
    target_uuid: &str,
) -> Response<PeripheralInfo> {
    println!("call connect_peripheral");
    Ok(state.client().await.connect(target_uuid).await.into())
}

#[tauri::command]
/// 断开与设备的连接
pub async fn disconnect_peripheral(state: State<'_, AppState>) -> Response<PeripheralInfo> {
    Ok(state.client().await.disconnect().await.into())
}
