import React, { useMemo, useState } from "react";
import { Card } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { ImuThreeCard } from "../../components/ImuThreeCard";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
import { ImuChartTabs } from "../../components/ImuChartTabs";
import { ImuToolBar } from "../../components/ImuToolBar";
import styles from "./ImuRealtimePanel.module.scss";

/**
 * IMU 实时可视化面板组件。
 */
export const ImuRealtimePanel: React.FC = () => {
  const {
    connectedDevice,
    recording,
    recordingStatus,
    toggleRecording,
  } = useBluetooth();
  // 控制是否显示图表, TODO: 由card内部决定
  const [showCharts, _] = useState(true);
  // 检查是否已连接设备
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);
  // 获取 IMU 数据源，缓冲区容量 4096
  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 250 * 200 });

  const chartItems = [
    {
      key: "accel",
      label: "加速度（无重力）",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="加速度 (m/s^2)"
            series={[
              { name: "X", color: "#57b2ff", getValues: (s) => s.builtin.accel.x },
              { name: "Y", color: "#ffb74d", getValues: (s) => s.builtin.accel.y },
              { name: "Z", color: "#88e0a5", getValues: (s) => s.builtin.accel.z },
            ]}
          />
        </div>
      ),
    },
    // {
    //   key: "gyro",
    //   label: "陀螺仪",
    //   children: (
    //     <div className={styles.imuChartPanel}>
    //       <ImuChartsCanvas
    //         source={imuSource}
    //         enabled={showCharts}
    //         refreshMs={40}
    //         label="Gyroscope (deg/s)"
    //         series={[
    //           { name: "X", color: "#9b87ff", getValues: (s) => s.builtin.gyro.x },
    //           { name: "Y", color: "#ff7aa2", getValues: (s) => s.builtin.gyro.y },
    //           { name: "Z", color: "#ffd166", getValues: (s) => s.builtin.gyro.z },
    //         ]}
    //       />
    //     </div>
    //   ),
    // },
    {
      key: "angle",
      label: "姿态角",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="偏航 / 俯仰 / 横滚 (deg)"
            series={[
              { name: "X", color: "#4cc9f0", getValues: (s) => s.builtin.angle.x },
              { name: "Y", color: "#f8961e", getValues: (s) => s.builtin.angle.y },
              { name: "Z", color: "#43aa8b", getValues: (s) => s.builtin.angle.z },
            ]}
          />
        </div>
      ),
    },
    // {
    //   key: "accel-with-g",
    //   label: "加速度（含重力）",
    //   children: (
    //     <div className={styles.imuChartPanel}>
    //       <ImuChartsCanvas
    //         source={imuSource}
    //         enabled={showCharts}
    //         refreshMs={40}
    //         label="Acceleration (m/s^2)"
    //         series={[
    //           { name: "X", color: "#9ad1ff", getValues: (s) => s.builtin.accelWithG.x },
    //           { name: "Y", color: "#ffda7a", getValues: (s) => s.builtin.accelWithG.y },
    //           { name: "Z", color: "#8ff0c4", getValues: (s) => s.builtin.accelWithG.z },
    //         ]}
    //       />
    //     </div>
    //   ),
    // },
    // {
    //   key: "quat",
    //   label: "四元数",
    //   children: (
    //     <div className={styles.imuChartPanel}>
    //       <ImuChartsCanvas
    //         source={imuSource}
    //         enabled={showCharts}
    //         refreshMs={40}
    //         label="Quaternion"
    //         series={[
    //           { name: "W", color: "#f07167", getValues: (s) => s.builtin.quat.w },
    //           { name: "X", color: "#00afb9", getValues: (s) => s.builtin.quat.x },
    //           { name: "Y", color: "#fed9b7", getValues: (s) => s.builtin.quat.y },
    //           { name: "Z", color: "#fdfcdc", getValues: (s) => s.builtin.quat.z },
    //         ]}
    //       />
    //     </div>
    //   ),
    // },
    {
      key: "offset",
      label: "偏移",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="偏移"
            series={[
              { name: "X", color: "#4d96ff", getValues: (s) => s.builtin.offset.x },
              { name: "Y", color: "#6bffb8", getValues: (s) => s.builtin.offset.y },
              { name: "Z", color: "#ff6b6b", getValues: (s) => s.builtin.offset.z },
            ]}
          />
        </div>
      ),
    },
    {
      key: "nav",
      label: "导航加速度",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
            enabled={showCharts}
            refreshMs={40}
            label="导航加速度 (m/s^2)"
            series={[
              { name: "X", color: "#b8c0ff", getValues: (s) => s.builtin.accelNav.x },
              { name: "Y", color: "#ffd6a5", getValues: (s) => s.builtin.accelNav.y },
              { name: "Z", color: "#caffbf", getValues: (s) => s.builtin.accelNav.z },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.imuRealtimePanel}>
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
