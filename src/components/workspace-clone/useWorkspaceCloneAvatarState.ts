import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildWorkspaceCloneAvatarPresetOptions,
  pickWorkspaceCloneDefaultIllustrationAvatar,
  type WorkspaceCloneAvatarCategoryId,
  type WorkspaceCloneAvatarOption,
  WORKSPACE_CLONE_AVATAR_UPLOAD_MAX_BYTES,
} from "./workspaceCloneAvatarPresets";
import {
  loadWorkspaceAvatarOverrides,
  normalizeAvatarOverrideKey,
  persistWorkspaceAvatarOverrides,
  resolveWorkspaceAvatarOverride,
} from "./workspaceCloneAvatarUtils";

interface WorkspaceCloneAvatarEntity {
  id: string;
  name: string;
  subtitle: string;
  avatarLabel: string;
  avatarUrl?: string;
}

const PRESET_OPTIONS = buildWorkspaceCloneAvatarPresetOptions();

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

export function useWorkspaceCloneAvatarState(
  selectedAgent: WorkspaceCloneAvatarEntity | null,
) {
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    loadWorkspaceAvatarOverrides(),
  );
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarCategory, setAvatarCategory] =
    useState<WorkspaceCloneAvatarCategoryId>("career");
  const [avatarNotice, setAvatarNotice] = useState("");
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    persistWorkspaceAvatarOverrides(overrides);
  }, [overrides]);

  const selectedAvatarUrl = useMemo(() => {
    if (!selectedAgent) {
      return "";
    }

    return (
      resolveWorkspaceAvatarOverride(overrides, selectedAgent.id) ||
      selectedAgent.avatarUrl?.trim() ||
      pickWorkspaceCloneDefaultIllustrationAvatar(selectedAgent.id)
    );
  }, [overrides, selectedAgent]);

  const selectedAvatarPresetId = useMemo(() => {
    const currentAvatarUrl = selectedAvatarUrl;
    if (!currentAvatarUrl) {
      return null;
    }

    for (const options of Object.values(PRESET_OPTIONS)) {
      const matched = options.find((option) => option.url === currentAvatarUrl);
      if (matched) {
        return matched.id;
      }
    }

    return null;
  }, [selectedAvatarUrl]);

  const avatarPresetOptions = useMemo(
    () => PRESET_OPTIONS[avatarCategory] ?? [],
    [avatarCategory],
  );

  const clearAvatarFeedback = useCallback(() => {
    setAvatarNotice("");
    setAvatarError("");
  }, []);

  const resolvePersistedAgentAvatarUrl = useCallback(
    (agentId?: string | null, fallbackAvatarUrl?: string | null) => {
      const overrideUrl = resolveWorkspaceAvatarOverride(overrides, agentId);
      if (overrideUrl) {
        return overrideUrl;
      }

      const normalizedFallbackAvatarUrl = fallbackAvatarUrl?.trim() || "";
      if (normalizedFallbackAvatarUrl) {
        return normalizedFallbackAvatarUrl;
      }

      return pickWorkspaceCloneDefaultIllustrationAvatar(agentId);
    },
    [overrides],
  );

  const setAgentAvatarOverride = useCallback((agentId: string, avatarUrl?: string | null) => {
    const normalizedKey = normalizeAvatarOverrideKey(agentId);
    if (!normalizedKey) {
      return;
    }

    setOverrides((current) => {
      const next = { ...current };
      const normalizedAvatarUrl = avatarUrl?.trim() || "";
      if (normalizedAvatarUrl) {
        next[normalizedKey] = normalizedAvatarUrl;
      } else {
        delete next[normalizedKey];
      }
      return next;
    });
  }, []);

  const openAvatarModal = useCallback(() => {
    if (!selectedAgent) {
      return;
    }

    const currentAvatarUrl = selectedAvatarUrl;
    if (currentAvatarUrl) {
      for (const [categoryId, options] of Object.entries(PRESET_OPTIONS) as Array<
        [WorkspaceCloneAvatarCategoryId, WorkspaceCloneAvatarOption[]]
      >) {
        if (options.some((option) => option.url === currentAvatarUrl)) {
          setAvatarCategory(categoryId);
          break;
        }
      }
    }

    clearAvatarFeedback();
    setIsAvatarModalOpen(true);
  }, [clearAvatarFeedback, selectedAgent, selectedAvatarUrl]);

  const closeAvatarModal = useCallback(() => {
    setIsAvatarModalOpen(false);
    clearAvatarFeedback();
  }, [clearAvatarFeedback]);

  const applyAvatarPreset = useCallback(
    (option: WorkspaceCloneAvatarOption) => {
      if (!selectedAgent) {
        return;
      }

      setAgentAvatarOverride(selectedAgent.id, option.url);
      setAvatarError("");
      setAvatarNotice(`已切换为“${option.label}”头像。`);
    },
    [selectedAgent, setAgentAvatarOverride],
  );

  const resetAvatarOverride = useCallback(() => {
    if (!selectedAgent) {
      return;
    }

    setAgentAvatarOverride(selectedAgent.id, null);
    setAvatarError("");
    setAvatarNotice("已恢复默认头像。");
  }, [selectedAgent, setAgentAvatarOverride]);

  const handleAvatarUploadChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0] ?? null;
      clearAvatarFeedback();

      if (!file || !selectedAgent) {
        input.value = "";
        return;
      }

      if (!file.type.startsWith("image/")) {
        setAvatarError("请选择图片文件。");
        input.value = "";
        return;
      }

      if (file.size > WORKSPACE_CLONE_AVATAR_UPLOAD_MAX_BYTES) {
        setAvatarError("图片大小不能超过 2MB。");
        input.value = "";
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl) {
          throw new Error("empty-data-url");
        }
        setAgentAvatarOverride(selectedAgent.id, dataUrl);
        setAvatarNotice("头像已更新。");
      } catch {
        setAvatarError("读取头像失败，请重试。");
      } finally {
        input.value = "";
      }
    },
    [clearAvatarFeedback, selectedAgent, setAgentAvatarOverride],
  );

  return {
    overrides,
    isAvatarModalOpen,
    avatarCategory,
    avatarNotice,
    avatarError,
    avatarPresetOptions,
    selectedAvatarPresetId,
    openAvatarModal,
    closeAvatarModal,
    setAvatarCategory,
    applyAvatarPreset,
    resetAvatarOverride,
    handleAvatarUploadChange,
    resolvePersistedAgentAvatarUrl,
  };
}
