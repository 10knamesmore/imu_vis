//! IMU 蓝牙客户端实现。

use anyhow::{anyhow, bail, Context};
use btleplug::{
    api::{Central, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType},
    platform::{Adapter, Manager, Peripheral},
};
use flume::Sender;
use futures::StreamExt;
use std::{
    collections::BTreeSet,
    time::{Duration, Instant},
};
use tauri::async_runtime::JoinHandle;
use tokio::sync::OnceCell;

use crate::{imu::config::IMUConfig, processor::RawImuData, types::bluetooth::PeripheralInfo};

struct NeededCharacteristics {
    write_char: Characteristic,
    notify_char: Characteristic,
    _battery_char: Characteristic,
}

// ===============================
// IMU客户端
// URL: https://www.yuque.com/cxqwork/lkw3sg/yqa3e0?#Phg5V
// ===============================
/// * `central`: 蓝牙主设备(本机)
/// * `peripheral`: 目前连接上的设备
/// * `chars`: 蓝牙特征
/// * `tx`: 接收蓝牙数据包发给下游
/// * `handle`: 接收蓝牙数据包的task的handle
pub struct IMUClient {
    central: OnceCell<Adapter>,
    peripheral: Option<Peripheral>,
    chars: Option<NeededCharacteristics>,
    tx: Sender<RawImuData>,
    handle: Option<JoinHandle<()>>,
}

impl IMUClient {
    /// 创建 IMU 客户端。
    pub fn new(tx: Sender<RawImuData>) -> Self {
        Self {
            central: OnceCell::new(),
            peripheral: None,
            chars: None,
            tx,
            handle: None,
        }
    }

    /// 尝试获取蓝牙 central 设备(本机)
    async fn central(&self) -> anyhow::Result<&Adapter> {
        self.central
            .get_or_try_init(async || -> anyhow::Result<Adapter> {
                Manager::new()
                    .await
                    .context("没找到蓝牙Manager")?
                    .adapters()
                    .await
                    .context("没找到蓝牙Adapters")?
                    .into_iter()
                    .next()
                    .ok_or(anyhow!("没找到蓝牙Adapters"))
            })
            .await
    }

    /// 连接指定 uuid 的设备。
    ///
    /// * `uuid`: 指定uuid
    pub async fn connect(&mut self, uuid: &str) -> anyhow::Result<PeripheralInfo> {
        let peripheral = match self.find_peripheral(uuid).await {
            Ok(it) => it,
            Err(e) => {
                bail!("连接到设备时发生错误: {}", e)
            }
        };

        peripheral.connect().await.context("连接到设备")?;
        peripheral
            .discover_services()
            .await
            .context("设备发现蓝牙服务")?;

        // info!("设备发现蓝牙服务");
        let characteristics = peripheral.characteristics();

        fn get_char(
            chars: &BTreeSet<Characteristic>,
            service_uuid: &str,
            uuid: &str,
        ) -> Option<Characteristic> {
            chars
                .iter()
                .find(|c| {
                    c.service_uuid.to_string().contains(service_uuid)
                        && c.uuid.to_string().contains(uuid)
                })
                .cloned()
        }

        let write_char = get_char(&characteristics, "ae30", "ae01").ok_or(anyhow!(
            "Write characteristic not found, 蓝牙设备非指定IMU?"
        ))?;

        let notify_char = get_char(&characteristics, "ae30", "ae02").ok_or(anyhow!(
            "Notify characteristic not found, 蓝牙设备非指定IMU?"
        ))?;

        let battery_char = get_char(&characteristics, "180f", "2a19").ok_or(anyhow!(
            "battery characteristic not found, 蓝牙设备非指定IMU?"
        ))?;

        self.peripheral = Some(peripheral.clone());
        self.chars = Some(NeededCharacteristics {
            write_char,
            notify_char,
            _battery_char: battery_char,
        });

        match self.init_peripheral().await {
            Ok(handle) => {
                if let Some(last_handle) = self.handle.take() {
                    // 先中止上一个任务
                    last_handle.abort();
                }
                self.handle = Some(handle)
            }
            Err(e) => {
                self.peripheral = None;
                self.chars = None;
                self.disconnect().await?;
                return Err(e);
            }
        };

        // info!("设备初始化成功!");

        Ok(PeripheralInfo::from_peripheral(&peripheral)
            .await
            .unwrap_or_default())
    }

    /// 断开当前连接的设备。
    pub async fn disconnect(&mut self) -> anyhow::Result<PeripheralInfo> {
        self.disable_data_reporting().await?;
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
        if let Err(e) = self.tx.send_async(RawImuData::Reset).await {
            tracing::error!("下游通道已关闭, 无法发送重置信号: {}", e);
        };

        match self.peripheral.take() {
            Some(p) => {
                p.disconnect().await.context("断开设备连接")?;
                Ok(PeripheralInfo::from_peripheral(&p)
                    .await
                    .unwrap_or_default())
            }
            None => {
                anyhow::bail!("没有连接的设备可断开")
            }
        }
    }

