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
            refreshMs={16}
            label="加速度 (m/s^2)"
            series={[
              { name: "X", color: "#57b2ff", getBuffer: (w) => w.builtin.accelX },
              { name: "Y", color: "#ffb74d", getBuffer: (w) => w.builtin.accelY },
              { name: "Z", color: "#88e0a5", getBuffer: (w) => w.builtin.accelZ },
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
    //         refreshMs={16}
    //         label="Gyroscope (deg/s)"
    //         series={[
    //           { name: "X", color: "#9b87ff", getBuffer: (w) => w.builtin.gyroX },
    //           { name: "Y", color: "#ff7aa2", getBuffer: (w) => w.builtin.gyroY },
    //           { name: "Z", color: "#ffd166", getBuffer: (w) => w.builtin.gyroZ },
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
            refreshMs={16}
            label="偏航 / 俯仰 / 横滚 (deg)"
            series={[
              { name: "X", color: "#4cc9f0", getBuffer: (w) => w.builtin.angleX },
              { name: "Y", color: "#f8961e", getBuffer: (w) => w.builtin.angleY },
              { name: "Z", color: "#43aa8b", getBuffer: (w) => w.builtin.angleZ },
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
    //         refreshMs={16}
    //         label="Acceleration (m/s^2)"
    //         series={[
    //           { name: "X", color: "#9ad1ff", getBuffer: (w) => w.builtin.accelWithGX },
    //           { name: "Y", color: "#ffda7a", getBuffer: (w) => w.builtin.accelWithGY },
    //           { name: "Z", color: "#8ff0c4", getBuffer: (w) => w.builtin.accelWithGZ },
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
    //         refreshMs={16}
    //         label="Quaternion"
    //         series={[
    //           { name: "W", color: "#f07167", getBuffer: (w) => w.builtin.quatW },
    //           { name: "X", color: "#00afb9", getBuffer: (w) => w.builtin.quatX },
    //           { name: "Y", color: "#fed9b7", getBuffer: (w) => w.builtin.quatY },
    //           { name: "Z", color: "#fdfcdc", getBuffer: (w) => w.builtin.quatZ },
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
            refreshMs={16}
            label="m"
            series={[
              { name: "X", color: "#4d96ff", getBuffer: (w) => w.builtin.offsetX },
              { name: "Y", color: "#6bffb8", getBuffer: (w) => w.builtin.offsetY },
              { name: "Z", color: "#ff6b6b", getBuffer: (w) => w.builtin.offsetZ },
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
            refreshMs={16}
            label="导航加速度 (m/s^2)"
            series={[
              { name: "X", color: "#b8c0ff", getBuffer: (w) => w.builtin.accelNavX },
              { name: "Y", color: "#ffd6a5", getBuffer: (w) => w.builtin.accelNavY },
              { name: "Z", color: "#caffbf", getBuffer: (w) => w.builtin.accelNavZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "angle-delta",
      label: "姿态差值",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={imuSource}
            enabled={showCharts}
            refreshMs={16}
            label="角度差值 (deg)"
            series={[
              { name: "偏航 Δ", color: "#57b2ff", getBuffer: (w) => w.deltaAngleX },
              { name: "俯仰 Δ", color: "#ffb74d", getBuffer: (w) => w.deltaAngleY },
              { name: "横滚 Δ", color: "#88e0a5", getBuffer: (w) => w.deltaAngleZ },
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
            refreshMs={16}
            label="速度 (m/s)"
            series={[
              { name: "X", color: "#4cc9f0", getBuffer: (w) => w.calculated.velocityX },
              { name: "Y", color: "#f8961e", getBuffer: (w) => w.calculated.velocityY },
              { name: "Z", color: "#43aa8b", getBuffer: (w) => w.calculated.velocityZ },
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
            refreshMs={16}
            label="位置 (m)"
            series={[
              { name: "X", color: "#b8c0ff", getBuffer: (w) => w.calculated.positionX },
              { name: "Y", color: "#ffd6a5", getBuffer: (w) => w.calculated.positionY },
              { name: "Z", color: "#caffbf", getBuffer: (w) => w.calculated.positionZ },
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
