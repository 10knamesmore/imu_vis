import { createContext, type Dispatch, type SetStateAction } from 'react';

import type {
  ImuHistorySnapshot,
  PeripheralInfo,
  ProcessorPipelineConfig,
  RecordingMeta,
  RecordingStatus,
  ResponseData,
} from '../../types';

export type DataMode = 'live' | 'replay';

export type BluetoothContextValue = {
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
  setUiRefreshMs: Dispatch<SetStateAction<number>>;
  /** 最近 1 秒接收到的数据条数。 */
  lastSecondMessageCount: number;
  /** 当前是否正在录制。 */
  recording: boolean;
  /** 当前录制状态详情。 */
  recordingStatus: RecordingStatus | null;
  /** 录制会话列表。 */
  recordings: RecordingMeta[];
  /** 当前全局数据模式（live/replay）。 */
  dataMode: DataMode;
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

export const BluetoothContext = createContext<BluetoothContextValue | null>(null);
