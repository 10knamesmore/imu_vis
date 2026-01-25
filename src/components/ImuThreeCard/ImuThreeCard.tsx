import React, { useState } from "react";
import { Button, Card, Switch, Tooltip, message } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import type { ImuSource } from "../../hooks/useImuSource";
import { imuApi } from "../../services/imu";

import { ImuThreeView } from "./ImuThreeView";
import styles from "./ImuThreeCard.module.scss";

type ImuThreeCardProps = {
  source: ImuSource;
};

export const ImuThreeCard: React.FC<ImuThreeCardProps> = ({ source }) => {
  const { connectedDevice } = useBluetooth();
  const [showTrajectory, setShowTrajectory] = useState(true);

  const [useCalculated, setUseCalculated] = useState(false);

  const handleCalibrateZ = async () => {
    const res = await imuApi.setAxisCalibration();
    if (res.success) {
      message.success("姿态已校准");
    } else {
      message.error(res.message || "姿态校准失败");
    }
  };

  return (
    <Card
      title="三维姿态"
      size="small"
      variant="outlined"
      className={styles.imuThreeCard}
      extra={
        <div className={styles.imuControls}>
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
              <Button onClick={handleCalibrateZ} disabled={!connectedDevice}>
                姿态校准
              </Button>
            </Tooltip>
          </div>
          <div className={styles.imuControl}>
            <span>计算数据</span>
            <Switch checked={useCalculated} onChange={setUseCalculated} />
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
        <ImuThreeView
          source={source}
          showTrajectory={showTrajectory}
          scale={1}
          useCalculated={useCalculated}
        />
      </div>
    </Card>
  );
};
