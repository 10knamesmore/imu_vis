import { useEffect, useRef } from "react";

import styles from "./DebugStageChart.module.scss";

export type DebugChartPoint = {
  x: number;
  y: number;
};

export type DebugChartSeries = {
  name: string;
  color: string;
  dashed?: boolean;
  points: DebugChartPoint[];
};

type DebugStageChartProps = {
  /** 要绘制的曲线序列。 */
  series: DebugChartSeries[];
  /** X 轴标签。 */
  xLabel?: string;
  /** Y 轴标签。 */
  yLabel?: string;
};

/**
 * Debug 阶段对比折线图（Canvas）。
 */
export const DebugStageChart = ({
  series,
  xLabel = "Time (s)",
  yLabel = "Value",
}: DebugStageChartProps) => {
  /** 容器引用，用于监听尺寸变化。 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 画布引用。 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0c1119";
    ctx.fillRect(0, 0, width, height);

    const points = series.flatMap((item) => item.points);
    if (!points.length) {
      ctx.fillStyle = "#7b8591";
      ctx.font = "13px ui-sans-serif, system-ui";
      ctx.fillText("等待 Debug 实时流...", 24, 26);
      return;
    }

    const padding = {
      left: 58,
      right: 16,
      top: 20,
      bottom: 36,
    };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return;
    }
    if (maxX - minX < 1e-6) {
      maxX += 1;
    }
    if (maxY - minY < 1e-6) {
      maxY += 1;
      minY -= 1;
    }
    const yPadding = (maxY - minY) * 0.1;
    const displayMinY = minY - yPadding;
    const displayMaxY = maxY + yPadding;
    const displayRangeY = displayMaxY - displayMinY;

    const xTicks = 5;
    const yTicks = 5;

    ctx.strokeStyle = "#1b2636";
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
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= yTicks; i += 1) {
      const value = displayMaxY - (i / yTicks) * displayRangeY;
      const y = padding.top + (i / yTicks) * plotHeight;
      ctx.fillText(value.toFixed(3), padding.left - 6, y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= xTicks; i += 1) {
      const value = minX + (i / xTicks) * (maxX - minX);
      const x = padding.left + (i / xTicks) * plotWidth;
      ctx.fillText(value.toFixed(1), x, padding.top + plotHeight + 8);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(yLabel, padding.left, 2);
    ctx.textAlign = "center";
    ctx.fillText(xLabel, padding.left + plotWidth / 2, height - 16);

    for (const item of series) {
      if (item.points.length < 2) {
        continue;
      }
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(item.dashed ? [6, 4] : []);
      ctx.beginPath();
      for (let index = 0; index < item.points.length; index += 1) {
        const point = item.points[index];
        const x = padding.left + ((point.x - minX) / (maxX - minX)) * plotWidth;
        const y = padding.top + plotHeight - ((point.y - displayMinY) / displayRangeY) * plotHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let legendY = padding.top + 4;
    for (const item of series) {
      const lastPoint = item.points[item.points.length - 1];
      if (!lastPoint) {
        continue;
      }
      ctx.fillStyle = item.color;
      ctx.fillRect(padding.left + 8, legendY + 2, 10, 3);
      ctx.fillStyle = "#c7d2de";
      ctx.fillText(`${item.name}: ${lastPoint.y.toFixed(3)}`, padding.left + 24, legendY);
      legendY += 15;
    }
  }, [series, xLabel, yLabel]);

  return (
    <div className={styles.debugStageChart} ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};
