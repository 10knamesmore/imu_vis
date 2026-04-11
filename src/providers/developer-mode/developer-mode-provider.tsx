import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { DeveloperModeContext } from './developer-mode-context';

const STORAGE_KEY = 'imu_app_developer_mode';

type Props = {
  children: ReactNode;
};

/**
 * 从 localStorage 读取初始开发者模式状态，默认关闭。
 */
const getInitialDeveloperMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * 开发者模式全局 Provider。
 *
 * 管理开发者模式的开关状态，持久化到 localStorage。
 * 开发者模式开启后，诊断面板等调试功能对用户可见。
 */
export const DeveloperModeProvider = ({ children }: Props) => {
  const [developerMode, setDeveloperMode] = useState(getInitialDeveloperMode);

  const toggleDeveloperMode = useCallback(() => {
    setDeveloperMode((prev) => !prev);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(developerMode));
    } catch {
      // ignore
    }
  }, [developerMode]);

  return (
    <DeveloperModeContext.Provider value={{ developerMode, toggleDeveloperMode }}>
      {children}
    </DeveloperModeContext.Provider>
  );
};
