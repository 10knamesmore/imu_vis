import { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Empty, Form, InputNumber, Row, Select, Space, Switch, Tabs, Tag, message } from 'antd';
import { ReloadOutlined, PoweroffOutlined, CheckCircleOutlined, SignalFilled } from '@ant-design/icons';
import Text from "antd/es/typography/Text";

import { useBluetooth } from '../../hooks/useBluetooth';
import { useDeveloperMode } from '../../hooks/useDeveloperMode';
import { ProcessorPipelineConfig } from '../../types';

import styles from "./ConnectionPanel.module.scss";

const DEFAULT_SEARCH_VALUE = "im";
const numberRules = [{ required: true, message: '必填' }];

const DEFAULT_CONFIG: ProcessorPipelineConfig = {
  global: { gravity: 9.80665 },
  calibration: {
    passby: false,
    accel_bias: { x: 0, y: 0, z: 0 },
    gyro_bias: { x: 0, y: 0, z: 0 },
    accel_matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    gyro_matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  },
  filter: { passby: false, alpha: 0.9 },
  trajectory: {
    passby: false,
    integrator: 'trapezoid',
    dt_min_ms: 1,
    dt_max_ms: 50,
  },
  zupt: {
    passby: false,
    impl_type: 'smooth_hysteresis',
    gyro_thresh: 0.1,
    accel_thresh: 0.2,
    gyro_enter_thresh: 0.12,
    accel_enter_thresh: 0.18,
    gyro_exit_thresh: 0.2,
    accel_exit_thresh: 0.3,
    enter_frames: 6,
    exit_frames: 3,
    vel_decay_tau_ms: 120,
    pos_lock_tau_ms: 180,
    vel_zero_eps: 0.02,
  },
};

const getRssiColor = (rssi?: number) => {
  if (!rssi) return '#d9d9d9';
  if (rssi >= -60) return '#52c41a';
  if (rssi >= -80) return '#faad14';
  return '#f5222d';
};

/** 设备连接面板。 */
export const ConnectionPanel = () => {
  const { scanning, devices, connectedDevice, toggleScan, connect, disconnect } = useBluetooth();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchvalue, setSearchvalue] = useState(DEFAULT_SEARCH_VALUE);

  useEffect(() => {
    if (connectedDevice) {
      setSelectedDeviceId(connectedDevice.id);
    }
  }, [connectedDevice]);

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
                  <div className={styles.deviceMeta}>
                    <Text strong>{data.label}</Text>
                    <div className={styles.deviceSubLine}>
                      <Text type="secondary" className={styles.deviceIdText}>{data.value}</Text>
                      <div className={styles.rssiWrap}>
                        <SignalFilled style={{ color: rssiColor }} />
                        <span className={styles.rssiValue}>{option.data.rssi || '-'}</span>
                      </div>
                    </div>
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
        <div className={styles.connectedLine}>
          <Tag color="success" icon={<CheckCircleOutlined />}>
            已连接到 {connectedDevice?.local_name || '设备'}
          </Tag>
        </div>
      )}
    </div>
  );
};

