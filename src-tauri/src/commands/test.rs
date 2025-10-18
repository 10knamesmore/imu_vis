use glam::f64;
use serde::Serialize;
use std::{f64::consts::PI, time::Duration};
use tauri::{ipc::Channel, Emitter};

use crate::processor::parser::data::IMUData;

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
pub fn mock_imu_data(on_event: Channel<IMUData>) {
    println!("called mock_imu_data");
    let rx = mock::start_imu_data_simulation();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv() {
                Ok(data) => {
                    on_event.send(data).unwrap();
                    // dbg!(&data);
                }
                Err(_) => {
                    // dbg!(e);
                }
            }
        }
        // while let Ok(data) = rx.recv() {
        //     if on_event.send(data).is_err() {
        //         // 如果发送失败，说明前端已断开连接，退出循环
        //         eprintln!("Tauri 前端订阅已断开，停止发送IMU数据。");
        //         break;
        //     }
        // }
        // println!("sender has been dropped");
    });
}

mod mock {
    use std::{f64::consts::PI, time::Duration};

    use flume::Receiver;
    use glam::{DQuat, DVec3};

    use crate::processor::parser::data::IMUData;

    /// 返回一个 Receiver，其对应的 Sender 会以 250 Hz (每 4 毫秒) 的速率发送模拟的 IMUData
    ///
    /// Vector3 字段是相位不同的正弦波。
    ///
    /// # 返回值
    ///
    /// 一个 `flume::Receiver<IMUData>`
    pub fn start_imu_data_simulation() -> Receiver<IMUData> {
        // 1. 创建 MPSC (多生产者, 单消费者) 通道
        // 缓冲区大小设为 10，防止背压。
        let (sender, receiver) = flume::unbounded::<IMUData>();

        // 2. 在一个新的异步任务中运行数据生成和发送逻辑
        std::thread::spawn(move || {
            // 目标频率 250 Hz，周期 T = 1/250 s = 4 ms
            let period = Duration::from_millis(4);

            // 初始化时间变量
            let mut time_ms: u64 = 0;
            let frequency_hz: f64 = 0.5; // 正弦波频率 0.5 Hz
            let angular_velocity = 2.0 * PI * frequency_hz; // 角速度 ω = 2πf

            loop {
                // 等待下一个间隔，确保精确的 250 Hz 速率
                std::thread::sleep(period);

                // 归一化时间 t
                let t = time_ms as f64 / 1000.0; // t in seconds

                // ----------------------------------------------------
                // 3. 生成相位不同的正弦波 Vector3 数据
                // 以 accel_no_g 为例, x, y, z 分别有 0, π/3, 2π/3 的相位差
                // ----------------------------------------------------

                let accel_no_g = Some(DVec3 {
                    // 幅度 2.0
                    x: 2.0 * (angular_velocity * t).sin(),
                    y: 2.0 * (angular_velocity * t + PI / 3.0).sin(),
                    z: 2.0 * (angular_velocity * t + 2.0 * PI / 3.0).sin(),
                });

                let accel_with_g = Some(DVec3 {
                    // 幅度 2.0
                    x: 2.0 * (angular_velocity * t).sin() + 10.0,
                    y: 2.0 * (angular_velocity * t + PI / 3.0).sin() + 10.0,
                    z: 2.0 * (angular_velocity * t + 2.0 * PI / 3.0).sin() + 10.0,
                });

                let gyro = Some(DVec3 {
                    // 幅度 50.0
                    x: 50.0 * (angular_velocity * t + PI).sin(),
                    y: 50.0 * (angular_velocity * t + PI + PI / 4.0).sin(),
                    z: 50.0 * (angular_velocity * t + PI + 2.0 * PI / 4.0).sin(),
                });

                let angle = Some(DVec3 {
                    x: 30.0 * (angular_velocity * t + PI).sin(),
                    y: 30.0 * (angular_velocity * t + PI + PI / 4.0).sin(),
                    z: 30.0 * (angular_velocity * t + PI + 2.0 * PI / 4.0).sin(),
                });

                let quat = Some(DQuat {
                    w: 1.0,                                // 简化四元数 w 分量
                    x: (angular_velocity * t / 2.0).sin(), // 简化 x, y, z 随时间变化
                    y: (angular_velocity * t / 2.0 + PI / 6.0).sin(),
                    z: (angular_velocity * t / 2.0 + PI / 3.0).sin(),
                });

                // offset 改为螺旋线运动
                // 螺旋线参数方程：
                // x = r * cos(θ)
                // y = r * sin(θ)
                // z = c * θ (或 c * t，实现竖直方向上升)
                // 其中 θ = angular_velocity * t 是螺旋的旋转角度
                let theta = angular_velocity * t;
                let radius = 5.0; // 螺旋半径
                let pitch = 2.0; // 螺旋的竖直上升速度（每周期上升高度）

                let offset = Some(DVec3 {
                    x: radius * theta.cos(),
                    y: radius * theta.sin(),
                    z: pitch * theta / (2.0 * PI), // 或简单地用 z: pitch * t
                });

                let accel_nav = Some(DVec3 {
                    x: 5.0 * (angular_velocity * t + PI).sin(),
                    y: 5.0 * (angular_velocity * t + PI + PI / 4.0).sin(),
                    z: 5.0 * (angular_velocity * t + PI + 2.0 * PI / 4.0).sin(),
                });

                // 4. 构建 IMUData 结构体
                let imu_data = IMUData {
                    timestamp_ms: time_ms,
                    accel_no_g,
                    accel_with_g,
                    gyro,
                    quat,
                    angle,
                    offset,
                    accel_nav,
                };

                // 5. 尝试发送数据
                // 如果 receiver 已经被丢弃 (dropped)，send() 会返回 Err，此时循环应停止
                match sender.send(imu_data) {
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("{:?}", e);
                        continue;
                    }
                }

                // 时间递增 4 ms
                time_ms += 4;
            }
        });

        receiver
    }
}
