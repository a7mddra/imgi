import { useState } from 'react';

// STAGES: 0=Checking, 1=NeedsGemini, 2=NeedsLogin, 3=Authenticated
type AuthStage = 'GEMINI_SETUP' | 'LOGIN' | 'AUTHENTICATED';

export const useAuth = () => {
  // Default to Gemini Setup first, as requested
  const [authStage, setAuthStage] = useState<AuthStage>('GEMINI_SETUP');

  const completeGeminiSetup = () => {
    setAuthStage('LOGIN');
  };

  const login = () => {
    setAuthStage('AUTHENTICATED');
  };

  return { 
    authStage, 
    isAuthenticated: authStage === 'AUTHENTICATED',
    completeGeminiSetup,
    login
  };
};