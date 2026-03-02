import { useEffect, useState } from 'react';
import { Layout, Modal } from 'antd';

import { ConnectionPanel, SettingsPanel } from './components/ConnectionPanel';
import { GlobalSettingFloatButton } from './components/GlobalSettingFloatButton';
import { CalibrationWizard } from './components/CalibrationWizard';
import { ImuRealtimePanel } from './pages/ImuRealtimePanel';
import { useBluetooth } from './hooks/useBluetooth';
import { AppProviders } from './providers';

import styles from "./App.module.scss";

const { Content } = Layout;

/**
 * 应用主内容区域组件。
 */
const AppContent = () => {
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { connectedDevice, startScan, stopScan, needsCalibration } = useBluetooth();

  const hasConnectedDevice = connectedDevice !== null;
  const showSettingsButton = hasConnectedDevice;
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

  // 首次连接未标定设备时全页替换为标定向导
  if (needsCalibration && connectedDevice) {
    return (
      <CalibrationWizard
        deviceAddress={connectedDevice.address}
      />
    );
  }

  return (
    <Layout className={styles.appLayout}>
      <Content className={styles.appContent}>
        <ImuRealtimePanel
          onOpenDeviceModal={handleDeviceModalOpen}
        />
        <GlobalSettingFloatButton
          onClick={handleSettingsModalOpen}
          visible={showSettingsButton}
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
          width={1500}
          styles={{
            body: {
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

/**
 * 应用根组件。
 */
const App = () => {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
};

export default App;
