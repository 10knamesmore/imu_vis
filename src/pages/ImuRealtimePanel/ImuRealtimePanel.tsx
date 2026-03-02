import { useMemo, useState } from "react";
import { Card } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useImuSource } from "../../hooks/useImuSource";
import { useColorScheme } from "../../hooks/useColorScheme";
import { ImuThreeCard } from "../../components/ImuThreeCard";
import { ImuChartsCanvas } from "../../components/ImuChartsCanvas";
import { ImuChartTabs } from "../../components/ImuChartTabs";
import { ImuToolBar } from "../../components/ImuToolBar";
import styles from "./ImuRealtimePanel.module.scss";

/** 各组图表系列颜色：亮色主题下选用饱和度高的深色版本，确保在白底上清晰可读。 */
const CHART_COLORS = {
  dark: {
    xyz:    ['#57b2ff', '#ffb74d', '#88e0a5'] as const,
    angle:  ['#4cc9f0', '#f8961e', '#43aa8b'] as const,
    offset: ['#4d96ff', '#6bffb8', '#ff6b6b'] as const,
    nav:    ['#b8c0ff', '#ffd6a5', '#caffbf'] as const,
  },
  light: {
    xyz:    ['#2196f3', '#ff9800', '#4caf50'] as const,
    angle:  ['#00bcd4', '#ff5722', '#8e24aa'] as const,
    offset: ['#3f51b5', '#00bfa5', '#f44336'] as const,
    nav:    ['#9c27b0', '#ff6e40', '#8bc34a'] as const,
  },
} as const;

type ImuRealtimePanelProps = {
  /** 打开“设备”弹窗。 */
  onOpenDeviceModal: () => void;
};

/**
 * IMU 实时可视化面板组件。
 */
export const ImuRealtimePanel = ({
  onOpenDeviceModal,
}: ImuRealtimePanelProps) => {
  const {
    connectedDevice,
    recording,
    recordingStatus,
    recordings,
    replaying,
    replaySamples,
    replaySessionId,
    replayVersion,
    restartReplay,
    exitReplay,
    toggleRecording,
  } = useBluetooth();
  /** 跟踪图表区域是否折叠。 */
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  /** 图表展开时才驱动图表刷新，折叠时暂停绘制。 */
  const showCharts = useMemo(() => !chartsCollapsed, [chartsCollapsed]);
  /** 图表区域类名：折叠时让出高度给 Three 视图。 */
  const bottomRowClassName = useMemo(
    () => (chartsCollapsed ? `${styles.bottomRow} ${styles.bottomRowCollapsed}` : styles.bottomRow),
    [chartsCollapsed]
  );
  // 检查是否已连接设备
  const deviceConnected = useMemo(() => connectedDevice !== null, [connectedDevice]);
  const hasReplayData = useMemo(
    () => replaying && (replaySamples?.length ?? 0) > 0,
    [replaying, replaySamples]
  );
  const currentReplayMeta = useMemo(
    () => recordings.find((item) => item.id === replaySessionId) ?? null,
    [recordings, replaySessionId]
  );
  const restartReplayTooltip = useMemo(() => {
    const name = (currentReplayMeta?.name ?? "").trim() || "未命名";
    const startedAt = currentReplayMeta?.started_at_ms ?? replaySamples?.[0]?.timestamp_ms ?? null;
    const startedAtText = startedAt ? new Date(startedAt).toLocaleString() : "-";
    return (
      <div>
        <div>记录: {name}</div>
        <div>录制时间: {startedAtText}</div>
      </div>
    );
  }, [currentReplayMeta?.name, currentReplayMeta?.started_at_ms, replaySamples]);
  const sourceAvailable = useMemo(() => deviceConnected || hasReplayData, [deviceConnected, hasReplayData]);

  const { colorScheme } = useColorScheme();
  const C = CHART_COLORS[colorScheme];

  /** 切换图表区域折叠状态。 */
  const handleToggleChartsCollapsed = () => {
    setChartsCollapsed((prev) => !prev);
  };

  // 图表数据源：回放重播时保持不重置，避免图表重新滚动。
  const chartSource = useImuSource({
    enabled: sourceAvailable,
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

  const chartItems = useMemo(() => [
    {
      key: "accel",
      label: "加速度",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="加速度 (m/s^2)"
            visibilityKey="accel"
            series={[
              { name: "X", color: C.xyz[0], getBuffer: (w) => w.accelX },
              { name: "Y", color: C.xyz[1], getBuffer: (w) => w.accelY },
              { name: "Z", color: C.xyz[2], getBuffer: (w) => w.accelZ },
            ]}
          />
        </div>
      ),
    },
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
              { name: "X", color: C.angle[0], getBuffer: (w) => w.angleX },
              { name: "Y", color: C.angle[1], getBuffer: (w) => w.angleY },
              { name: "Z", color: C.angle[2], getBuffer: (w) => w.angleZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "velocity",
      label: "速度",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="速度 (m/s)"
            visibilityKey="velocity"
            series={[
              { name: "X", color: C.angle[0], getBuffer: (w) => w.velocityX },
              { name: "Y", color: C.angle[1], getBuffer: (w) => w.velocityY },
              { name: "Z", color: C.angle[2], getBuffer: (w) => w.velocityZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "position",
      label: "位置",
      children: (
        <div className={styles.imuChartPanel}>
          <ImuChartsCanvas
            source={chartSource}
            enabled={showCharts}
            refreshMs={16}
            label="位置 (m)"
            visibilityKey="position"
            series={[
              { name: "X", color: C.nav[0], getBuffer: (w) => w.positionX },
              { name: "Y", color: C.nav[1], getBuffer: (w) => w.positionY },
              { name: "Z", color: C.nav[2], getBuffer: (w) => w.positionZ },
            ]}
          />
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [chartSource, showCharts, C]);

  return (
    <div className={styles.imuRealtimePanel}>
      <div className={styles.toolbarInlineRow}>
        <Card
          size="small"
          variant="outlined"
          className={styles.toolbarCard}
          styles={{ body: { padding: "12px 16px" } }}
        >
          <ImuToolBar
            connectedDevice={deviceConnected}
            recording={recording}
            recordingStatus={recordingStatus}
            replaying={replaying}
            canRestartReplay={(replaySamples?.length ?? 0) > 0}
            restartReplayTooltip={restartReplayTooltip}
            onOpenDevice={onOpenDeviceModal}
            onRestartReplay={restartReplay}
            onExitReplay={exitReplay}
            onToggleRecording={toggleRecording}
          />
        </Card>
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.topRow}>
          <ImuThreeCard source={threeSource} replayTrailResetToken={replayVersion} />
        </div>

        <div className={bottomRowClassName}>
          <ImuChartTabs
            items={chartItems}
            collapsed={chartsCollapsed}
            onToggleCollapsed={handleToggleChartsCollapsed}
          />
        </div>
      </div>
    </div>
  );
};
