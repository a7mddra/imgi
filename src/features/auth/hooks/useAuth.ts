import { useState, useEffect } from 'react';

// MOCK AUTH for Development
export const useAuth = () => {
  // Set this to true to see the App, false to see Onboarding
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const login = () => setIsAuthenticated(true);
  const logout = () => setIsAuthenticated(false);

  return { isAuthenticated, isLoading, login, logout, user: { name: "Dev Architect", email: "deffffgtrgrgtrgtrgtgtgtgtgtrgtgtrv@spatialshot.app" } };
};