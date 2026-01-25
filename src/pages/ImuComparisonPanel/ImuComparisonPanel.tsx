import React, { useMemo, useState } from "react";
import { Card } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { ImuThreeCard } from "../../components/ImuThreeCard";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
import { ImuChartTabs } from "../../components/ImuChartTabs";
import { ImuToolBar } from "../../components/ImuToolBar";

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

  const [showCharts, _] = useState(true);
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);

  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 250 * 200 });

  const chartItems = [
    {
      key: "angle-delta",
      label: "姿态差值",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
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
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="速度 (m/s)"
            series={[
              { name: "X", color: "#4cc9f0", getValues: (s) => s.calculated.velocity.x },
              { name: "Y", color: "#f8961e", getValues: (s) => s.calculated.velocity.y },
              { name: "Z", color: "#43aa8b", getValues: (s) => s.calculated.velocity.z },
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
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="位置 (m)"
            series={[
              { name: "X", color: "#b8c0ff", getValues: (s) => s.calculated.position.x },
              { name: "Y", color: "#ffd6a5", getValues: (s) => s.calculated.position.y },
              { name: "Z", color: "#caffbf", getValues: (s) => s.calculated.position.z },
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
        <ImuToolBar
          sourceEnabled={sourceEnabled}
          connectedDevice={connectedDevice !== null}
          recording={recording}
          recordingStatus={recordingStatus}
          onToggleRecording={toggleRecording}
        />
      </Card>

      <div className={styles.mainGrid}>
        <div className={styles.leftColumn}>
          <ImuThreeCard source={imuSource} />
        </div>

        <div className={styles.rightColumn}>
          <ImuChartTabs items={chartItems} />

        </div>
      </div>
    </div>
  );
};
