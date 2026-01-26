//! Tauri 命令路由。

mod imu;
mod output;
mod recording;
mod response;

/// 注册所有命令处理器。
pub fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        imu::start_scan,
        imu::stop_scan,
        imu::list_peripherals,
        imu::connect_peripheral,
        imu::disconnect_peripheral,
        imu::set_axis_calibration,
        imu::set_position,
        output::subscribe_output,
        recording::start_recording,
        recording::stop_recording,
        recording::list_recordings,
        recording::update_recording_meta,
        recording::get_recording_samples
    ]
}
