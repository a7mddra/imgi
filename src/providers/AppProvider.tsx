// FILE: src/providers/AppProvider.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { TauriProvider } from './TauriProvider'; // Assuming this exists or is needed, but I'll stick to what I know

interface AppContextType {
  ready: boolean;
}

const AppContext = createContext<AppContextType>({ ready: true });

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AppContext.Provider value={{ ready: true }}>
        <ThemeProvider>
            {children}
        </ThemeProvider>
    </AppContext.Provider>
  );
};
