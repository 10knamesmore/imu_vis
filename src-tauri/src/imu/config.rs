pub struct IMUConfig {
    /// 惯导静止状态加速度阈值 (单位 dm/s²)
    ///
    /// 当加速度低于该阈值时，认为设备处于“静止状态”。
    /// 例如设为 5，表示阈值为 0.5 m/s²。
    /// 该值影响静止检测算法的敏感度。
    pub static_acc_threshold: u8,

    /// 静止归零速度 (单位 cm/s)
    ///
    /// 当设备检测到静止后，速度是否归零。
    /// - 0：不归零（保持上一次速度）
    /// - 255：立即归零
    ///
    /// 其他值表示归零速度阈值。
    pub zero_velocity_mode: u8,

    /// 动态归零速度 (单位 cm/s)
    ///
    /// 当处于运动状态时的归零控制参数。
    /// - 0 表示不归零；
    /// - 非零值可作为触发速度阈值。
    pub dynamic_zero_speed: u8,

    /// 传感器模式控制字节，包含磁场与气压计滤波配置。
    ///
    /// bit 含义如下：
    /// - bit[0]：磁场融合开关（1=启用磁场融合姿态，0=关闭）
    /// - bit[2:1]：气压计滤波等级 (0–3)，数值越大越平稳但实时性越差
    ///
    /// 其他高位暂未使用，应保持为 0。
    pub sensor_mode: SensorMode,

    /// 主动上报帧率 (单位 Hz)
    ///
    /// 有效范围 0–250：
    /// - 0 表示 0.5Hz（2秒一次）
    /// - 1–250 表示对应的上报频率。
    pub report_rate: u8,

    /// 陀螺仪滤波等级 (0–2)
    ///
    /// 0 = 无滤波（高实时性），
    /// 数值越大表示滤波越强，输出更平稳但延迟更高。
    pub gyro_filter: FilterLevel,

    /// 加速度计滤波等级 (0–4)
    ///
    /// 0 = 无滤波，
    /// 数值越大表示数据更平滑但响应更慢。
    pub accel_filter: FilterLevel,

    /// 磁力计滤波等级 (0–9)
    ///
    /// 数值越大滤波更强，适用于磁干扰较大的环境。
    pub mag_filter: FilterLevel,

    /// 数据功能订阅标志位 (`Cmd_ReportTag`)
    ///
    /// 每个 bit 表示是否订阅某类数据。  
    /// 0=不订阅, 1=订阅。
    ///
    /// 默认值为 `0x02E7`，表示：
    /// - ✅ 无重力加速度
    /// - ✅ 含重力加速度
    /// - ✅ 角速度
    /// - ✅ 四元数
    /// - ✅ 欧拉角
    /// - ✅ 三维位置
    /// - ✅ 导航系加速度
    /// - ❌ 磁场
    /// - ❌ 气压、温度、高度
    /// - ❌ 运动检测
    /// - ❌ AD1 / GPIO1
    ///
    /// ** 目前不支持修改默认订阅 **
    subscriptions: SubscriptionFlags,
}

impl Default for IMUConfig {
    fn default() -> Self {
        Self {
            static_acc_threshold: 5,
            zero_velocity_mode: 255,
            dynamic_zero_speed: 0,
            sensor_mode: SensorMode::new(false, 2),
            report_rate: 250,
            gyro_filter: FilterLevel(1),
            accel_filter: FilterLevel(3),
            mag_filter: FilterLevel(5),
            subscriptions: SubscriptionFlags::DEFAULT,
        }
    }
}

impl IMUConfig {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = vec![0u8; 11];
        buf[0] = 0x12;
        buf[1] = self.static_acc_threshold;
        buf[2] = self.zero_velocity_mode;
        buf[3] = self.dynamic_zero_speed;
        buf[4] = self.sensor_mode.byte();
        buf[5] = self.report_rate;
        buf[6] = self.gyro_filter.0;
        buf[7] = self.accel_filter.0;
        buf[8] = self.mag_filter.0;

        let bits = self.subscriptions.bits().to_le_bytes();
        buf[9] = bits[0];
        buf[10] = bits[1];
        buf
    }
}

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct SubscriptionFlags: u16 {
        const ACC_NO_GRAVITY  = 1 << 0;
        const ACC_WITH_GRAVITY = 1 << 1;
        const GYROSCOPE       = 1 << 2;
        const MAGNETOMETER    = 1 << 3;
        const BAROMETER       = 1 << 4;
        const QUATERNION      = 1 << 5;
        const EULER_ANGLES    = 1 << 6;
        const POSITION        = 1 << 7;
        const ACTIVITY        = 1 << 8;
        const NAV_ACC         = 1 << 9;
        const ADC1            = 1 << 10;
        const GPIO1           = 1 << 11;
    }
}

impl SubscriptionFlags {
    /// 默认功能订阅（不包含磁场/气压/高度/运动检测/AD1/GPIO1）
    const DEFAULT: SubscriptionFlags = SubscriptionFlags::from_bits_truncate(0x02E7);
}

#[derive(Debug, Clone, Copy)]
#[allow(unused)]
/// 目前暂不允许修改订阅
enum Subscription {
    AccelerationWithoutGravity,
    AccelerationWithGravity,
    Gyroscope,
    Magnetometer,
    Barometer,
    Quaternion,
    EulerAngles,
    Position,
    Activity,
    NavigationAcceleration,
    ADC1,
    GPIO1,
}

impl Subscription {
    #[allow(unused)]
    fn flag(&self) -> SubscriptionFlags {
        match self {
            Self::AccelerationWithoutGravity => SubscriptionFlags::ACC_NO_GRAVITY,
            Self::AccelerationWithGravity => SubscriptionFlags::ACC_WITH_GRAVITY,
            Self::Gyroscope => SubscriptionFlags::GYROSCOPE,
            Self::Magnetometer => SubscriptionFlags::MAGNETOMETER,
            Self::Barometer => SubscriptionFlags::BAROMETER,
            Self::Quaternion => SubscriptionFlags::QUATERNION,
            Self::EulerAngles => SubscriptionFlags::EULER_ANGLES,
            Self::Position => SubscriptionFlags::POSITION,
            Self::Activity => SubscriptionFlags::ACTIVITY,
            Self::NavigationAcceleration => SubscriptionFlags::NAV_ACC,
            Self::ADC1 => SubscriptionFlags::ADC1,
            Self::GPIO1 => SubscriptionFlags::GPIO1,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FilterLevel(u8);

#[derive(Debug, Clone, Copy)]
pub struct SensorMode {
    pub magnetometer_enabled: bool,
    pub barometer_filter_level: u8, // 0~3
}

impl SensorMode {
    pub fn new(magnetometer_enabled: bool, barometer_filter_level: u8) -> Self {
        Self {
            magnetometer_enabled,
            barometer_filter_level,
        }
    }

    pub fn byte(&self) -> u8 {
        (self.magnetometer_enabled as u8) | ((self.barometer_filter_level & 0x03) << 1)
    }
}
