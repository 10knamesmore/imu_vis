use serde::Serialize;
use std::{f64::consts::PI, time::Duration};
use tauri::Emitter;

use crate::commands::response::Response;

#[derive(Debug, Serialize, Clone)]
struct Payload {
    value: f64,
    time: f64,
}

#[tauri::command]
pub async fn gen_sine_wave(app_handle: tauri::AppHandle) {
    tokio::spawn(async move {
        let mut t = 0.0;
        loop {
            let value = (2.0 * PI * 1.0 * t).sin();
            app_handle
                .emit("sine_data", Payload { value, time: t })
                .unwrap();
            t += 0.01;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });
}

#[tauri::command]
pub fn test() -> Response<String> {
    Response::success("this is a message generate by rust".to_string())
}
