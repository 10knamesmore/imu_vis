//! 录制模块入口与公共接口。

pub mod db;
pub mod models;
mod service;

pub use service::{
    delete_recording, export_session_csv, get_recording_samples, list_recordings, spawn_recorder,
    start_recording, stop_recording, update_recording_meta, RecorderCommand, RecordingStartInput,
};
