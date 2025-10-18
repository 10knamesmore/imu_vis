import { PeripheralInfo } from "../../types/bluetooth";
import { Card } from "../common/Card";

interface DeviceListProps {
    devices: PeripheralInfo[];

    selectedDeviceId: string | null;

    onSelectDevice: (deviceId: string) => void;

    filter?: string;
}

export function DeviceList({ devices, selectedDeviceId, onSelectDevice, filter = "" }: DeviceListProps) {
    const filteredDevices = devices.filter((p) => p.local_name?.includes(filter));

    return (
        <Card title="已发现设备">
            <ul style={{ padding: 0, listStyle: "none" }}>
                {filteredDevices.map((p) => (
                    <li
                        key={p.id}
                        onClick={() => onSelectDevice(p.id)}
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
        </Card>
    );
}
