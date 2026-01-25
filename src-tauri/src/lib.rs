//! Tauri 后端入口与全局初始化。

#![deny(missing_docs)]

use tauri::Manager as _;

mod app_state;
mod commands;
mod imu;
mod logger;
mod processor;
mod recorder;
mod types;

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
            app.manage(app_state::AppState::new(app.handle().clone()));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
