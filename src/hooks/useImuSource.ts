import { useEffect, useMemo, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { imuApi } from "../services/imu";
import { ResponseData } from "../types";
import { ImuHistoryBuffer } from "../utils/ImuHistoryBuffer";

export type ImuSource = {
  bufferRef: React.RefObject<ImuHistoryBuffer>;
  latestRef: React.RefObject<ResponseData | null>;
  streamStartMsRef: React.RefObject<number | null>;
  reset: () => void;
};

type UseImuSourceOptions = {
  enabled: boolean;
  capacity: number;
};

export const useImuSource = ({ enabled, capacity }: UseImuSourceOptions): ImuSource => {
  const bufferRef = useRef(new ImuHistoryBuffer(capacity));
  const latestRef = useRef<ResponseData | null>(null);
  const streamStartMsRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const reset = useMemo(
    () => () => {
      bufferRef.current.clear();
      latestRef.current = null;
      streamStartMsRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      return;
    }

    activeRef.current = true;
    const channel = new Channel<ResponseData>();
    channel.onmessage = (msg) => {
      if (!activeRef.current) {
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
      channel.onmessage = () => { };
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled, reset]);

  return {
    bufferRef,
    latestRef,
    streamStartMsRef,
    reset,
  };
};
