import React, { useMemo, useState } from "react";
import { Card, Col, Row, Switch, Tag } from "antd";
import { useBluetooth } from "../hooks/useBluetooth";
import { useImuSource } from "../hooks/useImuSource";
import { ImuThreeView } from "./ImuThreeView";
import { ImuChartsCanvas } from "./ImuChartsCanvas";

export const ImuRealtimePanel: React.FC = () => {
  const { connectedDevice } = useBluetooth();
  // 控制是否显示轨迹
  const [showTrajectory, setShowTrajectory] = useState(true);
  // 控制是否显示图表
  const [showCharts, setShowCharts] = useState(true);
  // 检查是否已连接设备
  const sourceEnabled = useMemo(() => connectedDevice !== null, [connectedDevice]);
  // 获取 IMU 数据源，缓冲区容量 4096
  const imuSource = useImuSource({ enabled: sourceEnabled, capacity: 4096 });

  return (
    <div className="imu-realtime-panel">
      <Row gutter={[16, 16]}>
        {/* 工具栏：显示状态和控制开关 */}
        <Col span={24}>
          <Card
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ body: { padding: "12px 16px" } }}
          >
            <div className="imu-toolbar">
              <div className="imu-status">
                <span className="imu-status-label">IMU Stream</span>
                <Tag color={sourceEnabled ? "green" : "default"}>
                  {sourceEnabled ? "Connected" : "Idle"}
                </Tag>
              </div>
              <div className="imu-controls">
                <div className="imu-control">
                  <span>Trajectory</span>
                  <Switch checked={showTrajectory} onChange={setShowTrajectory} />
                </div>
                <div className="imu-control">
                  <span>Charts</span>
                  <Switch checked={showCharts} onChange={setShowCharts} />
                </div>
              </div>
            </div>
          </Card>
        </Col>

        {/* 三维姿态可视化 */}
        <Col span={24}>
          <Card
            title="三维姿态"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-three-panel">
              <ImuThreeView source={imuSource} showTrajectory={showTrajectory} scale={1} />
            </div>
          </Card>
        </Col>

        {/* 加速度（无重力）图表 */}
        <Col span={24}>
          <Card
            title="加速度（无重力）"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
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
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="陀螺仪"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
              <ImuChartsCanvas
                source={imuSource}
                enabled={showCharts}
                refreshMs={40}
                label="Gyroscope (deg/s)"
                series={[
                  { name: "X", color: "#9b87ff", getValues: (s) => s.gyro.x },
                  { name: "Y", color: "#ff7aa2", getValues: (s) => s.gyro.y },
                  { name: "Z", color: "#ffd166", getValues: (s) => s.gyro.z },
                ]}
              />
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="姿态角"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
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
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="加速度（含重力）"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
              <ImuChartsCanvas
                source={imuSource}
                enabled={showCharts}
                refreshMs={40}
                label="Acceleration (m/s^2)"
                series={[
                  { name: "X", color: "#9ad1ff", getValues: (s) => s.accelWithG.x },
                  { name: "Y", color: "#ffda7a", getValues: (s) => s.accelWithG.y },
                  { name: "Z", color: "#8ff0c4", getValues: (s) => s.accelWithG.z },
                ]}
              />
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="四元数"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
              <ImuChartsCanvas
                source={imuSource}
                enabled={showCharts}
                refreshMs={40}
                label="Quaternion"
                series={[
                  { name: "W", color: "#f07167", getValues: (s) => s.quat.w },
                  { name: "X", color: "#00afb9", getValues: (s) => s.quat.x },
                  { name: "Y", color: "#fed9b7", getValues: (s) => s.quat.y },
                  { name: "Z", color: "#fdfcdc", getValues: (s) => s.quat.z },
                ]}
              />
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="偏移"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
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
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="导航加速度"
            size="small"
            variant="outlined"
            style={{ background: "#141414", border: "1px solid #303030" }}
            styles={{ header: { color: "white" } }}
          >
            <div className="imu-chart-panel">
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
          </Card>
        </Col>
      </Row>
    </div>
  );
};
