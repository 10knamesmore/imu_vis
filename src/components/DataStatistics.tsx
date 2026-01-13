import React, { useRef } from 'react';
import Plot from 'react-plotly.js';
import { Card, Row, Col, Statistic, InputNumber, message } from 'antd';
import { useBluetooth } from '../hooks/useBluetooth';

export const Statistics: React.FC = () => {
  const { dataHistory, uiRefreshMs, setUiRefreshMs, lastSecondMessageCount } = useBluetooth();

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
    <div className="visualizer">

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
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <Card title="Acceleration (No Gravity)" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.accel.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.accel.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.accel.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Acceleration (m/s²)' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Gyroscope" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.gyro.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.gyro.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.gyro.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Gyroscope (deg/s)' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Angle" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.angle.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.angle.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.angle.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Angle (deg)' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="Acceleration (With Gravity)" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.accelWithG.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.accelWithG.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.accelWithG.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Acceleration (m/s²)' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Quaternion" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.quat.w, type: 'scatter', mode: 'lines', name: 'W' },
                { x: dataHistory.time, y: dataHistory.quat.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.quat.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.quat.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Quaternion' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Offset" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.offset.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.offset.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.offset.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Offset' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="Acceleration (Nav)" size="small" variant='outlined' style={{ background: '#141414', border: '1px solid #303030' }} styles={{ header: { color: 'white' } }}>
            <Plot
              data={[
                { x: dataHistory.time, y: dataHistory.accelNav.x, type: 'scatter', mode: 'lines', name: 'X' },
                { x: dataHistory.time, y: dataHistory.accelNav.y, type: 'scatter', mode: 'lines', name: 'Y' },
                { x: dataHistory.time, y: dataHistory.accelNav.z, type: 'scatter', mode: 'lines', name: 'Z' },
              ]}
              layout={{ ...commonLayout, title: { text: 'Acceleration (Nav)' } }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
