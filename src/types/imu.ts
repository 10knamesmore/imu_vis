export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface Quaternion {
    w: number;
    x: number;
    y: number;
    z: number;
}

export interface IMUDataFrame {
    /** 运行时间 (ms) */
    timestamp_ms: number;

    /** 没有 G 的重力加速度 */
    accel_no_g: Vector3;

    /** 有 G 的重力加速度 */
    accel_with_g: Vector3;

    /** 陀螺仪 */
    gyro: Vector3;

    /** 四元数 */
    quat: Quaternion;

    /** 欧拉角（角度） */
    angle: Vector3;

    /** 位置偏移 */
    offset: Vector3;

    /** 导航系加速度 */
    accel_nav: Vector3;
}