    /// 初始化IMU设备的连接
    /// 内部开启一个tokio线程接收蓝牙数据包
    async fn init_peripheral(&mut self) -> anyhow::Result<JoinHandle<()>> {
        // 保持蓝牙连接
        self.keep_bluetooth_connection().await?;

        // 尝试采用蓝牙高速通信特性
        self.enable_highspeed_communication().await?;

        // 配置IMU
        self.set_config(&IMUConfig::default()).await?;

        // 订阅通知
        self.subscribe_nofitication().await?;

        // 开启数据主动上报
        self.enable_data_reporting().await?;

        let (peripheral, _) = self.assert_initialzation()?;

        // 接收通知
        let mut notification_stream = peripheral.notifications().await?;

        let tx = self.tx.clone();
        let handle = tauri::async_runtime::spawn(async move {
            let mut msg_count = 0;
            let mut last_report = Instant::now();
            while let Some(data) = notification_stream.next().await {
                match tx.send_async(RawImuData::Packet(data.value)).await {
                    Ok(_) => {
                        // debug!(uuid = %data.uuid, "received imu packet");
                    }
                    // 当且仅当所有Receiver被drop时返回error
                    Err(e) => {
                        tracing::error!("下游通道已关闭, 停止接收IMU数据: {}", e);
                    }
                }

                msg_count += 1;
                let elapsed = last_report.elapsed();
                if elapsed > Duration::from_secs(1) {
                    let elapsed_secs = elapsed.as_secs_f64();
                    let throughput = msg_count as f64 / elapsed_secs;

                    tracing::debug!(throughput, msg_count, elapsed_secs, "处理速率报告");

                    // 重置计数器和计时器
                    msg_count = 0;
                    last_report = Instant::now();
                }
            }
        });

        Ok(handle)
    }

    /// 从central中查找指定uuid的Peripheral
    ///
    /// * `target_uuid`: 指定uuid
    async fn find_peripheral(&self, target_uuid: &str) -> anyhow::Result<Peripheral> {
        for p in self.central().await?.peripherals().await? {
            if p.id().to_string() == target_uuid {
                return Ok(p);
            }
        }
        Err(anyhow!("Device not found"))
    }

    /// 列举central中的peripheral
    /// 获取扫描到的设备列表。
    pub async fn list_peripherals(&self) -> anyhow::Result<Vec<PeripheralInfo>> {
        let peripherals = self
            .central()
            .await?
            .peripherals()
            .await
            .context("列举蓝牙从设备")?;

        Ok(futures::stream::iter(peripherals)
            .then(
                async move |p| match PeripheralInfo::from_peripheral(&p).await {
                    Ok(info) => {
                        let local_name = info.local_name.clone();
                        if local_name.is_some_and(|name| name != "Unknown") {
                            Some(info)
                        } else {
                            None
                        }
                    }
                    Err(e) => {
                        // HACK
                        tracing::warn!("fail to get PeripheralInfo : {}", e);
                        None
                    }
                },
            )
            .filter_map(async move |x| x)
            .collect::<Vec<_>>()
            .await)
    }
}

/// 低级蓝牙功能
impl IMUClient {
    /// assert 与 IMU948 相关的 Peripheral 和特征初始化成功
    fn assert_initialzation(&self) -> anyhow::Result<(&Peripheral, &NeededCharacteristics)> {
        let peripheral = match &self.peripheral {
            Some(p) => p,
            None => bail!("蓝牙初始化异常: 没有找到设备"),
        };
        let char = match &self.chars {
            Some(chars) => chars,
            None => bail!("蓝牙初始化异常: 找不到特征"),
        };

        Ok((peripheral, char))
    }

    /// 开始扫描设备。
    pub async fn start_scan(&self) -> anyhow::Result<()> {
        Ok(self
            .central()
            .await?
            .start_scan(ScanFilter::default())
            .await?)
    }

    /// 停止扫描设备。
    pub async fn stop_scan(&self) -> anyhow::Result<()> {
        Ok(self.central().await?.stop_scan().await?)
    }

    /// 以无回复方式写数据的工具函数
    ///
    /// * `data`: 要写入的二进制数据
    async fn write_no_response(&self, data: &[u8]) -> anyhow::Result<()> {
        let (peripheral, char) = self.assert_initialzation()?;

        peripheral
            .write(&char.write_char, data, WriteType::WithoutResponse)
            .await
            .context(format!("error write data to imu : {:?}", data))?;
        Ok(())
    }

    /// 保持蓝牙连接
    async fn keep_bluetooth_connection(&self) -> anyhow::Result<()> {
        self.write_no_response(&[0x29]).await
    }

    /// 向IMU写入配置项
    ///
    /// * `config`: IMU配置
    async fn set_config(&self, config: &IMUConfig) -> anyhow::Result<()> {
        self.write_no_response(&config.to_bytes()).await
    }

    /// 停止数据主动上报
    async fn disable_data_reporting(&self) -> anyhow::Result<()> {
        self.write_no_response(&[0x18])
            .await
            .context("停止数据主动上报")
    }

    /// 开启数据主动上报
    async fn enable_data_reporting(&self) -> anyhow::Result<()> {
        self.write_no_response(&[0x19])
            .await
            .context("开启数据主动上报")
    }

    /// 订阅notify特征
    async fn subscribe_nofitication(&self) -> anyhow::Result<()> {
        let (peripheral, char) = self.assert_initialzation()?;

        peripheral
            .subscribe(&char.notify_char)
            .await
            .context("subscribe notification")?;
        Ok(())
    }

    /// 尝试采用蓝牙高速通信特性
    ///
    /// IMU文档里没写, 但python事例代码里有
    async fn enable_highspeed_communication(&self) -> anyhow::Result<()> {
        self.write_no_response(&[0x46])
            .await
            .context("开启蓝牙高速通信特征")
    }
}
