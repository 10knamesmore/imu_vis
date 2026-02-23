import { useEffect, useMemo, useState } from "react";
import { Card, Checkbox, Col, Empty, Row, Select, Space, Statistic, Tag } from "antd";

import { DebugStageChart, type DebugChartSeries } from "../../components/DebugStageChart";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useDebugStreams } from "../../hooks/useDebugStreams";

import styles from "./DebugPanel.module.scss";

const WINDOW_MS = 10_000;

const OUTPUT_COLORS = ["#5aa9ff", "#ffb454", "#7dd3a6", "#d29bff", "#f78fb3", "#8bd3ff"];
const INPUT_COLORS = ["#9fc9ff", "#ffd38a", "#a8e8c3", "#e3c9ff", "#ffc0d4", "#b9e7ff"];

type PathOption = {
  label: string;
  value: string;
};

/**
 * 收集对象中的数值叶子路径。
 */
const collectNumericPaths = (value: unknown, prefix: string, output: Set<string>) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (prefix) {
      output.add(prefix);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : `${index}`;
      collectNumericPaths(item, nextPrefix, output);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectNumericPaths(child, nextPrefix, output);
    }
  }
};

/**
 * 从对象中按路径读取数值。
 */
const readNumberByPath = (value: unknown, path: string): number | undefined => {
  if (!path) {
    return undefined;
  }
  const parts = path.split(".");
  let cursor: unknown = value;
  for (const part of parts) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }
    if (cursor && typeof cursor === "object" && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  if (typeof cursor === "number" && Number.isFinite(cursor)) {
    return cursor;
  }
  return undefined;
};

/**
 * Debug 双流面板。
 */
