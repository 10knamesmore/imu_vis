import { useContext } from 'react';

import { ThemeContext } from '../providers/theme';

/**
 * 获取当前配色方案及切换函数。
 */
export const useColorScheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useColorScheme must be used within ThemeProvider');
  return ctx;
};
