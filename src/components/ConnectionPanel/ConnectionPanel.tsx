import { useEffect, useRef, useState } from 'react';
import { Button, Col, Form, InputNumber, Row, Select, Space, Switch, Tag, Typography, message } from 'antd';
import { ReloadOutlined, PoweroffOutlined, CheckCircleOutlined, SignalFilled } from '@ant-design/icons';
import Text from "antd/es/typography/Text";

import { useBluetooth } from '../../hooks/useBluetooth';
import { ProcessorPipelineConfig } from '../../types';

import styles from "./ConnectionPanel.module.scss";

const DEFAULT_SEARCH_VALUE = "im";

const getRssiColor = (rssi?: number) => {
  if (!rssi) return '#d9d9d9'; // grey for unknown
  if (rssi >= -60) return '#52c41a'; // green for strong
  if (rssi >= -80) return '#faad14'; // yellow for medium
  return '#f5222d'; // red for weak
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

const MATRIX_INDEX = [0, 1, 2] as const;

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

  const handleConnectClick = async () => {
    if (!selectedDeviceId) {
      message.warning('请选择要连接的设备');
      return;
    }
    const device = devices.find(d => d.id === selectedDeviceId);
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

  const isConnected = !!connectedDevice;

  const scheduleAutoApply = () => {
    if (autoApplyTimerRef.current !== undefined) {
      window.clearTimeout(autoApplyTimerRef.current);
    }
    autoApplyTimerRef.current = window.setTimeout(async () => {
      try {
        const config = await form.validateFields();
        await updatePipelineConfig(config);
      } catch (err) {
        // 表单未完成输入时跳过本次自动应用
        console.debug('auto apply skipped', err);
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

  const renderMatrixField = (label: string, field: MatrixField) => (
    <Form.Item label={label} style={{ marginBottom: 12 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        {MATRIX_INDEX.map((row) => (
          <Row gutter={8} key={`${field}-${row}`}>
            {MATRIX_INDEX.map((col) => (
              <Col span={8} key={`${field}-${row}-${col}`}>
                <Form.Item
                  name={['calibration', field, row, col]}
                  rules={[{ required: true, message: '必填' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            ))}
          </Row>
        ))}
      </Space>
    </Form.Item>
  );

  useEffect(() => {
    return () => {
      if (autoApplyTimerRef.current !== undefined) {
        window.clearTimeout(autoApplyTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.connectionPanel}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Tag color="blue" style={{ fontSize: '14px', padding: '5px 10px' }}>
            已发现 <strong>{devices.length}</strong> 台设备
          </Tag>
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined spin={scanning} />}
            onClick={async () => {
              await toggleScan();
            }}
            type={scanning ? "default" : "primary"}
          >
            {scanning ? "扫描中..." : "开始扫描"}
          </Button>
        </Col>
      </Row>

      <Row gutter={16} align="middle">
        <Col flex="auto">
          <Select
            style={{ width: '100%' }}
            placeholder="请选择要连接的设备"
            labelRender={(props) => {
              return (
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>{props.label}</span>
                </Space>
              );
            }}
            options={devices.map(peripheral => (
              {
                label: peripheral.local_name || '<未知设备>',
                value: peripheral.id,
                address: peripheral.address,
                rssi: peripheral.rssi,
              }
            ))}
            optionRender={(option) => {
              const data = option.data
              const rssiColor = getRssiColor(data.rssi);
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Space orientation="vertical" size={0}>
                    <Text strong>{data.label}</Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>{data.value}</Text>
                  </Space>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SignalFilled style={{ color: rssiColor }} />
                    <span style={{ color: '#888', minWidth: 30, textAlign: 'right' }}>
                      {option.data.rssi || '-'}
                    </span>
                  </div>
                </div>
              )
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
        <>
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Tag color="success" icon={<CheckCircleOutlined />}>
              已连接到 {connectedDevice?.local_name || '设备'}
            </Tag>
          </div>
          <div style={{ marginTop: 20 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
              <Col>
                <Text strong>Pipeline 配置</Text>
              </Col>
              <Col>
                <Space>
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
                  <Button
                    onClick={() => form.setFieldsValue(DEFAULT_CONFIG)}
                  >
                    重置默认值
                  </Button>
                  <Button
                    onClick={handleSaveConfig}
                    loading={savingConfig}
                  >
                    保存当前生效到文件
                  </Button>
                </Space>
              </Col>
            </Row>
            <Form
              form={form}
              layout="vertical"
              initialValues={DEFAULT_CONFIG}
              onValuesChange={scheduleAutoApply}
            >
              <Typography.Title level={5}>Global</Typography.Title>
              <Form.Item
                label="gravity"
                name={['global', 'gravity']}
                rules={[{ required: true, message: '必填' }]}
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>

              <Typography.Title level={5}>Calibration</Typography.Title>
              <Form.Item label="passby" name={['calibration', 'passby']} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="accel_bias.x" name={['calibration', 'accel_bias', 'x']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="accel_bias.y" name={['calibration', 'accel_bias', 'y']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="accel_bias.z" name={['calibration', 'accel_bias', 'z']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="gyro_bias.x" name={['calibration', 'gyro_bias', 'x']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="gyro_bias.y" name={['calibration', 'gyro_bias', 'y']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="gyro_bias.z" name={['calibration', 'gyro_bias', 'z']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              {renderMatrixField('accel_matrix', 'accel_matrix')}
              {renderMatrixField('gyro_matrix', 'gyro_matrix')}

              <Typography.Title level={5}>Filter</Typography.Title>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="passby" name={['filter', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item label="alpha" name={['filter', 'alpha']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Typography.Title level={5}>Attitude Fusion</Typography.Title>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="passby" name={['attitude_fusion', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item label="beta" name={['attitude_fusion', 'beta']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Typography.Title level={5}>Trajectory</Typography.Title>
              <Form.Item label="passby" name={['trajectory', 'passby']} valuePropName="checked">
                <Switch />
              </Form.Item>

              <Typography.Title level={5}>ZUPT</Typography.Title>
              <Form.Item label="passby" name={['zupt', 'passby']} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="gyro_thresh" name={['zupt', 'gyro_thresh']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="accel_thresh" name={['zupt', 'accel_thresh']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="bias_correction_gain" name={['zupt', 'bias_correction_gain']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Typography.Title level={5}>EKF</Typography.Title>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="passby" name={['ekf', 'passby']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="enabled" name={['ekf', 'enabled']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        </>
      )}
    </div>
  );
};
