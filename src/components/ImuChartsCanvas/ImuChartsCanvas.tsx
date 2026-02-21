import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "antd";

import type { ImuHistoryWindow } from "../../utils/ImuHistoryBuffer";

import styles from "./ImuChartsCanvas.module.scss";

type SeriesSpec = {
  name: string;
  color: string;
  getBuffer: (window: ImuHistoryWindow) => Float32Array | Float64Array;
};

type ImuChartsCanvasProps = {
  /** 图表数据源，提供历史窗口读取能力。 */
  source: { bufferRef: React.RefObject<{ getWindow: (durationMs: number, offsetMs: number) => ImuHistoryWindow }> };
  /** 是否启用图表渲染。 */
  enabled: boolean;
  /** 重绘间隔（毫秒），用于控制刷新频率。 */
  refreshMs?: number;
  /** 初始时间窗口大小（毫秒）。 */
  windowMs?: number;
  /** 图表名称/纵轴描述文本。 */
  label: string;
  /** 图表可见性缓存键，用于记忆序列勾选状态。 */
  visibilityKey: string;
  /** 需要绘制的序列列表。 */
  series: SeriesSpec[];
};

type SeriesVisibilityMap = Record<string, boolean>;
type TimelineDragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startThumbLeft: number;
};
type TimelineViewState = {
  historySpanMs: number;
  durationMs: number;
  offsetMs: number;
};
type TimelineMetrics = {
  trackWidthPx: number;
  thumbWidthPx: number;
  thumbLeftPx: number;
  movablePx: number;
  maxOffsetMs: number;
};

/**
 * 运行时缓存：在同一页面会话中记忆各图表的序列勾选状态。
 */
const visibilityCache = new Map<string, SeriesVisibilityMap>();
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 60000;
const TIMELINE_THUMB_MIN_PX = 24;

/**
 * 按当前 series 生成可见性映射，缺省值为 true。
 *
 * @param series - 当前图表序列定义
 * @param cached - 历史缓存（可选）
 * @returns 仅包含当前 series 的可见性映射
 */
const buildSeriesVisibilityMap = (series: SeriesSpec[], cached?: SeriesVisibilityMap): SeriesVisibilityMap => {
  const nextVisibility: SeriesVisibilityMap = {};
  for (const item of series) {
    nextVisibility[item.name] = cached?.[item.name] ?? true;
  }
  return nextVisibility;
};

/**
 * 判断两个可见性映射是否等价。
 *
 * @param left - 旧映射
 * @param right - 新映射
 * @returns true 表示内容一致
 */
const isSameVisibilityMap = (left: SeriesVisibilityMap, right: SeriesVisibilityMap) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
};

/**
 * 将值限制到给定范围内。
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
 * 计算 offset 允许的最大值。
 *
 * @param historySpanMs - 当前可回看总时长
 * @param durationMs - 当前显示窗口时长
 * @returns 最大 offset（毫秒）
 */
const getMaxOffsetMs = (historySpanMs: number, durationMs: number) => {
  return Math.max(0, historySpanMs - durationMs);
};

/**
 * 约束 duration 到允许区间。
 *
 * @param durationMs - 期望窗口时长
 * @returns 合法窗口时长
 */
const clampDurationMs = (durationMs: number) => {
  return clamp(durationMs, MIN_DURATION_MS, MAX_DURATION_MS);
};

/**
 * 约束 offset 到当前历史范围内。
 *
 * @param offsetMs - 期望偏移量
 * @param historySpanMs - 当前可回看总时长
 * @param durationMs - 当前显示窗口时长
 * @returns 合法偏移量
 */
const clampOffsetMs = (offsetMs: number, historySpanMs: number, durationMs: number) => {
  const maxOffsetMs = getMaxOffsetMs(historySpanMs, durationMs);
  return clamp(offsetMs, 0, maxOffsetMs);
};

/**
 * 计算时间进度条的滑块几何信息。
 *
 * @param historySpanMs - 当前可回看总时长
 * @param durationMs - 当前显示窗口时长
 * @param offsetMs - 当前偏移量
 * @param trackWidthPx - 轨道宽度
 * @returns 滑块宽度/位置等指标
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
 * 把毫秒格式化为秒文本。
 *
 * @param valueMs - 毫秒值
 * @returns 秒文本（1 位小数）
 */
const formatSeconds = (valueMs: number) => {
  return `${(Math.max(0, valueMs) / 1000).toFixed(1)}s`;
};

/**
 * 在 Canvas 上绘制折线图。
 *
 * @param ctx - Canvas 2D 绘图上下文
 * @param time - 当前时间窗口内的时间轴
 * @param yAxisLabel - 纵轴单位/说明
 * @param series - 要绘制的数据系列数组 (包含值、颜色、名称)
 * @param width - 绘图区域宽度
 * @param height - 绘图区域高度
 */
