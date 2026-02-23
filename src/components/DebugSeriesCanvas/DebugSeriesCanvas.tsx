import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./DebugSeriesCanvas.module.scss";

export type DebugComparePoint = {
  /** 设备时间戳（毫秒）。 */
  t: number;
  /** 输入数值。 */
  input?: number;
  /** 输出数值。 */
  output?: number;
};

type DebugSeriesCanvasProps = {
  /** 图表标题。 */
  title: string;
  /** 对比点序列（按时间升序）。 */
  points: DebugComparePoint[];
  /** 初始窗口长度（毫秒）。 */
  windowMs?: number;
};

type TimelineViewState = {
  historySpanMs: number;
  durationMs: number;
  offsetMs: number;
};

type TimelineDragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startThumbLeft: number;
};

type TimelineMetrics = {
  trackWidthPx: number;
  thumbWidthPx: number;
  thumbLeftPx: number;
  movablePx: number;
  maxOffsetMs: number;
};

type LatestValueState = {
  input?: number;
  output?: number;
};

const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 60_000;
const TIMELINE_THUMB_MIN_PX = 24;
const INPUT_COLOR = "#9fc9ff";
const OUTPUT_COLOR = "#5aa9ff";

/**
 * 将值约束在指定范围内。
 *
 * @param value - 输入值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 裁剪后的值
 */
const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * 约束窗口时长。
 *
 * @param durationMs - 期望时长
 * @returns 合法时长
 */
const clampDurationMs = (durationMs: number) => {
  return clamp(durationMs, MIN_DURATION_MS, MAX_DURATION_MS);
};

/**
 * 计算最大 offset。
 *
 * @param historySpanMs - 历史总时长
 * @param durationMs - 当前窗口时长
 * @returns 最大回退毫秒数
 */
const getMaxOffsetMs = (historySpanMs: number, durationMs: number) => {
  return Math.max(0, historySpanMs - durationMs);
};

/**
 * 约束 offset 到合法区间。
 *
 * @param offsetMs - 期望回退值
 * @param historySpanMs - 历史总时长
 * @param durationMs - 当前窗口时长
 * @returns 合法回退值
 */
const clampOffsetMs = (offsetMs: number, historySpanMs: number, durationMs: number) => {
  const maxOffsetMs = getMaxOffsetMs(historySpanMs, durationMs);
  return clamp(offsetMs, 0, maxOffsetMs);
};

/**
 * 计算时间进度条几何信息。
 *
 * @param historySpanMs - 历史总时长
 * @param durationMs - 当前窗口时长
 * @param offsetMs - 当前回退值
 * @param trackWidthPx - 轨道宽度
 * @returns 进度条指标
 */
const getTimelineMetrics = (
  historySpanMs: number,
  durationMs: number,
  offsetMs: number,
  trackWidthPx: number
): TimelineMetrics => {
  const safeTrackWidth = Math.max(0, trackWidthPx);
  const maxOffsetMs = getMaxOffsetMs(historySpanMs, durationMs);
  if (safeTrackWidth <= 0 || historySpanMs <= 0) {
    return {
      trackWidthPx: safeTrackWidth,
      thumbWidthPx: safeTrackWidth,
      thumbLeftPx: 0,
      movablePx: 0,
      maxOffsetMs,
    };
  }
  const rawThumbWidth = (durationMs / historySpanMs) * safeTrackWidth;
  const thumbWidthPx = clamp(rawThumbWidth, Math.min(TIMELINE_THUMB_MIN_PX, safeTrackWidth), safeTrackWidth);
  const movablePx = Math.max(0, safeTrackWidth - thumbWidthPx);
  const clampedOffsetMs = clampOffsetMs(offsetMs, historySpanMs, durationMs);
  const positionRatio = maxOffsetMs > 0 ? 1 - (clampedOffsetMs / maxOffsetMs) : 1;
  const thumbLeftPx = movablePx * positionRatio;
  return {
    trackWidthPx: safeTrackWidth,
    thumbWidthPx,
    thumbLeftPx,
    movablePx,
    maxOffsetMs,
  };
};

/**
 * 毫秒格式化为秒文本。
 *
 * @param valueMs - 毫秒
 * @returns 秒文本
 */
const formatSeconds = (valueMs: number) => `${(Math.max(0, valueMs) / 1000).toFixed(1)}s`;

/**
 * 在画布绘制对比曲线。
 *
 * @param ctx - 绘图上下文
 * @param points - 窗口内点集
 * @param width - 画布宽度
 * @param height - 画布高度
 */
