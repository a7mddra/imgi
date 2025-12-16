import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppProvider } from "./providers/AppProvider";
import { AppRouter } from "./router/AppRouter";
// Import ImgBB Setup directly
import { ImgbbSetup } from "./features/auth/components/BYOKey/ImgbbSetup";

function App() {
  const [mode, setMode] = useState<'app' | 'imgbb'>('app');

  useEffect(() => {
    // Check URL params for ?mode=imgbb
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'imgbb') {
      setMode('imgbb');
    }

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