import React, { useMemo, useRef } from 'react';
import Plot from 'react-plotly.js';
import { Button, Card, Row, Col, Statistic, InputNumber, message, Tag } from 'antd';

import { useBluetooth } from '../../hooks/useBluetooth';

import { RecordingsPanel } from '../../components/RecordingsPanel';
import styles from "./DataStatistics.module.scss";

type Series = { name: string; values: number[] };

/**
 * 单条曲线图与最新值统计卡片组件。
 */
const LinePlotCard: React.FC<{
  title: string;
  yTitle: string;
  time: number[];
  series: Series[];
  layoutBase: Record<string, unknown>;
  revision: number;
}> = ({ title, yTitle, time, series, layoutBase, revision }) => {
  const data = useMemo(() => {
    const timeSeconds = time.map((t) => t / 1000);
    return series.map((s) => ({
      x: timeSeconds,
      y: s.values.slice(),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: s.name,
    }));
  }, [series, time]);

  const latestValues = useMemo(
    () =>
      series.map((s) => ({
        name: s.name,
        value: s.values.length ? s.values[s.values.length - 1] : undefined,
      })),
    [series]
  );

  return (
    <Card
      title={title}
      size="small"
      variant="outlined"
      style={{ background: '#141414', border: '1px solid #303030' }}
      styles={{ header: { color: 'white' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Plot
            data={data}
            layout={{
              ...layoutBase,
              title: { text: yTitle },
              xaxis: { ...(layoutBase as { xaxis?: object }).xaxis, title: { text: '时间 (s)' } },
            }}
            revision={revision}
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
        <div
          style={{
            width: 50,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'stretch',
          }}
        >
          {latestValues.map((item) => (
            <Statistic
              key={item.name}
              title={item.name}
              value={item.value === undefined ? '--' : item.value.toFixed(3)}
              styles={{
                title: { color: '#999', fontSize: 12, marginBottom: 2 },
                content: { color: '#fff', fontSize: 14, fontVariantNumeric: 'tabular-nums' },
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
};

/**
 * 数据统计与回放面板组件。
 * @deprecated 使用ImuRealtimePanel
 */
export const Statistics: React.FC = () => {
  const {
    connectedDevice,
    dataHistory,
    plotRevision,
    uiRefreshMs,
    setUiRefreshMs,
    lastSecondMessageCount,
    recording,
    recordingStatus,
    toggleRecording,
  } = useBluetooth();

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const commonLayout = {
    height: 300,
    margin: { t: 30, r: 10, l: 40, b: 30 },
    showlegend: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc' },
    xaxis: { gridcolor: '#333' },
    yaxis: { gridcolor: '#333' }
  };

  return (
    <div className={styles.visualizer}>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ body: { padding: '12px 16px' } }}>
            <Row gutter={[16, 8]} align="middle">
              <Col flex="none">
                <span style={{ color: '#ccc', marginRight: 8 }}>UI 刷新 (Hz)</span>
                <InputNumber
                  min={5}
                  max={60}
                  value={Math.round(1000 / uiRefreshMs)}
                  onChange={(value) => {
                    if (value !== null) {
                      const clamped = Math.min(60, Math.max(5, value));
                      const targetMs = Math.round(1000 / clamped);
                      setUiRefreshMs(targetMs);
                      message.info(`Set UI refresh rate to ${clamped} Hz`);
                    }
                  }}
                />
              </Col>
              <Col flex="auto">
                <Statistic
                  title="上一秒收到数据包数"
                  value={lastSecondMessageCount}
                  styles={{ content: { color: '#fff' } }}
                />
              </Col>
              <Col flex="auto">
                <Statistic
                  title="渲染次数(for dev)"
                  value={renderCountRef.current}
                  styles={{ content: { color: '#fff' } }}
                />
              </Col>
              <Col flex='none'>
                <Statistic
                  title="revision"
                  value={plotRevision}
                  styles={{ content: { color: '#fff' } }}
                />
              </Col>
              <Col flex="none">
                <Button
                  type={recording ? 'primary' : 'default'}
                  danger={recording}
                  onClick={toggleRecording}
                  disabled={!connectedDevice}
                >
                  {recording ? '停止录制' : '开始录制'}
                </Button>
              </Col>
              <Col flex="none">
                <Tag color={recording ? 'red' : 'default'}>
                  {recording ? `录制中: ${recordingStatus?.session_id ?? '-'}` : '录制: 关闭'}
                </Tag>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <RecordingsPanel />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="加速度（无重力）"
            yTitle="加速度 (m/s²)"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.accel.x },
              { name: 'Y', values: dataHistory.builtin.accel.y },
              { name: 'Z', values: dataHistory.builtin.accel.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="陀螺仪"
            yTitle="角速度 (deg/s)"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.gyro.x },
              { name: 'Y', values: dataHistory.builtin.gyro.y },
              { name: 'Z', values: dataHistory.builtin.gyro.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="姿态角"
            yTitle="角度 (deg)"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.angle.x },
              { name: 'Y', values: dataHistory.builtin.angle.y },
              { name: 'Z', values: dataHistory.builtin.angle.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="加速度（含重力）"
            yTitle="加速度 (m/s²)"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.accelWithG.x },
              { name: 'Y', values: dataHistory.builtin.accelWithG.y },
              { name: 'Z', values: dataHistory.builtin.accelWithG.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="四元数"
            yTitle="四元数"
            time={dataHistory.time}
            series={[
              { name: 'W', values: dataHistory.builtin.quat.w },
              { name: 'X', values: dataHistory.builtin.quat.x },
              { name: 'Y', values: dataHistory.builtin.quat.y },
              { name: 'Z', values: dataHistory.builtin.quat.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="偏移"
            yTitle="偏移"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.offset.x },
              { name: 'Y', values: dataHistory.builtin.offset.y },
              { name: 'Z', values: dataHistory.builtin.offset.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
        <Col span={24}>
          <LinePlotCard
            title="导航加速度"
            yTitle="导航加速度"
            time={dataHistory.time}
            series={[
              { name: 'X', values: dataHistory.builtin.accelNav.x },
              { name: 'Y', values: dataHistory.builtin.accelNav.y },
              { name: 'Z', values: dataHistory.builtin.accelNav.z },
            ]}
            layoutBase={commonLayout}
            revision={plotRevision}
          />
        </Col>
      </Row>
    </div>
  );
};
