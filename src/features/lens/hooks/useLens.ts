import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";

export const useLens = (
    startupImage: { base64: string } | null,
    cachedUrl: string | null,
    setCachedUrl: (url: string) => void
) => {
  const [isLensLoading, setIsLensLoading] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  
  const imageRef = useRef(startupImage);
  useEffect(() => { imageRef.current = startupImage; }, [startupImage]);

  // --- Background Service ---
  useEffect(() => {
    if (!startupImage || cachedUrl) return; // Skip if already cached

    const prefetchLensUrl = async () => {
        try {
            const apiKey = await invoke<string>("get_api_key", { provider: "imgbb" });
            if (apiKey) {
                console.log("Background: Uploading to ImgBB...");
                const publicUrl = await uploadToImgBB(startupImage.base64, apiKey);
                const url = generateLensUrl(publicUrl);
                setCachedUrl(url); // Save to Global Session
            }
        } catch (e) { /* ignore */ }
    };
    prefetchLensUrl();
  }, [startupImage, cachedUrl]); 


  // --- Action Logic ---

  const runLensSearch = async (base64: string, key: string) => {
      try {
        setIsLensLoading(true);
        if (cachedUrl) {
             await invoke("open_external_url", { url: cachedUrl });
             setIsLensLoading(false);
             return;
        }

        // Fallback: If clicked before background job finished
        const publicUrl = await uploadToImgBB(base64, key);
        const lensUrl = generateLensUrl(publicUrl);
        
        // Cache it for next time
        setCachedUrl(lensUrl); // Update Global Session
        await invoke("open_external_url", { url: lensUrl });

      } finally { setIsLensLoading(false); }
  };

  // --- Setup Listener (unchanged) ---
  useEffect(() => {
    if (!waitingForKey) return;
    const unlistenPromise = listen<{ provider: string; key: string }>('clipboard-text', async (event) => {
        const { provider, key } = event.payload;
        if (provider === 'imgbb') {
            setWaitingForKey(false);
            invoke('close_imgbb_window'); // Immediate close
            // User just did setup, run search now
            if (imageRef.current) {
                await runLensSearch(imageRef.current.base64, key);
            }
        }
    });
    return () => { unlistenPromise.then(f => f()); };
  }, [waitingForKey]);

  // --- Button Handler ---
  const triggerLens = async () => {
    if (!startupImage) return;
    if (isLensLoading || waitingForKey) return;

    // 1. Instant Open if ready
    if (setCachedUrl) {
        await invoke("open_external_url", { url: setCachedUrl });
        return;
    }

    try {
      setIsLensLoading(true);
      const apiKey = await invoke<string>("get_api_key", { provider: "imgbb" });

      if (apiKey) {
        // Key exists, but pre-fetch hasn't finished yet. Show spinner and wait.
        await runLensSearch(startupImage.base64, apiKey);
      } else {
        await invoke("open_imgbb_window");
        setWaitingForKey(true);
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