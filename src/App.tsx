import React, { useEffect, useState } from 'react';
import { Layout, Modal } from 'antd';

import { ConnectionPanel, SettingsPanel } from './components/ConnectionPanel';
import { ImuRealtimePanel } from './pages/ImuRealtimePanel';
import { BluetoothProvider, useBluetooth } from './hooks/useBluetooth';

import styles from "./App.module.scss";

const { Content } = Layout;

/**
 * 应用主内容区域组件。
 */
const AppContent: React.FC = () => {
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { connectedDevice, startScan, stopScan } = useBluetooth()

  const hasConnectedDevice = connectedDevice !== null;
  const [wasConnected, setWasConnected] = useState(hasConnectedDevice);

  // 模态框打开时：如果没有连接设备，自动开始扫描
  const handleDeviceModalOpen = async () => {
    setIsDeviceModalOpen(true);
    if (!hasConnectedDevice) {
      await startScan();
    }
  }

  const handleDeviceModalClose = async () => {
    setIsDeviceModalOpen(false);
    await stopScan();
  }

  const handleSettingsModalOpen = () => {
    setIsSettingsModalOpen(true);
  };

  const handleSettingsModalClose = () => {
    setIsSettingsModalOpen(false);
  };

  useEffect(() => {
    if (!wasConnected && hasConnectedDevice && isDeviceModalOpen) {
      setIsDeviceModalOpen(false);
    }
    setWasConnected(hasConnectedDevice);
  }, [hasConnectedDevice, isDeviceModalOpen, wasConnected]);

  return (
    <Layout className={styles.appLayout}>
      <Content className={styles.appContent}>
        <ImuRealtimePanel
          onOpenDeviceModal={handleDeviceModalOpen}
          onOpenSettingsModal={handleSettingsModalOpen}
        />

        <Modal
          title="设备"
          open={isDeviceModalOpen}
          onCancel={handleDeviceModalClose}
          footer={null}
          width={800}
        >
          <ConnectionPanel />
        </Modal>

        <Modal
          title="设置"
          open={isSettingsModalOpen}
          onCancel={handleSettingsModalClose}
          footer={null}
          width={1360}
          styles={{
            body: {
              height: '74vh',
              overflow: 'hidden',
              padding: 12,
            },
          }}
        >
          <SettingsPanel />
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
