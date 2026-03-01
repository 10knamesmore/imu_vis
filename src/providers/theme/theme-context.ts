import { createContext } from 'react';

/** 应用配色方案类型。 */
export type ColorScheme = 'dark' | 'light';

export type ThemeContextValue = {
  /** 当前配色方案。 */
  colorScheme: ColorScheme;
  /** 切换亮/暗色主题。 */
  toggleColorScheme: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
