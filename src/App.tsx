import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { BluetoothControls } from "./components/bluetooth/BluetoothControls";
import { DeviceFilter } from "./components/bluetooth/DeviceFilter";
import { DeviceList } from "./components/bluetooth/DeviceList";
import { Card } from "./components/common/Card";
import { ImuDataDisplay } from "./components/display/ImuDataDisplay";
import { useBluetoothDevice } from "./hooks/useBluetoothDevice";
import { useImuData } from "./hooks/useImuData";
import { useMockData } from "./hooks/useMockData";


function App() {
    const {
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
    } = useBluetoothDevice();

    const { imuDataFrame } = useImuData();
    // const { mockImuDataFrame, setIsMocking } = useMockData();
    const [peripheralsFilter, setPeripheralFilter] = useState<string>("im");

    // const test = async () => {
    //     try {
    //         await invoke("mock_imu_data");
    //     } catch (e) {
    //         console.error(e);
    //     }
    // };

    const test = async () => {
        // setIsMocking(true)
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

            <p style={{ fontWeight: "bold", color: "#555" }}>状态: {status}</p>

            <BluetoothControls
                onStartScan={startScan}
                onStopScan={stopScan}
                onListPeripherals={listPeripherals}
                onConnect={connectDevice}
                onDisconnect={disconnect}
                onTest={test}
                isConnected={!!connected}
            />

            <DeviceFilter
                value={peripheralsFilter}
                onChange={setPeripheralFilter}
            />

            {selectedDeviceId && (
                <Card title="已选设备">
                    <ul style={{ padding: 0, listStyle: "none" }}>
                        {peripherals
                            .filter((p) => p.id === selectedDeviceId)
                            .map((p) => (
                                <li
                                    key={p.id}
                                    style={{
                                        padding: "0.5rem",
                                        backgroundColor: "#fff",
                                        borderRadius: "6px",
                                        marginBottom: "0.5rem",
                                    }}
                                >
                                    {p.local_name ?? "Unknown"} ({p.address}), RSSI: {p.rssi ?? "N/A"}, Uuid:{p.id}
                                </li>
                            ))}
                    </ul>
                </Card>
            )}

            <DeviceList
                devices={peripherals}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                filter={peripheralsFilter}
            />

            {connected && (
                <Card>
                    <h2>已连接设备</h2>
                    <p>{connected.local_name ?? "Unknown"} ({connected.address})</p>
                </Card>
            )}

            {imuDataFrame && <ImuDataDisplay ImuDataFrame={imuDataFrame} />}
            {/* {mockImuDataFrame && <ImuDataDisplay ImuDataFrame={mockImuDataFrame} />} */}
        </div>
    );
}

export default App;
