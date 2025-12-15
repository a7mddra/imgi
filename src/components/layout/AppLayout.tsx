// FILE: src/components/layout/AppLayout.tsx

import React, { useState, useEffect } from "react";
import "katex/dist/katex.min.css";
import { ContextMenu } from "../ui/ContextMenu/ContextMenu";
import { ChatLayout } from "../../features/chat/layouts/ChatLayout";
import { Welcome } from "../../features/onboarding"; // Import Welcome
import { useSystemSync } from "../../hooks/useSystemSync";
import { useChatEngine } from "../../features/chat/hooks/useChat";

export const AppLayout: React.FC = () => {
  // 1. Hook into System State
  const [isPanelActive, setIsPanelActive] = useState(false);
  const system = useSystemSync(() => setIsPanelActive(!isPanelActive));

  // 2. Chat Engine (only active if we have an image, essentially)
  const chatEngine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
  });

  // 3. Local Layout State
  const [input, setInput] = useState("");
  const [showUpdate, setShowUpdate] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

  // --- Handlers ---
  
  // Called by Welcome Screen when user picks a file
  const handleImageReady = (base64Full: string) => {
    // Backend returns full data url: "data:image/png;base64,..."
    // We split it for the system state
    const [header, base64Data] = base64Full.split(',');
    const mimeType = header.replace('data:', '').replace(';base64', '');
    
    system.setStartupImage({
        base64: base64Full, // Keeping full string for img src
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

  // If no image is loaded yet, show the Welcome/Upload screen
  if (!system.startupImage) {
    return (
        <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
            <Welcome onImageReady={handleImageReady} />
        </div>
    );
  }

  // Once image is loaded, show the Main Chat Interface
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