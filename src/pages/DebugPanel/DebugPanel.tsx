import { useEffect, useMemo, useState } from "react";
import { Card, Checkbox, Col, Empty, Row, Statistic, Tag } from "antd";
import type { TabsProps } from "antd";

import { DebugSeriesCanvas, type DebugComparePoint } from "../../components/DebugSeriesCanvas";
import { ImuChartTabs } from "../../components/ImuChartTabs";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useDebugStreams } from "../../hooks/useDebugStreams";

import styles from "./DebugPanel.module.scss";

type PathOption = {
  label: string;
  value: string;
};

type StageSample = {
  /** 设备时间戳（毫秒）。 */
  t: number;
  /** 阶段输入 JSON。 */
  input: unknown;
  /** 阶段输出 JSON。 */
  output: unknown;
};

type StageSelectionMap = Record<string, string[]>;

/**
 * 收集对象中的数值叶子路径。
 *
 * @param value - 当前 JSON 节点
 * @param prefix - 当前路径前缀
 * @param output - 路径集合输出
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
 *
 * @param value - JSON 节点
 * @param path - 路径
 * @returns 数值或 undefined
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
 * 判断两个阶段选中映射是否一致。
 *
 * @param left - 旧映射
 * @param right - 新映射
 * @returns 是否一致
 */
const isSameStageSelectionMap = (left: StageSelectionMap, right: StageSelectionMap) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftValues = left[key] ?? [];
    const rightValues = right[key] ?? [];
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    for (let index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) {
        return false;
      }
    }
  }
  return true;
};

/**
 * 生成阶段可选 series 列表（输入/输出路径并集）。
 *
 * @param input - 阶段输入 JSON
 * @param output - 阶段输出 JSON
 * @returns 选项列表
 */
const buildSeriesOptions = (input: unknown, output: unknown): PathOption[] => {
  const paths = new Set<string>();
  collectNumericPaths(input, "", paths);
  collectNumericPaths(output, "", paths);
  return Array.from(paths)
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      label: path,
      value: path,
    }));
};

/**
 * 将阶段样本转换为单系列绘图点。
 *
 * @param samples - 阶段样本
 * @param path - 数值路径
 * @returns 对比点
 */
