import type { ReactNode } from 'react';

import { BluetoothProvider } from './bluetooth';
import { DeveloperModeProvider } from './developer-mode';
import { ThemeProvider } from './theme';

type Props = {
  children: ReactNode;
};

/**
 * 应用级全局 Provider 组合。
 */
export const AppProviders = ({ children }: Props) => {
  return (
    <ThemeProvider>
      <DeveloperModeProvider>
        <BluetoothProvider>{children}</BluetoothProvider>
      </DeveloperModeProvider>
    </ThemeProvider>
  );
};

export { BluetoothProvider, BluetoothContext } from './bluetooth';
export type { BluetoothContextValue, DataMode } from './bluetooth';
export { DeveloperModeProvider, DeveloperModeContext } from './developer-mode';
export type { DeveloperModeContextValue } from './developer-mode';
export { ThemeProvider, ThemeContext } from './theme';
export type { ThemeContextValue, ColorScheme } from './theme';
