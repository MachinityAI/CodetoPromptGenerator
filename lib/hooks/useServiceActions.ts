// lib/hooks/useServiceActions.ts
import { useCallback } from "react";
import { useAutoSelectService } from "@/services/autoSelectServiceHooks";
import { useSettingsStore } from "@/stores/useSettingStore";
import { useAppStore } from "@/stores/useAppStore";
import { OPENROUTER_API_KEY_STORAGE_KEY } from "@/lib/constants/storage";

/**
 * Hook for managing service actions and API interactions
 */
export function useServiceActions(apiKeyDraft: string) {
  const setError = useAppStore((s) => s.setError);
  const closeSettingsModal = useAppStore((s) => s.closeSettingsModal);
  const setOpenrouterApiKey = useSettingsStore((s) => s.setOpenrouterApiKey);

  // Services
  const { autoSelect, isSelecting } = useAutoSelectService();

  // API key management
  const saveApiKey = useCallback((persist: boolean = true) => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed.startsWith("sk-")) {
      setError("API key format looks invalid. It should start with 'sk-'.");
      return;
    }
    if (persist) {
      try {
        localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, trimmed);
      } catch (error) {
        console.warn("Failed to persist API key", error);
        setError("Failed to persist API key. Try again or disable persistence.");
        return;
      }
    }
    setOpenrouterApiKey(trimmed);
    closeSettingsModal();
  }, [apiKeyDraft, setOpenrouterApiKey, setError, closeSettingsModal]);

  return {
    // Service states
    isSelecting,

    // Service actions
    autoSelect,
    saveApiKey,
  };
}