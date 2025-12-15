import { useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { fetchReleaseNotes } from '../features/onboarding/services/releaseNotes';

const STORAGE_KEYS = {
  VERSION: 'pending_update_version',
  NOTES: 'pending_update_notes',
  AVAILABLE: 'pending_update_available',
};

function log(message: string) {
  invoke("log_to_terminal", { message }).catch(() => {});
}

export function useUpdateCheck() {
  useEffect(() => {
    const checkUpdate = async () => {
      log("[UpdateCheck] Starting background check...");
      try {
        const { hasUpdate, version, notes } = await fetchReleaseNotes();
        
        if (hasUpdate) {
          log(`[UpdateCheck] Update found! Storing for next launch. Version: ${version}`);
          localStorage.setItem(STORAGE_KEYS.AVAILABLE, 'true');
          localStorage.setItem(STORAGE_KEYS.VERSION, version);
          localStorage.setItem(STORAGE_KEYS.NOTES, notes);
        } else {
          log("[UpdateCheck] No update found or up to date.");
          // Clear if no update (e.g. after an update was applied)
          localStorage.removeItem(STORAGE_KEYS.AVAILABLE);
          localStorage.removeItem(STORAGE_KEYS.VERSION);
          localStorage.removeItem(STORAGE_KEYS.NOTES);
        }
      } catch (error) {
        log(`[UpdateCheck] Failed: ${error}`);
      }
    };

    checkUpdate();
  }, []);
}

export function getPendingUpdate() {
  const available = localStorage.getItem(STORAGE_KEYS.AVAILABLE) === 'true';
  if (!available) return null;

  return {
    version: localStorage.getItem(STORAGE_KEYS.VERSION) || '',
    notes: localStorage.getItem(STORAGE_KEYS.NOTES) || '',
  };
}

export function clearPendingUpdate() {
  localStorage.removeItem(STORAGE_KEYS.AVAILABLE);
  // We might want to keep version/notes until actually updated, 
  // but clearing the 'available' flag stops the popup.
}
