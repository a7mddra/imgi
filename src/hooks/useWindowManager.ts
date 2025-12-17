import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Base sizes from your Electron code
const SIZES = {
  ONBOARDING: { w: 800, h: 600 },
  CHAT: { w: 940, h: 680 },
};

export const useWindowManager = (
  isChatActive: boolean,
  isAuthPending: boolean,
  isAgreementPending: boolean,
  isUpdatePending: boolean,
  isLoading: boolean // <--- NEW: Prevent early resizing
) => {
  useEffect(() => {
    // If we are still loading, don't touch the window yet.
    // It is hidden by default in Rust, so this prevents the "Flash of Small Window".
    if (isLoading) return;

    const adjustWindow = async () => {
      // Logic: If ANY "Onboarding" condition is met, use small size.
      // Otherwise (Chat is active), use big size.
      
      const isOnboardingPage = 
        !isChatActive || 
        isAuthPending || 
        isAgreementPending || 
        isUpdatePending;

      const target = isOnboardingPage ? SIZES.ONBOARDING : SIZES.CHAT;

      try {
        console.log(`Resizing window to ${isOnboardingPage ? 'Onboarding' : 'Chat'} mode:`, target);
        // We pass "show: true" to ensure the window becomes visible now that we are ready.
        await invoke("resize_window", { width: target.w, height: target.h, show: true });
      } catch (e) {
        console.error("Failed to resize window:", e);
      }
    };

    adjustWindow();
  }, [isChatActive, isAuthPending, isAgreementPending, isUpdatePending, isLoading]); // Trigger on any state change
};
