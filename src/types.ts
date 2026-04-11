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

// 后端返回的响应数据（扁平化结构）
export interface ResponseData {
  timestamp_ms: number;    // 时间戳（毫秒）
  accel: Vector3;          // 去重力加速度（m/s²）
  accel_with_g: Vector3;   // 含重力加速度（m/s²，用于标定）
  gyro: Vector3;           // 角速度（°/s，用于陀螺零偏标定）
  attitude: Quaternion;    // 姿态四元数（计算值）
  velocity: Vector3;       // 速度（m/s，计算值）
  position: Vector3;       // 位置（m，计算值）
  accel_saturated: boolean; // 加速度计是否触发饱和（IM948 ±16g 量程硬截断）
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
    integrator: 'legacy_euler' | 'trapezoid' | 'rk4';
    dt_min_ms: number;
    dt_max_ms: number;
  };
  zupt: {
    passby: boolean;
    impl_type: 'legacy_hard_lock' | 'smooth_hysteresis';
    gyro_thresh: number;
    accel_thresh: number;
    gyro_enter_thresh: number;
    accel_enter_thresh: number;
    gyro_exit_thresh: number;
    accel_exit_thresh: number;
    enter_frames: number;
    exit_frames: number;
    vel_decay_tau_ms: number;
    pos_lock_tau_ms: number;
    vel_zero_eps: number;
    backward_correction: boolean;
  };
  navigator_impl: 'legacy' | 'eskf';
  eskf: {
    gyro_noise: number;
    accel_noise: number;
    pos_noise: number;
    gyro_bias_walk: number;
    accel_bias_walk: number;
    zupt_velocity_noise: number;
    init_sigma_attitude: number;
    init_sigma_velocity: number;
    init_sigma_position: number;
    init_sigma_gyro_bias: number;
    init_sigma_accel_bias: number;
  };
}

// 设备标定数据
export interface DeviceCalibrationData {
  device_id: string;
  /** 加速度计偏置 [b_x, b_y, b_z]（m/s²） */
  accel_bias: [number, number, number];
  /** 加速度计比例因子 [s_x, s_y, s_z] */
  accel_scale: [number, number, number];
  /** 陀螺仪零偏 [b_x, b_y, b_z]（rad/s） */
  gyro_bias: [number, number, number];
  /** 标定质量误差（max |‖a_cal‖ - g|）*/
  quality_error: number;
  /** 标定时间戳（ms）*/
  created_at_ms: number;
}

// 管线诊断数据（后端 PipelineDiagnostics 对应）
export interface PipelineDiagnostics {
  timestamp_ms: number;
  // 标定阶段
  cal_accel_bias: Vector3;
  cal_gyro_bias: Vector3;
  cal_accel_pre: Vector3;
  cal_accel_post: Vector3;
  cal_gyro_pre: Vector3;
  cal_gyro_post: Vector3;
  // 滤波阶段
  filt_accel_pre: Vector3;
  filt_accel_post: Vector3;
  filt_gyro_pre: Vector3;
  filt_gyro_post: Vector3;
  // ZUPT 阶段
  zupt_is_static: boolean;
  zupt_gyro_norm: number;
  zupt_accel_norm: number;
  zupt_enter_count: number;
  zupt_exit_count: number;
  // 导航阶段
  nav_dt: number;
  nav_linear_accel: Vector3;
  // 饱和检测：本帧加速度计是否触发饱和（IM948 ±16g）
  accel_saturated: boolean;
  // ESKF 专属
  eskf_cov_diag: number[] | null;
  eskf_bias_gyro: Vector3 | null;
  eskf_bias_accel: Vector3 | null;
  eskf_innovation: Vector3 | null;
  // 后向修正
  backward_triggered: boolean;
  backward_correction_mag: number;
  // 性能指标
  perf_process_us: number;
  perf_upstream_queue_len: number;
  perf_downstream_queue_len: number;
  perf_record_queue_len: number;
  perf_ble_interval_ms: number;
}
