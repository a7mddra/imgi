// FILE: src/providers/AppProvider.tsx
import React, { createContext, useContext, ReactNode } from 'react';

interface AppContextType {
  ready: boolean;
}

const AppContext = createContext<AppContextType>({ ready: true });

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AppContext.Provider value={{ ready: true }}>
      {children}
    </AppContext.Provider>
  );
};