const buildSeriesPoints = (samples: StageSample[], path: string): DebugComparePoint[] => {
  const points: DebugComparePoint[] = [];
  for (const sample of samples) {
    const input = readNumberByPath(sample.input, path);
    const output = readNumberByPath(sample.output, path);
    if (input === undefined && output === undefined) {
      continue;
    }
    points.push({
      t: sample.t,
      input,
      output,
    });
  }
  return points;
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
  /** 图表区域折叠状态。 */
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  /** 每个 stage 的 series 选中状态。 */
  const [selectedSeriesByStage, setSelectedSeriesByStage] = useState<StageSelectionMap>({});

  /** 当前可用 stage 名称列表。 */
  const stageNames = useMemo(() => {
    if (!latestFrame) {
      return [] as string[];
    }
    return latestFrame.stages.map((stage) => stage.name);
  }, [latestFrame]);

  /** 每个 stage 的可选 series。 */
  const stageSeriesOptions = useMemo<Record<string, PathOption[]>>(() => {
    const optionsMap: Record<string, PathOption[]> = {};
    if (!latestFrame) {
      return optionsMap;
    }
    for (const stage of latestFrame.stages) {
      optionsMap[stage.name] = buildSeriesOptions(stage.input, stage.output);
    }
    return optionsMap;
  }, [latestFrame]);

  /**
   * 当 stage 或可选路径变化时，同步 series 选中状态。
   * 默认每个 stage 自动勾选第一个可选 series，便于直接看到图表。
   */
  useEffect(() => {
    if (!stageNames.length) {
      setSelectedSeriesByStage({});
      return;
    }
    setSelectedSeriesByStage((previous) => {
      const next: StageSelectionMap = {};
      for (const stageName of stageNames) {
        const availableSeries = stageSeriesOptions[stageName] ?? [];
        const availableSet = new Set(availableSeries.map((option) => option.value));
        const preserved = (previous[stageName] ?? []).filter((path) => availableSet.has(path));
        next[stageName] = preserved.length > 0
          ? preserved
          : (availableSeries[0] ? [availableSeries[0].value] : []);
      }
      return isSameStageSelectionMap(previous, next) ? previous : next;
    });
  }, [stageNames, stageSeriesOptions]);

  /** 将帧缓冲整理为按 stage 分组的样本序列。 */
  const stageSamplesByName = useMemo<Record<string, StageSample[]>>(() => {
    const stageMap: Record<string, StageSample[]> = {};
    for (const frame of framesRef.current) {
      for (const stage of frame.stages) {
        if (!stageMap[stage.name]) {
          stageMap[stage.name] = [];
        }
        stageMap[stage.name].push({
          t: frame.device_timestamp_ms,
          input: stage.input,
          output: stage.output,
        });
      }
    }
    return stageMap;
  }, [framesRef, framesRevision]);

  /**
   * 处理 stage 的 series 勾选变更。
   *
   * @param stageName - 阶段名称
   * @param values - 勾选项
   */
  const handleSeriesSelectionChange = (stageName: string, values: Array<string | number | boolean>) => {
    const nextValues = values.map((value) => String(value));
    setSelectedSeriesByStage((previous) => ({
      ...previous,
      [stageName]: nextValues,
    }));
  };

  /** stage tabs 内容。 */
  const stageTabItems = useMemo<TabsProps["items"]>(() => {
    if (!stageNames.length) {
      return [];
    }
    return stageNames.map((stageName) => {
      const options = stageSeriesOptions[stageName] ?? [];
      const selectedSeries = selectedSeriesByStage[stageName] ?? [];
      const samples = stageSamplesByName[stageName] ?? [];
      const chartEntries = selectedSeries.map((path) => ({
        path,
        points: buildSeriesPoints(samples, path),
      }));

      return {
        key: stageName,
        label: `${stageName} (${selectedSeries.length})`,
        children: (
          <div className={styles.stageTabPane}>
            <div className={styles.selectorGroup}>
              <span className={styles.selectorLabel}>Series（勾选即新增图表）</span>
              {options.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前 stage 没有可用数值路径" />
              ) : (
                <Checkbox.Group
                  options={options}
                  value={selectedSeries}
                  onChange={(values) => handleSeriesSelectionChange(stageName, values)}
                  className={styles.seriesSelector}
                />
              )}
            </div>

            {selectedSeries.length === 0 ? (
              <Empty description="请选择至少一个 series" />
            ) : (
              <div className={styles.seriesCharts}>
                {chartEntries.map((entry) => (
                  <DebugSeriesCanvas
                    key={`${stageName}:${entry.path}`}
                    title={`${stageName} · ${entry.path}`}
                    points={entry.points}
                  />
                ))}
              </div>
            )}
          </div>
        ),
      };
    });
  }, [selectedSeriesByStage, stageNames, stageSamplesByName, stageSeriesOptions]);

  const queueDepth = monitorTick?.queue_depth ?? { upstream: 0, downstream: 0, record: 0 };
  const queuePeak = monitorTick?.queue_peak ?? { upstream: 0, downstream: 0, record: 0 };
  const inputHz = monitorTick?.input_hz ?? 0;
  const pipelineHz = monitorTick?.pipeline_hz ?? 0;
  const outputHz = monitorTick?.output_hz ?? 0;
  const bufferedFrames = framesRef.current.length;

  /**
   * 切换图表区域折叠状态。
   */
  const handleToggleChartsCollapsed = () => {
    setChartsCollapsed((previous) => !previous);
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
          <div className={styles.realtimeContent}>
            <div className={styles.metaRow}>
              <Tag color={connectedDevice ? "green" : "default"}>
                {connectedDevice ? "设备已连接" : "设备未连接"}
              </Tag>
              <Tag color="blue">缓冲帧数 {bufferedFrames}</Tag>
              <Tag color="cyan">最新序号 #{latestFrame.seq}</Tag>
            </div>
            <div className={styles.tabsWrap}>
              <ImuChartTabs
                items={stageTabItems}
                collapsed={chartsCollapsed}
                onToggleCollapsed={handleToggleChartsCollapsed}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
