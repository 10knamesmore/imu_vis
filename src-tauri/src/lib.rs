//! Tauri 后端入口与全局初始化。

#![deny(missing_docs)]

use serde::Serialize;
use tauri::{Emitter, Manager as _};

mod app_state;
mod commands;
mod imu;
mod logger;
mod processor;
mod recorder;
mod types;

#[derive(Serialize, Clone)]
/// 心跳事件数据结构。
struct HeartbeatFrame {
    message: String,
    timestamp: u128,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 启动 Tauri 应用并注册后端能力。
pub fn run() {
    std::env::set_var("NO_PROXY", "localhost,127.0.0.1");
    let _log_guard = logger::init_tracing();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handlers())
        .setup(|app| {
            app.get_webview_window("main").unwrap().open_devtools();
            app.manage(app_state::AppState::new());
            let handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                loop {
                    handle
                        .emit(
                            "heartbeat",
                            HeartbeatFrame {
                                message: "一切正常".to_string(),
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis(),
                            },
                        )
                        .unwrap();
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
