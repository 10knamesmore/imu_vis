import { invoke, Channel } from "@tauri-apps/api/core";
import { PeripheralInfo, IMUData, ResponseData } from "../types";

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
};
