import { useEffect, useMemo, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";

import { imuApi } from "../services/imu";
import { ResponseData } from "../types";
import { ImuComparisonHistoryBuffer } from "../utils/ImuComparisonHistoryBuffer";

export type ImuComparisonSource = {
  bufferRef: React.RefObject<ImuComparisonHistoryBuffer>;
  latestRef: React.RefObject<ResponseData | null>;
  streamStartMsRef: React.RefObject<number | null>;
  reset: () => void;
};

type UseImuComparisonSourceOptions = {
  enabled: boolean;
  capacity: number;
};

export const useImuComparisonSource = ({
  enabled,
  capacity,
}: UseImuComparisonSourceOptions): ImuComparisonSource => {
  const bufferRef = useRef(new ImuComparisonHistoryBuffer(capacity));
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
      if (streamStartMsRef.current === null) {
        streamStartMsRef.current = msg.raw_data.timestamp_ms;
      }
      latestRef.current = msg;
      bufferRef.current.push(msg.raw_data, msg.calculated_data, streamStartMsRef.current);
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
