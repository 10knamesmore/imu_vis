import React, { useEffect, useRef, useState } from "react";
import { Button, Modal, Tag, Tooltip, message } from "antd";
import { ApiOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";

import { RecordingsPanel } from "../RecordingsPanel";
import type { RecordingStatus } from "../../types";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";

import styles from "./ImuToolBar.module.scss";

const DEV_MODE_TAP_COUNT = 5;
const DEV_MODE_TAP_TIMEOUT_MS = 1200;

type ImuToolBarProps = {
  /** 点击“设备”按钮时的回调。 */
  onOpenDevice: () => void;
  /** 是否已建立设备连接，用于控制需要实时设备的操作。 */
  connectedDevice: boolean;
  /** 当前是否处于录制中。 */
  recording: boolean;
  /** 当前录制状态详情（会话 ID、样本数等）。 */
  recordingStatus: RecordingStatus | null;
  /** 当前是否处于回放模式。 */
  replaying: boolean;
  /** 是否允许执行“重新回放”（已加载回放数据时为 true）。 */
  canRestartReplay: boolean;
  /** “重新回放”按钮提示文案（显示当前回放记录信息）。 */
  restartReplayTooltip?: React.ReactNode;
  /** 点击“重新回放”时的回调。 */
  onRestartReplay: () => void;
  /** 点击“切到实时”时的回调。 */
  onExitReplay: () => void;
  /** 点击“开始/停止录制”时的回调。 */
  onToggleRecording: () => void;
};

export const ImuToolBar: React.FC<ImuToolBarProps> = ({
  onOpenDevice,
  connectedDevice,
  recording,
  recordingStatus,
  replaying,
  canRestartReplay,
  restartReplayTooltip,
  onRestartReplay,
  onExitReplay,
  onToggleRecording,
}) => {
  const { isDeveloperMode, enableDeveloperMode } = useDeveloperMode();
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  /** 录制状态连击计数器。 */
  const recordingStatusTapCountRef = useRef(0);
  /** 连击计数重置定时器。 */
  const tapResetTimerRef = useRef<number | null>(null);

  /**
   * 清理连击重置定时器。
   */
  const clearTapResetTimer = () => {
    if (tapResetTimerRef.current !== null) {
      window.clearTimeout(tapResetTimerRef.current);
      tapResetTimerRef.current = null;
    }
  };

  /**
   * 处理“录制状态”点击，连续点击 5 次进入开发者模式。
   */
  const handleRecordingStatusTap = () => {
    if (isDeveloperMode) return;
    recordingStatusTapCountRef.current += 1;
    clearTapResetTimer();
    tapResetTimerRef.current = window.setTimeout(() => {
      recordingStatusTapCountRef.current = 0;
      tapResetTimerRef.current = null;
    }, DEV_MODE_TAP_TIMEOUT_MS);

    if (recordingStatusTapCountRef.current >= DEV_MODE_TAP_COUNT) {
      clearTapResetTimer();
      recordingStatusTapCountRef.current = 0;
      enableDeveloperMode();
      message.success("开发者模式已开启");
    }
  };

  /**
   * 组件卸载时清理定时器，避免泄漏。
   */
  useEffect(() => {
    return () => {
      clearTapResetTimer();
    };
  }, []);

  return (
    <>
      <div className={styles.imuToolbar}>
        <div className={styles.imuStatus}>
          <Button
            type="primary"
            icon={<ApiOutlined />}
            className={connectedDevice ? styles.deviceButtonConnected : undefined}
            onClick={onOpenDevice}
          >
            设备
          </Button>
          <Tag color={replaying ? "orange" : "default"}>
            {replaying ? "回放模式" : "实时模式"}
          </Tag>
          {isDeveloperMode && <Tag color="geekblue">开发者模式</Tag>}
        </div>
        <div className={styles.imuControls}>
          <div className={styles.imuControl}>
            <Tooltip title={connectedDevice ? "" : "请先连接设备"}>
              <Button
                type={recording ? "primary" : "default"}
                danger={recording}
                onClick={onToggleRecording}
                disabled={!connectedDevice}
              >
                {recording ? "停止录制" : "开始录制"}
              </Button>
            </Tooltip>
            <Tag
              color={recording ? "red" : "default"}
              className={styles.recordingStatusTag}
              onClick={handleRecordingStatusTap}
            >
              {recording ? `录制中: ${recordingStatus?.session_id ?? "-"}` : "录制: 关闭"}
            </Tag>
          </div>
          <div className={styles.imuControl}>
            <Tooltip title={canRestartReplay ? (restartReplayTooltip ?? "重新回放当前录制") : "请先加载一条录制数据"}>
              <Button
                icon={<ReloadOutlined />}
                onClick={onRestartReplay}
                disabled={!canRestartReplay}
              >
                重新回放
              </Button>
            </Tooltip>
          </div>
          <div className={styles.imuControl}>
            <Button onClick={onExitReplay} disabled={!replaying}>
              切到实时
            </Button>
          </div>
          <div className={styles.imuControl}>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => setRecordingsOpen(true)}>录制记录</Button>
          </div>
        </div>
      </div>
      <Modal
        title="录制记录"
        open={recordingsOpen}
        onCancel={() => setRecordingsOpen(false)}
        footer={null}
        width={960}
        destroyOnHidden
      >
        <RecordingsPanel embedded />
      </Modal>
    </>
  );
};
