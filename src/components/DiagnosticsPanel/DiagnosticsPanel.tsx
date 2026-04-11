import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "antd";

import { useDiagnostics } from "../../hooks/useDiagnostics";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useColorScheme } from "../../hooks/useColorScheme";
import { ImuChartsCanvas } from "../ImuChartsCanvas";
import type { PipelineDiagnostics } from "../../types";

import styles from "./DiagnosticsPanel.module.scss";

type DiagnosticsPanelProps = {
  enabled: boolean;
};

const DIAG_COLORS = {
  dark: {
    bias:   ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8'] as const,
    filter: ['#ff6b6b', '#6bcb77', '#4d96ff', '#ff922b'] as const,
    zupt:   ['#4cc9f0', '#f8961e', '#43aa8b'] as const,
    nav:    ['#57b2ff', '#ffb74d', '#88e0a5', '#b8c0ff'] as const,
    eskf:   ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8', '#4cc9f0', '#f8961e', '#43aa8b'] as const,
    perf:   ['#4cc9f0', '#f8961e', '#ff6b6b', '#6bcb77', '#4d96ff'] as const,
  },
  light: {
    bias:   ['#e03131', '#f59f00', '#2f9e44', '#1971c2', '#e8590c', '#9c36b5'] as const,
    filter: ['#e03131', '#2f9e44', '#1971c2', '#e8590c'] as const,
    zupt:   ['#0c8599', '#e8590c', '#2b8a3e'] as const,
    nav:    ['#1971c2', '#e8590c', '#2f9e44', '#7048e8'] as const,
    eskf:   ['#e03131', '#f59f00', '#2f9e44', '#1971c2', '#e8590c', '#9c36b5', '#0c8599', '#e67700', '#2b8a3e'] as const,
    perf:   ['#0c8599', '#e8590c', '#e03131', '#2f9e44', '#1971c2'] as const,
  },
} as const;

/** EMA 平滑状态，避免数值跳动。 */
type SmoothedMetrics = {
  bleIntervalMs: number;
  processUs: number;
  upstreamQ: number;
  downstreamQ: number;
  recordQ: number;
  gyroNorm: number;
  accelNorm: number;
  /** 饱和帧占比 EMA，取值 [0, 1]。 */
  saturatedRate: number;
};

const EMA_ALPHA = 0.05; // ~20 帧收敛
const ema = (prev: number, cur: number) => prev + EMA_ALPHA * (cur - prev);

/**
 * ZUPT 实时状态 + 性能仪表盘。
 *
 * 使用 EMA 平滑数值显示，每 200ms 刷新一次 UI（避免数值闪烁）。
 */
