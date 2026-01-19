import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { message } from 'antd';
import { Channel } from '@tauri-apps/api/core';
import { imuApi } from '../services/imu';
import { PeripheralInfo, ResponseData, RecordingMeta, RecordingStatus, ImuDataHistory } from '../types';

type BluetoothContextValue = {
  scanning: boolean;
  devices: PeripheralInfo[];
  connectedDevice: PeripheralInfo | null;
  dataHistory: ImuDataHistory;
  plotRevision: number;
  uiRefreshMs: number;
  setUiRefreshMs: React.Dispatch<React.SetStateAction<number>>;
  lastSecondMessageCount: number;
  recording: boolean;
  recordingStatus: RecordingStatus | null;
  recordings: RecordingMeta[];
  replaying: boolean;
  refreshRecordings: () => Promise<void>;
  updateRecordingMeta: (sessionId: number, name?: string, tags?: string[]) => Promise<void>;
  loadRecording: (sessionId: number) => Promise<void>;
  exitReplay: () => void;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
  connect: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  toggleRecording: () => Promise<void>;
};

const createEmptyHistory = (): ImuDataHistory => ({
  time: [],
  accel: { x: [], y: [], z: [] },
  accelWithG: { x: [], y: [], z: [] },
  gyro: { x: [], y: [], z: [] },
  angle: { x: [], y: [], z: [] },
  quat: { w: [], x: [], y: [], z: [] },
  offset: { x: [], y: [], z: [] },
  accelNav: { x: [], y: [], z: [] },
});

const BluetoothContext = React.createContext<BluetoothContextValue | null>(null);
const MAX_POINTS = 1000;

const pushCapped = (arr: number[], value: number, cap = MAX_POINTS) => {
  arr.push(value);
  if (arr.length > cap) {
    arr.splice(0, arr.length - cap);
  }
};

