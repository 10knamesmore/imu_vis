import { Button } from "../common/Button";

interface BluetoothControlsProps {
    onStartScan: () => void;
    onStopScan: () => void;
    onListPeripherals: () => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onTest: () => void;
    isConnected: boolean;
}

export function BluetoothControls({
    onStartScan,
    onStopScan,
    onListPeripherals,
    onConnect,
    onDisconnect,
    onTest,
    isConnected
}: BluetoothControlsProps) {
    const controls = [
        { label: "开始扫描", action: onStartScan, disabled: false },
        { label: "停止扫描", action: onStopScan, disabled: false },
        { label: "列出设备", action: onListPeripherals, disabled: false },
        { label: "连接设备", action: onConnect, disabled: isConnected },
        { label: "断开连接", action: onDisconnect, disabled: !isConnected },
        { label: "测试", action: onTest, disabled: false }
    ];

    return (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem", border: 5 }}>
            {controls.map((control, index) => (
                <Button
                    key={index}
                    label={control.label}
                    onClick={control.action}
                    disabled={control.disabled}
                />
            ))}
        </div>
    );
}
