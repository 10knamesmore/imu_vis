import { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Form, InputNumber, Row, Select, Space, Switch, Tag, message } from 'antd';
import { ReloadOutlined, PoweroffOutlined, CheckCircleOutlined, SignalFilled } from '@ant-design/icons';
import Text from "antd/es/typography/Text";

import { useBluetooth } from '../../hooks/useBluetooth';
import { ProcessorPipelineConfig } from '../../types';

import styles from "./ConnectionPanel.module.scss";

const DEFAULT_SEARCH_VALUE = "im";
const MATRIX_INDEX = [0, 1, 2] as const;
const AXIS_LABELS = ['X', 'Y', 'Z'] as const;
const numberRules = [{ required: true, message: '必填' }];

const getRssiColor = (rssi?: number) => {
  if (!rssi) return '#d9d9d9';
  if (rssi >= -60) return '#52c41a';
  if (rssi >= -80) return '#faad14';
  return '#f5222d';
};

const DEFAULT_CONFIG: ProcessorPipelineConfig = {
  global: {
    gravity: 9.80665,
  },
  calibration: {
    passby: false,
    accel_bias: { x: 0, y: 0, z: 0 },
    gyro_bias: { x: 0, y: 0, z: 0 },
    accel_matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    gyro_matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  },
  filter: {
    passby: false,
    alpha: 0.9,
  },
  attitude_fusion: {
    passby: false,
    beta: 0.02,
  },
  trajectory: {
    passby: false,
  },
  zupt: {
    passby: false,
    gyro_thresh: 0.1,
    accel_thresh: 0.2,
    bias_correction_gain: 0.01,
  },
  ekf: {
    passby: false,
    enabled: false,
  },
};

type MatrixField = 'accel_matrix' | 'gyro_matrix';

