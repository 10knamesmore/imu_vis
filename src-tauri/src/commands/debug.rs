//! Debug 双流订阅命令。

use tauri::{async_runtime::spawn, ipc::Channel, State};

use crate::{
    app_state::AppState,
    types::debug::{DebugMonitorTick, DebugRealtimeFrame},
};

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state, on_event))]
/// 订阅 Debug 实时流（阶段对比帧）。
pub fn subscribe_debug_realtime(state: State<'_, AppState>, on_event: Channel<DebugRealtimeFrame>) {
    tracing::info!("Tauri 前端订阅 Debug 实时流。");
    let rx = state.debug_realtime_rx.clone();
    rx.drain();
    spawn(async move {
        while let Ok(frame) = rx.recv_async().await {
            if on_event.send(frame).is_err() {
                tracing::info!("Debug 实时流订阅已断开。");
                break;
            }
        }
    });
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state, on_event))]
/// 订阅 Debug 监控流（1 秒聚合指标）。
pub fn subscribe_debug_monitor(state: State<'_, AppState>, on_event: Channel<DebugMonitorTick>) {
    tracing::info!("Tauri 前端订阅 Debug 监控流。");
    let rx = state.debug_monitor_rx.clone();
    rx.drain();
    spawn(async move {
        while let Ok(tick) = rx.recv_async().await {
            if on_event.send(tick).is_err() {
                tracing::info!("Debug 监控流订阅已断开。");
                break;
            }
        }
    });
}
