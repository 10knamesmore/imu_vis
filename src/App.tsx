import { Channel, invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import IMUPlot from "./components/DataPlot";

interface PeripheralInfo {
    id: string,
    address: string;
    local_name?: string;
    rssi?: number;
}

interface IpcResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
}


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

export interface IMUData {
    /** 运行时间 (ms) */
    timestamp_ms: number;

    /** 没有 G 的重力加速度 */
    accel_no_g: Vector3 | null;

    /** 有 G 的重力加速度 */
    accel_with_g: Vector3 | null;

    /** 陀螺仪 */
    gyro: Vector3 | null;

    /** 四元数 */
    quat: Quaternion | null;

    /** 欧拉角（角度） */
    angle: Vector3 | null;

    /** 位置偏移 */
    offset: Vector3 | null;

    /** 导航系加速度 */
    accel_nav: Vector3 | null;
}


function App() {
    const [peripherals, setPeripherals] = useState<PeripheralInfo[]>([]);
    const [connected, setConnected] = useState<PeripheralInfo | null>(null);
    const [status, setStatus] = useState<string>("Idle");
    const intervalRef = useRef<number | null>(null); // 保存定时器ID

    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
    const [peripheralsFilter, setPeripheralFilter] = useState<string>("im")

    const [imuData, setImuData] = useState<IMUData | null>(null);

    // 扫描设备
    const startScan = async () => {
        setStatus("Scanning...");
        await invoke("start_scan");

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        intervalRef.current = setInterval(async () => {
            await listPeripherals();
        }, 1000);
    };

    const stopScan = async () => {
        setStatus("Scan stopped");
        await invoke("stop_scan");

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null
        }
    };

    // 获取设备列表
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

    // 连接第一个设备（演示用）
    const connectSelected = async () => {
        if (peripherals.length === 0) return;

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null
        }

        setStatus(`Connecting to ${selectedDeviceId}`)
        const response: IpcResponse<PeripheralInfo> = await invoke("connect_peripheral", { targetUuid: selectedDeviceId });

        console.log(response);


        if (response.success && response.data) {
            setConnected(response.data);
            setStatus(`Connected to ${response.data.local_name ?? response.data.address}`);

            const onEvent = new Channel<IMUData>();
            onEvent.onmessage = (msg) => {
                setImuData(msg)
            }

            await invoke("subscribe_output", { onEvent });
        } else {
            setStatus(`Connect failed: ${response.message ?? "unknown error"}`);
        }
    };

    // 断开
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

    const test = async () => {
        try {
            const msg: IpcResponse<string> = await invoke("test")
            console.log(msg.data)
        } catch (e) {
            console.error(e);

        }
    }

    const changeFilter = (value: string) => {
        setPeripheralFilter(value)
    }


    return (
        <div style={{
            padding: "1rem",
            fontFamily: "Arial, sans-serif",
            backgroundColor: "#f0f2f5",
            minHeight: "100vh",
        }}>
            <h1 style={{
                textAlign: "center",
                color: "#333",
                marginBottom: "1rem",
            }}>IMU BLE Test</h1>

            <p style={{ fontWeight: "bold", color: "#555" }}>Status: {status}</p>

            {/* 按钮组 */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {[
                    { label: "Start Scan", action: startScan },
                    { label: "Stop Scan", action: stopScan },
                    { label: "List Peripherals", action: listPeripherals },
                    { label: "Connect selected", action: connectSelected, disabled: connected !== null },
                    { label: "Disconnect", action: disconnect, disabled: connected === null },
                    { label: "Test", action: test }
                ].map((btn, idx) => (
                    <button
                        key={idx}
                        onClick={btn.action}
                        disabled={btn.disabled}
                        style={{
                            cursor: btn.disabled ? "not-allowed" : "pointer",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            border: "none",
                            backgroundColor: btn.disabled ? "#ccc" : "#4a90e2",
                            color: "#fff",
                            fontWeight: "bold",
                            transition: "background-color 0.2s",
                        }}
                        onMouseOver={(e) => { if (!btn.disabled) (e.currentTarget.style.backgroundColor = "#357ABD") }}
                        onMouseOut={(e) => { if (!btn.disabled) (e.currentTarget.style.backgroundColor = "#4a90e2") }}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* 过滤输入框 */}
            <div style={{ marginBottom: "1rem", color: "#0f0f0f" }}>
                <input
                    type="text"
                    value={peripheralsFilter}
                    onChange={(e) => changeFilter(e.target.value)}
                    placeholder="Filter device name..."
                    style={{
                        padding: "0.5rem",
                        width: "100%",
                        maxWidth: "300px",
                        borderRadius: "6px",
                        border: "1px solid #ccc",
                        outline: "none",
                    }}
                />
            </div>

            {/* 已选设备 */}
            <div style={{ marginBottom: "1rem" }}>
                <h2>Selected Device</h2>
                <ul style={{ padding: 0, listStyle: "none" }}>
                    {peripherals
                        .filter((p) => p.id === selectedDeviceId)
                        .map((p) => (
                            <li
                                key={p.id}
                                onClick={() => setSelectedDeviceId(p.id)}
                                style={{
                                    cursor: "pointer",
                                    padding: "0.5rem",
                                    backgroundColor: "#fff",
                                    borderRadius: "6px",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                {p.local_name ?? "Unknown"} ({p.address}), RSSI: {p.rssi ?? "N/A"}, Uuid:{p.id}
                            </li>
                        ))}
                </ul>
            </div>

            {/* 发现设备列表 */}
            <div style={{ marginBottom: "1rem" }}>
                <h2>Discovered Peripherals</h2>
                <ul style={{ padding: 0, listStyle: "none" }}>
                    {peripherals
                        .filter((p) => p.local_name?.includes(peripheralsFilter))
                        .map((p) => (
                            <li
                                key={p.id}
                                onClick={() => setSelectedDeviceId(p.id)}
                                style={{
                                    cursor: "pointer",
                                    padding: "0.5rem",
                                    backgroundColor: selectedDeviceId === p.id ? "#4a90e2" : "#fff",
                                    borderRadius: "6px",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                {p.local_name ?? "Unknown"} ({p.address}), RSSI: {p.rssi ?? "N/A"}, Uuid:{p.id}
                            </li>
                        ))}
                </ul>
            </div>

            {/* 连接信息 */}
            {connected && (
                <div style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#dff0d8",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}>
                    <h2>Connected Device</h2>
                    <p>{connected.local_name ?? "Unknown"} ({connected.address})</p>
                </div>
            )}

            {/* IMU Plot */}
            {imuData && (
                <div style={{ marginTop: "1rem" }}>
                    <IMUPlot imuData={imuData} />
                </div>
            )}
        </div>
    );
}

export default App;
