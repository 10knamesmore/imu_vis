interface DeviceFilterProps {
    value: string;
    onChange: (value: string) => void;
}

export function DeviceFilter({ value, onChange }: DeviceFilterProps) {
    return (
        <div style={{ marginBottom: "1rem", color: "#0f0f0f" }}>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="搜索设备名称..."
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
    );
}