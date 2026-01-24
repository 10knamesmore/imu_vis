//! 录制相关命令。

use crate::{
    app_state::AppState,
    commands::response::Response as IpcResponse,
    recorder::{
        get_recording_samples as get_recording_samples_service,
        list_recordings as list_recordings_service, start_recording as start_recording_service,
        stop_recording as stop_recording_service,
        update_recording_meta as update_recording_meta_service, RecordingStartInput,
    },
    types::{
        outputs,
        recording::{RecordingMeta, RecordingStatus},
    },
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

type Response<T> = std::result::Result<IpcResponse<T>, ()>;

#[derive(Debug, Clone, Deserialize, Serialize)]
/// 开始录制参数。
pub struct RecordingStartOptions {
    /// 录制名称。
    pub name: Option<String>,
    /// 录制标签。
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 开始录制。
pub async fn start_recording(
    _app: AppHandle,
    state: State<'_, AppState>,
    options: Option<RecordingStartOptions>,
) -> Response<RecordingStatus> {
    let result: anyhow::Result<RecordingStatus> = async {
        let (name, tags) = options
            .map(|opt| (opt.name, opt.tags))
            .unwrap_or((None, None));
        start_recording_service(
            &state.recorder_tx,
            RecordingStartInput {
                device_id: None,
                name,
                tags,
            },
        )
        .await
    }
    .await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug", skip(state))]
/// 停止录制。
pub async fn stop_recording(state: State<'_, AppState>) -> Response<RecordingStatus> {
    let result: anyhow::Result<RecordingStatus> = stop_recording_service(&state.recorder_tx).await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 列出录制会话。
pub async fn list_recordings() -> Response<Vec<RecordingMeta>> {
    let result: anyhow::Result<Vec<RecordingMeta>> = list_recordings_service().await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 更新录制会话元信息。
pub async fn update_recording_meta(
    session_id: i64,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> Response<RecordingMeta> {
    let result: anyhow::Result<RecordingMeta> =
        update_recording_meta_service(session_id, name, tags).await;

    Ok(result.into())
}

#[tauri::command]
#[tracing::instrument(level = "debug")]
/// 获取录制样本。
pub async fn get_recording_samples(session_id: i64) -> Response<Vec<outputs::ResponseData>> {
    let result: anyhow::Result<Vec<outputs::ResponseData>> =
        get_recording_samples_service(session_id).await;

    Ok(result.into())
}
