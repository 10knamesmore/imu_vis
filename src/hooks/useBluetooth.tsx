import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { message } from 'antd';
import { Channel } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { imuApi } from '../services/imu';
import {
  PeripheralInfo,
  ProcessorPipelineConfig,
  ResponseData,
  RecordingMeta,
  RecordingStatus,
  ImuHistorySnapshot,
} from '../types';

type BluetoothContextValue = {
  /** 当前是否在扫描蓝牙设备。 */
  scanning: boolean;
  /** 扫描到的设备列表。 */
  devices: PeripheralInfo[];
  /** 当前已连接设备信息；未连接时为 null。 */
  connectedDevice: PeripheralInfo | null;
  /** 给旧图表链路使用的历史数据快照。 */
  dataHistory: ImuHistorySnapshot;
  /** 图表重绘版本号（每次刷新递增）。 */
  plotRevision: number;
  /** UI 刷新间隔（毫秒）。 */
  uiRefreshMs: number;
  /** 更新 UI 刷新间隔的方法。 */
  setUiRefreshMs: React.Dispatch<React.SetStateAction<number>>;
  /** 最近 1 秒接收到的数据条数。 */
  lastSecondMessageCount: number;
  /** 当前是否正在录制。 */
  recording: boolean;
  /** 当前录制状态详情。 */
  recordingStatus: RecordingStatus | null;
  /** 录制会话列表。 */
  recordings: RecordingMeta[];
  /** 当前是否处于回放模式。 */
  replaying: boolean;
  /** 当前加载的回放样本（未加载时为 null）。 */
  replaySamples: ResponseData[] | null;
  /** 当前回放会话 ID（未加载时为 null）。 */
  replaySessionId: number | null;
  /** 回放版本号，用于触发重新回放。 */
  replayVersion: number;
  /** 刷新录制列表。 */
  refreshRecordings: () => Promise<void>;
  /** 更新录制元信息（名称、标签）。 */
  updateRecordingMeta: (sessionId: number, name?: string, tags?: string[]) => Promise<void>;
  /** 加载指定会话的回放数据。 */
  loadRecording: (sessionId: number) => Promise<void>;
  /** 从头重新播放当前回放数据。 */
  restartReplay: () => void;
  /** 退出回放模式并恢复实时模式。 */
  exitReplay: () => void;
  /** 开始扫描设备。 */
  startScan: () => Promise<void>;
  /** 停止扫描设备。 */
  stopScan: () => Promise<void>;
  /** 切换扫描状态。 */
  toggleScan: () => Promise<void>;
  /** 连接指定设备。 */
  connect: (deviceId: string) => Promise<boolean>;
  /** 断开当前设备。 */
  disconnect: () => Promise<void>;
  /** 切换录制状态（开始/停止）。 */
  toggleRecording: () => Promise<void>;
  /** 获取当前流水线配置。 */
  getPipelineConfig: () => Promise<ProcessorPipelineConfig | null>;
  /** 更新流水线配置并立即生效。 */
  updatePipelineConfig: (config: ProcessorPipelineConfig) => Promise<boolean>;
  /** 将当前生效配置保存到配置文件。 */
  savePipelineConfig: () => Promise<boolean>;
};

