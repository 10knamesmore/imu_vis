use tauri::{async_runtime::spawn, ipc::Channel, AppHandle, Manager};

use crate::{app_state::AppState, processor::IMUData};

#[tauri::command]
pub fn subscribe_output(app: AppHandle, on_event: Channel<IMUData>) {
    let app_state = app.state::<AppState>();

    let rx = app_state.downstream_rx.clone();
    rx.drain();
    spawn(async move {
        while let Ok(data) = rx.recv() {
            if on_event.send(data).is_err() {
                // 如果发送失败，说明前端已断开连接，退出循环
                eprintln!("Tauri 前端订阅已断开，停止发送IMU数据。");
                break;
            }
        }

        // 暂停一段时间，控制发送频率，例如 4ms (250Hz)
        // 这一步很重要，能防止 CPU 100% 运行空循环
        // tokio::time::sleep(Duration::from_millis(4)).await;
    });
}
