import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Added 'LOADING' stage to prevent flash of setup screen
type AuthStage = 'LOADING' | 'GEMINI_SETUP' | 'LOGIN' | 'AUTHENTICATED';

export const useAuth = () => {
  const [authStage, setAuthStage] = useState<AuthStage>('LOADING'); 
  const [isWatcherActive, setIsWatcherActive] = useState(false);

  // 1. NEW: Check for existing keys on startup
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Check if gemini key exists
        const hasKey = await invoke<boolean>('check_file_exists', { filename: 'gemini_key.json' });
        
        if (hasKey) {
            // Optional: Check for profile.json if you want the Google Login flow
            const hasProfile = await invoke<boolean>('check_file_exists', { filename: 'profile.json' });
            setAuthStage(hasProfile ? 'AUTHENTICATED' : 'LOGIN');
        } else {
            setAuthStage('GEMINI_SETUP');
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        setAuthStage('GEMINI_SETUP');
      }
    };

    checkAuthStatus();
  }, []);

  useEffect(() => {
    // Listen for clipboard events from Rust
    const unlisten = listen<{ provider: string; key: string }>('clipboard-text', async (event) => {
      const { provider, key } = event.payload;

      // 1. OPTIMISTIC UPDATE: If ImgBB, close the window via command immediately
      // We don't wait for encryption. We just kill the window.
      if (provider === 'imgbb') {
          invoke('close_imgbb_window'); // We need to add this small command
      }

      await invoke('stop_clipboard_watcher');
      setIsWatcherActive(false);
      await invoke('encrypt_and_save', { plaintext: key, provider });
      
      // 3. Handle State Transitions
      if (provider === 'gemini') {
        const hasProfile = await invoke('check_file_exists', { filename: 'profile.json' });
        setAuthStage(hasProfile ? 'AUTHENTICATED' : 'LOGIN');
        // RELOAD page to ensure useSystemSync picks up the new key for the Chat Engine
        window.location.reload(); 
      }
      
      // If ImgBB, we don't change auth stage, just notify or let the user click Lens again
    });

    return () => {
      unlisten.then(f => f());
      invoke('stop_clipboard_watcher');
    };
  }, []);

  const startWatcher = async () => {
    if (isWatcherActive) return;
    setIsWatcherActive(true);
    await invoke('start_clipboard_watcher');
  };

  const completeGeminiSetup = () => {
     const deepLink = "https://aistudio.google.com/app/apikey";
     invoke("open_external_url", { url: deepLink });
     startWatcher();
  };
  
  // Removed startImgbbSetup from here (moved logic to useLens)

  const login = () => {
    setAuthStage('AUTHENTICATED');
  };

  return { 
    authStage, 
    isAuthenticated: authStage === 'AUTHENTICATED',
    completeGeminiSetup,
    isWatcherActive,
    login
  };
};