use anyhow::bail;
use glam::{DQuat, DVec3};
use serde::Serialize;

#[derive(Debug, Serialize)]
/// 从蓝牙数据包中解析出的原始数据体, 保证数据均为有效值
pub struct IMUData {
    /// * `timestamp_ms`: 运行时间ms
    pub timestamp_ms: u64,

    /// * `accel_no_g`: 没有G的重力加速度 m/s^2
    pub accel_no_g: DVec3,

    /// * `accel_with_g`: 有G的重力加速度 m/s^2
    pub accel_with_g: DVec3,

    /// * `gyro`:  角速度   度/s
    pub gyro: DVec3,

    /// * `quat`:  四元数
    pub quat: DQuat,

    /// * `angle`: 欧拉角 度
    pub angle: DVec3,

    /// * `offset`: 位置偏移 米
    pub offset: DVec3,

    /// * `accel_nav`: 导航系加速度
    pub accel_nav: DVec3,
}

// ===============================
// IMU解析器
// https://www.yuque.com/cxqwork/lkw3sg/yqa3e0?#Phg5V
// ===============================
pub struct IMUParser;

impl IMUParser {
    const SCALE_ACCEL: f64 = 0.00478515625; // 加速度 [-16g~+16g] 9.8*16/32768
    const SCALE_QUAT: f64 = 0.000030517578125; // 四元数 [-1~+1] 1/32768
    const SCALE_ANGLE: f64 = 0.0054931640625; // 角度 [-180~+180] 180/32768
    const SCALE_ANGLE_SPEED: f64 = 0.06103515625; // 角速度 [-2000~+2000] 2000/32768
    const SCALE_OFFSET: f64 = 1.0 / 1000.0; // 偏移量，m

    /// 从小端字节读取一个有符号 16 位整数
    fn read_i16(buf: &[u8]) -> i16 {
        // 假设数据是 Little Endian (LE)
        i16::from_le_bytes([buf[0], buf[1]])
    }

    /// 连续读取三个 i16，并按比例系数转换为 Vector3
    fn read_vec3(buf: &[u8], scale: f64) -> DVec3 {
        let x = Self::read_i16(&buf[0..2]) as f64 * scale;
        let y = Self::read_i16(&buf[2..4]) as f64 * scale;
        let z = Self::read_i16(&buf[4..6]) as f64 * scale;
        DVec3 { x, y, z }
    }

    /// 尝试解析 DVec3 字段，如果控制位未设置，则返回错误。
    /// 返回 (解析后的 DVec3, 下一个起始索引)
    fn try_parse_vec3(
        buf: &[u8],
        ctl: u16,
        bit_pos: u8,
        start_l: usize,
        scale: f64,
    ) -> anyhow::Result<(DVec3, usize)> {
        if (ctl & (1 << bit_pos)) != 0 {
            const LEN: usize = 6;
            if start_l + LEN > buf.len() {
                bail!(
                    "data buffer not long enough for Vec3 field (bit {})",
                    bit_pos
                )
            }
            // 解析值并推进索引
            let vec = Self::read_vec3(&buf[start_l..], scale);
            Ok((vec, start_l + LEN))
        } else {
            // 控制位未设置，返回零值和未推进的索引
            // Ok((DVec3::ZERO, start_l))
            bail!("数据包没有设置指定控制位, 期望控制位为 : {}", bit_pos)
        }
    }

    /// 尝试解析 DQuat 字段，如果控制位未设置，则返回错误 。
    /// 返回 (解析后的 DQuat, 下一个起始索引)
    fn try_parse_quat(
        buf: &[u8],
        ctl: u16,
        bit_pos: u8,
        start_l: usize,
    ) -> anyhow::Result<(DQuat, usize)> {
        if (ctl & (1 << bit_pos)) != 0 {
            const LEN: usize = 8;
            if start_l + LEN > buf.len() {
                bail!("data buffer not long enough for quat (bit {})", bit_pos)
            }
            let w = Self::read_i16(&buf[start_l..]) as f64 * Self::SCALE_QUAT;
            let x = Self::read_i16(&buf[start_l + 2..]) as f64 * Self::SCALE_QUAT;
            let y = Self::read_i16(&buf[start_l + 4..]) as f64 * Self::SCALE_QUAT;
            let z = Self::read_i16(&buf[start_l + 6..]) as f64 * Self::SCALE_QUAT;
            let quat = DQuat { w, x, y, z };
            Ok((quat, start_l + LEN))
        } else {
            // 控制位未设置，返回身份四元数和未推进的索引
            // Ok((DQuat::IDENTITY, start_l))
            bail!("数据包没有设置指定控制位, 期望控制位为 : {}", bit_pos)
        }
    }

    /// 解析订阅的功能数据 (数据体第一个字节为0x11)
    ///
    /// * `buf`: 蓝牙数据包
    pub fn parse(buf: &[u8]) -> anyhow::Result<IMUData> {
        // 头部检查
        if buf.is_empty() || buf[0] != 0x11 {
            bail!("[error] data head not defined")
        }
        if buf.len() < 7 {
            bail!("[error] buffer too short, expected at least 7 bytes")
        }

        let ctl = ((buf[2] as u16) << 8) | (buf[1] as u16);
        let timestamp_ms = ((buf[6] as u64) << 24)
            | ((buf[5] as u64) << 16)
            | ((buf[4] as u64) << 8)
            | (buf[3] as u64);

        let initial_l = 7;

        // 1. accel_noG (bit 0)
        let (accel_no_g, l1) = Self::try_parse_vec3(buf, ctl, 0, initial_l, Self::SCALE_ACCEL)?;

        // 2. accel_withG (bit 1)
        let (accel_with_g, l2) = Self::try_parse_vec3(buf, ctl, 1, l1, Self::SCALE_ACCEL)?;

        // 3. gyro (bit 2)
        let (gyro, l3) = Self::try_parse_vec3(buf, ctl, 2, l2, Self::SCALE_ANGLE_SPEED)?;

        // 4. quat (bit 5)
        let (quat, l4) = Self::try_parse_quat(buf, ctl, 5, l3)?;

        // 5. angle (欧拉角) (bit 6)
        let (angle, l5) = Self::try_parse_vec3(buf, ctl, 6, l4, Self::SCALE_ANGLE)?;

        // 6. offset (bit 7)
        let (offset, l6) = Self::try_parse_vec3(buf, ctl, 7, l5, Self::SCALE_OFFSET)?;

        // 7. accel_nav (导航加速度) (bit 10)
        let (accel_nav, _l_final) = Self::try_parse_vec3(buf, ctl, 10, l6, Self::SCALE_ACCEL)?;

        Ok(IMUData {
            timestamp_ms,
            accel_no_g,
            accel_with_g,
            gyro,
            quat,
            angle,
            offset,
            accel_nav,
        })
    }
}
