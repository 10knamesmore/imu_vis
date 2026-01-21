use anyhow::bail;
use math_f64::{DQuat, DVec3};

use crate::processor::parser::types::ImuSampleRaw;

// ===============================
// IMU解析器
// https://www.yuque.com/cxqwork/lkw3sg/yqa3e0?#Phg5V
// ===============================
pub struct ImuParser;

impl ImuParser {
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
        bit_mask: u16,
        start_l: usize,
        scale: f64,
    ) -> anyhow::Result<(DVec3, usize)> {
        if (ctl & bit_mask) != 0 {
            const LEN: usize = 6;
            if start_l + LEN > buf.len() {
                bail!(
                    "data buffer not long enough for Vec3 field (bit {})",
                    bit_mask
                )
            }
            // 解析值并推进索引
            let vec = Self::read_vec3(&buf[start_l..], scale);
            Ok((vec, start_l + LEN))
        } else {
            bail!("数据包没有设置指定控制位, 期望控制位为 : {}", bit_mask)
        }
    }

    /// 尝试解析 DQuat 字段，如果控制位未设置，则返回错误 。
    /// 返回 (解析后的 DQuat, 下一个起始索引)
    fn try_parse_quat(
        buf: &[u8],
        ctl: u16,
        bit_mask: u16,
        start_l: usize,
    ) -> anyhow::Result<(DQuat, usize)> {
        if (ctl & bit_mask) != 0 {
            const LEN: usize = 8;
            if start_l + LEN > buf.len() {
                bail!("data buffer not long enough for quat (bit {})", bit_mask)
            }
            let w = Self::read_i16(&buf[start_l..]) as f64 * Self::SCALE_QUAT;
            let x = Self::read_i16(&buf[start_l + 2..]) as f64 * Self::SCALE_QUAT;
            let y = Self::read_i16(&buf[start_l + 4..]) as f64 * Self::SCALE_QUAT;
            let z = Self::read_i16(&buf[start_l + 6..]) as f64 * Self::SCALE_QUAT;
            let quat = DQuat { w, x, y, z };
            Ok((quat, start_l + LEN))
        } else {
            bail!("数据包没有设置指定控制位, 期望控制位为 : {}", bit_mask)
        }
    }

    /// 解析订阅的功能数据 (数据体第一个字节为0x11)
    ///
    /// * `buf`: 蓝牙数据包
    pub fn parse(buf: &[u8]) -> anyhow::Result<ImuSampleRaw> {
        // 头部检查
        if buf.is_empty() || buf[0] != 0x11 {
            bail!("[error] data head not defined")
        }
        if buf.len() < 7 {
            bail!("[error] buffer too short, expected at least 7 bytes")
        }

        let ctl = ((buf[2] as u16) << 8) | (buf[1] as u16); // 前两个直接功能订阅标识

        let timestamp_ms = ((buf[6] as u64) << 24)
            | ((buf[5] as u64) << 16)
            | ((buf[4] as u64) << 8)
            | (buf[3] as u64);

        let initial_l = 7;

        // (bit 0)
        let (accel_no_g, l1) =
            Self::try_parse_vec3(buf, ctl, 0x0001, initial_l, Self::SCALE_ACCEL)?;

        // (bit 1)
        let (accel_with_g, l2) = Self::try_parse_vec3(buf, ctl, 0x0002, l1, Self::SCALE_ACCEL)?;

        // (bit 2)
        let (gyro, l3) = Self::try_parse_vec3(buf, ctl, 0x0004, l2, Self::SCALE_ANGLE_SPEED)?;

        // bit3 磁场, bit4 气压计不订阅

        // (bit 5)
        let (quat, l4) = Self::try_parse_quat(buf, ctl, 0x0020, l3)?;

        // (bit 6)
        let (angle, l5) = Self::try_parse_vec3(buf, ctl, 0x0040, l4, Self::SCALE_ANGLE)?;

        // (bit 7)
        let (offset, l6) = Self::try_parse_vec3(buf, ctl, 0x0080, l5, Self::SCALE_OFFSET)?;

        // (bit 10)
        let (accel_nav, _l_final) =
            Self::try_parse_vec3(buf, ctl, 0x0200, l6, Self::SCALE_ACCEL)?;

        Ok(ImuSampleRaw {
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
