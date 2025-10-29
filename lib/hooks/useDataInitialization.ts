// lib/hooks/useDataInitialization.ts
import { useEffect, useState } from "react";
import { usePromptService } from "@/services/promptServiceHooks";
import { useExclusionService } from "@/services/exclusionServiceHooks";
import { useSettingsStore } from "@/stores/useSettingStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useExclusionStore } from "@/stores/useExclusionStore";
import { OPENROUTER_API_KEY_STORAGE_KEY } from "@/lib/constants/storage";

/**
 * Hook for managing initial data loading and client-side initialization
 */
export function useDataInitialization() {
  const [isClient, setIsClient] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState<string>("");

  const projectPath = useProjectStore((s) => s.projectPath);
  const setOpenrouterApiKey = useSettingsStore((s) => s.setOpenrouterApiKey);

  // Services
  const { fetchMetaPromptList } = usePromptService();
  const { fetchGlobalExclusions, fetchLocalExclusions } = useExclusionService();

  // Client-side initialization
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initial data loading
  useEffect(() => {
    fetchGlobalExclusions();
    fetchMetaPromptList();

    let storedKey = "";
    try {
      storedKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) ?? "";
    } catch (error) {
      console.warn("Failed to read stored API key", error);
    }
    setApiKeyDraft(storedKey);
    if (storedKey) {
      setOpenrouterApiKey(storedKey);
    }
  }, [fetchGlobalExclusions, fetchMetaPromptList, setOpenrouterApiKey]);

  // Project-specific data loading
  useEffect(() => {
    if (projectPath) {
      fetchLocalExclusions();
    } else {
      useExclusionStore.setState({ localExclusions: [] });
    }
  }, [projectPath, fetchLocalExclusions]);

  return {
    isClient,
    apiKeyDraft,
    setApiKeyDraft,
  };
}