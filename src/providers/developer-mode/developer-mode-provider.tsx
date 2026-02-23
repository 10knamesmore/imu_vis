import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { DeveloperModeContext } from './developer-mode-context';

const STORAGE_KEY = 'imu_app_developer_mode';

type Props = {
  children: ReactNode;
};

/**
 * 读取本地存储中的开发者模式开关值。
 */
const getInitialDeveloperMode = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * 开发者模式全局 Provider。
 */
export const DeveloperModeProvider = ({ children }: Props) => {
  /** 全局开发者模式状态。 */
  const [isDeveloperMode, setIsDeveloperMode] = useState(getInitialDeveloperMode);

  /** 开启开发者模式。 */
  const enableDeveloperMode = useCallback(() => {
    setIsDeveloperMode(true);
  }, []);

  /** 关闭开发者模式。 */
  const disableDeveloperMode = useCallback(() => {
    setIsDeveloperMode(false);
  }, []);

  /**
   * 将开发者模式同步到本地存储，保证刷新后状态不丢失。
   */
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, isDeveloperMode ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }, [isDeveloperMode]);

  return (
    <DeveloperModeContext.Provider
      value={{ isDeveloperMode, enableDeveloperMode, disableDeveloperMode }}
    >
      {children}
    </DeveloperModeContext.Provider>
  );
};
