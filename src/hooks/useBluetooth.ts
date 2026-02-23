import { useContext } from 'react';

import { BluetoothContext, type BluetoothContextValue } from '../providers/bluetooth';

/**
 * 使用蓝牙全局状态与操作的 Hook。
 */
export const useBluetooth = (): BluetoothContextValue => {
  const context = useContext(BluetoothContext);

  if (!context) {
    throw new Error('useBluetooth must be used within BluetoothProvider');
  }

  return context;
};
