import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { IMUDataFrame } from "../types/imu";

/**
 * @returns 通道实时接收的Imu数据帧
 */
export function useImuData() {
    const [imuDataFrame, setImuDataFrame] = useState<IMUDataFrame | null>(null);
    const channelRef = useRef<Channel<IMUDataFrame> | null>(null);

    const subscribeToImuData = async () => {
        const channel = new Channel<IMUDataFrame>();
        channel.onmessage = (msg) => {
            setImuDataFrame(msg);
        };
        await invoke("subscribe_output", { onEvent: channel });
        channelRef.current = channel;
    };

    useEffect(() => {
        subscribeToImuData();
        return () => {
            if (channelRef.current) {
                // 清理订阅
                channelRef.current.onmessage = () => { };
            }
        };
    }, []);

    return { imuDataFrame };
}
