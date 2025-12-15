import { BaseDirectory, exists, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { appConfigDir } from "@tauri-apps/api/path";
import { DEFAULT_MODEL, DEFAULT_PROMPT, DEFAULT_THEME, PREFERENCES_FILE_NAME } from "../utils/constants";

export interface UserPreferences {
  model: string;
  theme: "dark" | "light";
  prompt: string;
}

export const defaultPreferences: UserPreferences = {
  model: DEFAULT_MODEL,
  theme: DEFAULT_THEME as "dark" | "light",
  prompt: DEFAULT_PROMPT,
};

// Helper to get the full path (mainly for debugging or advanced use, Tauri fs uses BaseDirectory)
export async function getPreferencesPath(): Promise<string> {
  const configDir = await appConfigDir();
  return `${configDir}/${PREFERENCES_FILE_NAME}`;
}

export async function hasPreferencesFile(): Promise<boolean> {
  try {
    // We check in the APP_CONFIG directory
    return await exists(PREFERENCES_FILE_NAME, { baseDir: BaseDirectory.AppConfig });
  } catch (error) {
    console.warn("Failed to check preference file existence:", error);
    return false;
  }
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const fileExists = await hasPreferencesFile();
    if (!fileExists) {
      return defaultPreferences;
    }

    const content = await readTextFile(PREFERENCES_FILE_NAME, { baseDir: BaseDirectory.AppConfig });
    const parsed = JSON.parse(content);
    
    // Merge with defaults to ensure all keys exist
    return { ...defaultPreferences, ...parsed };
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return defaultPreferences;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  try {
    // Ensure the directory exists first
    const existsDir = await exists("", { baseDir: BaseDirectory.AppConfig });
    if (!existsDir) {
        // Create the directory if it doesn't exist.
        // Note: mkdir with BaseDirectory might require the path to be the directory name itself
        // But since we are using BaseDirectory.AppConfig as the base, we just need to ensure *it* exists.
        // Actually, Tauri's mkdir helper with recursive: true handles this best usually.
        // However, we can't easily "mkdir AppConfig" if we are *inside* it contextually.
        // Let's resolve the path to be sure.
        const configPath = await appConfigDir();
        // We use the 'appConfigDir' from api/path which returns the absolute path
        // Then we use mkdir from plugin-fs to create it.
        // Wait, plugin-fs mkdir takes a path and options.
        // If we use BaseDirectory, it's relative.
        // Let's try creating it via the absolute path method which is safer for "ensure directory exists"
        // But plugin-fs is sandboxed to scopes.
        
        // Simpler approach: Just try to write, if it fails, try to create dir.
        // Or explicitly create the AppConfig dir.
        // exists("") with AppConfig checks the dir itself.
    }
    
    // We explicitly create the AppConfig dir. 
    // If we pass an empty string to mkdir with AppConfig, it might fail or do nothing.
    // Let's try to create the directory using the absolute path logic if we can, 
    // OR just rely on Tauri to handle it? No, usually we must create the dir.
    
    // Correct way in Tauri v2:
    await mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true });

    await writeTextFile(PREFERENCES_FILE_NAME, JSON.stringify(prefs, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    throw error;
  }
}
