import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { message } from 'antd';
import { Channel } from '@tauri-apps/api/core';
import { imuApi } from '../services/imu';
import { PeripheralInfo, ResponseData } from '../types';

type BluetoothContextValue = {
  scanning: boolean;
  devices: PeripheralInfo[];
  connectedDevice: PeripheralInfo | null;
  dataHistory: ImuDataHistory;
  uiRefreshMs: number;
  setUiRefreshMs: React.Dispatch<React.SetStateAction<number>>;
  lastSecondMessageCount: number;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
  connect: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

export type ImuDataHistory = {
  time: number[];
  accel: { x: number[]; y: number[]; z: number[] };
  accelWithG: { x: number[]; y: number[]; z: number[] };
  gyro: { x: number[]; y: number[]; z: number[] };
  angle: { x: number[]; y: number[]; z: number[] };
  quat: { w: number[]; x: number[]; y: number[]; z: number[] };
  offset: { x: number[]; y: number[]; z: number[] };
  accelNav: { x: number[]; y: number[]; z: number[] };
};

const emptyHistory: ImuDataHistory = {
  time: [],
  accel: { x: [], y: [], z: [] },
  accelWithG: { x: [], y: [], z: [] },
  gyro: { x: [], y: [], z: [] },
  angle: { x: [], y: [], z: [] },
  quat: { w: [], x: [], y: [], z: [] },
  offset: { x: [], y: [], z: [] },
  accelNav: { x: [], y: [], z: [] },
};

const BluetoothContext = React.createContext<BluetoothContextValue | null>(null);

const useBluetoothInternal = (): BluetoothContextValue => {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<PeripheralInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PeripheralInfo | null>(null);
  const [dataHistory, setDataHistory] = useState<ImuDataHistory>(emptyHistory);
  // UI 刷新间隔（ms），只影响图表渲染频率，不影响数据接收频率
  const [uiRefreshMs, setUiRefreshMs] = useState(200);
  // 上一秒收到的消息数（用于展示/监控输入频率）
  const [lastSecondMessageCount, setLastSecondMessageCount] = useState(0);
  // 高频数据缓存：onmessage 只更新这里，避免每条消息都触发 React 重渲染
  const dataHistoryRef = useRef<ImuDataHistory>(emptyHistory);
  // 1s 内的消息计数器（由定时器每秒读取并清零）
  const messageCountRef = useRef(0);

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

  const startScan = useCallback(async () => {
    try {
      await imuApi.startScan();
      setScanning(true);
    } catch (e) {
      message.error('Failed to start scan');
      console.error(e);
    }
  }, []);

  const stopScan = useCallback(async () => {
    try {
      await imuApi.stopScan();
      setScanning(false);
    } catch (e) {
      message.error('Failed to stop scan');
      console.error(e);
    }
  }, []);

  const toggleScan = useCallback(async () => {
    if (scanning) {
      await stopScan();
    } else {
      await startScan();
    }
  }, [scanning, startScan, stopScan]);

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
        // Try to find in current list if api response data is missing but success is true
        const deviceInList = devices.find(d => d.id === deviceId);
        if (res.success) {
          // If we found it in the list, use that info, otherwise just use ID
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
    dataHistoryRef.current = emptyHistory;
    messageCountRef.current = 0;
    // 每秒统计一次接收消息数
    const messageRateTimer = setInterval(() => {
      setLastSecondMessageCount(messageCountRef.current);
      messageCountRef.current = 0;
    }, 1000);
    // 按 UI 刷新频率将缓存快照推入 state，触发图表重绘
    const uiRefreshTimer = setInterval(() => {
      setDataHistory(dataHistoryRef.current);
    }, Math.max(16, uiRefreshMs)); // 最快 60 FPS
    channel.onmessage = (msg: ResponseData) => {
      // 每条消息只更新缓存与计数，不触发 UI 更新
      messageCountRef.current += 1;
      // console.log('Received IMU data:', msg);
      const imuData = msg.raw_data;
      const prev = dataHistoryRef.current;
      const newTime = [...prev.time, imuData.timestamp_ms / 1000].slice(-100);
      dataHistoryRef.current = {
        time: newTime,
        accel: {
          x: [...prev.accel.x, imuData.accel_no_g.x].slice(-1000),
          y: [...prev.accel.y, imuData.accel_no_g.y].slice(-1000),
          z: [...prev.accel.z, imuData.accel_no_g.z].slice(-1000),
        },
        accelWithG: {
          x: [...prev.accelWithG.x, imuData.accel_with_g.x].slice(-1000),
          y: [...prev.accelWithG.y, imuData.accel_with_g.y].slice(-1000),
          z: [...prev.accelWithG.z, imuData.accel_with_g.z].slice(-1000),
        },
        gyro: {
          x: [...prev.gyro.x, imuData.gyro.x].slice(-1000),
          y: [...prev.gyro.y, imuData.gyro.y].slice(-1000),
          z: [...prev.gyro.z, imuData.gyro.z].slice(-1000),
        },
        angle: {
          x: [...prev.angle.x, imuData.angle.x].slice(-1000),
          y: [...prev.angle.y, imuData.angle.y].slice(-1000),
          z: [...prev.angle.z, imuData.angle.z].slice(-1000),
        },
        quat: {
          w: [...prev.quat.w, imuData.quat.w].slice(-1000),
          x: [...prev.quat.x, imuData.quat.x].slice(-1000),
          y: [...prev.quat.y, imuData.quat.y].slice(-1000),
          z: [...prev.quat.z, imuData.quat.z].slice(-1000),
        },
        offset: {
          x: [...prev.offset.x, imuData.offset.x].slice(-1000),
          y: [...prev.offset.y, imuData.offset.y].slice(-1000),
          z: [...prev.offset.z, imuData.offset.z].slice(-1000),
        },
        accelNav: {
          x: [...prev.accelNav.x, imuData.accel_nav.x].slice(-1000),
          y: [...prev.accelNav.y, imuData.accel_nav.y].slice(-1000),
          z: [...prev.accelNav.z, imuData.accel_nav.z].slice(-1000),
        },
      };
    };

    imuApi.subscribeOutput(channel);
    return () => {
      // 断开/切换设备时清理定时器，避免泄漏
      clearInterval(messageRateTimer);
      clearInterval(uiRefreshTimer);
    };
  }, [connectedDevice, uiRefreshMs]);

  const disconnect = useCallback(async () => {
    try {
      await imuApi.disconnect();
      setConnectedDevice(null);
      setDevices([]);
      setScanning(false);
      // 断开时清空 UI 数据与缓存
      setDataHistory(emptyHistory);
      dataHistoryRef.current = emptyHistory;
      // 断开时清空上一秒计数显示
      setLastSecondMessageCount(0);
    } catch (e) {
      console.error(e);
      message.error('Disconnect failed');
    }
  }, []);

  return {
    scanning,
    devices,
    connectedDevice,
    dataHistory,
    uiRefreshMs,
    setUiRefreshMs,
    lastSecondMessageCount,
    startScan,
    stopScan,
    toggleScan,
    connect,
    disconnect
  };
};

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
