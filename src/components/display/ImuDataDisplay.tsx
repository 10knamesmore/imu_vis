import Plot from "react-plotly.js";
import { IMUDataFrame, Vector3 } from "../../types/imu";
import { useEffect, useRef, useState } from "react";

interface AxisesData {
    x: number[]
    y: number[]
    z: number[]
}

/**
 * 折线图组件
 */
interface LiveLineChartProps {
    timestamps: number[];
    data: AxisesData;
    title: string;
    yTitle: string;
}

function LiveLineChart({ timestamps, data, title, yTitle }: LiveLineChartProps) {
    const defaultLayout = {
        autosize: true,
        height: 300,
        title: { text: title },
        xaxis: { title: { text: "时间 (s)" } },
        yaxis: { title: { text: yTitle } },
        margin: { l: 50, r: 20, t: 40, b: 40 },
    }
    // const [layout, setLayout] = useState<Partial<Plotly.Layout>>(defaultLayout);
    const [frames, setFrames] = useState<Plotly.Frame[]>([])


    return (
        <div style={{
            padding: "1rem",
            borderRadius: "8px",
            backgroundColor: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        }}>
            <Plot
                data={
                    [
                        { x: timestamps, y: data.x, type: "scatter", mode: "lines", name: "X" },
                        { x: timestamps, y: data.y, type: "scatter", mode: "lines", name: "Y" },
                        { x: timestamps, y: data.z, type: "scatter", mode: "lines", name: "Z" }
                    ]
                }
                layout={defaultLayout}
                config={{ displayModeBar: false, scrollZoom: false }}
                style={{ width: "100%" }}
                frames={frames}
                onUpdate={(figure) => setFrames(figure.frames ? figure.frames : [])}
            />
        </div>
    );
}

interface ThreeDementionChartProps {
    timestamps: number[];
    data: AxisesData;
    title: string,
}

function ThreeDementionChart({ timestamps, data, title }: ThreeDementionChartProps) {
    return (
        <div style={{
            padding: "1rem",
            borderRadius: "8px",
            backgroundColor: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        }}>
            <Plot
                data={
                    [
                        { x: data.x, y: data.y, z: data.z, mode: "lines", type: "scatter3d" }
                    ]
                }
                layout={{
                    autosize: false,
                    title: { text: title },
                    xaxis: { title: { text: "时间 (s)" }, range: [-100, 100] },
                    // yaxis: { title: { text: title } },
                    margin: { l: 50, r: 20, t: 40, b: 40 },
                    scene: {
                        aspectmode: 'data'
                    },
                    hovermode: "closest"
                }}
                config={{ responsive: true }} />
        </div>
    )
}

interface ImuDataDisplayProps {
    ImuDataFrame: IMUDataFrame
}

type AxisesDataMap = {
    [key in keyof Omit<IMUDataFrame, "timestamp_ms">]?: AxisesData
}

export function ImuDataDisplay({ ImuDataFrame }: ImuDataDisplayProps) {
    const [accelWithGData, setAccelWithGData] = useState<AxisesData>({ x: [], y: [], z: [] })

    const [timestamps, setTimestamps] = useState<number[]>([])
    const [imuDataMap, setImuDataMap] = useState<AxisesDataMap>({})

    const [traData, setTraData] = useState<AxisesData>({ x: [], y: [], z: [] })

    const initialTimestamp = useRef<number | null>(null)

    function concatAxisesData(oldData: AxisesData, newFrame: Vector3): AxisesData {
        return {
            x: [...oldData.x, newFrame.x].slice(-500),
            y: [...oldData.y, newFrame.y].slice(-500),
            z: [...oldData.z, newFrame.z].slice(-500)
        }
    }

    useEffect(() => {
        if (initialTimestamp.current === null) {
            initialTimestamp.current = ImuDataFrame.timestamp_ms
            setTimestamps([0])
        } else {
            setTimestamps([...timestamps, (ImuDataFrame.timestamp_ms - initialTimestamp.current) / 1000].slice(-1000))
        }
        // 遍历 IMU 数据字段
        const newMap: AxisesDataMap = {};
        (["accel_with_g", "accel_no_g", "gyro", "angle", "accel_nav"] as const).forEach((key) => {
            const frame = ImuDataFrame[key]
            if (frame) {
                newMap[key] = imuDataMap[key]
                    ? concatAxisesData(imuDataMap[key]!, frame)
                    : concatAxisesData({ x: [], y: [], z: [] }, frame)
            }
        })
        setImuDataMap(prev => ({ ...prev, ...newMap }))

        let frame = ImuDataFrame.offset
        if (frame) {
            frame.x = frame.x * 10
            frame.y = frame.y * 10
            frame.z = frame.z * 10

            if (frame.x === 0 && frame.y === 0 && frame.z == 0) {
                setTraData({
                    x: [], y: [], z: []
                })
            } else {
                setTraData(concatAxisesData(traData, frame))
            }
        }

        if (ImuDataFrame.accel_with_g) {
            setAccelWithGData(concatAxisesData(accelWithGData, ImuDataFrame.accel_with_g))
        }
    }, [ImuDataFrame])


    return (
        <div style={{ marginTop: "1rem" }}>
            {/* <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}> */}
            {/* <div style={{ display: "flex", gap: "1rem" }}> */}
            {/* <LiveLineChart timestamps={timestamps} data={accelWithGData} title="有G的加速度" yTitle="m/s^2"></LiveLineChart> */}
            {/* </div> */}
            {/* </div> */}
            {Object.entries(imuDataMap).map(([key, data]) => (
                <LiveLineChart
                    key={key}
                    timestamps={timestamps}
                    data={data!}
                    title={key}
                    yTitle="value"
                />
            ))}
            <ThreeDementionChart timestamps={timestamps} data={traData} title="轨迹" />
        </div>
    );
}
