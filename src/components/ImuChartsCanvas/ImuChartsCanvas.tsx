import React, { useEffect, useRef } from "react";

import { ImuSource } from "../../hooks/useImuSource";
import { ImuDataHistory } from "../../types";

import styles from "./ImuChartsCanvas.scss";

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



/**
 * 截取 ImuDataHistory 的一部分
 */
const sliceSnapshot = (snapshot: ImuDataHistory, start: number, end: number): ImuDataHistory => {
  const s = (arr: number[]) => arr.slice(start, end);
  return {
    time: s(snapshot.time),
    accel: { x: s(snapshot.accel.x), y: s(snapshot.accel.y), z: s(snapshot.accel.z) },
    accelWithG: { x: s(snapshot.accelWithG.x), y: s(snapshot.accelWithG.y), z: s(snapshot.accelWithG.z) },
    gyro: { x: s(snapshot.gyro.x), y: s(snapshot.gyro.y), z: s(snapshot.gyro.z) },
    angle: { x: s(snapshot.angle.x), y: s(snapshot.angle.y), z: s(snapshot.angle.z) },
    quat: { w: s(snapshot.quat.w), x: s(snapshot.quat.x), y: s(snapshot.quat.y), z: s(snapshot.quat.z) },
    offset: { x: s(snapshot.offset.x), y: s(snapshot.offset.y), z: s(snapshot.offset.z) },
    accelNav: { x: s(snapshot.accelNav.x), y: s(snapshot.accelNav.y), z: s(snapshot.accelNav.z) },
  };
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
      viewStateRef.current.offset - dx * msPerPixel
    );
  };

  /**
   * 监听指针抬起：结束拖动
   */
  const handlePointerUp = (e: PointerEvent) => {
    viewStateRef.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
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

      // 获取全部历史数据
      const snapshot = source.bufferRef.current.snapshot();
      if (snapshot.time.length < 2) {
        ctx.fillStyle = "#6b7280";
        ctx.fillText("Waiting for IMU stream...", 16, 20);
        return;
      }

      // 根据视图状态截取数据
      const { duration, offset } = viewStateRef.current;
      const latestTime = snapshot.time[snapshot.time.length - 1];
      const viewEndTime = latestTime - offset;
      const viewStartTime = viewEndTime - duration;

      // 查找对应的时间范围索引
      // 简单遍历查找边界，由于数据有序，可以优化但此处数据量不大直接遍历即可
      let startIndex = 0;
      let endIndex = snapshot.time.length;

      // 找到第一个 >= viewStartTime 的点
      while (startIndex < snapshot.time.length && snapshot.time[startIndex] < viewStartTime) {
        startIndex++;
      }

      // 找到第一个 > viewEndTime 的点作为结束
      // 注意：如果 offset 为 0，endIndex 应该是 length
      if (offset > 0) {
        let i = startIndex;
        while (i < snapshot.time.length && snapshot.time[i] <= viewEndTime) {
          i++;
        }
        endIndex = i;
      }

      // 如果选区内没有足够数据
      if (endIndex - startIndex < 2) {
        // 尝试显示最近的数据，或者保持空
        if (startIndex > 0) startIndex = Math.max(0, startIndex - 2);
      }

      const viewData = sliceSnapshot(snapshot, startIndex, endIndex);

      const seriesValues = series.map((entry) => {
        const values = entry.getValues(viewData);
        return { name: entry.name, color: entry.color, values };
      });

      drawChart(
        ctx,
        viewData,
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
    <div className={styles.imuChartsCanvas} ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};
