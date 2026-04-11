import { invoke, Channel } from "@tauri-apps/api/core";
import {
  PeripheralInfo,
  ProcessorPipelineConfig,
  ResponseData,
  RecordingMeta,
  RecordingStatus,
  DeviceCalibrationData,
} from "../types";

// 通用 API 响应接口
export interface imuApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// IMU 服务 API，封装了与 Tauri 后端的通信
export const imuApi = {
  // 启动蓝牙扫描
  startScan: () => invoke<void>("start_scan"),
  // 停止蓝牙扫描
  stopScan: () => invoke<void>("stop_scan"),
  // 获取扫描到的外设列表
  listPeripherals: () => invoke<imuApiResponse<PeripheralInfo[]>>("list_peripherals"),
  // 连接指定外设
  connect: (targetUuid: string) => invoke<imuApiResponse<PeripheralInfo>>("connect_peripheral", { targetUuid }),
  // 断开当前连接
  disconnect: () => invoke<imuApiResponse<PeripheralInfo>>("disconnect_peripheral"),
  // 设置姿态矫正值（按当前姿态作为零位，由后端读取最新姿态）
  setAxisCalibration: () => invoke<imuApiResponse<void>>("set_axis_calibration"),
  // 设置位置（手动校正）
  setPosition: (x: number, y: number, z: number) =>
    invoke<imuApiResponse<void>>("set_position", { x, y, z }),
  // 获取当前 pipeline 配置
  getPipelineConfig: () =>
    invoke<imuApiResponse<ProcessorPipelineConfig>>("get_pipeline_config"),
  // 更新 pipeline 配置（实时生效）
  updatePipelineConfig: (config: ProcessorPipelineConfig) =>
    invoke<imuApiResponse<void>>("update_pipeline_config", { config }),
  // 将当前生效 pipeline 配置写入 processor.toml
  savePipelineConfig: () =>
    invoke<imuApiResponse<void>>("save_pipeline_config"),

  // 订阅数据输出
  // onEvent: Tauri Channel，用于接收实时数据流
  subscribeOutput: (onEvent: Channel<ResponseData>) =>
    invoke("subscribe_output", { onEvent }),

  // 开始录制数据
  startRecording: (options?: { name?: string; tags?: string[] }) =>
    invoke<imuApiResponse<RecordingStatus>>("start_recording", { options }),
  // 停止录制
  stopRecording: () => invoke<imuApiResponse<RecordingStatus>>("stop_recording"),
  // 获取录制列表
  listRecordings: () => invoke<imuApiResponse<RecordingMeta[]>>("list_recordings"),
  // 更新录制元数据（名称、标签）
  updateRecordingMeta: (sessionId: number, name?: string, tags?: string[]) =>
    invoke<imuApiResponse<RecordingMeta>>("update_recording_meta", { sessionId, name, tags }),
  // 获取指定录制的样本数据
  getRecordingSamples: (sessionId: number) =>
    invoke<imuApiResponse<ResponseData[]>>("get_recording_samples", { sessionId }),

  // 保存设备标定结果到 SQLite
  saveDeviceCalibration: (
    deviceId: string,
    accelBias: [number, number, number],
    accelScale: [number, number, number],
    gyroBias: [number, number, number],
    qualityError: number,
  ) =>
    invoke<imuApiResponse<void>>("save_device_calibration", {
      deviceId,
      accelBias,
      accelScale,
      gyroBias,
      qualityError,
    }),

  // 查询设备历史标定数据
  getDeviceCalibration: (deviceId: string) =>
    invoke<imuApiResponse<DeviceCalibrationData | null>>("get_device_calibration", { deviceId }),

  // 将指定会话导出为 CSV，返回导出文件的绝对路径
  exportSessionCsv: (sessionId: number) =>
    invoke<imuApiResponse<string>>("export_session_csv", { sessionId }),

  // 删除指定录制会话及其所有样本数据
  deleteRecording: (sessionId: number) =>
    invoke<imuApiResponse<void>>("delete_recording", { sessionId }),

  // 读取已连接设备的电量（0–100）
  getBatteryLevel: () =>
    invoke<imuApiResponse<number>>("get_battery_level"),
};
