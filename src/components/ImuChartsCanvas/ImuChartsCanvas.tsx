import React, { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "antd";

import type { ImuHistoryWindow } from "../../utils/ImuHistoryBuffer";

import styles from "./ImuChartsCanvas.module.scss";

type SeriesSpec = {
  name: string;
  color: string;
  getBuffer: (window: ImuHistoryWindow) => Float32Array | Float64Array;
};

type ImuChartsCanvasProps = {
  source: { bufferRef: React.RefObject<{ getWindow: (durationMs: number, offsetMs: number) => ImuHistoryWindow }> };
  enabled: boolean;
  refreshMs?: number;
  windowMs?: number;
  label: string;
  visibilityKey: string;
  series: SeriesSpec[];
};

type SeriesVisibilityMap = Record<string, boolean>;

/**
 * 运行时缓存：在同一页面会话中记忆各图表的序列勾选状态。
 */
const visibilityCache = new Map<string, SeriesVisibilityMap>();

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
  const range = max - min;

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
    const value = max - (i / yTicks) * range;
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
      const y = padding.top + plotHeight - ((v - min) / range) * plotHeight;
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
  const [latestStats, setLatestStats] = useState<Array<{ name: string; color: string; value?: number }>>([]);
  /** 每个序列是否可见。 */
  const [seriesVisibility, setSeriesVisibility] = useState<SeriesVisibilityMap>(() =>
    buildSeriesVisibilityMap(series, visibilityCache.get(visibilityKey))
  );
  const lastStatsUpdateRef = useRef(0);

  /** 视图状态：时间窗口长度和偏移量 */
  const viewStateRef = useRef({
    duration: windowMs || 10000,
    offset: 0, // 距离最新数据的偏移量（毫秒），0 表示跟随最新
    isDragging: false,
    lastX: 0,
  });

  /**
   * 监听滚轮事件：缩放时间窗口
   */
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    viewStateRef.current.duration = Math.max(
      1000, // 最小显示 1 秒
      Math.min(60000, viewStateRef.current.duration * zoomFactor) // 最大显示 60 秒
    );
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
    viewStateRef.current.offset = Math.max(
      0,
      viewStateRef.current.offset + dx * msPerPixel
    );
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

      if (!enabled) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("图表已暂停", 16, 20);
        return;
      }

      // 获取全部历史数据
      const { duration, offset } = viewStateRef.current;
      const window = source.bufferRef.current.getWindow(duration, offset);
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
  }, [enabled, refreshMs, source, windowMs, label, series, seriesVisibility]);

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

  return (
    <div className={styles.imuChartsCanvas}>
      <div className={styles.canvasArea} ref={containerRef}>
        <canvas ref={canvasRef} aria-label={label} />
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
