import React, { useState, useEffect } from 'react';
import { Button, Select, Tag, Row, Col, Space, message } from 'antd';
import { ReloadOutlined, PoweroffOutlined, CheckCircleOutlined, SignalFilled } from '@ant-design/icons';
import { useBluetooth } from '../hooks/useBluetooth.tsx';
import Text from "antd/es/typography/Text"

const DEFAULT_SEARCH_VALUE = "im";

const getRssiColor = (rssi?: number) => {
  if (!rssi) return '#d9d9d9'; // grey for unknown
  if (rssi >= -60) return '#52c41a'; // green for strong
  if (rssi >= -80) return '#faad14'; // yellow for medium
  return '#f5222d'; // red for weak
};

export const ConnectionPanel: React.FC = () => {
  const {
    scanning,
    devices,
    connectedDevice,
    toggleScan,
    connect,
    disconnect
  } = useBluetooth();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchvalue, setSearchvalue] = useState(DEFAULT_SEARCH_VALUE);

  useEffect(() => {
    if (connectedDevice) {
      setSelectedDeviceId(connectedDevice.id);
    }
  }, [connectedDevice]);

  const handleConnectClick = async () => {
    if (!selectedDeviceId) return;
    const device = devices.find(d => d.id === selectedDeviceId);
    if (!device) {
      message.warning('Device not found in scan results');
      return;
    }
    await connect(selectedDeviceId);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setSelectedDeviceId(null);
  };

  const isConnected = !!connectedDevice;

  return (
    <div className="connection-panel">
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Tag color="blue" style={{ fontSize: '14px', padding: '5px 10px' }}>
            Found: <strong>{devices.length}</strong> Devices
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
            {scanning ? "Scanning..." : "Start Scan"}
          </Button>
        </Col>
      </Row>

      <Row gutter={16} align="middle">
        <Col flex="auto">
          <Select
            style={{ width: '100%' }}
            placeholder="Select a device to connect"
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
              Disconnect
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleConnectClick}
              disabled={!selectedDeviceId}
              size="large"
            >
              Connect
            </Button>
          )}
        </Col>
      </Row>

      {isConnected && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Connected to {connectedDevice?.local_name || 'Device'}
          </Tag>
        </div>
      )}
    </div>
  );
};
