// FILE: src/components/layout/AppLayout.tsx

import React, { useState, useEffect, useCallback } from "react";
import "katex/dist/katex.min.css";
import "../ui/Notifications/Toast.css";
import { ContextMenu } from "../ui/ContextMenu/ContextMenu";
import { ChatLayout } from "../../features/chat/layouts/ChatLayout";
import { Welcome } from "../../features/onboarding";
import { Agreement } from "../../features/onboarding/components/Agreement/Agreement";
import { UpdateNotes } from "../../features/onboarding/components/UpdateNotes/UpdateNotes";
import { GeminiSetup } from "../../features/auth/components/BYOKey/GeminiSetup";
import { LoginScreen } from "../../features/auth/components/LoginScreen/LoginScreen";
import { useAuth } from "../../features/auth/hooks/useAuth"; 
import { useSystemSync } from "../../hooks/useSystemSync";
import { useChatEngine } from "../../features/chat/hooks/useChat";
import { useUpdateCheck, getPendingUpdate } from "../../hooks/useUpdateCheck";
import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export const AppLayout: React.FC = () => {
  const [isPanelActive, setIsPanelActive] = useState(false);

  // FIX: Memoize the toggle function to prevent infinite loop in useSystemSync
  const handleToggleSettings = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  // Pass the memoized function
  const system = useSystemSync(handleToggleSettings);
  const auth = useAuth(); 
  const performLogout = async () => {
      await system.handleLogout(); // 1. Delete file & clear user data
      auth.logout();               // 2. Switch UI to Login Screen
      setIsPanelActive(false);     // 3. Close settings panel
  };
  useUpdateCheck();

  // Listen for CLI image path on startup
  useEffect(() => {
    const initStartupImage = async () => {
      try {
        // 1. Check if Rust already loaded an image from CLI args during setup
        const initialImage = await invoke<string | null>('get_initial_image');
        if (initialImage) {
          console.log("Found CLI image in state, loading...");
          handleImageReady(initialImage);
        }
      } catch (e) {
        console.error("Failed to check initial image:", e);
      }
    };

    // Run immediate check
    initStartupImage();

    // 2. Keep the listener for runtime file associations (e.g. "Open With" while app is running)
    const unlisten = listen<string>('image-path', async (event) => {
      const imagePath = event.payload;
      if (imagePath) {
        try {
          console.log("Event received for image:", imagePath);
          const base64 = await invoke<string>('process_image_path', { path: imagePath });
          handleImageReady(base64);
        } catch (error) {
          console.error("Failed to process CLI image event:", error);
        }
      }
    });
   
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const isAgreementPending = system.hasAgreed === false;
  const isLoadingState = system.hasAgreed === null || auth.authStage === 'LOADING';
  const isImageMissing = !system.startupImage;
  const isAuthPending = auth.authStage === 'GEMINI_SETUP' || auth.authStage === 'LOGIN';

  // 2. Determine if Chat should be active
  const isChatActive = !isLoadingState && !isAgreementPending && !isImageMissing && !isAuthPending;

  // 2. Chat Engine
  const chatEngine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
    enabled: isChatActive, // <--- ONLY RUN WHEN UI IS READY
  });


  // 3. Local Layout State
  const [input, setInput] = useState("");
  
  // Initialize update state based on storage
  const [pendingUpdate] = useState(() => getPendingUpdate());
  const [showUpdate, setShowUpdate] = useState(() => {
     // FIX: Don't show if we just reloaded for Auth reasons
     const wasDismissed = sessionStorage.getItem('update_dismissed');
     return !!pendingUpdate && !wasDismissed;
  });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

  // --- Handlers ---
  
  const handleImageReady = (base64Full: string) => {
    // Basic validation to ensure we have a valid data URL
    if (!base64Full || !base64Full.includes(',')) return;

    const [header, base64Data] = base64Full.split(',');
    const mimeType = header.replace('data:', '').replace(';base64', '');
    
    system.setStartupImage({
        base64: base64Full, 
        mimeType: mimeType
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedText = window.getSelection()?.toString() || "";
    if (selectedText) {
      setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
    }
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleCopy = () => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    }
  };

  useEffect(() => {
    const handleClick = () => { if (contextMenu) handleCloseContextMenu(); };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  // --- Render Logic ---

  if (showUpdate && pendingUpdate) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <UpdateNotes 
          version={pendingUpdate.version}
          notes={pendingUpdate.notes}
          onClose={() => {
            setShowUpdate(false);
            // FIX: Remember dismissal for this session
            sessionStorage.setItem('update_dismissed', 'true');
          }} 
        />
      </div>
    );
  }

  // 1. Loading State (Checking file)
  if (system.hasAgreed === null || auth.authStage === 'LOADING') {
      return <div className="h-screen w-screen bg-neutral-950" />;
  }

  // 2. Agreement Screen
  if (system.hasAgreed === false) {
    const getOSType = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) return "windows";
      if (userAgent.includes("mac")) return "macos";
      return "linux";
    };

    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Agreement 
          osType={getOSType()} 
          onNext={() => system.setHasAgreed(true)} 
          onCancel={() => exit(0)} 
        />
      </div>
    );
  }

  // 3. Welcome / Image Upload
  if (!system.startupImage) {
     return (
        <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
           <Welcome onImageReady={handleImageReady} />
        </div>
     );
  }

  // 2. Gemini Setup (SECOND - Forced if not done)
  if (auth.authStage === 'GEMINI_SETUP') {
    return <GeminiSetup onComplete={auth.completeGeminiSetup} />;
  }

  // 3. Login Screen (THIRD)
  if (auth.authStage === 'LOGIN') {
    return <LoginScreen onComplete={auth.login} />;
  }

  // 4. Main Chat Interface
  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100"
    >
      <ChatLayout
        // Chat State
        messages={chatEngine.messages}
        streamingText={chatEngine.streamingText}
        isChatMode={chatEngine.isChatMode}
        isLoading={chatEngine.isLoading}
        isStreaming={chatEngine.isStreaming}
        error={chatEngine.error || system.systemError}
        lastSentMessage={chatEngine.lastSentMessage}
        
        // Inputs
        input={input}
        onInputChange={setInput}
        
        // Models & Settings
        currentModel={system.sessionModel}
        editingModel={system.editingModel}
        startupImage={system.startupImage}
        prompt={system.prompt}
        setPrompt={system.setEditingPrompt}
        
        // User Info
        userName={system.userName}
        userEmail={system.userEmail}
        avatarSrc={system.avatarSrc}
        isDarkMode={system.isDarkMode}
        
        // Actions
        onSend={() => {
            chatEngine.handleSend(input);
            setInput("");
        }}
        onModelChange={system.setSessionModel}
        onEditingModelChange={system.setEditingModel}
        onRetry={() => {
            if (chatEngine.messages.length === 0) {
                chatEngine.handleReload();
            } else {
                chatEngine.handleRetrySend();
            }
        }}
        onLogout={performLogout}
        onSave={system.saveSettings}
        onToggleTheme={system.handleToggleTheme}
        onCheckSettings={() => {
            setIsPanelActive(true);
            chatEngine.clearError();
        }}
        toggleSettingsPanel={() => setIsPanelActive(!isPanelActive)}
        isPanelActive={isPanelActive}
        onResetAPIKey={system.handleResetAPIKey}
        onReload={chatEngine.handleReload} 
      />
      
      <div id="toast" className="toast"></div>
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.selectedText}
          onCopy={handleCopy}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
