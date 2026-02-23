import { useContext } from 'react';

import {
  DeveloperModeContext,
  type DeveloperModeContextValue,
} from '../providers/developer-mode';

/**
 * 使用开发者模式全局状态的 Hook。
 */
export const useDeveloperMode = (): DeveloperModeContextValue => {
  const context = useContext(DeveloperModeContext);

  if (!context) {
    throw new Error('useDeveloperMode must be used within DeveloperModeProvider');
  }

  return context;
};
