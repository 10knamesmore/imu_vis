mod imu;
mod output;
mod response;
mod test;

pub fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        test::gen_sine_wave,
        test::test,
        imu::start_scan,
        imu::stop_scan,
        imu::list_peripherals,
        imu::connect_peripheral,
        imu::disconnect_peripheral,
        output::subscribe_output
    ]
}
