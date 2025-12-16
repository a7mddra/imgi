import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppProvider } from "./providers/AppProvider";
import { AppRouter } from "./router/AppRouter";
import { ImgbbSetup } from "./features/auth/components/BYOKey/ImgbbSetup";

function App() {
  // FIX 1: Initialize state synchronously from URL.
  // This guarantees 'mode' is correct BEFORE the first render.
  const [mode] = useState<'app' | 'imgbb'>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'imgbb' ? 'imgbb' : 'app';
    }
    return 'app';
  });

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href && target.href.startsWith("http")) {
        e.preventDefault();
        invoke("open_external_url", { url: target.href });
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, []);

  // FIX 2: Early return. 
  // If mode is imgbb, we render ONLY the setup component.
  // We skip AppProvider entirely to prevent overhead/flashing.
  if (mode === 'imgbb') {
    return <ImgbbSetup />;
  }

  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}

export default App;