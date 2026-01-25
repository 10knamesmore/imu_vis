import React, { useState } from "react";
import { Button, Card, Switch, Tooltip, message } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import type { ImuSource } from "../../hooks/useImuSource";
import { imuApi } from "../../services/imu";

import { ImuThreeView } from "./ImuThreeView";
import styles from "./ImuThreeCard.module.scss";
import type { AxisTrajectoryOption } from "./ImuThreeView/ImuThreeView";

type ImuThreeCardProps = {
  source: ImuSource;
};

export const ImuThreeCard: React.FC<ImuThreeCardProps> = ({ source }) => {
  const { connectedDevice } = useBluetooth();

  // 轨迹总开关（轴向量端点轨迹 + 未来原点轨迹）
  const [showTrajectory, setShowTrajectory] = useState(true);

  // 各轴轴向量端点轨迹开关
  const [axisTrajectoryOption, setAxisTrajectoryOption] =
    useState<AxisTrajectoryOption>({
      x: false,
      y: false,
      z: true
    });

  // 通过递增 token 触发子组件清空轨迹缓冲（轴向量端点轨迹 + 未来原点轨迹）
  const [trailResetToken, setTrailResetToken] = useState(0);

  // 是否使用后端计算姿态
  const [useCalculated, setUseCalculated] = useState(false);

  const handleCalibrateZ = async () => {
    const res = await imuApi.setAxisCalibration();
    if (res.success) {
      message.success("姿态已校准");
      // 校准后清空轨迹
      setTrailResetToken((token) => token + 1);
    } else {
      message.error(res.message || "姿态校准失败");
    }
  };

  const toggleAxis = (axis: keyof AxisTrajectoryOption, checked: boolean) => {
    setAxisTrajectoryOption((prev: AxisTrajectoryOption) => ({
      ...prev,
      [axis]: checked
    }));
  };

  return (
    <Card
      title="三维姿态"
      size="small"
      variant="outlined"
      className={styles.imuThreeCard}
      extra={
        <div className={styles.imuControls}>
          {/* 姿态校准 */}
          <div className={styles.imuControl}>
            <Tooltip
              title={
                connectedDevice ? (
                  <div>
                    X轴正方向对准屏幕
                    <br />
                    Y轴正方向对准左边
                    <br />
                    Z轴正方向向上
                  </div>
                ) : (
                  "请先连接设备"
                )
              }
            >
              <Button
                onClick={handleCalibrateZ}
                disabled={!connectedDevice}
              >
                姿态校准
              </Button>
            </Tooltip>
          </div>

          {/* 清空轨迹 */}
          <div className={styles.imuControl}>
            <Button onClick={() => setTrailResetToken((token) => token + 1)}>
              清空轨迹
            </Button>
          </div>

          {/* 数据源切换 */}
          <div className={styles.imuControl}>
            <span>使用计算数据</span>
            <Switch
              checked={useCalculated}
              onChange={(checked) => {
                setUseCalculated(checked);
                setTrailResetToken((token) => token + 1);
              }}
            />
          </div>

          {/* 轴向量端点轨迹控制 */}
          <div className={styles.imuControl}>
            <Tooltip
              title={
                <div style={{ minWidth: 120 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>X轴向量轨迹</span>
                    <Switch
                      size="small"
                      checked={axisTrajectoryOption.x}
                      onChange={(checked) => toggleAxis("x", checked)}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Y轴向量轨迹</span>
                    <Switch
                      size="small"
                      checked={axisTrajectoryOption.y}
                      onChange={(checked) => toggleAxis("y", checked)}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Z轴向量轨迹</span>
                    <Switch
                      size="small"
                      checked={axisTrajectoryOption.z}
                      onChange={(checked) => toggleAxis("z", checked)}
                    />
                  </div>
                </div>
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>轨迹</span>
                <Switch
                  checked={showTrajectory}
                  onChange={(checked) => {
                    setShowTrajectory(checked);
                    setTrailResetToken((token) => token + 1);
                  }}
                />
              </div>
            </Tooltip>
          </div>
        </div>
      }
      style={{ background: "#141414", border: "1px solid #303030" }}
      styles={{ header: { color: "white" } }}
    >
      <div className={styles.imuThreePanel}>
        <ImuThreeView
          source={source}
          scale={1}
          useCalculated={useCalculated}
          showTrajectory={showTrajectory}
          axisTrajectoryOption={axisTrajectoryOption}
          trailResetToken={trailResetToken}
        />
      </div>
    </Card>
  );
};
