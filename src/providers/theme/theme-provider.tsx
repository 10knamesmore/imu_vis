import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider, theme } from 'antd';

import { ThemeContext, type ColorScheme } from './theme-context';

const STORAGE_KEY = 'imu_app_color_scheme';

type Props = {
  children: ReactNode;
};

/**
 * 从 localStorage 读取初始配色方案，默认为 dark。
 */
const getInitialColorScheme = (): ColorScheme => {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  return 'dark';
};

/**
 * 将配色方案应用到 document 根元素属性。
 */
const applyColorScheme = (colorScheme: ColorScheme) => {
  document.documentElement.setAttribute('data-color-scheme', colorScheme);
};

/**
 * 主题全局 Provider，包含 Ant Design ConfigProvider。
 */
export const ThemeProvider = ({ children }: Props) => {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getInitialColorScheme);

  /** 切换亮/暗色主题。 */
  const toggleColorScheme = useCallback(() => {
    setColorScheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  /** 同步 data-color-scheme 属性与 localStorage。 */
  useEffect(() => {
    applyColorScheme(colorScheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, colorScheme);
    } catch {
      // ignore
    }
  }, [colorScheme]);

  const antdTheme =
    colorScheme === 'dark'
      ? {
          algorithm: theme.darkAlgorithm,
          token: {
            colorBgBase: '#0a0a0a',
            colorTextBase: '#fff',
          },
        }
      : {
          algorithm: theme.defaultAlgorithm,
        };

  return (
    <ThemeContext.Provider value={{ colorScheme, toggleColorScheme }}>
      <ConfigProvider theme={antdTheme}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
