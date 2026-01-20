import React, { useMemo, useState } from "react";
import { Button, Card, Switch, Tabs, Tag, message } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { useImuComparisonSource } from "../../hooks/useImuComparisonSource";
import { ImuThreeView } from "../../components/ImuThreeView";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
import { RecordingsPanel } from "../../components/RecordingsPanel";
import { imuApi } from "../../services/imu";

import styles from "./ImuComparisonPanel.module.scss";

/**
 * 原始数据与计算数据对比面板组件。
 */
export const ImuComparisonPanel: React.FC = () => {
  const {
    connectedDevice,
    recording,
    recordingStatus,
    toggleRecording,
  } = useBluetooth();

  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);

  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 4096 });
  const comparisonSource = useImuComparisonSource({ enabled: sourceEnabled, capacity: 4096 });

  /**
   * 触发姿态校准：由后端读取“当前姿态”并归零。
   */
  const handleCalibrateZ = async () => {
    const res = await imuApi.setAxisCalibration();
    if (res.success) {
      message.success("姿态已校准");
    } else {
      message.error(res.message || "姿态校准失败");
    }
  };

  const chartItems = [
    {
      key: "angle-delta",
      label: "姿态差值",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={comparisonSource}
            enabled={showCharts}
            refreshMs={40}
            label="角度差值 (deg)"
            series={[
              { name: "偏航 Δ", color: "#57b2ff", getValues: (s) => s.deltaAngle.x },
              { name: "俯仰 Δ", color: "#ffb74d", getValues: (s) => s.deltaAngle.y },
              { name: "横滚 Δ", color: "#88e0a5", getValues: (s) => s.deltaAngle.z },
            ]}
          />
        </div>
      ),
    },
    {
      key: "velocity",
      label: "速度（计算）",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={comparisonSource}
            enabled={showCharts}
            refreshMs={40}
            label="速度 (m/s)"
            series={[
              { name: "X", color: "#4cc9f0", getValues: (s) => s.velocity.x },
              { name: "Y", color: "#f8961e", getValues: (s) => s.velocity.y },
              { name: "Z", color: "#43aa8b", getValues: (s) => s.velocity.z },
            ]}
          />
        </div>
      ),
    },
    {
      key: "position",
      label: "位置（计算）",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={comparisonSource}
            enabled={showCharts}
            refreshMs={40}
            label="位置 (m)"
            series={[
              { name: "X", color: "#b8c0ff", getValues: (s) => s.position.x },
              { name: "Y", color: "#ffd6a5", getValues: (s) => s.position.y },
              { name: "Z", color: "#caffbf", getValues: (s) => s.position.z },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.imuComparisonPanel}>
      <Card
        size="small"
        variant="outlined"
        style={{ background: "#141414", border: "1px solid #303030" }}
        styles={{ body: { padding: "12px 16px" } }}
      >
        <div className={styles.imuToolbar}>
          <div className={styles.imuStatus}>
            <span className={styles.imuStatusLabel}>IMU 数据流</span>
            <Tag color={sourceEnabled ? "green" : "default"}>
              {sourceEnabled ? "已连接" : "未连接"}
            </Tag>
          </div>
          <div className={styles.imuControls}>
            <div className={styles.imuControl}>
              <span>轨迹</span>
              <Switch checked={showTrajectory} onChange={setShowTrajectory} />
            </div>
            <div className={styles.imuControl}>
              <span>图表</span>
              <Switch checked={showCharts} onChange={setShowCharts} />
            </div>
            <div className={styles.imuControl}>
              <Button
                type={recording ? "primary" : "default"}
                danger={recording}
                onClick={toggleRecording}
                disabled={!connectedDevice}
              >
                {recording ? "停止录制" : "开始录制"}
              </Button>
              <Tag color={recording ? "red" : "default"}>
                {recording ? `录制中: ${recordingStatus?.session_id ?? "-"}` : "录制: 关闭"}
              </Tag>
            </div>
            <div className={styles.imuControl}>
              <Button onClick={handleCalibrateZ} disabled={!connectedDevice}>
                姿态校准
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className={styles.mainGrid}>
        <div className={styles.leftColumn}>
          <Card
            title="三维姿态"
            size="small"
            variant="outlined"
            className={styles.panelCard}
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className={styles.imuThreePanel}>
              <ImuThreeView source={imuSource} showTrajectory={showTrajectory} scale={1} />
            </div>
          </Card>
        </div>

        <div className={styles.rightColumn}>
          <Card
            size="small"
            variant="outlined"
            className={styles.panelCard}
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "blue" }, body: { paddingTop: 0 } }}
          >
            <Tabs
              className={styles.chartTabs}
              items={chartItems}
              destroyOnHidden
            />
          </Card>

          <RecordingsPanel />
        </div>
      </div>
    </div>
  );
};