const StatusDashboard = ({ latestRef }: { latestRef: React.RefObject<PipelineDiagnostics | null> }) => {
  const smoothRef = useRef<SmoothedMetrics | null>(null);
  const [display, setDisplay] = useState<{ snap: PipelineDiagnostics; smooth: SmoothedMetrics } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRenderRef = useRef(0);

  useEffect(() => {
    const tick = (now: number) => {
      const latest = latestRef.current;
      if (latest) {
        // 更新 EMA（每帧都算）
        if (!smoothRef.current) {
          smoothRef.current = {
            bleIntervalMs: latest.perf_ble_interval_ms,
            processUs: latest.perf_process_us,
            upstreamQ: latest.perf_upstream_queue_len,
            downstreamQ: latest.perf_downstream_queue_len,
            recordQ: latest.perf_record_queue_len,
            gyroNorm: latest.zupt_gyro_norm,
            accelNorm: latest.zupt_accel_norm,
            saturatedRate: latest.accel_saturated ? 1 : 0,
          };
        } else {
          const s = smoothRef.current;
          s.bleIntervalMs = ema(s.bleIntervalMs, latest.perf_ble_interval_ms);
          s.processUs = ema(s.processUs, latest.perf_process_us);
          s.upstreamQ = ema(s.upstreamQ, latest.perf_upstream_queue_len);
          s.downstreamQ = ema(s.downstreamQ, latest.perf_downstream_queue_len);
          s.recordQ = ema(s.recordQ, latest.perf_record_queue_len);
          s.gyroNorm = ema(s.gyroNorm, latest.zupt_gyro_norm);
          s.accelNorm = ema(s.accelNorm, latest.zupt_accel_norm);
          s.saturatedRate = ema(s.saturatedRate, latest.accel_saturated ? 1 : 0);
        }
        // 200ms 刷新一次 UI
        if (now - lastRenderRef.current > 200) {
          lastRenderRef.current = now;
          setDisplay({ snap: latest, smooth: { ...smoothRef.current } });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [latestRef]);

  if (!display) {
    return <div className={styles.statusRow}>等待诊断数据...</div>;
  }

  const { snap, smooth } = display;
  const isStatic = snap.zupt_is_static;
  const fpsEstimate = smooth.bleIntervalMs > 0.5 ? (1000 / smooth.bleIntervalMs).toFixed(0) : "--";

  return (
    <div className={styles.statusRow}>
      <div className={styles.statusCard}>
        <span className={isStatic ? styles.ledGreen : styles.ledRed} />
        <span className={styles.statusLabel}>{isStatic ? "静止" : "运动"}</span>
        <span className={styles.statusMono}>g:{smooth.gyroNorm.toFixed(3)} a:{smooth.accelNorm.toFixed(3)}</span>
      </div>
      <div className={styles.statusCard}>
        <span className={styles.statusLabel}>帧率</span>
        <span className={styles.statusValue}>{fpsEstimate}</span>
        <span className={styles.statusUnit}>Hz</span>
        <span className={styles.statusMono}>{smooth.bleIntervalMs.toFixed(1)}ms</span>
      </div>
      <div className={styles.statusCard}>
        <span className={styles.statusLabel}>处理</span>
        <span className={styles.statusValue}>{smooth.processUs.toFixed(0)}</span>
        <span className={styles.statusUnit}>us</span>
      </div>
      <div className={styles.statusCard}>
        <span className={styles.statusLabel}>队列</span>
        <span className={styles.statusMono}>
          {smooth.upstreamQ.toFixed(0)}/{smooth.downstreamQ.toFixed(0)}/{smooth.recordQ.toFixed(0)}
        </span>
      </div>
      <div className={styles.statusCard}>
        <span className={styles.statusLabel}>ZUPT 计数</span>
        <span className={styles.statusMono}>in:{snap.zupt_enter_count} out:{snap.zupt_exit_count}</span>
      </div>
      <div className={styles.statusCard}>
        <span className={(snap.accel_saturated || smooth.saturatedRate > 0.01) ? styles.ledRed : styles.ledGreen} />
        <span className={styles.statusLabel}>加速度饱和</span>
        <span className={styles.statusMono}>
          {snap.accel_saturated ? "★ 当前帧" : `${(smooth.saturatedRate * 100).toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
};

/**
 * 管线诊断面板。
 *
 * 包含实时状态仪表盘 + 多标签页时序图表。
 * 仅在开发者模式下可见，切到此标签页时自动订阅诊断数据流。
 */
export const DiagnosticsPanel = ({ enabled }: DiagnosticsPanelProps) => {
  const { connectedDevice } = useBluetooth();
  const deviceConnected = connectedDevice !== null;
  const diagEnabled = enabled && deviceConnected;
  const { bufferRef, latestRef } = useDiagnostics(diagEnabled);
  const { colorScheme } = useColorScheme();
  const C = DIAG_COLORS[colorScheme];

  const diagSource = useMemo(() => ({ bufferRef }), [bufferRef]);

  const chartTabs = useMemo(() => [
    {
      key: "bias",
      label: "标定偏置",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="偏置值"
            visibilityKey="diag-bias"
            series={[
              { name: "accel_bias.x", color: C.bias[0], getBuffer: (w: any) => w.calAccelBiasX },
              { name: "accel_bias.y", color: C.bias[1], getBuffer: (w: any) => w.calAccelBiasY },
              { name: "accel_bias.z", color: C.bias[2], getBuffer: (w: any) => w.calAccelBiasZ },
              { name: "gyro_bias.x", color: C.bias[3], getBuffer: (w: any) => w.calGyroBiasX },
              { name: "gyro_bias.y", color: C.bias[4], getBuffer: (w: any) => w.calGyroBiasY },
              { name: "gyro_bias.z", color: C.bias[5], getBuffer: (w: any) => w.calGyroBiasZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "filter",
      label: "滤波效果",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="加速度 X 轴 (m/s2) 滤波前后"
            visibilityKey="diag-filter"
            series={[
              { name: "pre.x", color: C.filter[0], getBuffer: (w: any) => w.filtAccelPreX },
              { name: "post.x", color: C.filter[1], getBuffer: (w: any) => w.filtAccelPostX },
              { name: "pre.y", color: C.filter[2], getBuffer: (w: any) => w.filtAccelPreY },
              { name: "post.y", color: C.filter[3], getBuffer: (w: any) => w.filtAccelPostY },
            ]}
          />
        </div>
      ),
    },
    {
      key: "zupt",
      label: "ZUPT",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="ZUPT 检测信号"
            visibilityKey="diag-zupt"
            series={[
              { name: "gyro_norm", color: C.zupt[0], getBuffer: (w: any) => w.zuptGyroNorm },
              { name: "accel_norm", color: C.zupt[1], getBuffer: (w: any) => w.zuptAccelNorm },
              { name: "is_static", color: C.zupt[2], getBuffer: (w: any) => w.zuptIsStatic },
            ]}
          />
        </div>
      ),
    },
    {
      key: "nav",
      label: "导航",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="世界系线加速度 (m/s2) + dt"
            visibilityKey="diag-nav"
            series={[
              { name: "a_lin.x", color: C.nav[0], getBuffer: (w: any) => w.navLinAccelX },
              { name: "a_lin.y", color: C.nav[1], getBuffer: (w: any) => w.navLinAccelY },
              { name: "a_lin.z", color: C.nav[2], getBuffer: (w: any) => w.navLinAccelZ },
              { name: "dt (s)", color: C.nav[3], getBuffer: (w: any) => w.navDt },
            ]}
          />
        </div>
      ),
    },
    {
      key: "eskf",
      label: "ESKF",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="ESKF 协方差(vel) + 偏差估计"
            visibilityKey="diag-eskf"
            series={[
              { name: "cov_vel.x", color: C.eskf[0], getBuffer: (w: any) => w.eskfCovVelX },
              { name: "cov_vel.y", color: C.eskf[1], getBuffer: (w: any) => w.eskfCovVelY },
              { name: "cov_vel.z", color: C.eskf[2], getBuffer: (w: any) => w.eskfCovVelZ },
              { name: "bg.x", color: C.eskf[3], getBuffer: (w: any) => w.eskfBiasGyroX },
              { name: "bg.y", color: C.eskf[4], getBuffer: (w: any) => w.eskfBiasGyroY },
              { name: "bg.z", color: C.eskf[5], getBuffer: (w: any) => w.eskfBiasGyroZ },
              { name: "ba.x", color: C.eskf[6], getBuffer: (w: any) => w.eskfBiasAccelX },
              { name: "ba.y", color: C.eskf[7], getBuffer: (w: any) => w.eskfBiasAccelY },
              { name: "ba.z", color: C.eskf[8], getBuffer: (w: any) => w.eskfBiasAccelZ },
            ]}
          />
        </div>
      ),
    },
    {
      key: "perf",
      label: "性能",
      children: (
        <div className={styles.chartPanel}>
          <ImuChartsCanvas
            source={diagSource}
            enabled={diagEnabled}
            refreshMs={32}
            label="管线性能指标"
            visibilityKey="diag-perf"
            series={[
              { name: "process (us)", color: C.perf[0], getBuffer: (w: any) => w.perfProcessUs },
              { name: "BLE interval (ms)", color: C.perf[1], getBuffer: (w: any) => w.perfBleIntervalMs },
              { name: "upstream Q", color: C.perf[2], getBuffer: (w: any) => w.perfUpstreamQueueLen },
              { name: "downstream Q", color: C.perf[3], getBuffer: (w: any) => w.perfDownstreamQueueLen },
              { name: "record Q", color: C.perf[4], getBuffer: (w: any) => w.perfRecordQueueLen },
            ]}
          />
        </div>
      ),
    },
  ], [diagSource, diagEnabled, C]);

  return (
    <div className={styles.diagnosticsPanel}>
      <StatusDashboard latestRef={latestRef} />
      <Tabs
        items={chartTabs}
        destroyOnHidden
        size="small"
        className={styles.diagTabs}
      />
    </div>
  );
};
