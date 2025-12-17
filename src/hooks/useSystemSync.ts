/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { showToast } from "../components/ui/Notifications/Toast";
import { initializeGemini } from "../lib/api/gemini/client";
import { useTheme } from "./useTheme";
import { loadPreferences, savePreferences, hasPreferencesFile } from "../lib/config/preferences";
import { DEFAULT_MODEL, DEFAULT_PROMPT, DEFAULT_THEME } from "../lib/utils/constants";

export const useSystemSync = (onToggleSettings: () => void) => {
  const { theme, toggleTheme, setTheme } = useTheme();

  const onToggleSettingsRef = useRef(onToggleSettings);
  
  // Update ref whenever the passed function changes
  useEffect(() => {
    onToggleSettingsRef.current = onToggleSettings;
  }, [onToggleSettings]);

  const [apiKey, setApiKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>(DEFAULT_PROMPT);
  const [editingPrompt, setEditingPrompt] = useState<string>(DEFAULT_PROMPT);
  const [startupModel, setStartupModel] = useState<string>(DEFAULT_MODEL);
  const [editingModel, setEditingModel] = useState<string>(DEFAULT_MODEL);
  const [sessionModel, setSessionModel] = useState<string>(DEFAULT_MODEL);
  
  // User Data (Still mocked or via Tauri for now if not in preferences)
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");

  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  
  const [sessionLensUrl, setSessionLensUrl] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  // New: Agreement State
  const [hasAgreed, setHasAgreed] = useState<boolean | null>(null); // null = loading

  // Load Preferences & Agreement Status
  useEffect(() => {
    const init = async () => {
        // Check Agreement
        const agreed = await hasPreferencesFile();
        setHasAgreed(agreed);

        if (agreed) {
            const prefs = await loadPreferences();
            
            const loadedPrompt = prefs.prompt || DEFAULT_PROMPT;
            setActivePrompt(loadedPrompt);
            setEditingPrompt(loadedPrompt);
            
            const loadedModel = prefs.model || DEFAULT_MODEL;
            setStartupModel(loadedModel);
            setEditingModel(loadedModel);
            setSessionModel(loadedModel);

            if (prefs.theme) {
                setTheme(prefs.theme);
            }
        } else {
             // Fallback to defaults if no preferences file
             setTheme(DEFAULT_THEME as "light" | "dark");
        }
    };
    init();
  }, []);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];

    const setupIpc = async () => {
      try {
        const apiKey = await invoke<string>("get_api_key", { provider: "gemini" });
        if (apiKey) {
          setApiKey(apiKey);
          initializeGemini(apiKey);
        }

        const userData = await invoke<any>("get_user_data");
        if (userData) {
          setUserName(userData.name);
          setUserEmail(userData.email);
          setAvatarSrc(userData.avatar);
        }
      } catch (e) {
        console.error("Config load error", e);
        setSystemError("Failed to load configuration.");
      }

      const loadImageFromPath = async (path: string) => {
        try {
          const data = await invoke<{ base64: string; mimeType: string }>(
            "read_image_file",
            { path }
          );
          if (data) {
            setStartupImage(data);
          }
        } catch (e) {
          console.error("Failed to read image file", e);
        }
      };

      const unlistenImage = await listen<string>("image-path", (event) => {
        loadImageFromPath(event.payload);
      });
      unlisteners.push(unlistenImage);
    };

    setupIpc();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [onToggleSettings]);

  const saveSettingsHandler = async (newPrompt: string, newModel: string) => {
    setStartupModel(newModel);
    setEditingModel(newModel);
    setActivePrompt(newPrompt);
    setEditingPrompt(newPrompt);
    
    try {
        await savePreferences({
            prompt: newPrompt,
            model: newModel,
            theme: theme
        });
        showToast("Settings saved", "done");
    } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : String(e);
        showToast(`Failed to save`, "error");
    }
  };

  const handleToggleTheme = () => {
    toggleTheme();
  };

  const handleLogout = async () => {
    try {
        await invoke("logout");
        // Clear User Data Only
        setUserName("");
        setUserEmail("");
        setAvatarSrc("");
        
        // CRITICAL: We do NOT clear startupImage or sessionLensUrl here.
        // This preserves the session for the next user.
    } catch (e) {
        console.error("Logout failed", e);
    }
  };

// ... inside useSystemSync hook

  const handleResetAPIKey = async () => {
    try {
        await invoke("reset_api_key");
        
        // 3. Clear State
        setApiKey("");
        setHasAgreed(null);
        
        // 4. Prevent "Update Page" hijack
        sessionStorage.setItem('update_dismissed', 'true');
        
        // 5. Reload (The disk operation is guaranteed done because we awaited the promise)
        window.location.reload();
    } catch (e) {
        showToast("Reset failed", "error");
    }
  };

  return {
    apiKey,
    prompt: activePrompt,
    editingPrompt,
    setEditingPrompt,
    startupModel,
    editingModel,
    setEditingModel,
    sessionModel,
    setSessionModel,
    startupImage,
    setStartupImage,    
    userName,
    userEmail,
    avatarSrc,
    isDarkMode: theme === "dark",
    systemError,
    clearSystemError,
    saveSettings: saveSettingsHandler,
    handleToggleTheme,
    handleLogout,
    handleResetAPIKey,
    hasAgreed,
    setHasAgreed,
    sessionLensUrl, 
    setSessionLensUrl 
  };
};