export const DebugPanel = () => {
  const { connectedDevice } = useBluetooth();
  const {
    framesRef,
    framesRevision,
    latestFrame,
    monitorTick,
    frontendRxHz,
  } = useDebugStreams();
  /** 已选中的 stage 名称。 */
  const [selectedStageNames, setSelectedStageNames] = useState<string[]>([]);
  /** 已选中的 input 数值路径。 */
  const [selectedInputPath, setSelectedInputPath] = useState<string>("");
  /** 已选中的 output 数值路径。 */
  const [selectedOutputPath, setSelectedOutputPath] = useState<string>("");

  const stageOptions = useMemo<PathOption[]>(() => {
    if (!latestFrame) {
      return [];
    }
    return latestFrame.stages.map((stage) => ({
      label: stage.name,
      value: stage.name,
    }));
  }, [latestFrame]);

  useEffect(() => {
    if (!stageOptions.length) {
      setSelectedStageNames([]);
      return;
    }
    setSelectedStageNames((previous) => {
      const next = previous.filter((name) => stageOptions.some((option) => option.value === name));
      if (next.length > 0) {
        return next;
      }
      return [stageOptions[0].value];
    });
  }, [stageOptions]);

  const inputPathOptions = useMemo<PathOption[]>(() => {
    if (!latestFrame || !selectedStageNames.length) {
      return [];
    }
    const paths = new Set<string>();
    for (const stage of latestFrame.stages) {
      if (!selectedStageNames.includes(stage.name)) {
        continue;
      }
      collectNumericPaths(stage.input, "", paths);
    }
    return Array.from(paths)
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({ label: path, value: path }));
  }, [latestFrame, selectedStageNames]);

  const outputPathOptions = useMemo<PathOption[]>(() => {
    if (!latestFrame || !selectedStageNames.length) {
      return [];
    }
    const paths = new Set<string>();
    for (const stage of latestFrame.stages) {
      if (!selectedStageNames.includes(stage.name)) {
        continue;
      }
      collectNumericPaths(stage.output, "", paths);
    }
    return Array.from(paths)
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({ label: path, value: path }));
  }, [latestFrame, selectedStageNames]);

  useEffect(() => {
    if (!inputPathOptions.length) {
      setSelectedInputPath("");
      return;
    }
    setSelectedInputPath((previous) => {
      if (inputPathOptions.some((option) => option.value === previous)) {
        return previous;
      }
      return inputPathOptions[0].value;
    });
  }, [inputPathOptions]);

  useEffect(() => {
    if (!outputPathOptions.length) {
      setSelectedOutputPath("");
      return;
    }
    setSelectedOutputPath((previous) => {
      if (outputPathOptions.some((option) => option.value === previous)) {
        return previous;
      }
      return outputPathOptions[0].value;
    });
  }, [outputPathOptions]);

  const framesInWindow = useMemo(() => {
    const frames = framesRef.current;
    if (!frames.length) {
      return [] as typeof frames;
    }
    const latestTimestamp = frames[frames.length - 1].device_timestamp_ms;
    const startTimestamp = Math.max(0, latestTimestamp - WINDOW_MS);
    return frames.filter((frame) => frame.device_timestamp_ms >= startTimestamp);
  }, [framesRef, framesRevision]);

  const chartSeries = useMemo<DebugChartSeries[]>(() => {
    if (
      !framesInWindow.length ||
      !selectedStageNames.length ||
      !selectedInputPath ||
      !selectedOutputPath
    ) {
      return [];
    }

    const startTimestamp = framesInWindow[0].device_timestamp_ms;
    const series: DebugChartSeries[] = [];

    selectedStageNames.forEach((stageName, index) => {
      const inputPoints: Array<{ x: number; y: number }> = [];
      const outputPoints: Array<{ x: number; y: number }> = [];

      for (const frame of framesInWindow) {
        const stage = frame.stages.find((item) => item.name === stageName);
        if (!stage) {
          continue;
        }
        const x = (frame.device_timestamp_ms - startTimestamp) / 1000;
        const inputValue = readNumberByPath(stage.input, selectedInputPath);
        if (inputValue !== undefined) {
          inputPoints.push({ x, y: inputValue });
        }
        const outputValue = readNumberByPath(stage.output, selectedOutputPath);
        if (outputValue !== undefined) {
          outputPoints.push({ x, y: outputValue });
        }
      }

      if (inputPoints.length >= 2) {
        series.push({
          name: `${stageName}.input`,
          color: INPUT_COLORS[index % INPUT_COLORS.length],
          dashed: true,
          points: inputPoints,
        });
      }

      if (outputPoints.length >= 2) {
        series.push({
          name: `${stageName}.output`,
          color: OUTPUT_COLORS[index % OUTPUT_COLORS.length],
          points: outputPoints,
        });
      }
    });

    return series;
  }, [framesInWindow, selectedStageNames, selectedInputPath, selectedOutputPath]);

  const queueDepth = monitorTick?.queue_depth ?? { upstream: 0, downstream: 0, record: 0 };
  const queuePeak = monitorTick?.queue_peak ?? { upstream: 0, downstream: 0, record: 0 };
  const inputHz = monitorTick?.input_hz ?? 0;
  const pipelineHz = monitorTick?.pipeline_hz ?? 0;
  const outputHz = monitorTick?.output_hz ?? 0;
  const bufferedFrames = framesRef.current.length;

  /**
   * 处理 stage 多选变更。
   */
  const handleStageSelectionChange = (values: Array<string | number | boolean>) => {
    setSelectedStageNames(values.map((value) => String(value)));
  };

  return (
    <div className={styles.debugPanel}>
      <Card
        title="监控流（1Hz）"
        size="small"
        variant="outlined"
        className={styles.monitorCard}
        style={{ background: "#141414", border: "1px solid #303030" }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="input_hz" value={inputHz} precision={1} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="pipeline_hz" value={pipelineHz} precision={1} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="output_hz" value={outputHz} precision={1} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="frontend_rx_hz" value={frontendRxHz} precision={1} />
          </Col>
        </Row>
        <Row gutter={[12, 12]} className={styles.queueRow}>
          <Col xs={24} md={8}>
            <Card size="small" className={styles.queueCard}>
              <Statistic
                title="upstream queue"
                value={queueDepth.upstream}
                suffix={<span className={styles.queueSuffix}>peak {queuePeak.upstream}</span>}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" className={styles.queueCard}>
              <Statistic
                title="downstream queue"
                value={queueDepth.downstream}
                suffix={<span className={styles.queueSuffix}>peak {queuePeak.downstream}</span>}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" className={styles.queueCard}>
              <Statistic
                title="record queue"
                value={queueDepth.record}
                suffix={<span className={styles.queueSuffix}>peak {queuePeak.record}</span>}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="实时流阶段对比（250Hz）"
        size="small"
        variant="outlined"
        className={styles.realtimeCard}
        style={{ background: "#141414", border: "1px solid #303030" }}
      >
        {!latestFrame ? (
          <Empty description="等待 Debug 实时流..." />
        ) : (
          <Space direction="vertical" className={styles.realtimeContent} size={12}>
            <div className={styles.toolbar}>
              <div className={styles.selectorGroup}>
                <span className={styles.selectorLabel}>Stages</span>
                <Checkbox.Group
                  value={selectedStageNames}
                  options={stageOptions}
                  onChange={handleStageSelectionChange}
                />
              </div>
              <div className={styles.selectorGroup}>
                <span className={styles.selectorLabel}>Input Path</span>
                <Select
                  className={styles.pathSelect}
                  value={selectedInputPath || undefined}
                  onChange={setSelectedInputPath}
                  options={inputPathOptions}
                  showSearch
                  placeholder="选择 input 数值路径"
                />
              </div>
              <div className={styles.selectorGroup}>
                <span className={styles.selectorLabel}>Output Path</span>
                <Select
                  className={styles.pathSelect}
                  value={selectedOutputPath || undefined}
                  onChange={setSelectedOutputPath}
                  options={outputPathOptions}
                  showSearch
                  placeholder="选择 output 数值路径"
                />
              </div>
            </div>

            <div className={styles.metaRow}>
              <Tag color={connectedDevice ? "green" : "default"}>
                {connectedDevice ? "设备已连接" : "设备未连接"}
              </Tag>
              <Tag color="blue">缓冲帧数 {bufferedFrames}</Tag>
              <Tag color="purple">窗口 {WINDOW_MS / 1000}s</Tag>
              <Tag color="cyan">最新序号 #{latestFrame.seq}</Tag>
            </div>

            <DebugStageChart
              series={chartSeries}
              xLabel="Time (s)"
              yLabel={`${selectedInputPath || selectedOutputPath || "value"}`}
            />
          </Space>
        )}
      </Card>
    </div>
  );
};
