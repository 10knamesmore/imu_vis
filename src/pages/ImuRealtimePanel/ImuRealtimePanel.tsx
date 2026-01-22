import React, { useMemo, useState } from "react";
import { Button, Card, Switch, Tabs, message } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { imuApi } from "../../services/imu";

import { ImuThreeView } from "../../components/ImuThreeView";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
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
  // 控制是否显示轨迹
  const [showTrajectory, setShowTrajectory] = useState(true);
  // 控制是否显示图表, TODO: 由card内部决定
  const [showCharts, _] = useState(true);
  // 检查是否已连接设备
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);
  // 获取 IMU 数据源，缓冲区容量 4096
  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 4096 });

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
            label="偏航 / 俯仰 / 横滚 (deg)"
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
            label="偏移"
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
            label="导航加速度 (m/s^2)"
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
          <Card
            title="三维姿态"
            size="small"
            variant="outlined"
            className={styles.panelCard}
            extra={
              <div className={styles.imuControls}>
                <div className={styles.imuControl}>
                  <Button onClick={handleCalibrateZ} disabled={!connectedDevice}>
                    姿态校准
                  </Button>
                </div>
                <div className={styles.imuControl}>
                  <span>轨迹</span>
                  <Switch checked={showTrajectory} onChange={setShowTrajectory} />
                </div>
              </div>
            }
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

        </div>
      </div>
    </div>
  );
};