/** 设置面板。 */
export const SettingsPanel = () => {
  const [form] = Form.useForm<ProcessorPipelineConfig>();
  const {
    connectedDevice,
    getPipelineConfig,
    updatePipelineConfig,
    savePipelineConfig,
    setNeedsCalibration,
  } = useBluetooth();
  const { isDeveloperMode, enableDeveloperMode, disableDeveloperMode } = useDeveloperMode();
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const autoApplyTimerRef = useRef<number | undefined>(undefined);
  const integrator = Form.useWatch(['trajectory', 'integrator'], form);
  const zuptImplType = Form.useWatch(['zupt', 'impl_type'], form);

  /**
   * 切换开发者模式开关。
   * @param checked - 目标开关状态，true 表示开启，false 表示关闭。
   */
  const handleDeveloperModeChange = (checked: boolean) => {
    if (checked) {
      enableDeveloperMode();
      message.success('开发者模式已开启');
      return;
    }
    disableDeveloperMode();
    message.info('开发者模式已关闭');
  };

  /** 渲染开发者模式开关区域。 */
  const renderDeveloperModeControl = () => (
    isDeveloperMode &&
    <div className={styles.developerModeBar}>
      <Tag color={isDeveloperMode ? 'geekblue' : 'default'}>开发者模式</Tag>
      <Switch
        size="small"
        checked={isDeveloperMode}
        onChange={handleDeveloperModeChange}
        checkedChildren="开"
        unCheckedChildren="关"
      />
    </div>
  );

  useEffect(() => {
    const loadConfig = async () => {
      if (!connectedDevice) return;
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

  const scheduleAutoApply = () => {
    if (autoApplyTimerRef.current !== undefined) {
      window.clearTimeout(autoApplyTimerRef.current);
    }
    autoApplyTimerRef.current = window.setTimeout(async () => {
      try {
        const config = await form.validateFields();
        console.info('[SettingsPanel] apply pipeline config:', JSON.stringify(config, null, 2));
        await updatePipelineConfig(config);
      } catch {
        // ignore invalid intermediate input
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

  if (!connectedDevice) {
    return (
      <div className={`${styles.connectionPanel} ${styles.settingsPanel}`}>
        {renderDeveloperModeControl()}
        <Empty description="请先在“设备”面板连接设备后再配置参数" />
      </div>
    );
  }

  return (
    <div className={`${styles.connectionPanel} ${styles.settingsPanel}`}>
      <div className={styles.configHeader}>
        <Text strong>流水线 配置</Text>
        <Space wrap>
          {renderDeveloperModeControl()}
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

      <Form form={form} layout="vertical" initialValues={DEFAULT_CONFIG} onValuesChange={scheduleAutoApply} className={styles.settingsForm}>
        <Tabs
          className={styles.settingsTabs}
          items={[
            {
              key: 'base',
              label: '基础配置',
              children: (
                <div className={styles.tabPane}>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} lg={6}>
                      <Card size="small" title="全局" className={styles.sectionCard}>
                        <Form.Item label="重力加速度" name={['global', 'gravity']} rules={numberRules} className={styles.compactItem}>
                          <InputNumber className={styles.numberInput} />
                        </Form.Item>
                      </Card>
                    </Col>
                    <Col xs={24} lg={6}>
                      <Card size="small" title="滤波" className={styles.sectionCard}>
                        <Form.Item label="跳过处理" name={['filter', 'passby']} valuePropName="checked">
                          <Switch />
                        </Form.Item>
                        <Form.Item label="平滑系数(alpha)" name={['filter', 'alpha']} rules={numberRules} className={styles.compactItem}>
                          <InputNumber className={styles.numberInput} />
                        </Form.Item>
                      </Card>
                    </Col>
                    <Col xs={24} lg={6}>
                      <Card size="small" title="轨迹计算" className={styles.sectionCard}>
                        <Form.Item label="跳过处理" name={['trajectory', 'passby']} valuePropName="checked" className={styles.compactItem}>
                          <Switch />
                        </Form.Item>
                        <Form.Item label="积分实现" name={['trajectory', 'integrator']} rules={numberRules} className={styles.compactItem}>
                          <Select
                            options={[
                              { label: '欧拉积分', value: 'legacy_euler' },
                              { label: '梯形积分', value: 'trapezoid' },
                            ]}
                          />
                        </Form.Item>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item label="最小步长 dt_min_ms" name={['trajectory', 'dt_min_ms']} rules={numberRules} className={styles.compactItem}>
                              <InputNumber className={styles.numberInput} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item label="最大步长 dt_max_ms" name={['trajectory', 'dt_max_ms']} rules={numberRules} className={styles.compactItem}>
                              <InputNumber className={styles.numberInput} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          当前: {integrator === 'legacy_euler' ? '旧版一阶欧拉积分' : '梯形积分'}
                        </Text>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card size="small" title="ZUPT(零速更新)" className={styles.sectionCard}>
                        <Form.Item label="跳过处理" name={['zupt', 'passby']} valuePropName="checked">
                          <Switch />
                        </Form.Item>
                        <Form.Item label="ZUPT 实现" name={['zupt', 'impl_type']} rules={numberRules} className={styles.compactItem}>
                          <Select
                            options={[
                              { label: '硬锁定', value: 'legacy_hard_lock' },
                              { label: '平滑滞回', value: 'smooth_hysteresis' },
                            ]}
                          />
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
                        </Row>
                        {zuptImplType === 'smooth_hysteresis' && (
                          <>
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label="进入角速度阈值" name={['zupt', 'gyro_enter_thresh']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item label="进入加速度阈值" name={['zupt', 'accel_enter_thresh']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label="退出角速度阈值" name={['zupt', 'gyro_exit_thresh']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item label="退出加速度阈值" name={['zupt', 'accel_exit_thresh']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={12}>
                              <Col xs={24} md={8}>
                                <Form.Item label="进入帧数" name={['zupt', 'enter_frames']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item label="退出帧数" name={['zupt', 'exit_frames']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item label="速度归零阈值" name={['zupt', 'vel_zero_eps']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label="速度衰减tau(ms)" name={['zupt', 'vel_decay_tau_ms']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item label="位置锁定tau(ms)" name={['zupt', 'pos_lock_tau_ms']} rules={numberRules} className={styles.compactItem}>
                                  <InputNumber className={styles.numberInput} />
                                </Form.Item>
                              </Col>
                            </Row>
                          </>
                        )}
                      </Card>
                    </Col>
                    <Col xs={24} lg={6}>
                      <Card size="small" title="加速度计标定" className={styles.sectionCard}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                          标定参数由向导采集并自动应用，无需手动调整。
                        </Text>
                        <Button
                          type="primary"
                          danger
                          block
                          onClick={() => setNeedsCalibration(true)}
                        >
                          重新标定
                        </Button>
                      </Card>
                    </Col>
                  </Row>
                </div>
              ),
            },
          ]}
        />
      </Form>
    </div>
  );
};
