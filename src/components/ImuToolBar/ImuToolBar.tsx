import React, { useState } from "react";
import { Button, Modal, Tag, Tooltip } from "antd";

import { RecordingsPanel } from "../RecordingsPanel";
import type { RecordingStatus } from "../../types";

import styles from "./ImuToolBar.module.scss";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";

type ImuToolBarProps = {
  /** 数据源是否可用（已连接设备或其他可提供数据的状态）。 */
  sourceEnabled: boolean;
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
  /** 点击“重新回放”时的回调。 */
  onRestartReplay: () => void;
  /** 点击“切到实时”时的回调。 */
  onExitReplay: () => void;
  /** 点击“开始/停止录制”时的回调。 */
  onToggleRecording: () => void;
};

export const ImuToolBar: React.FC<ImuToolBarProps> = ({
  sourceEnabled,
  connectedDevice,
  recording,
  recordingStatus,
  replaying,
  canRestartReplay,
  onRestartReplay,
  onExitReplay,
  onToggleRecording,
}) => {
  const [recordingsOpen, setRecordingsOpen] = useState(false);

  return (
    <>
      <div className={styles.imuToolbar}>
        <div className={styles.imuStatus}>
          <span className={styles.imuStatusLabel}>IMU 数据流</span>
          <Tag color={sourceEnabled ? "green" : "default"}>
            {sourceEnabled ? "已连接" : "未连接"}
          </Tag>
          <Tag color={replaying ? "orange" : "default"}>
            {replaying ? "回放模式" : "实时模式"}
          </Tag>
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
            <Tag color={recording ? "red" : "default"}>
              {recording ? `录制中: ${recordingStatus?.session_id ?? "-"}` : "录制: 关闭"}
            </Tag>
          </div>
          <div className={styles.imuControl}>
            <Tooltip title={canRestartReplay ? "" : "请先加载一条录制数据"}>
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
