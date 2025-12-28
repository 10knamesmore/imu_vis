import { useImuStream } from "../hooks/useWebSocket";

/**
 * Component: Real-time IMU data display
 */
export function ImuDataDisplay() {
  if (!connected) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h3>⏳ 正在连接...</h3>
      </div>
    );
  }

  if (!frame) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h3>⏳ 等待数据...</h3>
      </div>
    );
  }

  const formatVec3 = (vec: [number, number, number]) => {
    return vec.map((v) => v.toFixed(3)).join(", ");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace", background: "#1a1a1a", borderRadius: "8px" }}>
      <div style={{ marginBottom: "16px", fontSize: "18px", color: "#4CAF50" }}>
        📊 IMU 数据流 ({fps} FPS)
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <DataRow label="Accelerometer (m/s²)" value={formatVec3(frame.accel)} color="#64B5F6" />
        <DataRow label="Gyroscope (rad/s)" value={formatVec3(frame.gyro)} color="#FFB74D" />
        <DataRow label="Magnetometer (μT)" value={formatVec3(frame.mag)} color="#E57373" />
        <DataRow label="message" value={frame.message ?? "N/A"} color="#BA68C8" />
        <DataRow
          label="Timestamp (μs)"
          value={frame.timestamp_us.toLocaleString()}
          color="#81C784"
        />
      </div>
    </div>
  );
}

interface DataRowProps {
  label: string;
  value: string;
  color: string;
}

function DataRow({ label, value, color }: DataRowProps) {
  return (
    <div style={{ padding: "8px", background: "#2a2a2a", borderRadius: "4px" }}>
      <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", color, fontWeight: "bold" }}>
        {value}
      </div>
    </div>
  );
}
