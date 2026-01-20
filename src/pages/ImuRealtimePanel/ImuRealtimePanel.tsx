import React, { useMemo, useState } from "react";
import { Button, Card, Switch, Tabs, Tag, message } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { imuApi } from "../../services/imu";

import { RecordingsPanel } from "../../components/RecordingsPanel";
import { ImuThreeView } from "../../components/ImuThreeView";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
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
  // 控制是否显示轨迹
  const [showTrajectory, setShowTrajectory] = useState(true);
  // 控制是否显示图表
  const [showCharts, setShowCharts] = useState(true);
  // 检查是否已连接设备
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);
  // 获取 IMU 数据源，缓冲区容量 4096
  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 4096 });

  const handleCalibrateZ = async () => {
    const latest = imuSource.latestRef.current;
    if (!latest) {
      message.warning("No IMU data available");
      return;
    }
    const zOffset = latest.angle.z;
    const res = await imuApi.setZAxisOffset(zOffset);
    if (res.success) {
      message.success(`Z axis calibrated (${zOffset.toFixed(3)})`);
    } else {
      message.error(res.message || "Failed to calibrate Z axis");
    }
  };

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
            label="Acceleration (m/s^2)"
            series={[
              { name: "X", color: "#57b2ff", getValues: (s) => s.accel.x },
              { name: "Y", color: "#ffb74d", getValues: (s) => s.accel.y },
              { name: "Z", color: "#88e0a5", getValues: (s) => s.accel.z },
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
    //           { name: "X", color: "#9b87ff", getValues: (s) => s.gyro.x },
    //           { name: "Y", color: "#ff7aa2", getValues: (s) => s.gyro.y },
    //           { name: "Z", color: "#ffd166", getValues: (s) => s.gyro.z },
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
            label="Yaw / Pitch / Roll (deg)"
            series={[
              { name: "X", color: "#4cc9f0", getValues: (s) => s.angle.x },
              { name: "Y", color: "#f8961e", getValues: (s) => s.angle.y },
              { name: "Z", color: "#43aa8b", getValues: (s) => s.angle.z },
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
    //           { name: "X", color: "#9ad1ff", getValues: (s) => s.accelWithG.x },
    //           { name: "Y", color: "#ffda7a", getValues: (s) => s.accelWithG.y },
    //           { name: "Z", color: "#8ff0c4", getValues: (s) => s.accelWithG.z },
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
    //           { name: "W", color: "#f07167", getValues: (s) => s.quat.w },
    //           { name: "X", color: "#00afb9", getValues: (s) => s.quat.x },
    //           { name: "Y", color: "#fed9b7", getValues: (s) => s.quat.y },
    //           { name: "Z", color: "#fdfcdc", getValues: (s) => s.quat.z },
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
            label="Offset"
            series={[
              { name: "X", color: "#4d96ff", getValues: (s) => s.offset.x },
              { name: "Y", color: "#6bffb8", getValues: (s) => s.offset.y },
              { name: "Z", color: "#ff6b6b", getValues: (s) => s.offset.z },
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
            label="Acceleration (Nav)"
            series={[
              { name: "X", color: "#b8c0ff", getValues: (s) => s.accelNav.x },
              { name: "Y", color: "#ffd6a5", getValues: (s) => s.accelNav.y },
              { name: "Z", color: "#caffbf", getValues: (s) => s.accelNav.z },
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
        <div className={styles.imuToolbar}>
          <div className={styles.imuStatus}>
            <span className={styles.imuStatusLabel}>IMU Stream</span>
            <Tag color={sourceEnabled ? "green" : "default"}>
              {sourceEnabled ? "Connected" : "Idle"}
            </Tag>
          </div>
          <div className={styles.imuControls}>
            <div className={styles.imuControl}>
              <span>Trajectory</span>
              <Switch checked={showTrajectory} onChange={setShowTrajectory} />
            </div>
            <div className={styles.imuControl}>
              <span>Charts</span>
              <Switch checked={showCharts} onChange={setShowCharts} />
            </div>
            <div className={styles.imuControl}>
              <Button
                type={recording ? "primary" : "default"}
                danger={recording}
                onClick={toggleRecording}
                disabled={!connectedDevice}
              >
                {recording ? "Stop Recording" : "Start Recording"}
              </Button>
              <Tag color={recording ? "red" : "default"}>
                {recording ? `Recording: ${recordingStatus?.session_id ?? "-"}` : "Recording: Off"}
              </Tag>
            </div>
            <div className={styles.imuControl}>
              <Button onClick={handleCalibrateZ} disabled={!connectedDevice}>
                Z Axis Calibrate
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
