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
    replaying,
    replaySamples,
    replaySessionId,
    replayVersion,
    restartReplay,
    exitReplay,
    toggleRecording,
  } = useBluetooth();
  // 控制是否显示图表, TODO: 由card内部决定
  const [showCharts, _] = useState(true);
  // 检查是否已连接设备
  const deviceConnected = useMemo(() => connectedDevice !== null, [connectedDevice]);
  const hasReplayData = useMemo(
    () => replaying && (replaySamples?.length ?? 0) > 0,
    [replaying, replaySamples]
  );
  const sourceEnabled = useMemo(() => deviceConnected || hasReplayData, [deviceConnected, hasReplayData]);

  // 图表数据源：回放重播时保持不重置，避免图表重新滚动。
  const chartSource = useImuSource({
    enabled: sourceEnabled,
    capacity: 250 * 200,
    replaying: hasReplayData,
    replaySamples,
    replaySessionId,
  });

  // Three 数据源：使用 replayVersion 触发重播。
  const replayThreeSource = useImuSource({
    enabled: hasReplayData,
    capacity: 250 * 200,
    replaying: hasReplayData,
    replaySamples,
    replaySessionId,
    replayVersion,
  });
  const threeSource = hasReplayData ? replayThreeSource : chartSource;

  const chartItems = [
    {
      key: "accel",
      label: "加速度（无重力）",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="加速度 (m/s^2)"
            visibilityKey="accel"
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="偏航 / 俯仰 / 横滚 (deg)"
            visibilityKey="angle"
            series={[
              { name: "X", color: "#4cc9f0", getBuffer: (w) => w.builtin.angleX },
              { name: "Y", color: "#f8961e", getBuffer: (w) => w.builtin.angleY },
              { name: "Z", color: "#43aa8b", getBuffer: (w) => w.builtin.angleZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "accel-with-g",
      label: "加速度（含重力）",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="Acceleration (m/s^2)"
            visibilityKey="accel-with-g"
            series={[
              { name: "X", color: "#9ad1ff", getBuffer: (w) => w.builtin.accelWithGX },
              { name: "Y", color: "#ffda7a", getBuffer: (w) => w.builtin.accelWithGY },
              { name: "Z", color: "#8ff0c4", getBuffer: (w) => w.builtin.accelWithGZ },
            ]}
          />
        </div>
      ),
    },
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="m"
            visibilityKey="offset"
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="导航加速度 (m/s^2)"
            visibilityKey="nav"
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="角度差值 (deg)"
            visibilityKey="angle-delta"
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="速度 (m/s)"
            visibilityKey="velocity"
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
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="位置 (m)"
            visibilityKey="position"
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
          sourceEnabled={deviceConnected}
          connectedDevice={deviceConnected}
          recording={recording}
          recordingStatus={recordingStatus}
          replaying={replaying}
          canRestartReplay={(replaySamples?.length ?? 0) > 0}
          onRestartReplay={restartReplay}
          onExitReplay={exitReplay}
          onToggleRecording={toggleRecording}
        />
      </Card>

      <div className={styles.mainGrid}>
        <div className={styles.topRow}>
          <ImuThreeCard source={threeSource} replayTrailResetToken={replayVersion} />
        </div>

        <div className={styles.bottomRow}>
          <ImuChartTabs items={chartItems} />

        </div>
      </div>
    </div>
  );
};
