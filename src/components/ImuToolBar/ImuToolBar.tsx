import React, { useState } from "react";
import { Button, Modal, Tag } from "antd";

import { RecordingsPanel } from "../RecordingsPanel";
import type { RecordingStatus } from "../../types";

import styles from "./ImuToolBar.module.scss";
import { SearchOutlined } from "@ant-design/icons";

type ImuToolBarProps = {
  sourceEnabled: boolean;
  connectedDevice: boolean;
  recording: boolean;
  recordingStatus: RecordingStatus | null;
  onToggleRecording: () => void;
};

export const ImuToolBar: React.FC<ImuToolBarProps> = ({
  sourceEnabled,
  connectedDevice,
  recording,
  recordingStatus,
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
        </div>
        <div className={styles.imuControls}>
          <div className={styles.imuControl}>
            <Button
              type={recording ? "primary" : "default"}
              danger={recording}
              onClick={onToggleRecording}
              disabled={!connectedDevice}
            >
              {recording ? "停止录制" : "开始录制"}
            </Button>
            <Tag color={recording ? "red" : "default"}>
              {recording ? `录制中: ${recordingStatus?.session_id ?? "-"}` : "录制: 关闭"}
            </Tag>
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
