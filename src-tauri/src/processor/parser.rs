use anyhow::bail;
use serde::Serialize;

// ===============================
// IMU数据结构 (需要根据实际解析实现)
// ===============================
#[derive(Debug, Clone, Serialize)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Quaternion {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quaternion {
    pub fn to_euler(&self) -> (f64, f64, f64) {
        // 四元数转欧拉角 (roll, pitch, yaw)
        let sinr_cosp = 2.0 * (self.w * self.x + self.y * self.z);
        let cosr_cosp = 1.0 - 2.0 * (self.x * self.x + self.y * self.y);
        let roll = sinr_cosp.atan2(cosr_cosp);

        let sinp = 2.0 * (self.w * self.y - self.z * self.x);
        let pitch = if sinp.abs() >= 1.0 {
            std::f64::consts::FRAC_PI_2.copysign(sinp)
        } else {
            sinp.asin()
        };

        let siny_cosp = 2.0 * (self.w * self.z + self.x * self.y);
        let cosy_cosp = 1.0 - 2.0 * (self.y * self.y + self.z * self.z);
        let yaw = siny_cosp.atan2(cosy_cosp);

        (roll, pitch, yaw)
    }

    pub fn print_euler(&self, prefix: &str) {
        let (roll, pitch, yaw) = self.to_euler();
        println!(
            "{} (roll={:.2}°, pitch={:.2}°, yaw={:.2}°)",
            prefix,
            roll.to_degrees(),
            pitch.to_degrees(),
            yaw.to_degrees()
        );
    }
}

#[derive(Debug, Serialize)]
/// 从蓝牙数据包中解析出的原始数据体
///
/// * `timestamp_ms`: 运行时间ms
/// * `accel_no_g`: 没有G的重力加速度 m/s^2
/// * `accel_with_g`: 有G的重力加速度 m/s^2
/// * `gyro`:  角速度   度/s
/// * `quat`:  四元数
/// * `angle`: 欧拉角 度
/// * `offset`: 位置偏移 米
/// * `accel_nav`: 导航系加速度
pub struct IMUData {
    pub timestamp_ms: u64,
    pub accel_no_g: Option<Vector3>,
    pub accel_with_g: Option<Vector3>,
    pub gyro: Option<Vector3>,
    pub quat: Option<Quaternion>,
    pub angle: Option<Vector3>,
    pub offset: Option<Vector3>,
    pub accel_nav: Option<Vector3>,
}

// ===============================
// IMU解析器
// ===============================
pub struct IMUParser;

impl IMUParser {
    const SCALE_ACCEL: f64 = 0.00478515625; // 加速度 [-16g~+16g] 9.8*16/32768
    const SCALE_QUAT: f64 = 0.000030517578125; // 四元数 [-1~+1] 1/32768
    const SCALE_ANGLE: f64 = 0.0054931640625; // 角度 [-180~+180] 180/32768
    const SCALE_ANGLE_SPEED: f64 = 0.06103515625; // 角速度 [-2000~+2000] 2000/32768

    /// 解析订阅的功能数据 (数据体第一个字节为0x11)
    ///
    /// * `buf`: 蓝牙数据包
    pub fn parse_imu(buf: &[u8]) -> anyhow::Result<IMUData> {
        // 字节[2-1] 为功能订阅标识，指示当前订阅了哪些功能
        // 字节[6-3] 为模块开机后的时间戳(单位ms)
        // 字节[7-n] 根据功能订阅标识而变化, 请看 文档表3
        //
        if buf.is_empty() || buf[0] != 0x11 {
            bail!("[error] data head not defined")
        }

        if buf.len() < 7 {
            bail!("[error] buffer too short")
        }

        // 解析控制字和时间戳
        let ctl = ((buf[2] as u16) << 8) | (buf[1] as u16);
        let timestamp_ms = ((buf[6] as u64) << 24)
            | ((buf[5] as u64) << 16)
            | ((buf[4] as u64) << 8)
            | (buf[3] as u64);

        let mut imu_data = IMUData {
            timestamp_ms,
            accel_no_g: None,
            accel_with_g: None,
            gyro: None,
            quat: None,
            angle: None,
            offset: None,
            accel_nav: None,
        };

        let mut l = 7; // 从第7字节开始解析

        // ===============================
        // accel_noG bit0
        // ===============================
        if (ctl & 0x0001) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.accel_no_g = Some(Self::read_vec3(&buf[l..], Self::SCALE_ACCEL));
            l += 6;
        }

        // ===============================
        // accel_withG bit1
        // ===============================
        if (ctl & 0x0002) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.accel_with_g = Some(Self::read_vec3(&buf[l..], Self::SCALE_ACCEL));
            l += 6;
        }

        // ===============================
        // gyro 角速度 bit2
        // ===============================
        if (ctl & 0x0004) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.gyro = Some(Self::read_vec3(&buf[l..], Self::SCALE_ANGLE_SPEED));
            l += 6;
        }

        // ===============================
        // quaternion bit5
        // ===============================
        if (ctl & 0x0020) != 0 {
            if l + 8 > buf.len() {
                bail!("data buffer not long enough")
            }
            let w = Self::read_i16(&buf[l..]) as f64 * Self::SCALE_QUAT;
            let x = Self::read_i16(&buf[l + 2..]) as f64 * Self::SCALE_QUAT;
            let y = Self::read_i16(&buf[l + 4..]) as f64 * Self::SCALE_QUAT;
            let z = Self::read_i16(&buf[l + 6..]) as f64 * Self::SCALE_QUAT;
            imu_data.quat = Some(Quaternion { w, x, y, z });
            l += 8;
        }

        // ===============================
        // angle (欧拉角) bit6
        // ===============================
        if (ctl & 0x0040) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.angle = Some(Self::read_vec3(&buf[l..], Self::SCALE_ANGLE));
            l += 6;
        }

        // ===============================
        // offset bit7
        // ===============================
        if (ctl & 0x0080) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.offset = Some(Self::read_vec3(&buf[l..], 1.0 / 1000.0));
            l += 6;
        }

        // ===============================
        // accel_nav (导航加速度) bit10
        // ===============================
        if (ctl & 0x0200) != 0 {
            if l + 6 > buf.len() {
                bail!("data buffer not long enough")
            }
            imu_data.accel_nav = Some(Self::read_vec3(&buf[l..], Self::SCALE_ACCEL));
            // l += 6;
        }

        Ok(imu_data)
    }

    /// 从小端字节读取一个有符号 16 位整数
    fn read_i16(buf: &[u8]) -> i16 {
        i16::from_le_bytes([buf[0], buf[1]])
    }

    /// 连续读取三个 i16，并按比例系数转换为 Vector3
    fn read_vec3(buf: &[u8], scale: f64) -> Vector3 {
        let x = Self::read_i16(&buf[0..2]) as f64 * scale;
        let y = Self::read_i16(&buf[2..4]) as f64 * scale;
        let z = Self::read_i16(&buf[4..6]) as f64 * scale;
        Vector3 { x, y, z }
    }
}
