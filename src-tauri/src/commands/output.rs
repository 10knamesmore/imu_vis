use tauri::{async_runtime::spawn, ipc::Channel, State};

use crate::{app_state::AppState, types::outputs::ResponseData};

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state, on_event))]
pub fn subscribe_output(state: State<'_, AppState>, on_event: Channel<ResponseData>) {
    let rx = state.downstream_rx.clone();
    rx.drain();
    spawn(async move {
        while let Ok(data) = rx.recv() {
            if on_event.send(data).is_err() {
                // 如果发送失败，说明前端已断开连接，退出循环
                tracing::info!("Tauri 前端订阅已断开，停止发送IMU数据。");
                break;
            }
        }
    });
}
