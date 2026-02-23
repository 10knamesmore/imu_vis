import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Channel } from "@tauri-apps/api/core";

import { imuApi } from "../services/imu";
import type { DebugMonitorTick, DebugRealtimeFrame } from "../types";

const MAX_RETAINED_FRAMES = 6_000;
const VIEW_REFRESH_MS = 120;

export type UseDebugStreamsResult = {
  /** Debug 实时帧缓冲区引用。 */
  framesRef: MutableRefObject<DebugRealtimeFrame[]>;
  /** 帧缓冲区更新版本号。 */
  framesRevision: number;
  /** 最近一帧实时数据。 */
  latestFrame: DebugRealtimeFrame | null;
  /** 最近一帧监控数据。 */
  monitorTick: DebugMonitorTick | null;
  /** 前端每秒接收速率。 */
  frontendRxHz: number;
};

/**
 * 订阅 Debug 双流并维护前端侧缓冲与统计。
 */
export const useDebugStreams = (): UseDebugStreamsResult => {
  /** 实时帧缓冲，按固定容量保留最近数据。 */
  const framesRef = useRef<DebugRealtimeFrame[]>([]);
  /** 最近一帧实时数据引用。 */
  const latestFrameRef = useRef<DebugRealtimeFrame | null>(null);
  /** 1 秒窗口内的实时帧计数器。 */
  const frontendRxCounterRef = useRef(0);
  /** 帧缓冲区刷新版本号。 */
  const [framesRevision, setFramesRevision] = useState(0);
  /** 最近一帧实时数据。 */
  const [latestFrame, setLatestFrame] = useState<DebugRealtimeFrame | null>(null);
  /** 最近一帧监控数据。 */
  const [monitorTick, setMonitorTick] = useState<DebugMonitorTick | null>(null);
  /** 前端每秒接收速率。 */
  const [frontendRxHz, setFrontendRxHz] = useState(0);

  useEffect(() => {
    const realtimeChannel = new Channel<DebugRealtimeFrame>();
    realtimeChannel.onmessage = (frame: DebugRealtimeFrame) => {
      const frames = framesRef.current;
      frames.push(frame);
      if (frames.length > MAX_RETAINED_FRAMES) {
        frames.splice(0, frames.length - MAX_RETAINED_FRAMES);
      }
      latestFrameRef.current = frame;
      frontendRxCounterRef.current += 1;
    };

    const monitorChannel = new Channel<DebugMonitorTick>();
    monitorChannel.onmessage = (tick: DebugMonitorTick) => {
      setMonitorTick(tick);
    };

    imuApi.subscribeDebugRealtime(realtimeChannel).catch((error) => {
      console.error("subscribeDebugRealtime failed:", error);
    });
    imuApi.subscribeDebugMonitor(monitorChannel).catch((error) => {
      console.error("subscribeDebugMonitor failed:", error);
    });

    const renderTimer = window.setInterval(() => {
      setLatestFrame(latestFrameRef.current);
      setFramesRevision((version) => (version + 1) % 1_000_000);
    }, VIEW_REFRESH_MS);

    const frontendRxTimer = window.setInterval(() => {
      setFrontendRxHz(frontendRxCounterRef.current);
      frontendRxCounterRef.current = 0;
    }, 1000);

    return () => {
      realtimeChannel.onmessage = () => { };
      monitorChannel.onmessage = () => { };
      window.clearInterval(renderTimer);
      window.clearInterval(frontendRxTimer);
    };
  }, []);

  return {
    framesRef,
    framesRevision,
    latestFrame,
    monitorTick,
    frontendRxHz,
  };
};
