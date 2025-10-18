export interface PeripheralInfo {
    id: string;
    address: string;
    local_name?: string;
    rssi?: number;
}

export interface IpcResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
}
