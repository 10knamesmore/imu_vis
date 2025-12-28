import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

interface HeartbeatFrame {
  message: string;
  timestamp: number;
  device_connected: boolean;
  service_uptime_sec: number;
  imu_subscribers: number;
}

/**
 * React Hook: 订阅心跳数据流
 * 
 * @returns 当前心跳帧和连接状态
 * 
 * @example
 * const { heartbeat, connected } = useHeartbeat();
 * console.log(`Uptime: ${heartbeat?.service_uptime_sec}s`);
 */
export function useHeartbeat() {
  const [heartbeat, setHeartbeat] = useState<HeartbeatFrame | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // 启动监听
    listen<HeartbeatFrame>('heartbeat', (event) => {
      setHeartbeat(event.payload);
      setConnected(true);
    })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
      })
      .catch((error) => {
        console.error('Failed to listen to heartbeat:', error);
        setConnected(false);
      });

    // 可选：超时检测（如果一段时间没收到心跳，标记为断开）
    const timeoutId = setInterval(() => {
      if (heartbeat) {
        const now = Date.now();
        const lastUpdate = heartbeat.timestamp || 0;
        if (now - lastUpdate > 3000) { // 3秒无心跳
          setConnected(false);
        }
      }
    }, 1000);

    // 清理函数
    return () => {
      if (unlisten) {
        unlisten();
      }
      clearInterval(timeoutId);
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  return { heartbeat, connected };
}
