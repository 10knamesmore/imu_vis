import { useCallback, useEffect, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { imuApi } from "../services/imu";
import { ResponseData } from "../types";
import { ImuHistoryBuffer } from "../utils/ImuHistoryBuffer";

export type ImuSource = {
  bufferRef: React.RefObject<ImuHistoryBuffer>;
  latestRef: React.RefObject<ResponseData | null>;
  streamStartMsRef: React.RefObject<number | null>;
  sourceModeRef: React.RefObject<"live" | "replay">;
  reset: () => void;
};

type UseImuSourceOptions = {
  enabled: boolean;
  capacity: number;
  replaying?: boolean;
  replaySamples?: ResponseData[] | null;
  replaySessionId?: number | null;
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
