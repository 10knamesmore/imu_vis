import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { App as AntdApp } from 'antd';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { imuApi } from '../../services/imu';
import {
  PeripheralInfo,
  ProcessorPipelineConfig,
  ResponseData,
  RecordingMeta,
  RecordingStatus,
  ImuHistorySnapshot,
} from '../../types';
import { BluetoothContext, type BluetoothContextValue, type DataMode } from './bluetooth-context';

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

const useBluetoothInternal = (): BluetoothContextValue => {
  const { message } = AntdApp.useApp();
  // 是否在扫描中
  const [scanning, setScanning] = useState(false);
  // 扫描到的设备列表
  const [devices, setDevices] = useState<PeripheralInfo[]>([]);
  // 是否已连接设备
  const [connectedDevice, setConnectedDevice] = useState<PeripheralInfo | null>(null);
  // 是否需要显示标定向导
  const [needsCalibration, setNeedsCalibration] = useState(false);
  // 原始数据回调（供标定向导采集数据）
  const rawDataCallbackRef = useRef<((data: ResponseData) => void) | null>(null);
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
  const dataModeRef = useRef<DataMode>('live');
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>('live');
  const [replaySamples, setReplaySamples] = useState<ResponseData[] | null>(null);
  const [replaySessionId, setReplaySessionId] = useState<number | null>(null);
  const [replayVersion, setReplayVersion] = useState(0);
  const replaying = dataMode === 'replay';

  const switchDataMode = useCallback((mode: DataMode) => {
    dataModeRef.current = mode;
    setDataMode(mode);
  }, []);

  const enterLiveMode = useCallback((notify = false) => {
    if (dataModeRef.current === 'live') {
      return;
    }
    switchDataMode('live');
    if (notify) {
      message.info('已切换到实时模式');
    }
  }, [switchDataMode]);

  const enterReplayMode = useCallback(() => {
    if (dataModeRef.current !== 'replay') {
      switchDataMode('replay');
      return;
    }
    setDataMode('replay');
  }, [switchDataMode]);

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

  // 连接成功后检查标定，并在有历史标定时自动应用
  const checkAndApplyCalibration = useCallback(async (device: { id: string; address?: string }) => {
    try {
      const calibrationKey = (device.address || '').trim();
      if (!calibrationKey) {
        throw new Error('设备地址为空，无法查询标定');
      }
      console.info('[Calibration] query key:', calibrationKey);

      const calibRes = await imuApi.getDeviceCalibration(calibrationKey);
      if (!calibRes.success) {
        throw new Error(calibRes.message || `查询标定失败(key=${calibrationKey})`);
      }
      const calibrationData = calibRes.data;

      if (!calibrationData) {
        console.info('[Calibration] miss, require calibration. key=', calibrationKey);
        // 没有标定数据 → 弹出向导
        setNeedsCalibration(true);
        return;
      }
      console.info('[Calibration] hit key:', calibrationKey);
      // 有历史标定 → 自动应用到 pipeline
      const { accel_bias, accel_scale } = calibrationData;
      const configRes = await imuApi.getPipelineConfig();
      if (configRes.success && configRes.data) {
        const config = configRes.data;
        const updateRes = await imuApi.updatePipelineConfig({
          ...config,
          calibration: {
            ...config.calibration,
            accel_bias: { x: accel_bias[0], y: accel_bias[1], z: accel_bias[2] },
            accel_matrix: [
              [accel_scale[0], 0, 0],
              [0, accel_scale[1], 0],
              [0, 0, accel_scale[2]],
            ],
          },
        });
        if (!updateRes.success) {
          throw new Error(updateRes.message || '应用历史标定到流水线失败');
        }
      }
      setNeedsCalibration(false);
    } catch (e) {
      console.error('检查标定状态失败:', e);
      // 出错时不强制弹向导，避免影响正常使用
      setNeedsCalibration(false);
    }
  }, []);

  // 连接到指定设备
  const connect = useCallback(async (deviceId: string) => {
    try {
      if (scanning) {
        await stopScan();
      }

      const res = await imuApi.connect(deviceId);

      if (res.success && res.data) {
        enterLiveMode(true);
        setConnectedDevice(res.data);
        message.success(`已连接 ${res.data.local_name || res.data.id}`);
        await checkAndApplyCalibration(res.data);
        return true;
      } else {
        // 如果API没有返回完整数据，尝试从已扫描列表中查找
        const deviceInList = devices.find(d => d.id === deviceId);
        if (res.success) {
          // 优先使用列表中的信息，否则仅使用 ID
          const deviceData = deviceInList || { id: deviceId, address: deviceId };
          enterLiveMode(true);
          setConnectedDevice(deviceData);
          message.success(`已连接 ${deviceData.local_name || deviceData.id}`);
          await checkAndApplyCalibration(deviceData);
          return true;
        }

        throw new Error(res.message || "未知错误");
      }
    } catch (e) {
      message.error('连接失败');
      console.error(e);
      return false;
    }
  }, [scanning, stopScan, devices, enterLiveMode, checkAndApplyCalibration]);

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
        history.time.push(imuData.timestamp_ms - startMs);
        history.builtin.accel.x.push(imuData.accel_no_g.x);
        history.builtin.accel.y.push(imuData.accel_no_g.y);
        history.builtin.accel.z.push(imuData.accel_no_g.z);
        history.builtin.accelWithG.x.push(imuData.accel_with_g.x);
        history.builtin.accelWithG.y.push(imuData.accel_with_g.y);
        history.builtin.accelWithG.z.push(imuData.accel_with_g.z);
        history.builtin.gyro.x.push(imuData.gyro.x);
        history.builtin.gyro.y.push(imuData.gyro.y);
        history.builtin.gyro.z.push(imuData.gyro.z);
        history.builtin.angle.x.push(imuData.angle.x);
        history.builtin.angle.y.push(imuData.angle.y);
        history.builtin.angle.z.push(imuData.angle.z);
        history.builtin.quat.w.push(imuData.quat.w);
        history.builtin.quat.x.push(imuData.quat.x);
        history.builtin.quat.y.push(imuData.quat.y);
        history.builtin.quat.z.push(imuData.quat.z);
        history.builtin.offset.x.push(imuData.offset.x);
        history.builtin.offset.y.push(imuData.offset.y);
        history.builtin.offset.z.push(imuData.offset.z);
        history.builtin.accelNav.x.push(imuData.accel_nav.x);
        history.builtin.accelNav.y.push(imuData.accel_nav.y);
        history.builtin.accelNav.z.push(imuData.accel_nav.z);
      }
      setDataHistory(history);
      setPlotRevision((rev) => (rev + 1) % 1_000_000);
      setLastSecondMessageCount(0);
      setReplaySamples(samples);
      setReplaySessionId(sessionId);
      enterReplayMode();
      setReplayVersion((version) => version + 1);
      message.success('录制数据已加载');
    } catch (e) {
      console.error(e);
      message.error('加载录制数据失败');
    }
  }, [enterReplayMode]);

  // 退出回放模式
  const restartReplay = useCallback(() => {
    if (!replaySamples || replaySamples.length === 0) {
      message.warning('请先加载录制数据');
      return;
    }
    enterReplayMode();
    setReplayVersion((version) => version + 1);
  }, [enterReplayMode, replaySamples]);

  // 退出回放模式
  const exitReplay = useCallback(() => {
    enterLiveMode(true);
  }, [enterLiveMode]);

  const registerRawDataCallback = useCallback(
    (cb: ((data: ResponseData) => void) | null) => {
      rawDataCallbackRef.current = cb;
    },
    [],
  );

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
    dataMode,
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
    needsCalibration,
    setNeedsCalibration,
    registerRawDataCallback,
  };
};

/**
 * 蓝牙状态与操作的全局 Provider 组件。
 */
type Props = {
  children: ReactNode;
};

export const BluetoothProvider = ({ children }: Props) => {
  const value = useBluetoothInternal();
  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};
