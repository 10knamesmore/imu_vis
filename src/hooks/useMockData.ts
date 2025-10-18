import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { IMUDataFrame } from "../types/imu";

/**
 * @returns 通道实时接收的Imu数据帧
 */
export function useMockData() {
    const [mockImuDataFrame, setMockImuDataFrame] = useState<IMUDataFrame | null>(null);
    const [isMocking, setIsMocking] = useState(false);
    const channelRef = useRef<Channel<IMUDataFrame> | null>(null);


    const subscribeToMockImuData = async () => {
        const channel = new Channel<IMUDataFrame>();
        channel.onmessage = (msg) => {
            setMockImuDataFrame(msg);
            console.log(msg)
        };
        await invoke("mock_imu_data", { onEvent: channel });
        channelRef.current = channel;
    };

    useEffect(() => {
        if (isMocking) {
            subscribeToMockImuData();
        }
        return () => {
            if (channelRef.current) {
                // 清理订阅
                channelRef.current.onmessage = () => { };
            }
        };
    }, [isMocking]);

    return { mockImuDataFrame, setIsMocking };
}
