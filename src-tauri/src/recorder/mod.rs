//! 录制模块入口与公共接口。

mod db;
mod models;
mod service;

pub use service::{
    get_recording_samples, list_recordings, spawn_recorder, start_recording, stop_recording,
    update_recording_meta, RecorderCommand, RecordingStartInput,
};
