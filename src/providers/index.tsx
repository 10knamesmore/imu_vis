import type { ReactNode } from 'react';

import { BluetoothProvider } from './bluetooth';
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
      <BluetoothProvider>{children}</BluetoothProvider>
    </ThemeProvider>
  );
};

export { BluetoothProvider, BluetoothContext } from './bluetooth';
export type { BluetoothContextValue, DataMode } from './bluetooth';
export { ThemeProvider, ThemeContext } from './theme';
export type { ThemeContextValue, ColorScheme } from './theme';
