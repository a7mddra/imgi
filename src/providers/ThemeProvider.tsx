import React, { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "../hooks/useTheme";
import { loadPreferences, savePreferences } from "../lib/config/preferences";
import { DEFAULT_THEME } from "../lib/utils/constants";

const THEME_STORAGE_KEY = "app_theme_cache";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Initialize synchronously from localStorage to prevent flash
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark") {
        // Apply immediately to body to ensure 0ms visual update before first paint if possible
        const isDark = cached === "dark";
        document.body.classList.toggle("light-mode", !isDark);
        return cached;
      }
    }
    // Default fallback
    const isDefaultDark = DEFAULT_THEME === "dark";
    document.body.classList.toggle("light-mode", !isDefaultDark);
    return DEFAULT_THEME as "light" | "dark";
  });

  // 2. Helper to update everything
  const setTheme = useCallback((newTheme: "light" | "dark") => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    document.body.classList.toggle("light-mode", newTheme === "light");
    
    // We also want to update the persistent JSON file
    loadPreferences().then(prefs => {
        if (prefs.theme !== newTheme) {
            savePreferences({ ...prefs, theme: newTheme }).catch(console.error);
        }
    });
  }, []);

  // 3. Toggle helper
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // 4. On Mount: Sync with real file source of truth
  useEffect(() => {
    let mounted = true;
    loadPreferences().then(prefs => {
      if (!mounted) return;
      if (prefs.theme && prefs.theme !== theme) {
        // If file says something different than cache, file wins
        setThemeState(prefs.theme);
        localStorage.setItem(THEME_STORAGE_KEY, prefs.theme);
        document.body.classList.toggle("light-mode", prefs.theme === "light");
      }
    });
    return () => { mounted = false; };
  }, []); // Run once on mount

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
