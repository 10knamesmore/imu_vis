import { useEffect, useMemo, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { imuApi } from "../services/imu";
import { IMUData, ResponseData } from "../types";
import { ImuHistoryBuffer } from "../utils/ImuHistoryBuffer";

export type ImuSource = {
  bufferRef: React.RefObject<ImuHistoryBuffer>;
  latestRef: React.RefObject<IMUData | null>;
  streamStartMsRef: React.RefObject<number | null>;
  reset: () => void;
};

type UseImuSourceOptions = {
  enabled: boolean;
  capacity?: number;
};

export const useImuSource = ({ enabled, capacity = 4096 }: UseImuSourceOptions): ImuSource => {
  const bufferRef = useRef(new ImuHistoryBuffer(capacity));
  const latestRef = useRef<IMUData | null>(null);
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
      const imu = msg.raw_data;
      latestRef.current = imu;
      if (streamStartMsRef.current === null) {
        streamStartMsRef.current = imu.timestamp_ms;
      }
      bufferRef.current.push(imu, streamStartMsRef.current);
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