/** 连接和处理配置面板。 */
export const ConfigPanel = () => {
  const [form] = Form.useForm<ProcessorPipelineConfig>();
  const {
    scanning,
    devices,
    connectedDevice,
    toggleScan,
    connect,
    disconnect,
    getPipelineConfig,
    updatePipelineConfig,
    savePipelineConfig,
  } = useBluetooth();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchvalue, setSearchvalue] = useState(DEFAULT_SEARCH_VALUE);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const autoApplyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (connectedDevice) {
      setSelectedDeviceId(connectedDevice.id);
    }
  }, [connectedDevice]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!connectedDevice) {
        return;
      }
      setLoadingConfig(true);
      try {
        const config = await getPipelineConfig();
        if (config) {
          form.setFieldsValue(config);
        }
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, [connectedDevice, form, getPipelineConfig]);

  useEffect(() => {
    return () => {
      if (autoApplyTimerRef.current !== undefined) {
        window.clearTimeout(autoApplyTimerRef.current);
      }
    };
  }, []);

  const handleConnectClick = async () => {
    if (!selectedDeviceId) {
      message.warning('请选择要连接的设备');
      return;
    }
    const device = devices.find((d) => d.id === selectedDeviceId);
    if (!device) {
      message.warning('扫描结果中未找到该设备');
      return;
    }
    await connect(selectedDeviceId);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setSelectedDeviceId(null);
  };

  const scheduleAutoApply = () => {
    if (autoApplyTimerRef.current !== undefined) {
      window.clearTimeout(autoApplyTimerRef.current);
    }
    autoApplyTimerRef.current = window.setTimeout(async () => {
      try {
        const config = await form.validateFields();
        await updatePipelineConfig(config);
      } catch {
        // 输入中态不触发下发
      }
    }, 300);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await savePipelineConfig();
    } finally {
      setSavingConfig(false);
    }
  };

  const renderVec3Fields = (label: string, basePath: (string | number)[]) => (
    <Form.Item label={label} className={styles.formBlock}>
      <Row gutter={12}>
        <Col xs={24} md={8}>
          <Form.Item name={[...basePath, 'x']} rules={numberRules} label="X" className={styles.compactItem}>
            <InputNumber className={styles.numberInput} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name={[...basePath, 'y']} rules={numberRules} label="Y" className={styles.compactItem}>
            <InputNumber className={styles.numberInput} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name={[...basePath, 'z']} rules={numberRules} label="Z" className={styles.compactItem}>
            <InputNumber className={styles.numberInput} />
          </Form.Item>
        </Col>
      </Row>
    </Form.Item>
  );

  const renderMatrixField = (label: string, field: MatrixField) => (
    <Form.Item label={label} className={styles.formBlock}>
      <div className={styles.matrixWrap}>
        <Row gutter={8} className={styles.matrixHeaderRow}>
          <Col span={3} />
          {MATRIX_INDEX.map((col) => (
            <Col span={7} key={`${field}-header-${col}`} className={styles.matrixAxisLabel}>
              {AXIS_LABELS[col]}
            </Col>
          ))}
        </Row>
        {MATRIX_INDEX.map((row) => (
          <Row gutter={8} key={`${field}-${row}`} className={styles.matrixRow}>
            <Col span={3} className={styles.matrixAxisLabel}>
              {AXIS_LABELS[row]}
            </Col>
            {MATRIX_INDEX.map((col) => (
              <Col span={7} key={`${field}-${row}-${col}`}>
                <Form.Item
                  name={['calibration', field, row, col]}
                  rules={numberRules}
                  className={styles.compactItem}
                >
                  <InputNumber className={styles.numberInput} />
                </Form.Item>
              </Col>
            ))}
          </Row>
        ))}
      </div>
    </Form.Item>
  );

  const isConnected = !!connectedDevice;

  return (
    <div className={styles.connectionPanel}>
      <Row justify="space-between" align="middle" className={styles.toolbarRow}>
        <Col>
          <Tag color="blue" className={styles.deviceTag}>
            已发现 <strong>{devices.length}</strong> 台设备
          </Tag>
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined spin={scanning} />}
            onClick={toggleScan}
            type={scanning ? "default" : "primary"}
          >
            {scanning ? "扫描中..." : "开始扫描"}
          </Button>
        </Col>
      </Row>

      <Row gutter={16} align="middle">
        <Col flex="auto">
          <Select
            className={styles.deviceSelect}
            placeholder="请选择要连接的设备"
            labelRender={(props) => (
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>{props.label}</span>
              </Space>
            )}
            options={devices.map((peripheral) => ({
              label: peripheral.local_name || '<未知设备>',
              value: peripheral.id,
              address: peripheral.address,
              rssi: peripheral.rssi,
            }))}
            optionRender={(option) => {
              const data = option.data;
              const rssiColor = getRssiColor(data.rssi);
              return (
                <div className={styles.deviceOption}>
                  <Space direction="vertical" size={0}>
                    <Text strong>{data.label}</Text>
                    <Text type="secondary" className={styles.deviceIdText}>{data.value}</Text>
                  </Space>
                  <div className={styles.rssiWrap}>
                    <SignalFilled style={{ color: rssiColor }} />
                    <span className={styles.rssiValue}>
                      {option.data.rssi || '-'}
                    </span>
                  </div>
                </div>
              );
            }}
            value={selectedDeviceId}
            onChange={setSelectedDeviceId}
            disabled={isConnected}
            showSearch={{
              searchValue: searchvalue,
              onSearch: setSearchvalue,
              filterSort: (a, b) =>
                (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase())
            }}
          />
        </Col>
        <Col>
          {isConnected ? (
            <Button
              type="primary"
              danger
              icon={<PoweroffOutlined />}
              onClick={handleDisconnect}
              size="large"
            >
              断开连接
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleConnectClick}
              disabled={!selectedDeviceId}
              size="large"
            >
              连接
            </Button>
          )}
        </Col>
      </Row>

      {isConnected && (
        <div className={styles.configArea}>
          <div className={styles.connectedLine}>
            <Tag color="success" icon={<CheckCircleOutlined />}>
              已连接到 {connectedDevice?.local_name || '设备'}
            </Tag>
          </div>

          <div className={styles.configHeader}>
            <Text strong>Pipeline 配置</Text>
            <Space wrap>
              <Button
                onClick={async () => {
                  setLoadingConfig(true);
                  try {
                    const config = await getPipelineConfig();
                    if (config) {
                      form.setFieldsValue(config);
                    }
                  } finally {
                    setLoadingConfig(false);
                  }
                }}
                loading={loadingConfig}
              >
                读取当前配置
              </Button>
              <Button onClick={() => form.setFieldsValue(DEFAULT_CONFIG)}>
                重置默认值
              </Button>
              <Button onClick={handleSaveConfig} loading={savingConfig}>
                保存当前生效到文件
              </Button>
            </Space>
          </div>

          <Form
            form={form}
            layout="vertical"
            initialValues={DEFAULT_CONFIG}
            onValuesChange={scheduleAutoApply}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={8}>
                <Card size="small" title="全局" className={styles.sectionCard}>
                  <Form.Item
                    label="重力加速度"
                    name={['global', 'gravity']}
                    rules={numberRules}
                    className={styles.compactItem}
                  >
                    <InputNumber className={styles.numberInput} />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24} lg={8}>
                <Card size="small" title="滤波" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['filter', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item label="平滑系数(alpha)" name={['filter', 'alpha']} rules={numberRules} className={styles.compactItem}>
                    <InputNumber className={styles.numberInput} />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24} lg={8}>
                <Card size="small" title="姿态融合" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['attitude_fusion', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item label="融合增益(beta)" name={['attitude_fusion', 'beta']} rules={numberRules} className={styles.compactItem}>
                    <InputNumber className={styles.numberInput} />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24}>
                <Card size="small" title="标定" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['calibration', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  {renderVec3Fields('加速度偏置(accel_bias)', ['calibration', 'accel_bias'])}
                  {renderVec3Fields('陀螺仪偏置(gyro_bias)', ['calibration', 'gyro_bias'])}
                  {renderMatrixField('加速度矩阵(accel_matrix)', 'accel_matrix')}
                  {renderMatrixField('陀螺仪矩阵(gyro_matrix)', 'gyro_matrix')}
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" title="轨迹计算" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['trajectory', 'passby']} valuePropName="checked" className={styles.compactItem}>
                    <Switch />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" title="EKF(扩展卡尔曼滤波)" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['ekf', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item label="启用" name={['ekf', 'enabled']} valuePropName="checked" className={styles.compactItem}>
                    <Switch />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24}>
                <Card size="small" title="ZUPT(零速更新)" className={styles.sectionCard}>
                  <Form.Item label="跳过处理" name={['zupt', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item label="角速度阈值(gyro_thresh)" name={['zupt', 'gyro_thresh']} rules={numberRules} className={styles.compactItem}>
                        <InputNumber className={styles.numberInput} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="加速度阈值(accel_thresh)" name={['zupt', 'accel_thresh']} rules={numberRules} className={styles.compactItem}>
                        <InputNumber className={styles.numberInput} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="偏置修正增益(bias_correction_gain)" name={['zupt', 'bias_correction_gain']} rules={numberRules} className={styles.compactItem}>
                        <InputNumber className={styles.numberInput} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </Form>
        </div>
      )}
    </div>
  );
};
