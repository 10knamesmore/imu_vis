use serde::Serialize;
use tauri::{Emitter, Manager as _};

mod app_state;
mod commands;
mod imu;
mod processor;
mod types;

// interface HeartbeatFrame {
//   message: string;
//   timestamp: number;
//   device_connected: boolean;
//   service_uptime_sec: number;
//   imu_subscribers: number;
// }
#[derive(Serialize, Clone)]
struct HeartbeatFrame {
    message: String,
    timestamp: u128,
    device_connected: bool,
    service_uptime_sec: u64,
    imu_subscribers: u32,
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var("NO_PROXY", "localhost,127.0.0.1");

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
                                device_connected: true,
                                service_uptime_sec: 1,
                                imu_subscribers: 1,
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
