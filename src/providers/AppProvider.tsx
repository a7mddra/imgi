import React, { createContext, useContext, ReactNode } from 'react';

// Simple context for now, we can expand later
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