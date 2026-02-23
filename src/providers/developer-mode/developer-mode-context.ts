import { createContext } from 'react';

export type DeveloperModeContextValue = {
  /** 当前是否开启开发者模式。 */
  isDeveloperMode: boolean;
  /** 开启开发者模式。 */
  enableDeveloperMode: () => void;
  /** 关闭开发者模式。 */
  disableDeveloperMode: () => void;
};

export const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(null);
