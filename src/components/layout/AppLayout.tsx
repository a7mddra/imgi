import React, { useState, useEffect } from "react";
import "katex/dist/katex.min.css";
import { ContextMenu } from "../ui/ContextMenu/ContextMenu";
import { ChatLayout } from "../../features/chat/layouts/ChatLayout";
import { useSystemSync } from "../../hooks/useSystemSync";
import { useChatEngine } from "../../features/chat/hooks/useChat";

export const AppLayout: React.FC = () => {
  // 1. Hook into System State (Settings, Theme, User)
  const [isPanelActive, setIsPanelActive] = useState(false);
  const system = useSystemSync(() => setIsPanelActive(!isPanelActive));

  // 2. Hook into Chat Engine
  const chatEngine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
  });

  // 3. Local Layout State
  const [input, setInput] = useState("");
  const [showUpdate, setShowUpdate] = useState(false); // Mock update state

  // Context Menu Logic
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

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

  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100"
    >
      {/* 4. Pass everything to ChatLayout */}
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
        onRetry={chatEngine.handleRetrySend}
        onSave={system.saveSettings}
        onLogout={system.handleLogout}
        onToggleTheme={system.handleToggleTheme}
        onCheckSettings={() => setIsPanelActive(true)}
        toggleSettingsPanel={() => setIsPanelActive(!isPanelActive)}
        isPanelActive={isPanelActive}
        onResetAPIKey={system.handleResetAPIKey}
        onReload={() => window.location.reload()} 
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