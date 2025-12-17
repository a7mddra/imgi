import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";

export const useLens = (startupImage: { base64: string } | null) => {
  // UI States
  const [isLensLoading, setIsLensLoading] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  
  // The Cached URL (The "Killer Idea")
  const [cachedLensUrl, setCachedLensUrl] = useState<string | null>(null);

  const imageRef = useRef(startupImage);
  useEffect(() => { imageRef.current = startupImage; }, [startupImage]);

  // --- Background Service: Pre-fetch URL ---
  useEffect(() => {
    if (!startupImage) return;

    const prefetchLensUrl = async () => {
        try {
            // Check for key (Now Async! No Freeze!)
            const apiKey = await invoke<string>("get_key", { provider: "imgbb" });
            
            if (apiKey) {
                console.log("Background Service: Pre-uploading image to ImgBB...");
                // Silent upload - no spinners, just internal state
                const publicUrl = await uploadToImgBB(startupImage.base64, apiKey);
                const url = generateLensUrl(publicUrl);
                setCachedLensUrl(url);
                console.log("Background Service: Lens URL Ready.");
            }
        } catch (e) {
            console.warn("Background Service: Pre-fetch failed (user might need setup)", e);
        }
    };

    prefetchLensUrl();
  }, [startupImage]);


  // --- Action Logic ---

  const runLensSearch = async (base64: string, key: string) => {
      try {
        setIsLensLoading(true);
        // If we have a cached URL, use it instantly!
        if (cachedLensUrl) {
             await invoke("open_external_url", { url: cachedLensUrl });
             setIsLensLoading(false);
             return;
        }

        // Fallback: If clicked before background job finished
        const publicUrl = await uploadToImgBB(base64, key);
        const lensUrl = generateLensUrl(publicUrl);
        
        // Cache it for next time
        setCachedLensUrl(lensUrl);
        
        await invoke("open_external_url", { url: lensUrl });
      } catch (error) {
        console.error("Lens Error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
      } finally {
        setIsLensLoading(false);
      }
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
    if (cachedLensUrl) {
        await invoke("open_external_url", { url: cachedLensUrl });
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