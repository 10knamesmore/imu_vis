import React, { useEffect, useRef } from "react";
import { ImuSource } from "../hooks/useImuSource";
import { ImuDataHistory } from "../types";

type SeriesSpec = {
  name: string;
  color: string;
  getValues: (snapshot: ImuDataHistory) => number[];
};

type ImuChartsCanvasProps = {
  source: ImuSource;
  enabled: boolean;
  refreshMs?: number;
  windowMs?: number;
  label: string;
  series: SeriesSpec[];
};

const MAX_DRAW_POINTS = 400;

/**
 * 对数组进行降采样，以减少绘图点的数量。
 *
 * @param values - 原始数值数组
 * @param step - 采样步长 (例如 step=2 表示每隔一个取一个)
 * @returns 降采样后的新数组
 */
const downsample = (values: number[], step: number): number[] => {
  if (step <= 1) {
    return values;
  }
  const result: number[] = [];
  for (let i = 0; i < values.length; i += step) {
    result.push(values[i]);
  }
  return result;
};

/**
 * 在 Canvas 上绘制折线图。
 *
 * @param ctx - Canvas 2D 绘图上下文
 * @param snapshot - 当前时间窗口内的 IMU 数据快照
 * @param label - 图表标题
 * @param series - 要绘制的数据系列数组 (包含值、颜色、名称)
 * @param width - 绘图区域宽度
 * @param height - 绘图区域高度
 */
const drawChart = (
  ctx: CanvasRenderingContext2D,
  snapshot: ImuDataHistory,
  label: string,
  series: Array<{ values: number[]; color: string; name: string }>,
  width: number,
  height: number
) => {
  const padding = 28;
  const plotHeight = height - padding * 1.6;
  const plotWidth = width - padding * 2;
  const baseY = padding;
  const time = snapshot.time;

  if (time.length < 2) {
    ctx.fillStyle = "#7b8591";
    ctx.fillText(label, padding, 20);
    return;
  }

  const latestTime = time[time.length - 1];
  const earliestTime = time[0];
  const timeSpan = latestTime - earliestTime || 1;

  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const v of s.values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;

  ctx.save();
  ctx.translate(0, baseY);
  ctx.strokeStyle = "#1a1f29";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, plotHeight / 2);
  ctx.lineTo(width - padding, plotHeight / 2);
  ctx.stroke();

  ctx.fillStyle = "#9aa5b1";
  ctx.fillText(label, padding, -8);
  ctx.fillText(`${min.toFixed(2)}..${max.toFixed(2)}`, width - padding - 120, -8);

  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < s.values.length; i += 1) {
      const t = time[i];
      const x = padding + ((t - earliestTime) / timeSpan) * plotWidth;
      const y = plotHeight - ((s.values[i] - min) / range) * plotHeight;
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
 * @param props.label - 图表主标题
 * @param props.series - 需要绘制的数据系列配置
 */
export const ImuChartsCanvas: React.FC<ImuChartsCanvasProps> = ({
  source,
  enabled,
  refreshMs = 40,
  windowMs,
  label,
  series,
}) => {
  /** 容器 div 的引用，用于监听尺寸变化 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Canvas 元素的引用，用于获取绘图上下文 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
     * 3. 获取数据快照并降采样
     * 4. 调用 drawChart 进行实际绘制
     */
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0c1119";
      ctx.fillRect(0, 0, width, height);

      if (!enabled) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("Charts paused", 16, 20);
        return;
      }

      const snapshot = source.bufferRef.current.snapshot(windowMs);
      if (snapshot.time.length < 2) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("Waiting for IMU stream...", 16, 20);
        return;
      }

      const step = Math.ceil(snapshot.time.length / MAX_DRAW_POINTS);
      const downsampledTime = downsample(snapshot.time, step);
      const seriesValues = series.map((entry) => {
        const values = downsample(entry.getValues(snapshot), step);
        return { name: entry.name, color: entry.color, values };
      });

      drawChart(
        ctx,
        { ...snapshot, time: downsampledTime },
        label,
        seriesValues,
        width,
        height
      );
    };

    const timer = window.setInterval(draw, refreshMs);
    draw();

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, refreshMs, source, windowMs]);

  return (
    <div className="imu-charts-canvas" ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};
