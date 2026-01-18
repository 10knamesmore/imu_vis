import { invoke, Channel } from "@tauri-apps/api/core";
import { PeripheralInfo, ResponseData, RecordingMeta, RecordingStatus } from "../types";

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
};
