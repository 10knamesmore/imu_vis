import { useEffect, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { imuApi } from "../services/imu";
import type { PipelineDiagnostics } from "../types";
import { DiagnosticsHistoryBuffer } from "../utils/DiagnosticsHistoryBuffer";

export type DiagnosticsSource = {
  bufferRef: React.RefObject<DiagnosticsHistoryBuffer>;
  latestRef: React.RefObject<PipelineDiagnostics | null>;
  streamStartMsRef: React.RefObject<number | null>;
};

/**
 * 诊断数据订阅 Hook。
 *
 * enabled=true 时自动订阅后端诊断数据流，推入环形缓冲区。
 * enabled=false 时不订阅，零开销。
 * 组件卸载时自动断开，后端随即关闭诊断采集。
 */
export const useDiagnostics = (enabled: boolean): DiagnosticsSource => {
  const bufferRef = useRef(new DiagnosticsHistoryBuffer(10_000));
  const latestRef = useRef<PipelineDiagnostics | null>(null);
  const streamStartMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    bufferRef.current.clear();
    latestRef.current = null;
    streamStartMsRef.current = null;

    const channel = new Channel<PipelineDiagnostics>();
    channel.onmessage = (msg) => {
      if (streamStartMsRef.current === null) {
        streamStartMsRef.current = msg.timestamp_ms;
      }
      latestRef.current = msg;
      bufferRef.current.push(msg, streamStartMsRef.current);
    };

    imuApi.subscribeDiagnostics(channel);

    return () => {
      // 断开 channel，后端自动关闭诊断采集
      channel.onmessage = () => {};
    };
  }, [enabled]);

  return { bufferRef, latestRef, streamStartMsRef };
};
