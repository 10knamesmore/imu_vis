import React, { useEffect, useState } from 'react';
import { Layout, Tabs, Modal, Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

import { ConfigPanel } from './components/ConnectionPanel';
import { ImuRealtimePanel } from './pages/ImuRealtimePanel';
import { BluetoothProvider, useBluetooth } from './hooks/useBluetooth';

import styles from "./App.module.scss";

const { Content } = Layout;

/**
 * 应用主内容区域组件。
 */
const AppContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { connectedDevice, startScan, stopScan } = useBluetooth()

  const hasConnectedDevice = connectedDevice !== null;

  const items = [
    {
      key: '1',
      label: '可视化',
      children: <ImuRealtimePanel />,
    },
  ];

  // 模态框打开时：如果没有连接设备，自动开始扫描
  const handleModalOpen = async () => {
    setIsModalOpen(true);
    if (!hasConnectedDevice) {
      await startScan();
    }
  }

  // 模态框关闭时：停止扫描
  const handleModalClose = async () => {
    setIsModalOpen(false);
    await stopScan();
  }

  // 当设备连接成功后，自动关闭设备管理模态框
  useEffect(() => {
    if (hasConnectedDevice && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [hasConnectedDevice]);

  return (
    <Layout className={styles.appLayout}>
      <Content className={styles.appContent}>
        <Tabs
          defaultActiveKey="1"
          items={items}
          className={styles.appTabs}
          tabBarExtraContent={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              className={hasConnectedDevice ? styles.deviceButtonConnected : undefined}
              onClick={handleModalOpen}
            >
              设备与设置
            </Button>
          }
          destroyOnHidden
        />

        <Modal
          title="设备与配置"
          open={isModalOpen}
          onCancel={handleModalClose}
          footer={null}
          width={800}
        >
          <ConfigPanel />
        </Modal>
      </Content>
    </Layout>
  );
};

// 辅助组件：将多个 Provider 合并
/**
 * 组合多个 Provider 的辅助组件。
 */
const Compose = ({ providers, children }: { providers: React.FC<{ children: React.ReactNode }>[]; children: React.ReactNode }) => {
  return (
    <>
      {providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children)}
    </>
  );
};

/**
 * 应用根组件。
 */
const App: React.FC = () => {
  return (
    <Compose providers={[BluetoothProvider]}>
      <AppContent />
    </Compose>
  );
};

export default App;
