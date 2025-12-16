import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";
import { showToast } from "../../../components/ui/Notifications/Toast";

export const useLens = (startupImage: { base64: string } | null) => {
  const [isLensLoading, setIsLensLoading] = useState(false);
  // Track if we are currently waiting for the user to copy the key
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
    if (isLensLoading) return;

    try {
      setIsLensLoading(true);

      // 1. Try to get existing key
      const apiKey = await invoke<string>("get_key", { provider: "imgbb" });

      if (apiKey) {
        // Path A: Key exists -> Run immediately
        await runLensSearch(startupImage.base64, apiKey);
      } else {
        // Path B: Key missing -> Start Setup Flow
        
        // 1. Open the website (User Req #1)
        invoke("open_external_url", { url: "https://api.imgbb.com/" });
        
        // 2. Start the watcher so we can catch the copy
        await invoke("start_clipboard_watcher"); 
        
        // 3. Open the instruction window
        await invoke("open_imgbb_window");
        
        // 4. Enter "Waiting" state to auto-trigger when ready (User Req #2)
        setWaitingForKey(true);
        
        setIsLensLoading(false); // Stop loading spinner so they can see UI
      }
    } catch (error) {
      console.error("Lens Trigger Error:", error);
      setIsLensLoading(false);
    }
  };

  return {
    isLensLoading: isLensLoading || waitingForKey, // Keep spinner or disabled state while setting up
    triggerLens,
  };
};