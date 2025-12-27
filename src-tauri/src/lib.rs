use tauri::Manager;

mod app_state;
mod commands;
mod imu;
mod processor;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var("NO_PROXY", "localhost,127.0.0.1");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handlers())
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();
            app.manage(app_state::AppState::new());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
