// 三维向量接口，用于表示加速度、角速度、位置等
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

// 四元数接口，用于表示姿态
export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

// IMU 原始数据结构
export interface IMUData {
  timestamp_ms: number; // 时间戳（毫秒）
  accel_no_g: Vector3;  // 去除重力后的加速度
  accel_with_g: Vector3; // 包含重力的加速度
  gyro: Vector3;        // 角速度
  quat: Quaternion;     // 姿态四元数
  angle: Vector3;       // 欧拉角
  offset: Vector3;      // 传感器偏差
  accel_nav: Vector3;   // 导航坐标系下的加速度
}

// IMU 历史数据，用于图表绘制
// 将每个分量存储为数组以便于 plotting library 使用
export interface ImuDataHistory {
  time: number[];
  accel: { x: number[]; y: number[]; z: number[] };
  accelWithG: { x: number[]; y: number[]; z: number[] };
  gyro: { x: number[]; y: number[]; z: number[] };
  angle: { x: number[]; y: number[]; z: number[] };
  quat: { w: number[]; x: number[]; y: number[]; z: number[] };
  offset: { x: number[]; y: number[]; z: number[] };
  accelNav: { x: number[]; y: number[]; z: number[] };
}

// 计算后的数据（速度、位置等）
export interface CalculatedData {
  attitude: any; // 姿态信息 (可能需要细化类型)
  velocity: any; // 速度
  position: any; // 位置
  timestamp_ms: number;
}

// 后端返回的完整响应数据
export interface ResponseData {
  raw_data: IMUData;          // 原始 IMU 数据
  calculated_data: CalculatedData; // 计算后的数据
}

// 录制状态
export interface RecordingStatus {
  recording: boolean;         // 是否正在录制
  session_id?: number | null; // 当前会话 ID
  db_path?: string | null;    // 数据库路径
  sample_count?: number | null; // 已采样数量
  started_at_ms?: number | null; // 开始时间
  name?: string | null;       // 录制名称
  tags?: string[] | null;     // 标签
}

// 录制元数据
export interface RecordingMeta {
  id: number;
  started_at_ms: number;
  stopped_at_ms?: number | null;
  sample_count: number;
  name?: string | null;
  tags: string[];
}

// 蓝牙外设信息
export interface PeripheralInfo {
  id: string;        // 设备 ID (UUID)
  address: string;   // MAC 地址
  local_name?: string; // 设备名称
  rssi?: number;     // 信号强度
}
