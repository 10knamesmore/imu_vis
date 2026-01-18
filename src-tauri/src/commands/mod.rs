mod imu;
mod output;
mod recording;
mod response;
mod test;

pub fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        test::gen_sine_wave,
        test::mock_imu_data,
        imu::start_scan,
        imu::stop_scan,
        imu::list_peripherals,
        imu::connect_peripheral,
        imu::disconnect_peripheral,
        output::subscribe_output,
        recording::start_recording,
        recording::stop_recording,
        recording::list_recordings,
        recording::update_recording_meta,
        recording::get_recording_samples
    ]
}
