import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

type AuthStage = 'GEMINI_SETUP' | 'LOGIN' | 'AUTHENTICATED';

export const useAuth = () => {
  const [authStage, setAuthStage] = useState<AuthStage>('GEMINI_SETUP');
  const [isWatcherActive, setIsWatcherActive] = useState(false);

  useEffect(() => {
    // Listen for clipboard events from Rust
    const unlisten = listen<{ provider: string; key: string }>('clipboard-text', async (event) => {
      const { provider, key } = event.payload;

      // 1. Stop Watcher
      await invoke('stop_clipboard_watcher');
      setIsWatcherActive(false);

      // 2. Encrypt & Save (Rust handles the file writing)
      await invoke('encrypt_and_save', { plaintext: key, provider });

      // 3. Handle Transitions
      if (provider === 'gemini') {
        // Check if user has a profile (legacy logic) or just go to Login
        const hasProfile = await invoke('check_file_exists', { filename: 'profile.json' });
        if (hasProfile) {
            setAuthStage('AUTHENTICATED'); // Skip login if profile exists
        } else {
            setAuthStage('LOGIN');
        }
      } 
      // Note: ImgBB window closing is handled inside the Rust 'encrypt_and_save' command
    });

    return () => {
      unlisten.then(f => f());
      // Cleanup: stop watcher if component unmounts
      invoke('stop_clipboard_watcher');
    };
  }, []);

  const startWatcher = async () => {
    if (isWatcherActive) return;
    setIsWatcherActive(true);
    await invoke('start_clipboard_watcher');
  };

  const completeGeminiSetup = () => {
     // This is called by the UI button
     const deepLink = "https://aistudio.google.com/app/apikey";
     invoke("open_external_url", { url: deepLink });
     startWatcher();
  };
  
  const startImgbbSetup = async () => {
      // Called by ImgBB Component
      const deepLink = "https://api.imgbb.com/";
      invoke("open_external_url", { url: deepLink });
      await invoke('start_clipboard_watcher');
  };

  const login = () => {
    setAuthStage('AUTHENTICATED');
  };

  return { 
    authStage, 
    isAuthenticated: authStage === 'AUTHENTICATED',
    completeGeminiSetup,
    startImgbbSetup, // Expose this for ImgBB component
    isWatcherActive,
    login
  };
};