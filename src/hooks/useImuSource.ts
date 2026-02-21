import { useCallback, useEffect, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { imuApi } from "../services/imu";
import { ResponseData } from "../types";
import { ImuHistoryBuffer } from "../utils/ImuHistoryBuffer";

export type ImuSource = {
  /** 环形历史缓冲区引用，供图表窗口读取。 */
  bufferRef: React.RefObject<ImuHistoryBuffer>;
  /** 最新一帧 IMU 数据引用。 */
  latestRef: React.RefObject<ResponseData | null>;
  /** 当前数据流起始时间戳（毫秒）引用。 */
  streamStartMsRef: React.RefObject<number | null>;
  /** 当前数据源模式（实时/回放）引用。 */
  sourceModeRef: React.RefObject<"live" | "replay">;
  /** 清空当前缓冲与状态。 */
  reset: () => void;
};

type UseImuSourceOptions = {
  /** 是否启用数据源订阅。 */
  enabled: boolean;
  /** 历史缓冲区容量。 */
  capacity: number;
  /** 是否进入回放模式。 */
  replaying?: boolean;
  /** 回放样本数据。 */
  replaySamples?: ResponseData[] | null;
  /** 回放会话 ID。 */
  replaySessionId?: number | null;
  /** 回放版本号（变化时触发重新回放）。 */
  replayVersion?: number;
};

export const useImuSource = ({
  enabled,
  capacity,
  replaying = false,
  replaySamples = null,
  replaySessionId = null,
  replayVersion = 0,
}: UseImuSourceOptions): ImuSource => {
  const bufferRef = useRef(new ImuHistoryBuffer(capacity));
  const latestRef = useRef<ResponseData | null>(null);
  const streamStartMsRef = useRef<number | null>(null);
  const sourceModeRef = useRef<"live" | "replay">("live");
  const activeRef = useRef(false);
  const replayRafRef = useRef<number | null>(null);
  const replayRunIdRef = useRef(0);

  const cancelReplayFrame = useCallback(() => {
    if (replayRafRef.current !== null) {
      cancelAnimationFrame(replayRafRef.current);
      replayRafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    bufferRef.current.clear();
    latestRef.current = null;
    streamStartMsRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      sourceModeRef.current = "live";
      cancelReplayFrame();
      return;
    }

    activeRef.current = true;
    const channel = new Channel<ResponseData>();
    channel.onmessage = (msg) => {
      if (!activeRef.current || sourceModeRef.current !== "live") {
        return;
      }
      latestRef.current = msg;
      if (streamStartMsRef.current === null) {
        streamStartMsRef.current = msg.raw_data.timestamp_ms;
      }
      bufferRef.current.push(msg, streamStartMsRef.current);
    };

    imuApi.subscribeOutput(channel);

    return () => {
      activeRef.current = false;
      cancelReplayFrame();
      channel.onmessage = () => { };
    };
  }, [cancelReplayFrame, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!replaying || !replaySamples || replaySamples.length === 0) {
      if (sourceModeRef.current === "replay") {
        sourceModeRef.current = "live";
        reset();
      }
      cancelReplayFrame();
      return;
    }

    sourceModeRef.current = "replay";
    reset();
    cancelReplayFrame();

    const runId = replayRunIdRef.current + 1;
    replayRunIdRef.current = runId;
    const playbackStartTs = replaySamples[0].raw_data.timestamp_ms;
    streamStartMsRef.current = playbackStartTs;
    let cursor = 0;
    const frameStart = performance.now();

    const step = (now: number) => {
      if (replayRunIdRef.current !== runId || sourceModeRef.current !== "replay") {
        return;
      }
      const elapsedMs = now - frameStart;
      while (
        cursor < replaySamples.length &&
        replaySamples[cursor].raw_data.timestamp_ms - playbackStartTs <= elapsedMs
      ) {
        const sample = replaySamples[cursor];
        latestRef.current = sample;
        bufferRef.current.push(sample, playbackStartTs);
        cursor += 1;
      }
      if (cursor < replaySamples.length) {
        replayRafRef.current = requestAnimationFrame(step);
      } else {
        replayRafRef.current = null;
      }
    };

    replayRafRef.current = requestAnimationFrame(step);

    return () => {
      if (replayRunIdRef.current === runId) {
        replayRunIdRef.current += 1;
      }
      cancelReplayFrame();
    };
  }, [cancelReplayFrame, enabled, replaying, replaySamples, replaySessionId, replayVersion, reset]);

  useEffect(() => {
    if (!enabled) {
      cancelReplayFrame();
      reset();
    }
  }, [cancelReplayFrame, enabled, reset]);

  return {
    bufferRef,
    latestRef,
    streamStartMsRef,
    sourceModeRef,
    reset,
  };
};
