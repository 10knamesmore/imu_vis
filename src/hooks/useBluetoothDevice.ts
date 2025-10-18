import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { IpcResponse, PeripheralInfo } from "../types/bluetooth";

/**
 * 蓝牙设备 Hook 返回值接口
 */
export interface BluetoothDeviceHook {
    /**
     * 当前扫描到的蓝牙设备列表
     * - 每秒更新一次（如果扫描正在进行）
     * - 数组元素为 PeripheralInfo 对象
     */
    peripherals: PeripheralInfo[];

    /**
     * 当前已连接的蓝牙设备信息
     * - null 表示未连接
     * - 连接成功后保存设备信息，便于显示或操作
     */
    connected: PeripheralInfo | null;

    /**
     * 当前蓝牙状态文本
     * - 用于 UI 提示用户当前操作状态
     * - 示例值："Idle", "Scanning...", "Found 3 devices", "Connected to XXX"
     */
    status: string;

    /**
     * 用户当前选中的设备 ID
     * - 用于 connectDevice 函数连接设备
     */
    selectedDeviceId: string | null;

    /**
     * 开始扫描附近蓝牙设备
     * - 调用后会向后端发送 start_scan 请求
     * - 设置状态为 "Scanning..."
     * - 启动每秒更新 peripherals 的定时器
     */
    startScan: () => Promise<void>;

    /**
     * 停止扫描附近蓝牙设备
     * - 调用后会向后端发送 stop_scan 请求
     * - 清除扫描定时器
     * - 状态设置为 "Scan stopped"
     */
    stopScan: () => Promise<void>;

    /**
     * 手动列举当前可用蓝牙设备
     * - 调用后向后端发送 list_peripherals 请求
     * - 更新 peripherals 状态数组
     * - 更新 status 文本显示扫描结果或错误
     */
    listPeripherals: () => Promise<void>;

    /**
     * 连接到选中的蓝牙设备
     * - 依赖 selectedDeviceId
     * - 调用后会停止扫描定时器，避免重复操作
     * - 向后端发送 connect_peripheral 请求
     * - 成功后更新 connected 状态，并更新 status
     * - 失败时更新 status 显示错误信息
     */
    connectDevice: () => Promise<void>;

    /**
     * 断开当前已连接的蓝牙设备
     * - 如果没有设备连接，则直接返回
     * - 向后端发送 disconnect_peripheral 请求
     * - 成功后将 connected 状态置为 null
     * - 更新 status 文本提示断开结果
     */
    disconnect: () => Promise<void>;

    /**
     * 设置选中的设备 ID
     * - 用于在 UI 里选择某个设备进行连接
     * @param deviceId 设备的唯一 ID（UUID）
     */
    setSelectedDeviceId: (deviceId: string) => void;
}

/**
 * @returns 蓝牙设备与连接相关状态
 */
export function useBluetoothDevice(): BluetoothDeviceHook {
    const [peripherals, setPeripherals] = useState<PeripheralInfo[]>([]);
    const [connected, setConnected] = useState<PeripheralInfo | null>(null);
    const [status, setStatus] = useState<string>("Idle");
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    const intervalRef = useRef<number | null>(null);

    const startScan = async () => {
        setStatus("Scanning...");
        await invoke("start_scan");

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        // 每秒列举一次 
        intervalRef.current = setInterval(async () => {
            await listPeripherals();
        }, 1000);
    };

    const stopScan = async () => {
        setStatus("Scan stopped");
        await invoke("stop_scan");

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    const listPeripherals = async () => {
        setStatus("Fetching peripherals...");
        const response: IpcResponse<PeripheralInfo[]> = await invoke("list_peripherals");
        if (response.success && response.data) {
            setPeripherals(response.data);
            setStatus(`Found ${response.data.length} devices`);
        } else {
            setPeripherals([]);
            setStatus(`No devices found: ${response.message ?? "unknown error"}`);
        }
    };

    const connectDevice = async () => {
        if (!selectedDeviceId) return;

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        setStatus(`Connecting to ${selectedDeviceId}`);
        const response: IpcResponse<PeripheralInfo> = await invoke("connect_peripheral", {
            targetUuid: selectedDeviceId,
        });

        if (response.success && response.data) {
            setConnected(response.data);
            setStatus(`Connected to ${response.data.local_name ?? response.data.address}`);
        } else {
            setStatus(`Connect failed: ${response.message ?? "unknown error"}`);
        }
    };

    const disconnect = async () => {
        if (!connected) return;
        const response: IpcResponse<PeripheralInfo> = await invoke("disconnect_peripheral");
        if (response.success && response.data) {
            setStatus(`Disconnected from ${response.data.local_name ?? response.data.address}`);
        } else {
            setStatus(`Disconnect failed: ${response.message ?? "unknown error"}`);
        }
        setConnected(null);
    };

    // 清理定时器
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        peripherals,
        connected,
        status,
        selectedDeviceId,
        startScan,
        stopScan,
        listPeripherals,
        connectDevice,
        disconnect,
        setSelectedDeviceId,
    };
}
