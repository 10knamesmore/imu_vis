//! 管线诊断数据订阅命令。

use std::sync::atomic::Ordering;

use tauri::{async_runtime::spawn, ipc::Channel, State};

use crate::{
    app_state::AppState,
    processor::pipeline::diagnostics::PipelineDiagnostics,
};

/// 订阅管线诊断数据流。
///
/// 订阅时自动启用诊断采集，前端断开时自动关闭。
/// 诊断数据包含管线各阶段中间值、ZUPT 状态、ESKF 内部状态和性能指标。
#[tauri::command]
#[tracing::instrument(level = "debug", skip(state, on_event))]
pub fn subscribe_diagnostics(state: State<'_, AppState>, on_event: Channel<PipelineDiagnostics>) {
    tracing::info!("前端订阅管线诊断数据。");
    let rx = state.diagnostics_rx.clone();
    let flag = state.diagnostics_flag.clone();

    // 开启诊断采集
    flag.store(true, Ordering::Relaxed);
    // 清空旧数据
    rx.drain();

    spawn(async move {
        while let Ok(data) = rx.recv_async().await {
            if on_event.send(data).is_err() {
                tracing::info!("前端诊断订阅已断开，停止发送诊断数据。");
                break;
            }
        }
        // 前端断开后自动关闭诊断采集
        flag.store(false, Ordering::Relaxed);
        tracing::info!("诊断采集已自动关闭。");
    });
}