const drawCompareChart = (
  ctx: CanvasRenderingContext2D,
  points: DebugComparePoint[],
  width: number,
  height: number
) => {
  const padding = {
    left: 52,
    right: 12,
    top: 16,
    bottom: 30,
  };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  if (plotHeight <= 0 || plotWidth <= 0) {
    return;
  }

  const minX = points[0]?.t ?? 0;
  const maxX = points[points.length - 1]?.t ?? minX + 1;
  const xSpan = Math.max(1, maxX - minX);

  const values: number[] = [];
  for (const point of points) {
    if (point.input !== undefined && Number.isFinite(point.input)) {
      values.push(point.input);
    }
    if (point.output !== undefined && Number.isFinite(point.output)) {
      values.push(point.output);
    }
  }

  if (!values.length) {
    ctx.fillStyle = "#6b7280";
    ctx.fillText("当前序列没有可绘制数值", 16, 20);
    return;
  }

  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (Math.abs(maxY - minY) < 1e-9) {
    minY -= 1;
    maxY += 1;
  }
  const yPadding = (maxY - minY) * 0.1;
  const displayMinY = minY - yPadding;
  const displayMaxY = maxY + yPadding;
  const ySpan = displayMaxY - displayMinY;

  const xTicks = 5;
  const yTicks = 5;

  ctx.save();
  ctx.strokeStyle = "#1a1f29";
  ctx.lineWidth = 1;
  for (let i = 0; i <= xTicks; i += 1) {
    const x = padding.left + (i / xTicks) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotHeight);
    ctx.stroke();
  }
  for (let i = 0; i <= yTicks; i += 1) {
    const y = padding.top + (i / yTicks) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotWidth, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#2a3342";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotHeight);
  ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
  ctx.stroke();

  ctx.fillStyle = "#9aa5b1";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= yTicks; i += 1) {
    const value = displayMaxY - (i / yTicks) * ySpan;
    const y = padding.top + (i / yTicks) * plotHeight;
    ctx.fillText(value.toFixed(3), padding.left - 6, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= xTicks; i += 1) {
    const x = padding.left + (i / xTicks) * plotWidth;
    const value = (i / xTicks) * (xSpan / 1000);
    ctx.fillText(value.toFixed(1), x, padding.top + plotHeight + 8);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("值", padding.left, 2);
  ctx.textAlign = "center";
  ctx.fillText("时间 (s)", padding.left + plotWidth / 2, height - 16);

  /**
   * 绘制单条曲线。
   *
   * @param selector - 从点中提取数值
   * @param color - 颜色
   * @param dashed - 是否虚线
   */
  const drawLine = (
    selector: (point: DebugComparePoint) => number | undefined,
    color: string,
    dashed: boolean
  ) => {
    let started = false;
    let drawnCount = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.beginPath();
    for (const point of points) {
      const yValue = selector(point);
      if (yValue === undefined || !Number.isFinite(yValue)) {
        continue;
      }
      const x = padding.left + ((point.t - minX) / xSpan) * plotWidth;
      const y = padding.top + plotHeight - ((yValue - displayMinY) / ySpan) * plotHeight;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
      drawnCount += 1;
    }
    if (drawnCount >= 2) {
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  drawLine((point) => point.input, INPUT_COLOR, true);
  drawLine((point) => point.output, OUTPUT_COLOR, false);
  ctx.restore();
};

/**
 * Debug 单序列对比图（input/output）。
 */
export const DebugSeriesCanvas = ({
  title,
  points,
  windowMs = 10_000,
}: DebugSeriesCanvasProps) => {
  /** 画布容器引用。 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Canvas 引用。 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 时间进度条轨道引用。 */
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  /** 时间轨道宽度。 */
  const [timelineTrackWidth, setTimelineTrackWidth] = useState(0);
  /** 时间视图状态。 */
  const [timelineView, setTimelineView] = useState<TimelineViewState>({
    historySpanMs: 0,
    durationMs: clampDurationMs(windowMs),
    offsetMs: 0,
  });
  /** 当前窗口最新值。 */
  const [latestValues, setLatestValues] = useState<LatestValueState>({});
  const lastStatsUpdateRef = useRef(0);
  const historySpanRef = useRef(0);
  const latestTimeRef = useRef<number | null>(null);
  const timelineDragRef = useRef<TimelineDragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startThumbLeft: 0,
  });
  /** 视图状态引用，用于高频交互。 */
  const viewStateRef = useRef({
    duration: clampDurationMs(windowMs),
    offset: 0,
    isDragging: false,
    lastX: 0,
  });

  /**
   * 同步时间视图 state。
   *
   * @param historySpanMs - 历史总时长
   * @param durationMs - 窗口时长
   * @param offsetMs - 回退时长
   * @param force - 是否强制刷新
   */
  const syncTimelineView = useCallback(
    (historySpanMs: number, durationMs: number, offsetMs: number, force = false) => {
      const normalizedDuration = clampDurationMs(durationMs);
      const normalizedOffset = clampOffsetMs(offsetMs, historySpanMs, normalizedDuration);
      historySpanRef.current = historySpanMs;
      if (!force) {
        setTimelineView((prev) => {
          if (
            Math.abs(prev.historySpanMs - historySpanMs) < 1 &&
            Math.abs(prev.durationMs - normalizedDuration) < 1 &&
            Math.abs(prev.offsetMs - normalizedOffset) < 1
          ) {
            return prev;
          }
          return {
            historySpanMs,
            durationMs: normalizedDuration,
            offsetMs: normalizedOffset,
          };
        });
        return;
      }
      setTimelineView({
        historySpanMs,
        durationMs: normalizedDuration,
        offsetMs: normalizedOffset,
      });
    },
    []
  );

  /**
   * 滚轮缩放窗口。
   *
   * @param event - WheelEvent
   */
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    const nextDuration = clampDurationMs(viewStateRef.current.duration * zoomFactor);
    viewStateRef.current.duration = nextDuration;
    viewStateRef.current.offset = clampOffsetMs(viewStateRef.current.offset, historySpanRef.current, nextDuration);
    syncTimelineView(historySpanRef.current, nextDuration, viewStateRef.current.offset, true);
  };

  /**
   * 开始拖动画布平移。
   *
   * @param event - PointerEvent
   */
  const handlePointerDown = (event: PointerEvent) => {
    viewStateRef.current.isDragging = true;
    viewStateRef.current.lastX = event.clientX;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  /**
   * 画布拖拽平移。
   *
   * @param event - PointerEvent
   */
  const handlePointerMove = (event: PointerEvent) => {
    if (!viewStateRef.current.isDragging) {
      return;
    }
    const dx = event.clientX - viewStateRef.current.lastX;
    viewStateRef.current.lastX = event.clientX;
    const msPerPixel = viewStateRef.current.duration / (canvasRef.current?.getBoundingClientRect().width || 1);
    const nextOffset = viewStateRef.current.offset + dx * msPerPixel;
    viewStateRef.current.offset = clampOffsetMs(nextOffset, historySpanRef.current, viewStateRef.current.duration);
    syncTimelineView(historySpanRef.current, viewStateRef.current.duration, viewStateRef.current.offset, true);
  };

  /**
   * 结束画布拖拽。
   *
   * @param event - PointerEvent
   */
  const handlePointerUp = (event: PointerEvent) => {
    viewStateRef.current.isDragging = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  };

  /**
   * 时间进度条指标。
   */
  const timelineMetrics = useMemo(
    () => getTimelineMetrics(timelineView.historySpanMs, timelineView.durationMs, timelineView.offsetMs, timelineTrackWidth),
    [timelineTrackWidth, timelineView.durationMs, timelineView.historySpanMs, timelineView.offsetMs]
  );

  /**
   * 点击轨道跳转到对应窗口位置。
   *
   * @param event - PointerEvent
   */
  const handleTimelineTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (timelineMetrics.trackWidthPx <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = clamp(event.clientX - rect.left, 0, timelineMetrics.trackWidthPx);
    const targetLeft = clamp(clickX - timelineMetrics.thumbWidthPx / 2, 0, timelineMetrics.movablePx);
    const nextOffsetMs = timelineMetrics.movablePx > 0
      ? (1 - targetLeft / timelineMetrics.movablePx) * timelineMetrics.maxOffsetMs
      : 0;
    viewStateRef.current.offset = nextOffsetMs;
    syncTimelineView(historySpanRef.current, viewStateRef.current.duration, nextOffsetMs, true);
  };

  /**
   * 开始拖动时间滑块。
   *
   * @param event - PointerEvent
   */
  const handleTimelineThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startThumbLeft: timelineMetrics.thumbLeftPx,
    };
  };

  /**
   * 拖动时间滑块。
   *
   * @param event - PointerEvent
   */
  const handleTimelineThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = timelineDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const targetLeft = clamp(drag.startThumbLeft + dx, 0, timelineMetrics.movablePx);
    const nextOffsetMs = timelineMetrics.movablePx > 0
      ? (1 - targetLeft / timelineMetrics.movablePx) * timelineMetrics.maxOffsetMs
      : 0;
    viewStateRef.current.offset = nextOffsetMs;
    syncTimelineView(historySpanRef.current, viewStateRef.current.duration, nextOffsetMs, true);
  };

  /**
   * 结束时间滑块拖拽。
   *
   * @param event - PointerEvent
   */
  const handleTimelineThumbPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineDragRef.current.active || timelineDragRef.current.pointerId !== event.pointerId) {
      return;
    }
    timelineDragRef.current.active = false;
    timelineDragRef.current.pointerId = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  /**
   * 监听画布交互事件。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerUp);
    };
  }, []);

  /**
   * 监听时间轨道宽度变化。
   */
  useEffect(() => {
    const timelineTrack = timelineTrackRef.current;
    if (!timelineTrack) {
      return undefined;
    }
    const resize = () => {
      setTimelineTrackWidth(timelineTrack.getBoundingClientRect().width);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(timelineTrack);
    resize();
    return () => {
      observer.disconnect();
    };
  }, []);

  /**
   * 处理画布尺寸变化。
   */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return undefined;
    }
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      observer.disconnect();
    };
  }, []);

  /**
   * 绘制循环。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, sans-serif";

    /**
     * 绘制单帧。
     */
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0c1119";
      ctx.fillRect(0, 0, width, height);

      if (points.length < 2) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("等待 Debug 实时流...", 16, 20);
        syncTimelineView(0, viewStateRef.current.duration, 0);
        setLatestValues({});
        return;
      }

      const latestTime = points[points.length - 1]?.t ?? 0;
      const earliestTime = points[0]?.t ?? latestTime;
      const historySpanMs = Math.max(0, latestTime - earliestTime);
      const durationMs = clampDurationMs(viewStateRef.current.duration);
      viewStateRef.current.duration = durationMs;

      if (
        latestTimeRef.current !== null &&
        latestTime > latestTimeRef.current &&
        viewStateRef.current.offset > 0
      ) {
        viewStateRef.current.offset += latestTime - latestTimeRef.current;
      }
      latestTimeRef.current = latestTime;
      viewStateRef.current.offset = clampOffsetMs(viewStateRef.current.offset, historySpanMs, durationMs);
      syncTimelineView(historySpanMs, durationMs, viewStateRef.current.offset);

      const endTime = latestTime - viewStateRef.current.offset;
      const startTime = endTime - durationMs;
      const windowPoints = points.filter((point) => point.t >= startTime && point.t <= endTime);
      if (windowPoints.length < 2) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("窗口内数据不足", 16, 20);
        setLatestValues({});
        return;
      }

      drawCompareChart(ctx, windowPoints, width, height);

      const now = Date.now();
      if (now - lastStatsUpdateRef.current > 200) {
        lastStatsUpdateRef.current = now;
        let latestInput: number | undefined;
        let latestOutput: number | undefined;
        for (let index = windowPoints.length - 1; index >= 0; index -= 1) {
          const point = windowPoints[index];
          if (latestInput === undefined && point.input !== undefined) {
            latestInput = point.input;
          }
          if (latestOutput === undefined && point.output !== undefined) {
            latestOutput = point.output;
          }
          if (latestInput !== undefined && latestOutput !== undefined) {
            break;
          }
        }
        setLatestValues({
          input: latestInput,
          output: latestOutput,
        });
      }
    };

    const timer = window.setInterval(draw, 24);
    draw();
    return () => {
      window.clearInterval(timer);
    };
  }, [points, syncTimelineView]);

  const isTimelineDisabled = timelineView.historySpanMs <= 0 || timelineMetrics.trackWidthPx <= 0;

  return (
    <div className={styles.debugSeriesCanvas}>
      <div className={styles.chartColumn}>
        <div className={styles.chartTitle}>{title}</div>
        <div className={styles.canvasArea} ref={containerRef}>
          <canvas ref={canvasRef} aria-label={title} />
        </div>
        <div className={`${styles.timelineWrap} ${isTimelineDisabled ? styles.timelineDisabled : ""}`.trim()}>
          <div
            ref={timelineTrackRef}
            className={styles.timelineTrack}
            onPointerDown={handleTimelineTrackPointerDown}
          >
            <div
              className={styles.timelineThumb}
              style={{
                width: `${timelineMetrics.thumbWidthPx}px`,
                transform: `translateX(${timelineMetrics.thumbLeftPx}px)`,
              }}
              onPointerDown={handleTimelineThumbPointerDown}
              onPointerMove={handleTimelineThumbPointerMove}
              onPointerUp={handleTimelineThumbPointerUp}
              onPointerCancel={handleTimelineThumbPointerUp}
            />
          </div>
          <div className={styles.timelineMeta}>
            范围 {formatSeconds(timelineView.durationMs)} · 位置 回退 {formatSeconds(timelineView.offsetMs)}
          </div>
        </div>
      </div>
      <div className={styles.statsColumn}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>input</span>
            <span className={styles.colorSwatch} style={{ backgroundColor: INPUT_COLOR }} />
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statValue}>
            {latestValues.input === undefined ? "--" : latestValues.input.toFixed(3)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>output</span>
            <span className={styles.colorSwatch} style={{ backgroundColor: OUTPUT_COLOR }} />
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statValue}>
            {latestValues.output === undefined ? "--" : latestValues.output.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
};
