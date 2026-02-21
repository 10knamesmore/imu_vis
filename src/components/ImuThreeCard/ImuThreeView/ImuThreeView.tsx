import React from "react";
import { ImuSource } from "../../../hooks/useImuSource";
import styles from "./ImuThreeView.module.scss";
import { ImuModelView } from "./ImuModelView";
import { ImuTrajectoryView } from "./ImuTrajectoryView";
import { TrajectoryOption } from "./types";

export type { TrajectoryOption };

/**
 * 组件属性定义
 */
type ImuThreeViewProps = {
  /** IMU 数据源，包含最新的姿态数据 */
  source: ImuSource;
  /** 是否在视图中绘制轨迹（轴向量端点轨迹 + 未来原点轨迹） */
  showTrajectory: boolean;
  /** 轴向量端点轨迹配置 */
  trajectoryOption: TrajectoryOption;
  /** 触发轨迹清空的计数器（轴向量端点轨迹 + 未来原点轨迹） */
  trailResetToken: number;
};

/**
 * IMU 三维视图组件：包含模型视图和轨迹视图
 */
export const ImuThreeView: React.FC<ImuThreeViewProps> = (props) => {
  return (
    <div className={styles.imuThreeContainer}>
      <div className={styles.leftPanel}>
        <ImuModelView {...props} />
      </div>
      <div className={styles.rightPanel}>
        <ImuTrajectoryView {...props} />
      </div>
    </div>
  );
};
