import { invoke, Channel } from "@tauri-apps/api/core";
import { PeripheralInfo, ResponseData, RecordingMeta, RecordingStatus } from "../types";

export interface imuApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export const imuApi = {
  startScan: () => invoke<void>("start_scan"),
  stopScan: () => invoke<void>("stop_scan"),
  listPeripherals: () => invoke<imuApiResponse<PeripheralInfo[]>>("list_peripherals"),
  connect: (targetUuid: string) => invoke<imuApiResponse<PeripheralInfo>>("connect_peripheral", { targetUuid }),
  disconnect: () => invoke<imuApiResponse<PeripheralInfo>>("disconnect_peripheral"),

  // Subscriptions
  subscribeOutput: (onEvent: Channel<ResponseData>) =>
    invoke("subscribe_output", { onEvent }),

  startRecording: (options?: { name?: string; tags?: string[] }) =>
    invoke<imuApiResponse<RecordingStatus>>("start_recording", { options }),
  stopRecording: () => invoke<imuApiResponse<RecordingStatus>>("stop_recording"),
  listRecordings: () => invoke<imuApiResponse<RecordingMeta[]>>("list_recordings"),
  updateRecordingMeta: (sessionId: number, name?: string, tags?: string[]) =>
    invoke<imuApiResponse<RecordingMeta>>("update_recording_meta", { sessionId, name, tags }),
  getRecordingSamples: (sessionId: number) =>
    invoke<imuApiResponse<ResponseData[]>>("get_recording_samples", { sessionId }),
};
