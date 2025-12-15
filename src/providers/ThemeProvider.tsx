import React, { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "../hooks/useTheme";
import { loadPreferences, savePreferences } from "../lib/config/preferences";
import { DEFAULT_THEME } from "../lib/utils/constants";

const THEME_STORAGE_KEY = "theme"; // Matches the key used in index.html

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 1. Initialize synchronously from localStorage (handled by index.html script)
  // This prevents the hydration mismatch and the flash
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark") {
        return cached;
      }
    }
    return DEFAULT_THEME as "light" | "dark";
  });

  // 2. Helper to update State + LocalStorage + JSON File
  const setTheme = useCallback((newTheme: "light" | "dark") => {
    setThemeState(newTheme);

    // Update LocalStorage immediately (for next boot 0ms load)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    // Update DOM immediately
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    document.documentElement.style.colorScheme = newTheme;
    document.body.classList.toggle("light-mode", newTheme === "light");

    // Update Persistent JSON File
    loadPreferences().then((prefs) => {
      if (prefs.theme !== newTheme) {
        savePreferences({ ...prefs, theme: newTheme }).catch(console.error);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // 3. On Mount: Check the Real JSON file
  // If the file says "Light" but LocalStorage said "Dark", the File wins.
  useEffect(() => {
    let mounted = true;
    loadPreferences().then((prefs) => {
      if (!mounted) return;

      if (prefs.theme && prefs.theme !== theme) {
        // Force update to match file
        setTheme(prefs.theme);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