const drawChart = (
  ctx: CanvasRenderingContext2D,
  window: ImuHistoryWindow,
  series: Array<{ color: string; name: string; buffer: Float32Array | Float64Array }>,
  yAxisLabel: string,
  width: number,
  height: number
) => {
  const yPaddingRatio = 0.1;
  const padding = {
    left: 52,
    right: 12,
    top: 16,
    bottom: 30,
  };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  if (window.count < 2) {
    ctx.fillStyle = "#7b8591";
    ctx.fillText("等待数据...", padding.left, 20);
    return;
  }

  const latestTime = window.getTime(window.count - 1);
  const earliestTime = window.getTime(0);
  const timeSpan = latestTime - earliestTime || 1;

  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (let i = 0; i < window.count; i += 1) {
      const v = window.getValue(s.buffer, i);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const yPadding = (max - min) * yPaddingRatio;
  const displayMin = min - yPadding;
  const displayMax = max + yPadding;
  const range = displayMax - displayMin;

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
    const value = displayMax - (i / yTicks) * range;
    const y = padding.top + (i / yTicks) * plotHeight;
    ctx.fillText(value.toFixed(2), padding.left - 6, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= xTicks; i += 1) {
    const t = (i / xTicks) * timeSpan;
    const label = `${(t / 1000).toFixed(1)}`;
    const x = padding.left + (i / xTicks) * plotWidth;
    ctx.fillText(label, x, padding.top + plotHeight + 8);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(yAxisLabel, padding.left, 2);

  ctx.textAlign = "center";
  ctx.fillText("时间 (s)", padding.left + plotWidth / 2, height - 16);

  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < window.count; i += 1) {
      const t = window.getTime(i);
      const v = window.getValue(s.buffer, i);
      const x = padding.left + ((t - earliestTime) / timeSpan) * plotWidth;
      const y = padding.top + plotHeight - ((v - displayMin) / range) * plotHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * ImuChartsCanvas 组件
 * 使用 Canvas 高性能绘制实时 IMU 数据波形图。
 *
 * @param props.source - IMU 数据源对象
 * @param props.enabled - 是否启用绘制 (false 时暂停更新)
 * @param props.refreshMs - 刷新间隔 (毫秒)，默认 40ms
 * @param props.windowMs - 显示的时间窗口大小 (毫秒)
 * @param props.label - 纵轴单位/说明
 * @param props.visibilityKey - 图表唯一 key，用于在同页记忆序列勾选状态
 * @param props.series - 需要绘制的数据系列配置
 */
/**
 * IMU 数据曲线画布组件。
 */
export const ImuChartsCanvas = ({
  source,
  enabled,
  refreshMs = 16,
  windowMs,
  label,
  visibilityKey,
  series,
}: ImuChartsCanvasProps) => {
  /** 容器 div 的引用，用于监听尺寸变化 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Canvas 元素的引用，用于获取绘图上下文 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 时间进度条轨道引用。 */
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const [latestStats, setLatestStats] = useState<Array<{ name: string; color: string; value?: number }>>([]);
  /** 每个序列是否可见。 */
  const [seriesVisibility, setSeriesVisibility] = useState<SeriesVisibilityMap>(() =>
    buildSeriesVisibilityMap(series, visibilityCache.get(visibilityKey))
  );
  /** 时间进度条视图状态。 */
  const [timelineView, setTimelineView] = useState<TimelineViewState>({
    historySpanMs: 0,
    durationMs: clampDurationMs(windowMs || 10000),
    offsetMs: 0,
  });
  /** 时间进度条轨道宽度。 */
  const [timelineTrackWidth, setTimelineTrackWidth] = useState(0);
  const lastStatsUpdateRef = useRef(0);
  const lastTimelineUpdateRef = useRef(0);
  const latestTimeRef = useRef<number | null>(null);
  const historySpanRef = useRef(0);
  const timelineDragRef = useRef<TimelineDragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startThumbLeft: 0,
  });

  /** 视图状态：时间窗口长度和偏移量 */
  const viewStateRef = useRef({
    duration: clampDurationMs(windowMs || 10000),
    offset: 0, // 距离最新数据的偏移量（毫秒），0 表示跟随最新
    isDragging: false,
    lastX: 0,
  });

  /**
   * 同步时间进度条显示状态。
   *
   * @param historySpanMs - 当前可回看总时长
   * @param durationMs - 当前窗口时长
   * @param offsetMs - 当前偏移量
   * @param force - 是否强制刷新
   */
  const syncTimelineView = useCallback(
    (historySpanMs: number, durationMs: number, offsetMs: number, force = false) => {
      const normalizedDuration = clampDurationMs(durationMs);
      const normalizedOffset = clampOffsetMs(offsetMs, historySpanMs, normalizedDuration);
      historySpanRef.current = historySpanMs;
      const now = Date.now();
      if (!force && now - lastTimelineUpdateRef.current < 50) {
        return;
      }
      lastTimelineUpdateRef.current = now;
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
    },
    []
  );

  /**
   * 监听滚轮事件：缩放时间窗口
   */
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const nextDuration = clampDurationMs(viewStateRef.current.duration * zoomFactor);
    viewStateRef.current.duration = nextDuration;
    viewStateRef.current.offset = clampOffsetMs(viewStateRef.current.offset, historySpanRef.current, nextDuration);
    syncTimelineView(historySpanRef.current, nextDuration, viewStateRef.current.offset, true);
  };

  /**
   * 监听指针按下：开始拖动
   */
  const handlePointerDown = (e: PointerEvent) => {
    viewStateRef.current.isDragging = true;
    viewStateRef.current.lastX = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  /**
   * 监听指针移动：平移时间窗口
   */
  const handlePointerMove = (e: PointerEvent) => {
    if (!viewStateRef.current.isDragging) return;
    const dx = e.clientX - viewStateRef.current.lastX;
    viewStateRef.current.lastX = e.clientX;

    const { duration } = viewStateRef.current;
    // 每一个像素代表的时间长度
    const msPerPixel = duration / (canvasRef.current?.getBoundingClientRect().width || 1);

    // 拖动方向与数据移动方向相反
    const nextOffset = viewStateRef.current.offset + dx * msPerPixel;
    viewStateRef.current.offset = clampOffsetMs(nextOffset, historySpanRef.current, duration);
    syncTimelineView(historySpanRef.current, duration, viewStateRef.current.offset, true);
  };

  /**
   * 监听指针抬起：结束拖动
   */
  const handlePointerUp = (e: PointerEvent) => {
    viewStateRef.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  /**
   * 同步可见性状态：当图表 key 或 series 变化时，复用缓存并补齐新序列默认值。
   */
  useEffect(() => {
    const nextVisibility = buildSeriesVisibilityMap(series, visibilityCache.get(visibilityKey));
    visibilityCache.set(visibilityKey, nextVisibility);
    setSeriesVisibility((prev) => (isSameVisibilityMap(prev, nextVisibility) ? prev : nextVisibility));
  }, [visibilityKey, series]);

  /**
   * 切换单个序列显示状态。
   *
   * @param seriesName - 序列名称
   * @param checked - 选中状态
   */
  const handleSeriesVisibilityChange = (seriesName: string, checked: boolean) => {
    setSeriesVisibility((prev) => {
      const next = { ...prev, [seriesName]: checked };
      visibilityCache.set(visibilityKey, next);
      return next;
    });
  };

  /**
   * 时间进度条几何信息：滑块宽度、位置、可移动范围。
   */
  const timelineMetrics = useMemo(
    () => getTimelineMetrics(timelineView.historySpanMs, timelineView.durationMs, timelineView.offsetMs, timelineTrackWidth),
    [timelineTrackWidth, timelineView.durationMs, timelineView.historySpanMs, timelineView.offsetMs]
  );

  /**
   * 点击轨道后跳转到对应历史位置。
   *
   * @param event - PointerEvent
   */
  const handleTimelineTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (timelineMetrics.trackWidthPx <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = clamp(event.clientX - rect.left, 0, timelineMetrics.trackWidthPx);
    const targetLeft = clamp(
      clickX - timelineMetrics.thumbWidthPx / 2,
      0,
      timelineMetrics.movablePx
    );
    const nextOffsetMs = timelineMetrics.movablePx > 0
      ? (1 - targetLeft / timelineMetrics.movablePx) * timelineMetrics.maxOffsetMs
      : 0;
    viewStateRef.current.offset = nextOffsetMs;
    syncTimelineView(historySpanRef.current, viewStateRef.current.duration, nextOffsetMs, true);
  };

  /**
   * 滑块指针按下：记录拖拽起点。
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
   * 滑块拖动：更新 offset 并驱动图表平移。
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
   * 滑块拖拽结束。
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
   * Effect: 同步时间进度条轨道宽度。
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
   * Effect: 处理 Canvas 尺寸调整
   * 监听容器大小变化，并同步调整 Canvas 的内部分辨率和 CSS 尺寸，
   * 适配高 DPI 屏幕。
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
   * Effect: 处理动画循环与绘图逻辑
   * 设置定时器，定期从 source 获取最新数据快照并在 Canvas 上重绘。
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
     * 执行单帧绘制
     * 1. 清空画布
     * 2. 检查是否启用或有数据
     * 3. 获取数据快照
     * 4. 调用 drawChart 进行实际绘制
     */
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0c1119";
      ctx.fillRect(0, 0, width, height);

      const fullHistoryWindow = source.bufferRef.current.getWindow(Number.MAX_SAFE_INTEGER, 0);
      const historySpanMs = fullHistoryWindow.count >= 2
        ? fullHistoryWindow.getTime(fullHistoryWindow.count - 1) - fullHistoryWindow.getTime(0)
        : 0;
      const latestHistoryTime = fullHistoryWindow.count > 0
        ? fullHistoryWindow.getTime(fullHistoryWindow.count - 1)
        : null;
      const durationMs = clampDurationMs(viewStateRef.current.duration);
      viewStateRef.current.duration = durationMs;

      if (
        latestHistoryTime !== null &&
        latestTimeRef.current !== null &&
        latestHistoryTime > latestTimeRef.current &&
        viewStateRef.current.offset > 0
      ) {
        viewStateRef.current.offset += latestHistoryTime - latestTimeRef.current;
      }
      latestTimeRef.current = latestHistoryTime;
      viewStateRef.current.offset = clampOffsetMs(viewStateRef.current.offset, historySpanMs, durationMs);
      syncTimelineView(historySpanMs, durationMs, viewStateRef.current.offset);

      if (!enabled) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("图表已暂停", 16, 20);
        return;
      }

      // 获取当前窗口数据
      const window = source.bufferRef.current.getWindow(durationMs, viewStateRef.current.offset);
      if (window.count < 2) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("等待 IMU 数据流...", 16, 20);
        return;
      }

      const yAxisLabel = label.includes("(")
        ? label.slice(label.indexOf("(") + 1, label.lastIndexOf(")"))
        : label;
      const seriesBuffers = series.map((entry) => ({
        name: entry.name,
        color: entry.color,
        buffer: entry.getBuffer(window),
      }));
      const visibleSeriesBuffers = seriesBuffers.filter((entry) => seriesVisibility[entry.name] !== false);
      if (visibleSeriesBuffers.length === 0) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("请选择至少一个序列", 16, 20);
      } else {
        drawChart(ctx, window, visibleSeriesBuffers, yAxisLabel, width, height);
      }

      const now = Date.now();
      if (now - lastStatsUpdateRef.current > 200) {
        lastStatsUpdateRef.current = now;
        setLatestStats(
          seriesBuffers.map((entry) => ({
            name: entry.name,
            color: entry.color,
            value: window.count ? window.getValue(entry.buffer, window.count - 1) : undefined,
          }))
        );
      }
    };

    const timer = window.setInterval(draw, refreshMs);
    draw();

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, refreshMs, source, label, series, seriesVisibility, syncTimelineView]);

  /**
   * 以 series 定义为主，组合最新值，保证 checkbox 始终可见。
   */
  const statEntries = useMemo(() => {
    const latestValueMap = new Map<string, number | undefined>();
    for (const stat of latestStats) {
      latestValueMap.set(stat.name, stat.value);
    }
    return series.map((entry) => ({
      name: entry.name,
      color: entry.color,
      value: latestValueMap.get(entry.name),
    }));
  }, [latestStats, series]);

  const unit = label.includes("(")
    ? label.slice(label.indexOf("(") + 1, label.lastIndexOf(")"))
    : label;
  const isTimelineDisabled = timelineView.historySpanMs <= 0 || timelineMetrics.trackWidthPx <= 0;

  return (
    <div className={styles.imuChartsCanvas}>
      <div className={styles.chartColumn}>
        <div className={styles.canvasArea} ref={containerRef}>
          <canvas ref={canvasRef} aria-label={label} />
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
        {statEntries.map((entry) => {
          const isVisible = seriesVisibility[entry.name] !== false;
          return (
            <div
              key={entry.name}
              className={`${styles.statCard} ${isVisible ? "" : styles.statCardDisabled}`.trim()}
            >
              <div className={styles.statHeader}>
                <Checkbox
                  checked={isVisible}
                  onChange={(event) => handleSeriesVisibilityChange(entry.name, event.target.checked)}
                  className={`${styles.seriesCheckbox} ${isVisible ? "" : styles.seriesCheckboxMuted}`.trim()}
                >
                  <span className={styles.statLabel}>{entry.name}</span>
                </Checkbox>
                <span className={styles.colorSwatch} style={{ backgroundColor: entry.color }} />
              </div>
              <div className={styles.statDivider} />
              <div className={`${styles.statValue} ${isVisible ? "" : styles.statValueMuted}`.trim()}>
                {entry.value === undefined ? "--" : `${entry.value.toFixed(3)} ${unit}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
