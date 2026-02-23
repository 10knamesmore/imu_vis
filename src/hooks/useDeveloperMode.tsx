import React, { useCallback, useContext, useEffect, useState } from "react";

type DeveloperModeContextValue = {
  /** 当前是否开启开发者模式。 */
  isDeveloperMode: boolean;
  /** 开启开发者模式。 */
  enableDeveloperMode: () => void;
  /** 关闭开发者模式。 */
  disableDeveloperMode: () => void;
};

const STORAGE_KEY = "imu_app_developer_mode";
const DeveloperModeContext = React.createContext<DeveloperModeContextValue | null>(null);

/**
 * 读取本地存储中的开发者模式开关值。
 */
const getInitialDeveloperMode = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * 开发者模式全局 Provider。
 */
export const DeveloperModeProvider = ({ children }: { children: React.ReactNode }) => {
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
      window.localStorage.setItem(STORAGE_KEY, isDeveloperMode ? "1" : "0");
    } catch {
      // ignore storage failure
    }
  }, [isDeveloperMode]);

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, enableDeveloperMode, disableDeveloperMode }}>
      {children}
    </DeveloperModeContext.Provider>
  );
};

/**
 * 使用开发者模式全局状态的 Hook。
 */
export const useDeveloperMode = () => {
  const ctx = useContext(DeveloperModeContext);
  if (!ctx) {
    throw new Error("useDeveloperMode must be used within DeveloperModeProvider");
  }
  return ctx;
};

