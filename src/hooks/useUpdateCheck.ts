import { useEffect } from 'react';
import { fetchReleaseNotes } from '../features/onboarding/services/releaseNotes';

const STORAGE_KEYS = {
  VERSION: 'pending_update_version',
  NOTES: 'pending_update_notes',
  AVAILABLE: 'pending_update_available',
};

export function useUpdateCheck() {
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const { hasUpdate, version, notes } = await fetchReleaseNotes();
        
        if (hasUpdate) {
          localStorage.setItem(STORAGE_KEYS.AVAILABLE, 'true');
          localStorage.setItem(STORAGE_KEYS.VERSION, version);
          localStorage.setItem(STORAGE_KEYS.NOTES, notes);
        } else {
          // Clear if no update (e.g. after an update was applied)
          localStorage.removeItem(STORAGE_KEYS.AVAILABLE);
          localStorage.removeItem(STORAGE_KEYS.VERSION);
          localStorage.removeItem(STORAGE_KEYS.NOTES);
        }
      } catch (error) {
        console.error('Failed to check for updates', error);
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