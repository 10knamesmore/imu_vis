import { useEffect, useState } from 'react';
import { Layout, Modal, Tabs } from 'antd';

import { ConnectionPanel, SettingsPanel } from './components/ConnectionPanel';
import { ImuRealtimePanel } from './pages/ImuRealtimePanel';
import { useBluetooth } from './hooks/useBluetooth';
import { useDeveloperMode } from './hooks/useDeveloperMode';
import { AppProviders } from './providers';

import styles from "./App.module.scss";

const { Content } = Layout;

/**
 * 应用主内容区域组件。
 */
const AppContent = () => {
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  /** 当前主内容 tab key。 */
  const [activeTabKey, setActiveTabKey] = useState("realtime");
  const { connectedDevice, startScan, stopScan } = useBluetooth();
  const { isDeveloperMode } = useDeveloperMode();


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

  /**
   * 非开发者模式下强制回到实时页签，避免隐藏 tab 后 key 残留。
   */
  useEffect(() => {
    if (!isDeveloperMode && activeTabKey !== "realtime") {
      setActiveTabKey("realtime");
    }
  }, [isDeveloperMode, activeTabKey]);

  const mainTabs = [
    {
      key: "realtime",
      label: "实时面板",
      children: (
        <div className={styles.tabPane}>
          <ImuRealtimePanel
            onOpenDeviceModal={handleDeviceModalOpen}
            onOpenSettingsModal={handleSettingsModalOpen}
          />
        </div>
      ),
    },
    {
      key: "debug",
      label: "Debug",
      children: (
        <div className={styles.tabPane}>
          <div className={styles.debugEmptyPage} />
        </div>
      ),
    },
  ]

  return (
    <Layout className={styles.appLayout}>
      <Content className={styles.appContent}>
        {isDeveloperMode ? (
          <Tabs
            className={styles.appTabs}
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={mainTabs}
          />
        ) : (
          <ImuRealtimePanel
            onOpenDeviceModal={handleDeviceModalOpen}
            onOpenSettingsModal={handleSettingsModalOpen}
          />
        )}

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
