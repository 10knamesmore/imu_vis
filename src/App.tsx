import React, { useEffect, useState } from 'react';
import { Layout, Tabs, Modal, Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { ConnectionPanel } from './components/ConnectionPanel';
import { Statistics } from './components/DataStatistics';
import { BluetoothProvider, useBluetooth } from './hooks/useBluetooth';
import './App.scss';

const { Header, Content } = Layout;

const AppContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { connectedDevice, startScan, stopScan } = useBluetooth()

  const hasConnectedDevice = connectedDevice !== null;

  const items = [
    {
      key: '1',
      label: '基础数据',
      children: <Statistics />,
    },
  ];

  const handleModalOpen = async () => {
    setIsModalOpen(true);
    if (!hasConnectedDevice) {
      await startScan();
    }
  }

  const handleModalClose = async () => {
    setIsModalOpen(false);
    await stopScan();
  }

  useEffect(() => {
    if (hasConnectedDevice && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [hasConnectedDevice]);

  return (
    <Layout className="app-layout">
      <Header style={{ display: 'flex', alignItems: 'center', color: 'white', background: '#141414', borderBottom: '1px solid #303030' }}>
        <div className="logo" style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
          IMU 轨迹重建可视化
        </div>
      </Header>
      <Content style={{ padding: '24px', minHeight: '100vh', background: '#000' }}>
        <Tabs
          defaultActiveKey="1"
          items={items}
          tabBarExtraContent={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              className={hasConnectedDevice ? 'device-button-connected' : undefined}
              onClick={handleModalOpen}
            >
              Devices
            </Button>
          }
        />

        <Modal
          title="设备管理"
          open={isModalOpen}
          onCancel={handleModalClose}
          footer={null}
          width={800}
        >
          <ConnectionPanel />
        </Modal>
      </Content>
    </Layout>
  );
};

// 辅助组件：将多个 Provider 合并
const Compose = ({ providers, children }: { providers: React.FC<{ children: React.ReactNode }>[]; children: React.ReactNode }) => {
  return (
    <>
      {providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children)}
    </>
  );
};

const App: React.FC = () => {
  return (
    <Compose providers={[BluetoothProvider]}>
      <AppContent />
    </Compose>
  );
};

export default App;