const createEmptyHistory = (): ImuHistorySnapshot => ({
  time: [],
  builtin: {
    accel: { x: [], y: [], z: [] },
    accelWithG: { x: [], y: [], z: [] },
    gyro: { x: [], y: [], z: [] },
    angle: { x: [], y: [], z: [] },
    quat: { w: [], x: [], y: [], z: [] },
    offset: { x: [], y: [], z: [] },
    accelNav: { x: [], y: [], z: [] },
  },
  calculated: {
    angle: { x: [], y: [], z: [] },
    attitude: { w: [], x: [], y: [], z: [] },
    velocity: { x: [], y: [], z: [] },
    position: { x: [], y: [], z: [] },
  },
  deltaAngle: { x: [], y: [], z: [] },
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
  const [dataHistory, setDataHistory] = useState<ImuHistorySnapshot>(createEmptyHistory);
  // 表示图重绘的版本号，每次更新加一
  const [plotRevision, setPlotRevision] = useState(0);
  // UI 刷新间隔（ms），只影响图表渲染频率，不影响数据接收频率
  const [uiRefreshMs, setUiRefreshMs] = useState(33);
  // 上一秒收到的消息数（用于展示/监控输入频率）
  const [lastSecondMessageCount, setLastSecondMessageCount] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [recording, setRecording] = useState(false);
  // 高频数据缓存：onmessage 只更新这里，避免每条消息都触发 React 重渲染
  const dataHistoryRef = useRef<ImuHistorySnapshot>(createEmptyHistory());
  // 记录数据流起始时间（ms），用于生成相对时间轴
  const streamStartMsRef = useRef<number | null>(null);
  // 1s 内的消息计数器（由定时器每秒读取并清零）
  const messageCountRef = useRef(0);
  const replayingRef = useRef(false);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [replaySamples, setReplaySamples] = useState<ResponseData[] | null>(null);
  const [replaySessionId, setReplaySessionId] = useState<number | null>(null);
  const [replayVersion, setReplayVersion] = useState(0);

  useEffect(() => {
    replayingRef.current = replaying;
  }, [replaying]);

  // 监听配置更新事件
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    const setupListener = async () => {
      try {
        unlisten = await listen('config_update', () => {
          message.info('流水线配置已更新');
        });
      } catch (e) {
        console.error(e);
      }
    };
    setupListener();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

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
      message.error('开始扫描失败');
      console.error(e);
    }
  }, []);

  // 停止扫描
  const stopScan = useCallback(async () => {
    try {
      await imuApi.stopScan();
      setScanning(false);
    } catch (e) {
      message.error('停止扫描失败');
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
        message.success(`已连接 ${res.data.local_name || res.data.id}`);
        return true;
      } else {
        // 如果API没有返回完整数据，尝试从已扫描列表中查找
        const deviceInList = devices.find(d => d.id === deviceId);
        if (res.success) {
          // 优先使用列表中的信息，否则仅使用 ID
          const deviceData = deviceInList || { id: deviceId, address: deviceId };
          setConnectedDevice(deviceData);
          message.success(`已连接 ${deviceData.local_name || deviceData.id}`);
          return true;
        }

        throw new Error(res.message || "未知错误");
      }
    } catch (e) {
      message.error('连接失败');
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
        builtin: snapshot.builtin,
        calculated: snapshot.calculated,
        deltaAngle: snapshot.deltaAngle,
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
      pushCapped(history.builtin.accel.x, imuData.accel_no_g.x);
      pushCapped(history.builtin.accel.y, imuData.accel_no_g.y);
      pushCapped(history.builtin.accel.z, imuData.accel_no_g.z);
      pushCapped(history.builtin.accelWithG.x, imuData.accel_with_g.x);
      pushCapped(history.builtin.accelWithG.y, imuData.accel_with_g.y);
      pushCapped(history.builtin.accelWithG.z, imuData.accel_with_g.z);
      pushCapped(history.builtin.gyro.x, imuData.gyro.x);
      pushCapped(history.builtin.gyro.y, imuData.gyro.y);
      pushCapped(history.builtin.gyro.z, imuData.gyro.z);
      pushCapped(history.builtin.angle.x, imuData.angle.x);
      pushCapped(history.builtin.angle.y, imuData.angle.y);
      pushCapped(history.builtin.angle.z, imuData.angle.z);
      pushCapped(history.builtin.quat.w, imuData.quat.w);
      pushCapped(history.builtin.quat.x, imuData.quat.x);
      pushCapped(history.builtin.quat.y, imuData.quat.y);
      pushCapped(history.builtin.quat.z, imuData.quat.z);
      pushCapped(history.builtin.offset.x, imuData.offset.x);
      pushCapped(history.builtin.offset.y, imuData.offset.y);
      pushCapped(history.builtin.offset.z, imuData.offset.z);
      pushCapped(history.builtin.accelNav.x, imuData.accel_nav.x);
      pushCapped(history.builtin.accelNav.y, imuData.accel_nav.y);
      pushCapped(history.builtin.accelNav.z, imuData.accel_nav.z);
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
      message.info("已断开连接");
    } catch (e) {
      console.error(e);
      message.error('断开连接失败');
    }
  }, [recording]);

  // 开始录制
  const startRecording = useCallback(async () => {
    try {
      const res = await imuApi.startRecording();
      if (res.success && res.data) {
        setRecording(true);
        setRecordingStatus(res.data);
        message.success(`开始录制：${res.data.db_path ?? 'sqlite'}`);
      } else {
        throw new Error(res.message || '未知错误');
      }
    } catch (e) {
      console.error(e);
      message.error('开始录制失败');
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
        message.info(`录制已停止（${count} 条数据）`);
      } else {
        throw new Error(res.message || '未知错误');
      }
    } catch (e) {
      console.error(e);
      message.error('停止录制失败');
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

  // 获取当前 pipeline 配置
  const getPipelineConfig = useCallback(async () => {
    try {
      const res = await imuApi.getPipelineConfig();
      if (res.success && res.data) {
        return res.data;
      }
      throw new Error(res.message || '未知错误');
    } catch (e) {
      console.error(e);
      message.error('获取流水线配置失败');
      return null;
    }
  }, []);

  // 更新 pipeline 配置并立即生效
  const updatePipelineConfig = useCallback(async (config: ProcessorPipelineConfig) => {
    try {
      const res = await imuApi.updatePipelineConfig(config);
      if (!res.success) {
        throw new Error(res.message || '未知错误');
      }
      return true;
    } catch (e) {
      console.error(e);
      message.error('更新流水线配置失败');
      return false;
    }
  }, []);

  // 保存当前生效配置到 processor.toml
  const savePipelineConfig = useCallback(async () => {
    try {
      const res = await imuApi.savePipelineConfig();
      if (!res.success) {
        throw new Error(res.message || '未知错误');
      }
      message.success('当前生效配置已保存到 processor.toml');
      return true;
    } catch (e) {
      console.error(e);
      message.error('保存流水线配置失败');
      return false;
    }
  }, []);

  // 刷新录制列表
  const refreshRecordings = useCallback(async () => {
    try {
      const res = await imuApi.listRecordings();
      if (res.success && res.data) {
        setRecordings(res.data);
      } else {
        throw new Error(res.message || '未知错误');
      }
    } catch (e) {
      console.error(e);
      message.error('加载录制列表失败');
    }
  }, []);

  // 更新录制元数据
  const updateRecordingMeta = useCallback(async (sessionId: number, name?: string, tags?: string[]) => {
    try {
      const res = await imuApi.updateRecordingMeta(sessionId, name, tags);
      if (res.success && res.data) {
        const updatedRecording = res.data;
        setRecordings((prev) => prev.map((item) => (item.id === sessionId ? updatedRecording : item)));
        message.success('录制信息已更新');
      } else {
        throw new Error(res.message || '未知错误');
      }
    } catch (e) {
      console.error(e);
      message.error('更新录制信息失败');
    }
  }, []);

  // 加载并回放录制的数据
  const loadRecording = useCallback(async (sessionId: number) => {
    try {
      const res = await imuApi.getRecordingSamples(sessionId);
      if (!res.success || !res.data) {
        throw new Error(res.message || '未知错误');
      }
      const samples = res.data;
      if (!samples.length) {
        message.warning('该录制没有数据');
        return;
      }
      const startMs = samples[0].raw_data.timestamp_ms;
      const history = createEmptyHistory();
      for (const sample of samples) {
        const imuData = sample.raw_data;
        pushCapped(history.time, imuData.timestamp_ms - startMs, samples.length + 1);
        pushCapped(history.builtin.accel.x, imuData.accel_no_g.x, samples.length + 1);
        pushCapped(history.builtin.accel.y, imuData.accel_no_g.y, samples.length + 1);
        pushCapped(history.builtin.accel.z, imuData.accel_no_g.z, samples.length + 1);
        pushCapped(history.builtin.accelWithG.x, imuData.accel_with_g.x, samples.length + 1);
        pushCapped(history.builtin.accelWithG.y, imuData.accel_with_g.y, samples.length + 1);
        pushCapped(history.builtin.accelWithG.z, imuData.accel_with_g.z, samples.length + 1);
        pushCapped(history.builtin.gyro.x, imuData.gyro.x, samples.length + 1);
        pushCapped(history.builtin.gyro.y, imuData.gyro.y, samples.length + 1);
        pushCapped(history.builtin.gyro.z, imuData.gyro.z, samples.length + 1);
        pushCapped(history.builtin.angle.x, imuData.angle.x, samples.length + 1);
        pushCapped(history.builtin.angle.y, imuData.angle.y, samples.length + 1);
        pushCapped(history.builtin.angle.z, imuData.angle.z, samples.length + 1);
        pushCapped(history.builtin.quat.w, imuData.quat.w, samples.length + 1);
        pushCapped(history.builtin.quat.x, imuData.quat.x, samples.length + 1);
        pushCapped(history.builtin.quat.y, imuData.quat.y, samples.length + 1);
        pushCapped(history.builtin.quat.z, imuData.quat.z, samples.length + 1);
        pushCapped(history.builtin.offset.x, imuData.offset.x, samples.length + 1);
        pushCapped(history.builtin.offset.y, imuData.offset.y, samples.length + 1);
        pushCapped(history.builtin.offset.z, imuData.offset.z, samples.length + 1);
        pushCapped(history.builtin.accelNav.x, imuData.accel_nav.x, samples.length + 1);
        pushCapped(history.builtin.accelNav.y, imuData.accel_nav.y, samples.length + 1);
        pushCapped(history.builtin.accelNav.z, imuData.accel_nav.z, samples.length + 1);
      }
      dataHistoryRef.current = history;
      setDataHistory(history);
      setPlotRevision((rev) => (rev + 1) % 1_000_000);
      setLastSecondMessageCount(0);
      streamStartMsRef.current = startMs;
      setReplaySamples(samples);
      setReplaySessionId(sessionId);
      setReplaying(true);
      setReplayVersion((version) => version + 1);
      message.success('录制数据已加载');
    } catch (e) {
      console.error(e);
      message.error('加载录制数据失败');
    }
  }, []);

  // 退出回放模式
  const restartReplay = useCallback(() => {
    if (!replaySamples || replaySamples.length === 0) {
      message.warning('请先加载录制数据');
      return;
    }
    setReplaying(true);
    setReplayVersion((version) => version + 1);
  }, [replaySamples]);

  // 退出回放模式
  const exitReplay = useCallback(() => {
    setReplaying(false);
    message.info('已退出回放');
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
    replaySamples,
    replaySessionId,
    replayVersion,
    refreshRecordings,
    updateRecordingMeta,
    loadRecording,
    restartReplay,
    exitReplay,
    startScan,
    stopScan,
    toggleScan,
    connect,
    disconnect,
    toggleRecording,
    getPipelineConfig,
    updatePipelineConfig,
    savePipelineConfig,
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
