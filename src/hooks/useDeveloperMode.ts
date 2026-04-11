import { useContext } from 'react';

import { DeveloperModeContext } from '../providers/developer-mode';

/**
 * 获取开发者模式状态及切换函数。
 */
export const useDeveloperMode = () => {
  const ctx = useContext(DeveloperModeContext);
  if (!ctx) throw new Error('useDeveloperMode must be used within DeveloperModeProvider');
  return ctx;
};