const useBluetoothInternal = (): BluetoothContextValue => {
  // 是否在扫描中
  const [scanning, setScanning] = useState(false);
  // 扫描到的设备列表
  const [devices, setDevices] = useState<PeripheralInfo[]>([]);
  // 是否已连接设备
  const [connectedDevice, setConnectedDevice] = useState<PeripheralInfo | null>(null);
  // 对外提供的 IMU 数据历史
  const [dataHistory, setDataHistory] = useState<ImuDataHistory>(createEmptyHistory);
  // 表示图重绘的版本号，每次更新加一
  const [plotRevision, setPlotRevision] = useState(0);
  // UI 刷新间隔（ms），只影响图表渲染频率，不影响数据接收频率
  const [uiRefreshMs, setUiRefreshMs] = useState(33);
  // 上一秒收到的消息数（用于展示/监控输入频率）
  const [lastSecondMessageCount, setLastSecondMessageCount] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [recording, setRecording] = useState(false);
  // 高频数据缓存：onmessage 只更新这里，避免每条消息都触发 React 重渲染
  const dataHistoryRef = useRef<ImuDataHistory>(createEmptyHistory());
  // 记录数据流起始时间（ms），用于生成相对时间轴
  const streamStartMsRef = useRef<number | null>(null);
  // 1s 内的消息计数器（由定时器每秒读取并清零）
  const messageCountRef = useRef(0);
  const replayingRef = useRef(false);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    replayingRef.current = replaying;
  }, [replaying]);

  useEffect(() => {
    let interval: number;
    if (scanning) {
      interval = setInterval(async () => {
        try {
          const response = await imuApi.listPeripherals();
          setDevices(response.data || []);
        } catch (e) {
          console.error(e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [scanning]);

  // 开始扫描蓝牙设备
  const startScan = useCallback(async () => {
    try {
      await imuApi.startScan();
      setScanning(true);
    } catch (e) {
      message.error('Failed to start scan');
      console.error(e);
    }
  }, []);

  // 停止扫描
  const stopScan = useCallback(async () => {
    try {
      await imuApi.stopScan();
      setScanning(false);
    } catch (e) {
      message.error('Failed to stop scan');
      console.error(e);
    }
  }, []);

  // 切换扫描状态
  const toggleScan = useCallback(async () => {
    if (scanning) {
      await stopScan();
    } else {
      await startScan();
    }
  }, [scanning, startScan, stopScan]);

  // 连接到指定设备
  const connect = useCallback(async (deviceId: string) => {
    try {
      if (scanning) {
        await stopScan();
      }

      const res = await imuApi.connect(deviceId);

      if (res.success && res.data) {
        setConnectedDevice(res.data);
        message.success(`Connected to ${res.data.local_name || res.data.id}`);
        return true;
      } else {
        // 如果API没有返回完整数据，尝试从已扫描列表中查找
        const deviceInList = devices.find(d => d.id === deviceId);
        if (res.success) {
          // 优先使用列表中的信息，否则仅使用 ID
          const deviceData = deviceInList || { id: deviceId, address: deviceId };
          setConnectedDevice(deviceData);
          message.success(`Connected to ${deviceData.local_name || deviceData.id}`);
          return true;
        }

        throw new Error(res.message || "Unknown error");
      }
    } catch (e) {
      message.error('Connection failed');
      console.error(e);
      return false;
    }
  }, [scanning, stopScan, devices]);

  useEffect(() => {
    if (!connectedDevice) return;

    const channel = new Channel<ResponseData>();
    // 连接时重置数据缓存与计数器
    dataHistoryRef.current = createEmptyHistory();
    messageCountRef.current = 0;
    streamStartMsRef.current = null;
    // 每秒统计一次接收消息数
    const messageRateTimer = setInterval(() => {
      setLastSecondMessageCount(messageCountRef.current);
      messageCountRef.current = 0;
    }, 1000);
    // 按 UI 刷新频率将缓存快照推入 state，触发图表重绘
    const uiRefreshTimer = setInterval(() => {
      const snapshot = dataHistoryRef.current;
      setDataHistory({
        time: snapshot.time,
        accel: snapshot.accel,
        accelWithG: snapshot.accelWithG,
        gyro: snapshot.gyro,
        angle: snapshot.angle,
        quat: snapshot.quat,
        offset: snapshot.offset,
        accelNav: snapshot.accelNav,
      });
      setPlotRevision((rev) => (rev + 1) % 1_000_000);
    }, Math.max(16, uiRefreshMs)); // 最快 60 FPS
    channel.onmessage = (msg: ResponseData) => {
      if (replayingRef.current) {
        return;
      }
      // 每条消息只更新缓存与计数，不触发 UI 更新
      messageCountRef.current += 1;
      // console.log('Received IMU data:', msg);
      const imuData = msg.raw_data;
      const history = dataHistoryRef.current;
      if (streamStartMsRef.current === null) {
        streamStartMsRef.current = imuData.timestamp_ms;
      }
      pushCapped(history.time, imuData.timestamp_ms - (streamStartMsRef.current ?? 0));
      pushCapped(history.accel.x, imuData.accel_no_g.x);
      pushCapped(history.accel.y, imuData.accel_no_g.y);
      pushCapped(history.accel.z, imuData.accel_no_g.z);
      pushCapped(history.accelWithG.x, imuData.accel_with_g.x);
      pushCapped(history.accelWithG.y, imuData.accel_with_g.y);
      pushCapped(history.accelWithG.z, imuData.accel_with_g.z);
      pushCapped(history.gyro.x, imuData.gyro.x);
      pushCapped(history.gyro.y, imuData.gyro.y);
      pushCapped(history.gyro.z, imuData.gyro.z);
      pushCapped(history.angle.x, imuData.angle.x);
      pushCapped(history.angle.y, imuData.angle.y);
      pushCapped(history.angle.z, imuData.angle.z);
      pushCapped(history.quat.w, imuData.quat.w);
      pushCapped(history.quat.x, imuData.quat.x);
      pushCapped(history.quat.y, imuData.quat.y);
      pushCapped(history.quat.z, imuData.quat.z);
      pushCapped(history.offset.x, imuData.offset.x);
      pushCapped(history.offset.y, imuData.offset.y);
      pushCapped(history.offset.z, imuData.offset.z);
      pushCapped(history.accelNav.x, imuData.accel_nav.x);
      pushCapped(history.accelNav.y, imuData.accel_nav.y);
      pushCapped(history.accelNav.z, imuData.accel_nav.z);
    };

    imuApi.subscribeOutput(channel);
    return () => {
      // 断开/切换设备时清理定时器，避免泄漏
      clearInterval(messageRateTimer);
      clearInterval(uiRefreshTimer);
    };
  }, [connectedDevice, uiRefreshMs]);

  // 断开设备连接
  const disconnect = useCallback(async () => {
    try {
      if (recording) {
        await imuApi.stopRecording();
        setRecording(false);
        setRecordingStatus(null);
      }
      await imuApi.disconnect();
      setConnectedDevice(null);
      setDevices([]);
      setScanning(false);
      // 断开时清空 UI 数据与缓存
      setDataHistory(createEmptyHistory());
      setPlotRevision((rev) => (rev + 1) % 1_000_000);
      dataHistoryRef.current = createEmptyHistory();
      streamStartMsRef.current = null;
      // 断开时清空上一秒计数显示
      setLastSecondMessageCount(0);
      message.info("Disconnected");
    } catch (e) {
      console.error(e);
      message.error('Disconnect failed');
    }
  }, [recording]);

  // 开始录制
  const startRecording = useCallback(async () => {
    try {
      const res = await imuApi.startRecording();
      if (res.success && res.data) {
        setRecording(true);
        setRecordingStatus(res.data);
        message.success(`Recording started: ${res.data.db_path ?? 'sqlite'}`);
      } else {
        throw new Error(res.message || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to start recording');
    }
  }, []);

  // 停止录制
  const stopRecording = useCallback(async () => {
    try {
      const res = await imuApi.stopRecording();
      if (res.success && res.data) {
        setRecording(false);
        setRecordingStatus(res.data);
        const count = res.data.sample_count ?? 0;
        message.info(`Recording stopped (${count} samples)`);
      } else {
        throw new Error(res.message || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to stop recording');
    }
  }, []);

  // 切换录制状态
  const toggleRecording = useCallback(async () => {
    if (recording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  // 刷新录制列表
  const refreshRecordings = useCallback(async () => {
    try {
      const res = await imuApi.listRecordings();
      if (res.success && res.data) {
        setRecordings(res.data);
      } else {
        throw new Error(res.message || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to load recordings');
    }
  }, []);

  // 更新录制元数据
  const updateRecordingMeta = useCallback(async (sessionId: number, name?: string, tags?: string[]) => {
    try {
      const res = await imuApi.updateRecordingMeta(sessionId, name, tags);
      if (res.success && res.data) {
        const updatedRecording = res.data;
        setRecordings((prev) => prev.map((item) => (item.id === sessionId ? updatedRecording : item)));
        message.success('Recording updated');
      } else {
        throw new Error(res.message || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to update recording');
    }
  }, []);

  // 加载并回放录制的数据
  const loadRecording = useCallback(async (sessionId: number) => {
    try {
      const res = await imuApi.getRecordingSamples(sessionId);
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Unknown error');
      }
      const samples = res.data;
      if (!samples.length) {
        message.warning('No samples in this recording');
        return;
      }
      const startMs = samples[0].raw_data.timestamp_ms;
      const history = createEmptyHistory();
      for (const sample of samples) {
        const imuData = sample.raw_data;
        pushCapped(history.time, imuData.timestamp_ms - startMs, samples.length + 1);
        pushCapped(history.accel.x, imuData.accel_no_g.x, samples.length + 1);
        pushCapped(history.accel.y, imuData.accel_no_g.y, samples.length + 1);
        pushCapped(history.accel.z, imuData.accel_no_g.z, samples.length + 1);
        pushCapped(history.accelWithG.x, imuData.accel_with_g.x, samples.length + 1);
        pushCapped(history.accelWithG.y, imuData.accel_with_g.y, samples.length + 1);
        pushCapped(history.accelWithG.z, imuData.accel_with_g.z, samples.length + 1);
        pushCapped(history.gyro.x, imuData.gyro.x, samples.length + 1);
        pushCapped(history.gyro.y, imuData.gyro.y, samples.length + 1);
        pushCapped(history.gyro.z, imuData.gyro.z, samples.length + 1);
        pushCapped(history.angle.x, imuData.angle.x, samples.length + 1);
        pushCapped(history.angle.y, imuData.angle.y, samples.length + 1);
        pushCapped(history.angle.z, imuData.angle.z, samples.length + 1);
        pushCapped(history.quat.w, imuData.quat.w, samples.length + 1);
        pushCapped(history.quat.x, imuData.quat.x, samples.length + 1);
        pushCapped(history.quat.y, imuData.quat.y, samples.length + 1);
        pushCapped(history.quat.z, imuData.quat.z, samples.length + 1);
        pushCapped(history.offset.x, imuData.offset.x, samples.length + 1);
        pushCapped(history.offset.y, imuData.offset.y, samples.length + 1);
        pushCapped(history.offset.z, imuData.offset.z, samples.length + 1);
        pushCapped(history.accelNav.x, imuData.accel_nav.x, samples.length + 1);
        pushCapped(history.accelNav.y, imuData.accel_nav.y, samples.length + 1);
        pushCapped(history.accelNav.z, imuData.accel_nav.z, samples.length + 1);
      }
      dataHistoryRef.current = history;
      setDataHistory(history);
      setPlotRevision((rev) => (rev + 1) % 1_000_000);
      setLastSecondMessageCount(0);
      streamStartMsRef.current = startMs;
      setReplaying(true);
      message.success('Recording loaded');
    } catch (e) {
      console.error(e);
      message.error('Failed to load recording');
    }
  }, []);

  // 退出回放模式
  const exitReplay = useCallback(() => {
    setReplaying(false);
    message.info('Replay cleared');
  }, []);

  return {
    scanning,
    devices,
    connectedDevice,
    dataHistory,
    plotRevision,
    uiRefreshMs,
    setUiRefreshMs,
    lastSecondMessageCount,
    recording,
    recordingStatus,
    recordings,
    replaying,
    refreshRecordings,
    updateRecordingMeta,
    loadRecording,
    exitReplay,
    startScan,
    stopScan,
    toggleScan,
    connect,
    disconnect,
    toggleRecording
  };
};

/**
 * 蓝牙状态与操作的全局 Provider 组件。
 */
export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useBluetoothInternal();
  return (
    <BluetoothContext.Provider value={value} >
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = (): BluetoothContextValue => {
  const ctx = useContext(BluetoothContext);
  if (!ctx) {
    throw new Error('useBluetooth must be used within BluetoothProvider');
  }
  return ctx;
};
