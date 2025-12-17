/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Message, ModelType } from "../types/chat.types";
import { startNewChatStream, sendMessage } from "../../../lib/api/gemini/client";
import systemPromptYaml from "../../../lib/config/prompts/system-prompt.yml?raw";

export const useChatEngine = ({
  apiKey,
  currentModel,
  startupImage,
  prompt,
  setCurrentModel,
  enabled,  
}: {
  apiKey: string;
  currentModel: string;
  startupImage: { base64: string; mimeType: string } | null;
  prompt: string;
  setCurrentModel: (model: string) => void;
  enabled: boolean;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  // FIX 1: Initialize loading state based on 'enabled'. 
  // If we are enabled, we should be shimmering immediately, waiting for the key.
  const [isLoading, setIsLoading] = useState(enabled); 
  const [error, setError] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstResponseId, setFirstResponseId] = useState<string | null>(null);
  const [lastSentMessage, setLastSentMessage] = useState<Message | null>(null);
  const clearError = () => setError(null);

  // FIX 2: Ensure loading state tracks 'enabled' prop changes
  useEffect(() => {
    if (enabled) setIsLoading(true);
  }, [enabled]);

  useEffect(() => {
    // Only start the actual session when we have the key.
    // The UI is already shimmering because of the fix above.
    if (enabled && startupImage && prompt && apiKey) {
      startSession(apiKey, currentModel, startupImage);
    }
  }, [apiKey, prompt, startupImage, currentModel, enabled]);

  const resetInitialUi = () => {
    setStreamingText("");
    setIsChatMode(false);
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: { base64: string; mimeType: string } | null,
    isRetry = false
  ) => {
    // Ensure loading is true (redundant but safe)
    setIsLoading(true);
    setError(null);

    // Double check key (though useEffect handles this mostly)
    if (!key) {
        // If we reached here without a key, something is wrong, but we wait.
        // We don't error out yet because it might be coming.
        return;
    }

    if (!isRetry) {
      resetInitialUi();
      setMessages([]);
      setFirstResponseId(null);
      setLastSentMessage(null);
      
      // Artificial delay for "Thinking" / Shimmer effect
      // This runs AFTER the key is found, adding to the total shimmer time.
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!imgData || !prompt) {
       setIsLoading(false);
       return;
    }

    setIsStreaming(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      const combinedPrompt = `<sys-prmp>\n${systemPromptYaml}\n</sys-prmp>\nMSS: ${prompt}`;

      await startNewChatStream(
        modelId,
        imgData.base64,
        imgData.mimeType,
        combinedPrompt,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        }
      );
      setIsStreaming(false);
      setIsLoading(false);
    } catch (apiError: any) {
      console.error(apiError);
      if (
        !isRetry &&
        (apiError.message?.includes("429") || apiError.message?.includes("503"))
      ) {
        console.log("Model failed, trying lite version...");
        setCurrentModel(ModelType.GEMINI_FLASH_LITE);
        return;
      }
      let errorMsg = "Failed to connect to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      setError(errorMsg);
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const handleReload = () => {
     if (apiKey && startupImage && prompt) {
         startSession(apiKey, currentModel, startupImage, false);
     } else if (!apiKey) {
         // Re-trigger startSession to show error manually if user clicks reload
         // In this specific manual case, we might want to show an error if key is truly missing
         setError("API Key missing. Please reset in settings.");
         setIsLoading(false);
     }
  };

  // ... (handleRetrySend and handleSend remain exactly the same) ...

  const handleRetrySend = async () => {
    if (!lastSentMessage) return;
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, lastSentMessage]);

    try {
      const responseText = await sendMessage(lastSentMessage.text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setLastSentMessage(null);
    } catch (apiError: any) {
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    if (!isChatMode) {
      setIsChatMode(true);
      if (streamingText && firstResponseId) {
        const botMsg: Message = {
          id: firstResponseId,
          role: "model",
          text: streamingText,
          timestamp: Date.now(),
        };
        setMessages([botMsg]);
        setStreamingText("");
        setFirstResponseId(null);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: userText,
      timestamp: Date.now(),
    };

    setLastSentMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const responseText = await sendMessage(userText);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setLastSentMessage(null);
    } catch (apiError: any) {
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    error,
    clearError,
    isChatMode,
    isStreaming,
    streamingText,
    lastSentMessage,
    handleSend,
    handleRetrySend,
    handleReload,
    startSession,
  };
};
