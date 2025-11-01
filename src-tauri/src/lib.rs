use tauri::Manager;

mod app_state;
mod commands;
mod imu;
mod processor;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handlers())
        .setup(|app| {
            app.manage(app_state::AppState::new());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
