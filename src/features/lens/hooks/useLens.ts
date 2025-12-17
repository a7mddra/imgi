/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

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
  useEffect(() => {
    imageRef.current = startupImage;
  }, [startupImage]);

  useEffect(() => {
    if (!startupImage || cachedUrl) return;

    const prefetchLensUrl = async () => {
      try {
        const apiKey = await invoke<string>("get_api_key", {
          provider: "imgbb",
        });
        if (apiKey) {
          console.log("Background: Uploading to ImgBB...");
          const publicUrl = await uploadToImgBB(startupImage.base64, apiKey);
          const url = generateLensUrl(publicUrl);
          setCachedUrl(url);
        }
      } catch (e) {}
    };
    prefetchLensUrl();
  }, [startupImage, cachedUrl]);

  const runLensSearch = async (base64: string, key: string) => {
    try {
      setIsLensLoading(true);
      if (cachedUrl) {
        await invoke("open_external_url", { url: cachedUrl });
        setIsLensLoading(false);
        return;
      }

      const publicUrl = await uploadToImgBB(base64, key);
      const lensUrl = generateLensUrl(publicUrl);

      setCachedUrl(lensUrl);
      await invoke("open_external_url", { url: lensUrl });
    } finally {
      setIsLensLoading(false);
    }
  };

  useEffect(() => {
    if (!waitingForKey) return;

    const unlistenKeyPromise = listen<{ provider: string; key: string }>(
      "clipboard-text",
      async (event) => {
        const { provider, key } = event.payload;
        if (provider === "imgbb") {
          setWaitingForKey(false);
          invoke("close_imgbb_window");
          if (imageRef.current) {
            await runLensSearch(imageRef.current.base64, key);
          }
        }
      }
    );

    const unlistenClosePromise = listen<void>("imgbb-popup-closed", () => {
      console.log("Setup window closed without key");
      setWaitingForKey(false);
    });

    return () => {
      unlistenKeyPromise.then((f) => f());
      unlistenClosePromise.then((f) => f());
    };
  }, [waitingForKey]);

  const triggerLens = async () => {
    if (!startupImage) return;
    if (isLensLoading || waitingForKey) return;

    if (cachedUrl) {
      await invoke("open_external_url", { url: cachedUrl });
      return;
    }

    try {
      setIsLensLoading(true);
      const apiKey = await invoke<string>("get_api_key", { provider: "imgbb" });

      if (apiKey) {
        await runLensSearch(startupImage.base64, apiKey);
      } else {
        await invoke("open_imgbb_window");
        setWaitingForKey(true);
        setIsLensLoading(false);
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
