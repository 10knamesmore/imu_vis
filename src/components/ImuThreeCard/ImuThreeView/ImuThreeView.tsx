import { Splitter } from "antd";
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
export const ImuThreeView = (props: ImuThreeViewProps) => {
  return (
    <div className={styles.imuThreeContainer}>
      <Splitter className={styles.imuThreeSplitter}>
        <Splitter.Panel className={styles.leftPanel} defaultSize="35%" min="20%" max="80%">
          <ImuModelView {...props} />
        </Splitter.Panel>
        <Splitter.Panel className={styles.rightPanel} min="20%">
          <ImuTrajectoryView {...props} />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};
