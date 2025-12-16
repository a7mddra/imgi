import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";
import { showToast } from "../../../components/ui/Notifications/Toast";

export const useLens = (startupImage: { base64: string } | null) => {
  const [isLensLoading, setIsLensLoading] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  
  // Keep a ref to the image so the event listener always has the latest version
  const imageRef = useRef(startupImage);
  useEffect(() => { imageRef.current = startupImage; }, [startupImage]);

  // 1. Separate the Search Logic so we can call it from two places
  const runLensSearch = async (base64: string, key: string) => {
      try {
        setIsLensLoading(true);
        const publicUrl = await uploadToImgBB(base64, key);
        const lensUrl = generateLensUrl(publicUrl);
        await invoke("open_external_url", { url: lensUrl });
      } catch (error) {
        console.error("Lens Error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
        showToast(msg, "error");
      } finally {
        setIsLensLoading(false);
      }
  };

  // 2. The Listener for "Auto-Trigger"
  useEffect(() => {
    if (!waitingForKey) return;

    // Listen for the specific clipboard event
    const unlistenPromise = listen<{ provider: string; key: string }>('clipboard-text', async (event) => {
        const { provider, key } = event.payload;
        
        if (provider === 'imgbb') {
            // Stop waiting
            setWaitingForKey(false);
            
            // IMMEDIATE ACTION: Run the search!
            // We don't need to save the key here; useAuth.ts is listening to the 
            // same event and handles the saving/encryption in parallel.
            if (imageRef.current) {
                showToast("Key detected! Uploading...", "success");
                await runLensSearch(imageRef.current.base64, key);
            }
        }
    });

    return () => {
        unlistenPromise.then(f => f());
    };
  }, [waitingForKey]);

  const triggerLens = async () => {
    if (!startupImage) return;
    // Don't trigger if already loading OR waiting for key
    if (isLensLoading || waitingForKey) return;

    try {
      setIsLensLoading(true);

      const apiKey = await invoke<string>("get_key", { provider: "imgbb" });

      if (apiKey) {
        await runLensSearch(startupImage.base64, apiKey);
      } else {
        // Path B: Key missing -> Start Setup Flow
        
        // REMOVED: invoke("open_external_url", ...) - User request: don't open browser here.
        
        // 1. Start Watcher
        await invoke("start_clipboard_watcher"); 
        
        // 2. Open Setup Window
        await invoke("open_imgbb_window");
        
        // 3. Enter Waiting State
        setWaitingForKey(true);
        
        // IMPORTANT: We do NOT set isLensLoading to false here.
        // We want the button to keep spinning/disabled until the flow finishes.
        // The spinning logic in the button relies on `isLensLoading`.
      }
    } catch (error) {
      console.error("Lens Trigger Error:", error);
      setIsLensLoading(false);
      setWaitingForKey(false);
    }
  };

  return {
    // Spinner is active if we are processing OR waiting for user input
    isLensLoading: isLensLoading || waitingForKey, 
    triggerLens,
  };
};