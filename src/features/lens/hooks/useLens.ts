/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";

export const useLens = (startupImage: { base64: string } | null) => {
  const [isLensLoading, setIsLensLoading] = useState(false);

  const triggerLens = async () => {
    if (!startupImage) {
        return;
    }
    
    if (isLensLoading) return;
    setIsLensLoading(true);

    try {
      // 1. Try to get the ImgBB Key from Rust vault
      const apiKey = await invoke<string>("get_key", { provider: "imgbb" });

      if (!apiKey) {
        // CASE A: No Key -> Open Setup Window
        await invoke("open_imgbb_window");
        // We stop here. The user will setup the key, then click Lens again.
      } else {
        // CASE B: Key Found -> Upload & Search
        
        const publicUrl = await uploadToImgBB(startupImage.base64, apiKey);
        const lensUrl = generateLensUrl(publicUrl);
        
        await invoke("open_external_url", { url: lensUrl });
      }
    } catch (error) {
      console.error("Lens Error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
    } finally {
      setIsLensLoading(false);
    }
  };

  return {
    isLensLoading,
    triggerLens,
  };
};