import { createContext } from 'react';

/** 开发者模式上下文值。 */
export type DeveloperModeContextValue = {
  /** 是否已启用开发者模式。 */
  developerMode: boolean;
  /** 切换开发者模式开关。 */
  toggleDeveloperMode: () => void;
};

export const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(null);
