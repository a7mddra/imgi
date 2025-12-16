import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";

export const useLens = (startupImage: { base64: string } | null) => {
  const [isLensLoading, setIsLensLoading] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  
  const imageRef = useRef(startupImage);
  useEffect(() => { imageRef.current = startupImage; }, [startupImage]);

  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

  const runLensSearch = async (base64: string, key: string) => {
      try {
        // Spinner is already true from the listener, but set it again to be safe
        setIsLensLoading(true);
        
        const publicUrl = await uploadToImgBB(base64, key);
        const lensUrl = generateLensUrl(publicUrl);
        await invoke("open_external_url", { url: lensUrl });
      } catch (error) {
        console.error("Lens Error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
      } finally {
        setIsLensLoading(false);
      }
  };

  useEffect(() => {
    if (!waitingForKey) return;

    const unlistenPromise = listen<{ provider: string; key: string }>('clipboard-text', async (event) => {
        const { provider, key } = event.payload;
        
        if (provider === 'imgbb') {
            // FIX: Set Loading TRUE before stopping waiting to prevent spinner flicker
            setIsLensLoading(true); 
            setWaitingForKey(false);
            
            if (imageRef.current) {
                await runLensSearch(imageRef.current.base64, key);
            }
        }
    });

    return () => { unlistenPromise.then(f => f()); };
  }, [waitingForKey]);

  const triggerLens = async () => {
    if (!startupImage) return;
    if (isLensLoading || waitingForKey) return;

    try {
      setIsLensLoading(true);
      await yieldToUI(); // <--- FIX 1: Allow React to render the spinner frame

      // Now call Rust (which is now Async and won't block)
      const apiKey = await invoke<string>("get_key", { provider: "imgbb" });

      if (apiKey) {
        await runLensSearch(startupImage.base64, apiKey);
      } else {
        // Path B: No key found.
        // 1. Open the Setup Window
        await invoke('open_imgbb_window');
        
        // Ensure spinner stays true for the "Waiting" transition
        setWaitingForKey(true);
        // setIsLensLoading(false); // REMOVE THIS. Keep it loading visually until the window appears.
      }
    } catch (error) {
      console.error("Lens Trigger Error:", error);
      setIsLensLoading(false);
      setWaitingForKey(false);
    }
  };

  return {
    isLensLoading: isLensLoading || waitingForKey, 
    triggerLens,
  };
};