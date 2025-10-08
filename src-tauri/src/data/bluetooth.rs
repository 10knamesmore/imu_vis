use btleplug::{api::Peripheral as _, platform::Peripheral};
use serde::Serialize;

#[derive(Debug, Default, Serialize)]
pub struct PeripheralInfo {
    pub id: String,
    /// The address of this peripheral
    pub address: String,
    /// The local name. This is generally a human-readable string that identifies the type of device.
    pub local_name: Option<String>,
    /// The most recent Received Signal Strength Indicator for the device
    pub rssi: Option<i16>,
}

impl PeripheralInfo {
    pub async fn from_peripheral(p: &Peripheral) -> anyhow::Result<PeripheralInfo> {
        let properties = p
            .properties()
            .await?
            .ok_or_else(|| anyhow::anyhow!("获取 properties 失败"))?;
        let id = p.id().to_string();

        Ok(PeripheralInfo {
            id,
            address: p.address().to_string(),
            local_name: properties.local_name,
            rssi: properties.rssi,
        })
    }
}
