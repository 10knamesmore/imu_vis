import { useEffect, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { IMUData } from "../App";

interface PlotProps {
    imuData: IMUData | null;
}


/**
 * Plot 组件：实时显示 IMU 所有主要数据
 */
function IMUPlot({ imuData }: PlotProps) {
    const [timestamps, setTimestamps] = useState<number[]>([]);

    const [accelNoG, setAccelNoG] = useState<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
    const [accelWithG, setAccelWithG] = useState<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
    const [gyro, setGyro] = useState<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
    const [angle, setAngle] = useState<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });

    const startTimeRef = useRef<number | null>(null);

    // 每次接收新的 imuData 时更新数据
    useEffect(() => {
        if (!imuData) return;
        if (startTimeRef.current === null) startTimeRef.current = imuData.timestamp_ms;

        const t = imuData.timestamp_ms - startTimeRef.current;

        setTimestamps((prev) => [...prev.slice(-500), t]);

        if (imuData.accel_no_g) {
            const { x, y, z } = imuData.accel_no_g;
            setAccelNoG((prev) => ({
                x: [...prev.x.slice(-500), x],
                y: [...prev.y.slice(-500), y],
                z: [...prev.z.slice(-500), z],
            }));
        }

        if (imuData.accel_with_g) {
            const { x, y, z } = imuData.accel_with_g;
            setAccelWithG((prev) => ({
                x: [...prev.x.slice(-500), x],
                y: [...prev.y.slice(-500), y],
                z: [...prev.z.slice(-500), z],
            }));
        }

        if (imuData.gyro) {
            const { x, y, z } = imuData.gyro;
            setGyro((prev) => ({
                x: [...prev.x.slice(-500), x],
                y: [...prev.y.slice(-500), y],
                z: [...prev.z.slice(-500), z],
            }));
        }

        if (imuData.angle) {
            const { x, y, z } = imuData.angle;
            setAngle((prev) => ({
                x: [...prev.x.slice(-500), x],
                y: [...prev.y.slice(-500), y],
                z: [...prev.z.slice(-500), z],
            }));
        }
    }, [imuData]);

    // 通用子图渲染函数
    const renderPlot = (title: string, dataGroup: { x: number[]; y: number[]; z: number[] }, yTitle: string) => (
        <div style={{
            padding: "1rem",
            borderRadius: "8px",
            backgroundColor: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        }}>
            <Plot
                data={[
                    { x: timestamps, y: dataGroup.x, type: "scatter", mode: "lines", name: "X" },
                    { x: timestamps, y: dataGroup.y, type: "scatter", mode: "lines", name: "Y" },
                    { x: timestamps, y: dataGroup.z, type: "scatter", mode: "lines", name: "Z" },
                ]}
                layout={{
                    autosize: true,
                    height: 300,
                    title: { text: title },
                    xaxis: { title: { text: "时间 (ms)" } },
                    yaxis: { title: { text: yTitle } },
                    margin: { l: 50, r: 20, t: 40, b: 40 },
                }}
                config={{ displayModeBar: false, scrollZoom: true }}
                style={{ width: "100%" }}
            />
        </div>
    );


    return (
        <div style={{
            padding: "1rem",
            fontFamily: "Arial, sans-serif",
            backgroundColor: "#dddddd",
            minHeight: "100vh",
            borderRadius: "8px"
        }}>
            <h2 style={{
                marginBottom: "1rem",
                color: "#333",
                fontSize: "1.5rem",
            }}>IMU 实时数据</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {renderPlot("加速度（不含重力 accel_no_g）", accelNoG, "加速度 (m/s²)")}
                {renderPlot("加速度（含重力 accel_with_g）", accelWithG, "加速度 (m/s²)")}
                {renderPlot("陀螺仪角速度 gyro", gyro, "角速度 (°/s)")}
                {renderPlot("欧拉角 angle", angle, "角度 (°)")}
            </div>
        </div>
    );
};

export default IMUPlot
