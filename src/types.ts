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

// 计算后的数据（速度、位置等）
export interface CalculatedData {
  attitude: Quaternion; // 姿态四元数
  velocity: Vector3; // 速度
  position: Vector3; // 位置
  timestamp_ms: number;
}

// IMU 历史数据缓冲（内置数据 + 计算数据）
export interface ImuHistorySnapshot {
  time: number[];
  builtin: {
    accel: { x: number[]; y: number[]; z: number[] };
    accelWithG: { x: number[]; y: number[]; z: number[] };
    gyro: { x: number[]; y: number[]; z: number[] };
    angle: { x: number[]; y: number[]; z: number[] };
    quat: { w: number[]; x: number[]; y: number[]; z: number[] };
    offset: { x: number[]; y: number[]; z: number[] };
    accelNav: { x: number[]; y: number[]; z: number[] };
  };
  calculated: {
    angle: { x: number[]; y: number[]; z: number[] };
    attitude: { w: number[]; x: number[]; y: number[]; z: number[] };
    velocity: { x: number[]; y: number[]; z: number[] };
    position: { x: number[]; y: number[]; z: number[] };
  };
  deltaAngle: { x: number[]; y: number[]; z: number[] };
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

// Pipeline 配置类型
export interface ProcessorPipelineConfig {
  global: {
    gravity: number;
  };
  calibration: {
    passby: boolean;
    accel_bias: Vector3;
    gyro_bias: Vector3;
    accel_matrix: number[][];
    gyro_matrix: number[][];
  };
  filter: {
    passby: boolean;
    alpha: number;
  };
  trajectory: {
    passby: boolean;
  };
  zupt: {
    passby: boolean;
    gyro_thresh: number;
    accel_thresh: number;
  };
}

// Debug 实时流中的 stage 快照
export interface DebugStageSnapshot {
  name: string;
  input: unknown;
  output: unknown;
  duration_us?: number | null;
}

// Debug 实时流帧
export interface DebugRealtimeFrame {
  seq: number;
  device_timestamp_ms: number;
  host_timestamp_ms: number;
  stages: DebugStageSnapshot[];
  output: ResponseData;
  ext?: unknown;
}

// Debug 监控流中的队列深度
export interface QueueDepth {
  upstream: number;
  downstream: number;
  record: number;
}

// Debug 监控流帧（1s）
export interface DebugMonitorTick {
  ts_ms: number;
  input_hz: number;
  pipeline_hz: number;
  output_hz: number;
  frontend_rx_hz: number;
  queue_depth: QueueDepth;
  queue_peak: QueueDepth;
  ext?: unknown;
}
