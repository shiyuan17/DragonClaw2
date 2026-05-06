import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SavedModel } from "../../types";

interface UseWorkspaceComposerModelMenuParams {
  configVersion: number;
  currentModelId: string;
  handleSetModel: (modelId: string) => Promise<void>;
}

export function useWorkspaceComposerModelMenu({
  configVersion,
  currentModelId,
  handleSetModel,
}: UseWorkspaceComposerModelMenuParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<SavedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const nextItems = await invoke<SavedModel[]>("list_all_models");
      setItems(nextItems);
      setLoaded(true);
    } catch (loadError) {
      setLoaded(false);
      setError(loadError instanceof Error ? loadError.message : "加载模型列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSwitchingId(null);
  }, []);

  const openMenu = useCallback(() => {
    setIsOpen(true);
    if (!loaded && !loading) {
      void loadItems();
    }
  }, [loaded, loading, loadItems]);

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
      return;
    }

    openMenu();
  }, [closeMenu, isOpen, openMenu]);

  const selectModel = useCallback(
    async (modelId: string) => {
      const nextModelId = modelId.trim();
      if (!nextModelId) {
        return;
      }

      if (nextModelId === currentModelId) {
        closeMenu();
        return;
      }

      setError("");
      setSwitchingId(nextModelId);

      try {
        await handleSetModel(nextModelId);
        closeMenu();
      } catch (switchError) {
        setError(switchError instanceof Error ? switchError.message : "切换模型失败");
      } finally {
        setSwitchingId(null);
      }
    },
    [closeMenu, currentModelId, handleSetModel],
  );

  useEffect(() => {
    setIsOpen(false);
    setItems([]);
    setLoading(false);
    setLoaded(false);
    setError("");
    setSwitchingId(null);
  }, [configVersion]);

  return {
    isOpen,
    items,
    loading,
    error,
    switchingId,
    loadItems,
    closeMenu,
    toggleMenu,
    selectModel,
  };
}
