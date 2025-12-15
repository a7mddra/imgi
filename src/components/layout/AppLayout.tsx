// FILE: src/components/layout/AppLayout.tsx

import React, { useState, useEffect } from "react";
import "katex/dist/katex.min.css";
import "../ui/Notifications/Toast.css";
import { ContextMenu } from "../ui/ContextMenu/ContextMenu";
import { ChatLayout } from "../../features/chat/layouts/ChatLayout";
import { Welcome } from "../../features/onboarding";
import { Agreement } from "../../features/onboarding/components/Agreement/Agreement";
import { UpdateNotes } from "../../features/onboarding/components/UpdateNotes/UpdateNotes";
import { useSystemSync } from "../../hooks/useSystemSync";
import { useChatEngine } from "../../features/chat/hooks/useChat";
import { useUpdateCheck, getPendingUpdate } from "../../hooks/useUpdateCheck";
import { exit } from "@tauri-apps/plugin-process";

export const AppLayout: React.FC = () => {
  // 1. Hook into System State
  const [isPanelActive, setIsPanelActive] = useState(false);
  const system = useSystemSync(() => setIsPanelActive(!isPanelActive));

  // Run background update check for *next* session
  useUpdateCheck();

  // 2. Chat Engine
  const chatEngine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
  });

  // 3. Local Layout State
  const [input, setInput] = useState("");
  
  // Initialize update state based on storage
  const [pendingUpdate] = useState(() => getPendingUpdate());
  const [showUpdate, setShowUpdate] = useState(!!pendingUpdate);
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

  // --- Handlers ---
  
  const handleImageReady = (base64Full: string) => {
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
          }} 
        />
      </div>
    );
  }

  // 1. Loading State (Checking file)
  if (system.hasAgreed === null) {
      // Return null or a subtle loader to avoid flicker.
      // Since it's fast file I/O, a black screen (matching app bg) is usually best.
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
        onSave={system.saveSettings}
        onLogout={system.handleLogout}
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
