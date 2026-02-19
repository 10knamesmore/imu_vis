import { useEffect, useState } from 'react';
import { Button, Col, Input, Row, Select, Space, Tag, message } from 'antd';
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

const parseConfigInput = (raw: string): ProcessorPipelineConfig => {
  const parsed = JSON.parse(raw) as ProcessorPipelineConfig;
  return parsed;
};

/** 连接和处理配置面板。 */
export const ConfigPanel = () => {
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
  const [configText, setConfigText] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

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
          setConfigText(JSON.stringify(config, null, 2));
        }
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, [connectedDevice, getPipelineConfig]);

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

  const handleApplyConfig = async () => {
    let config: ProcessorPipelineConfig;
    try {
      config = parseConfigInput(configText);
    } catch (err) {
      console.error(err);
      message.error("配置 JSON 格式错误");
      return;
    }
    setApplyingConfig(true);
    try {
      await updatePipelineConfig(config);
    } finally {
      setApplyingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await savePipelineConfig();
    } finally {
      setSavingConfig(false);
    }
  };

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
                <Text strong>Pipeline 配置（JSON）</Text>
              </Col>
              <Col>
                <Space>
                  <Button
                    onClick={async () => {
                      setLoadingConfig(true);
                      try {
                        const config = await getPipelineConfig();
                        if (config) {
                          setConfigText(JSON.stringify(config, null, 2));
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
                    onClick={() => setConfigText(JSON.stringify(DEFAULT_CONFIG, null, 2))}
                  >
                    重置默认模板
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleApplyConfig}
                    loading={applyingConfig}
                  >
                    应用配置
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
            <Input.TextArea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              autoSize={{ minRows: 16, maxRows: 24 }}
              spellCheck={false}
            />
          </div>
        </>
      )}
    </div>
  );
};
