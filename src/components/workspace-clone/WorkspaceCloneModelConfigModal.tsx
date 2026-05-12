import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../ui/Modal";
import type { CurrentConfig, ProviderInfo, SavedProvider, WorkspaceSavedProviderSyncEvent } from "../../types";
import { useFeedback } from "../../hooks/useFeedback";
import type { WorkspaceModelConfigDraft, WorkspaceModelProviderApi, WorkspaceSavedProviderCard } from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WORKSPACE_MODEL_VENDOR_PRESETS, getWorkspaceModelVendorPreset } from "./workspaceModelVendorPresets";

interface WorkspaceCloneModelConfigModalProps {
  show: boolean;
  savedProviders: SavedProvider[];
  currentConfig: CurrentConfig | null;
  providers: ProviderInfo[];
  loading?: boolean;
  onClose: () => void;
  onRefreshSavedProviders: () => Promise<void>;
  onRefreshCurrentConfig: () => Promise<CurrentConfig>;
  onEnqueueSavedProviderConfig: (payload: {
    providerKey: string;
    displayName?: string | null;
    baseUrl: string;
    api: string;
    apiKey: string;
    modelId: string;
    modelOptions?: string[];
  }) => Promise<string>;
  onDeleteSavedProviderConfig: (providerKey: string) => Promise<string>;
  providerSyncEvent?: { seq: number; payload: WorkspaceSavedProviderSyncEvent } | null;
}

interface PendingWorkspaceProviderSave {
  mode: "create" | "update";
  submittedDraft: WorkspaceModelConfigDraft;
  optimisticCard: WorkspaceSavedProviderCard;
}

const WORKSPACE_MODEL_PROTOCOL_OPTIONS: Array<{ value: WorkspaceModelProviderApi; label: string }> = [{ value: "openai-completions", label: "OpenAI Completion" }, { value: "openai-responses", label: "OpenAI Responses" }, { value: "anthropic-messages", label: "Anthropic Messages" }];

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function slugifyProviderKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "custom-provider";
}

function buildUniqueProviderKey(baseKey: string, existingKeys: string[]) {
  if (!existingKeys.includes(baseKey)) {
    return baseKey;
  }
  let index = 2;
  while (existingKeys.includes(`${baseKey}-${index}`)) {
    index += 1;
  }
  return `${baseKey}-${index}`;
}

function getPrimaryProviderKey(currentConfig: CurrentConfig | null) {
  return currentConfig?.provider || "";
}

function getPrimaryModelId(currentConfig: CurrentConfig | null) {
  const primary = currentConfig?.model || "";
  if (!primary) return "";
  return primary.includes("/") ? primary.split("/").slice(1).join("/") : primary;
}

function resolvePresetId(savedProvider: SavedProvider) {
  const byName = WORKSPACE_MODEL_VENDOR_PRESETS.find((item) => item.id === savedProvider.name);
  if (byName) return byName.id;
  const providerBaseUrl = normalizeBaseUrl(savedProvider.base_url);
  const byBaseUrl = WORKSPACE_MODEL_VENDOR_PRESETS.find((item) => normalizeBaseUrl(item.baseUrl) === providerBaseUrl);
  return byBaseUrl?.id || "custom";
}

function createDraftFromPreset(presetId: string): WorkspaceModelConfigDraft {
  const preset = getWorkspaceModelVendorPreset(presetId);
  return {
    providerKey: preset.id === "custom" ? "" : preset.id,
    vendorPresetId: preset.id,
    providerDisplayName: preset.displayName,
    providerBaseUrl: preset.baseUrl,
    providerApi: preset.apiType,
    modelId: preset.defaultModel,
    modelOptions: [...preset.modelOptions],
    apiKey: "",
    apiKeyConfigured: false,
  };
}

function createDraftFromSavedProvider(
  savedProvider: SavedProvider,
  currentConfig: CurrentConfig | null,
): WorkspaceModelConfigDraft {
  const presetId = resolvePresetId(savedProvider);
  const preset = getWorkspaceModelVendorPreset(presetId);
  const currentModelId =
    currentConfig?.provider === savedProvider.name
      ? getPrimaryModelId(currentConfig)
      : "";
  const firstModelId = currentModelId || savedProvider.models[0]?.id || preset.defaultModel;
  return {
    providerKey: savedProvider.name,
    vendorPresetId: presetId,
    providerDisplayName: savedProvider.display_name || preset.displayName || savedProvider.name,
    providerBaseUrl: savedProvider.base_url || preset.baseUrl,
    providerApi: (savedProvider.api as WorkspaceModelProviderApi | null) || preset.apiType,
    modelId: firstModelId,
    modelOptions: savedProvider.models.map((item) => item.id),
    apiKey: "",
    apiKeyConfigured: savedProvider.has_api_key,
  };
}

function resolveProviderLabel(savedProvider: SavedProvider, providers: ProviderInfo[]) {
  if (savedProvider.display_name?.trim()) {
    return savedProvider.display_name.trim();
  }
  const preset = WORKSPACE_MODEL_VENDOR_PRESETS.find((item) => item.id === savedProvider.name);
  if (preset) {
    return preset.displayName;
  }
  return providers.find((item) => item.id === savedProvider.name)?.name || savedProvider.name;
}

function buildSavedProviderCards(
  savedProviders: SavedProvider[],
  currentConfig: CurrentConfig | null,
  providers: ProviderInfo[],
): WorkspaceSavedProviderCard[] {
  const primaryProviderKey = getPrimaryProviderKey(currentConfig);
  const primaryModelId = getPrimaryModelId(currentConfig);
  const normalizedCurrentBaseUrl = normalizeBaseUrl(currentConfig?.base_url || "");
  const providersWithModels = savedProviders.filter((savedProvider) => savedProvider.models.length > 0);
  const hasPrimaryProviderCard = providersWithModels.some((savedProvider) => savedProvider.name === primaryProviderKey);
  const fallbackActiveProviderKey =
    hasPrimaryProviderCard || !primaryModelId
      ? ""
      : (
          providersWithModels.find(
            (savedProvider) =>
              normalizeBaseUrl(savedProvider.base_url) === normalizedCurrentBaseUrl &&
              savedProvider.models.some((model) => model.id === primaryModelId),
          ) ??
          providersWithModels.find((savedProvider) => savedProvider.models.some((model) => model.id === primaryModelId))
        )?.name || "";

  return providersWithModels.map((savedProvider) => {
    const firstModelId = savedProvider.models[0]?.id || "";
    const isActive = primaryProviderKey === savedProvider.name || fallbackActiveProviderKey === savedProvider.name;
    const activeModelId = isActive ? primaryModelId || firstModelId : firstModelId;

    return {
      providerKey: savedProvider.name,
      displayName: resolveProviderLabel(savedProvider, providers),
      baseUrl: savedProvider.base_url,
      apiType: (savedProvider.api as WorkspaceModelProviderApi | null) || "openai-completions",
      modelId: activeModelId,
      modelOptions: savedProvider.models.map((item) => item.id),
      hasApiKey: savedProvider.has_api_key,
      isActive,
    };
  });
}

function mergeSavedProviderCards(
  savedCards: WorkspaceSavedProviderCard[],
  pendingSaves: Record<string, PendingWorkspaceProviderSave>,
) {
  const pendingCards = Object.values(pendingSaves).map((item) => item.optimisticCard);
  const pendingCardMap = new Map(pendingCards.map((card) => [card.providerKey, card]));
  const mergedSavedCards = savedCards.map((card) => pendingCardMap.get(card.providerKey) ?? card);
  const appendedPendingCards = pendingCards.filter(
    (card) => !savedCards.some((savedCard) => savedCard.providerKey === card.providerKey),
  );
  return [...mergedSavedCards, ...appendedPendingCards];
}

function resolveDraftForProvider(
  providerKey: string,
  savedProviders: SavedProvider[],
  currentConfig: CurrentConfig | null,
) {
  const savedProvider = savedProviders.find((item) => item.name === providerKey);
  if (!savedProvider) {
    return null;
  }
  return createDraftFromSavedProvider(savedProvider, currentConfig);
}

export function WorkspaceCloneModelConfigModal({
  show,
  savedProviders,
  currentConfig,
  providers,
  loading = false,
  onClose,
  onRefreshSavedProviders,
  onRefreshCurrentConfig,
  onEnqueueSavedProviderConfig,
  onDeleteSavedProviderConfig,
  providerSyncEvent,
}: WorkspaceCloneModelConfigModalProps) {
  const { pushFeedback } = useFeedback();
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [selectedVendorPresetId, setSelectedVendorPresetId] = useState("custom");
  const [draft, setDraft] = useState<WorkspaceModelConfigDraft>(createDraftFromPreset("custom"));
  const [deletePendingProviderId, setDeletePendingProviderId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingProviderSaves, setPendingProviderSaves] = useState<Record<string, PendingWorkspaceProviderSave>>({});

  const savedCards = useMemo(() => buildSavedProviderCards(savedProviders, currentConfig, providers), [currentConfig, providers, savedProviders]);
  const cards = useMemo(() => mergeSavedProviderCards(savedCards, pendingProviderSaves), [pendingProviderSaves, savedCards]);
  const selectedPreset = useMemo(() => getWorkspaceModelVendorPreset(selectedVendorPresetId), [selectedVendorPresetId]);
  const isCustomPreset = selectedVendorPresetId === "custom";
  const hasPendingEditingSave = editingProviderId ? Boolean(pendingProviderSaves[editingProviderId]) : false;

  useEffect(() => {
    if (!show) {
      return;
    }
    if (editingProviderId && pendingProviderSaves[editingProviderId]) {
      return;
    }
    if (editingProviderId) {
      const editingSavedProvider = savedProviders.find((item) => item.name === editingProviderId);
      if (editingSavedProvider) {
        const nextDraft = createDraftFromSavedProvider(editingSavedProvider, currentConfig);
        setSelectedVendorPresetId(nextDraft.vendorPresetId);
        setDraft(nextDraft);
        return;
      }

      if (draft.providerKey === editingProviderId || draft.providerDisplayName.trim()) {
        return;
      }
    }
    const nextCard = cards.find((item) => item.isActive) ?? cards[0];
    if (nextCard) {
      const savedProvider = savedProviders.find((item) => item.name === nextCard.providerKey);
      if (savedProvider) {
        const nextDraft = createDraftFromSavedProvider(savedProvider, currentConfig);
        setEditingProviderId(nextCard.providerKey);
        setSelectedVendorPresetId(nextDraft.vendorPresetId);
        setDraft(nextDraft);
        return;
      }
    }

    const customDraft = createDraftFromPreset("custom");
    setEditingProviderId(null);
    setSelectedVendorPresetId("custom");
    setDraft(customDraft);
  }, [cards, currentConfig, draft.providerDisplayName, draft.providerKey, editingProviderId, pendingProviderSaves, savedProviders, show]);

  useEffect(() => {
    if (!providerSyncEvent) {
      return;
    }
    const { providerKey, operation, status, message, error: syncError } = providerSyncEvent.payload;
    const pendingSave = pendingProviderSaves[providerKey];
    if (operation !== "upsert" || !pendingSave) {
      return;
    }
    setPendingProviderSaves((current) => {
      const nextState = { ...current };
      delete nextState[providerKey];
      return nextState;
    });

    if (status === "success") {
      setNotice(message);
      if (editingProviderId === providerKey || draft.providerKey === providerKey) {
        applyDraftForProvider(providerKey, savedProviders, currentConfig);
      }
      return;
    }

    setEditingProviderId(providerKey);
    setSelectedVendorPresetId(pendingSave.submittedDraft.vendorPresetId);
    setDraft(pendingSave.submittedDraft);
    setError(syncError?.trim() || message);
  }, [currentConfig, draft.providerKey, editingProviderId, pendingProviderSaves, providerSyncEvent, savedProviders]);

  useEffect(() => {
    const message = notice.trim();
    if (!message) {
      return;
    }
    pushFeedback({
      tone: deletePendingProviderId ? "warning" : "success",
      message,
      dedupeKey: deletePendingProviderId ? "workspace-model-delete-confirm" : "workspace-model-notice",
      persistent: false,
      autoCloseMs: deletePendingProviderId ? 3600 : undefined,
    });
  }, [deletePendingProviderId, notice, pushFeedback]);

  useEffect(() => {
    const message = error.trim();
    if (!message) {
      return;
    }
    pushFeedback({
      tone: "error",
      title: "模型配置",
      message,
      dedupeKey: "workspace-model-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [error, pushFeedback]);

  const clearStatus = () => {
    setNotice("");
    setError("");
  };

  const applyDraftForProvider = (
    providerKey: string,
    nextSavedProviders: SavedProvider[],
    nextCurrentConfig: CurrentConfig | null,
  ) => {
    const nextDraft = resolveDraftForProvider(providerKey, nextSavedProviders, nextCurrentConfig);
    if (!nextDraft) {
      return false;
    }

    setEditingProviderId(providerKey);
    setSelectedVendorPresetId(nextDraft.vendorPresetId);
    setDraft(nextDraft);
    return true;
  };

  const refreshSavedProvidersSnapshot = async () => {
    await onRefreshSavedProviders();
    return invoke<SavedProvider[]>("list_saved_providers");
  };

  const handleSelectCard = (providerKey: string) => {
    clearStatus();
    setDeletePendingProviderId(null);

    const pendingSave = pendingProviderSaves[providerKey];
    if (pendingSave) {
      setEditingProviderId(providerKey);
      setSelectedVendorPresetId(pendingSave.submittedDraft.vendorPresetId);
      setDraft(pendingSave.submittedDraft);
      return;
    }

    const savedProvider = savedProviders.find((item) => item.name === providerKey);
    if (!savedProvider) {
      return;
    }

    const nextDraft = createDraftFromSavedProvider(savedProvider, currentConfig);
    setEditingProviderId(providerKey);
    setSelectedVendorPresetId(nextDraft.vendorPresetId);
    setDraft(nextDraft);
  };

  const handleEditCard = (providerKey: string) => {
    clearStatus();
    setDeletePendingProviderId(null);

    const pendingSave = pendingProviderSaves[providerKey];
    if (pendingSave) {
      setEditingProviderId(providerKey);
      setSelectedVendorPresetId(pendingSave.submittedDraft.vendorPresetId);
      setDraft(pendingSave.submittedDraft);
      return;
    }

    const savedProvider = savedProviders.find((item) => item.name === providerKey);
    if (!savedProvider) {
      return;
    }

    const nextDraft = createDraftFromSavedProvider(savedProvider, currentConfig);
    setEditingProviderId(providerKey);
    setSelectedVendorPresetId(nextDraft.vendorPresetId);
    setDraft(nextDraft);
  };

  const handleAddConfig = () => {
    clearStatus();
    setDeletePendingProviderId(null);
    const nextDraft = createDraftFromPreset("custom");
    setEditingProviderId(null);
    setSelectedVendorPresetId("custom");
    setDraft(nextDraft);
  };

  const handleSelectVendorPreset = (presetId: string) => {
    clearStatus();
    setDeletePendingProviderId(null);

    const nextPreset = getWorkspaceModelVendorPreset(presetId);
    setSelectedVendorPresetId(presetId);
    setDraft((current) => ({
      ...current,
      vendorPresetId: presetId,
      providerDisplayName: presetId === "custom" ? current.providerDisplayName : nextPreset.displayName,
      providerBaseUrl: presetId === "custom" ? current.providerBaseUrl : nextPreset.baseUrl,
      providerApi: presetId === "custom" ? current.providerApi : nextPreset.apiType,
      modelId:
        presetId === "custom"
          ? current.modelId
          : current.modelId && nextPreset.modelOptions.includes(current.modelId)
            ? current.modelId
            : nextPreset.defaultModel,
      modelOptions: presetId === "custom" ? current.modelOptions : [...nextPreset.modelOptions],
    }));
  };

  const handleRefresh = async () => {
    clearStatus();
    setDeletePendingProviderId(null);
    setRefreshing(true);
    try {
      await Promise.all([onRefreshSavedProviders(), onRefreshCurrentConfig()]);
      setNotice("模型配置已从 openclaw.json 刷新");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "刷新模型配置失败");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (providerKey: string) => {
    if (pendingProviderSaves[providerKey]) {
      clearStatus();
      setError("请等待当前配置同步完成后再删除");
      return;
    }

    if (deletePendingProviderId !== providerKey) {
      clearStatus();
      setDeletePendingProviderId(providerKey);
      setNotice("再次点击删除以确认移除该配置");
      return;
    }

    clearStatus();
    setSaving(true);
    try {
      const result = await onDeleteSavedProviderConfig(providerKey);
      const [nextSavedProviders, nextCurrentConfig] = await Promise.all([
        refreshSavedProvidersSnapshot(),
        onRefreshCurrentConfig(),
      ]);
      setNotice(result);
      setDeletePendingProviderId(null);

      if (!editingProviderId || editingProviderId === providerKey) {
        const nextCards = buildSavedProviderCards(nextSavedProviders, nextCurrentConfig, providers);
        const nextCard = nextCards.find((item) => item.isActive) ?? nextCards[0];
        if (nextCard && applyDraftForProvider(nextCard.providerKey, nextSavedProviders, nextCurrentConfig)) {
          return;
        }
        handleAddConfig();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除模型配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    clearStatus();

    const providerDisplayName = draft.providerDisplayName.trim();
    const providerBaseUrl = draft.providerBaseUrl.trim();
    const modelId = draft.modelId.trim();

    if (!providerDisplayName) {
      setError("请填写名称");
      return;
    }
    if (!providerBaseUrl) {
      setError("请填写请求地址");
      return;
    }
    if (!modelId) {
      setError("请填写模型 ID");
      return;
    }

    const existingKeys = [
      ...savedProviders.map((item) => item.name),
      ...Object.keys(pendingProviderSaves),
    ];
    const generatedKey =
      selectedVendorPresetId !== "custom"
        ? selectedPreset.id
        : buildUniqueProviderKey(slugifyProviderKey(providerDisplayName), existingKeys);

    const providerKey = editingProviderId || draft.providerKey || generatedKey;
    const modelOptions =
      selectedVendorPresetId === "custom"
        ? [modelId]
        : [modelId, ...selectedPreset.modelOptions.filter((item) => item !== modelId)];

    if (pendingProviderSaves[providerKey]) {
      setError("当前配置仍在同步中，请稍后再保存");
      return;
    }

    const existingCard = cards.find((item) => item.providerKey === providerKey);
    const submittedDraft: WorkspaceModelConfigDraft = {
      ...draft,
      providerKey,
      providerDisplayName,
      providerBaseUrl,
      modelId,
      modelOptions,
      apiKey: "",
      apiKeyConfigured: draft.apiKeyConfigured || draft.apiKey.trim().length > 0,
    };

    setSaving(true);
    try {
      setPendingProviderSaves((current) => ({
        ...current,
        [providerKey]: {
          mode: editingProviderId ? "update" : "create",
          submittedDraft,
          optimisticCard: {
            providerKey,
            displayName: providerDisplayName,
            baseUrl: providerBaseUrl,
            apiType: draft.providerApi,
            modelId: existingCard?.isActive ? existingCard.modelId : modelId,
            modelOptions,
            hasApiKey: submittedDraft.apiKeyConfigured,
            isActive: existingCard?.isActive ?? false,
            syncState: "pending",
          },
        },
      }));
      setEditingProviderId(providerKey);
      setSelectedVendorPresetId(submittedDraft.vendorPresetId);
      setDraft(submittedDraft);

      const result = await onEnqueueSavedProviderConfig({
        providerKey,
        displayName: providerDisplayName,
        baseUrl: providerBaseUrl,
        api: draft.providerApi,
        apiKey: draft.apiKey.trim(),
        modelId,
        modelOptions,
      });
      setNotice(result);
      return;
    } catch (saveError) {
      setPendingProviderSaves((current) => {
        const nextState = { ...current };
        delete nextState[providerKey];
        return nextState;
      });
      setError(saveError instanceof Error ? saveError.message : "保存模型配置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      maxWidth={840}
      overlayClassName="workspace-model-modal__overlay"
      contentClassName="workspace-model-modal__surface"
    >
      <div className="workspace-model-modal">
        <div className="workspace-model-modal__header">
          <div>
            <h3>模型配置</h3>
            <p>在 workspace-clone 内管理当前会话使用的模型 Provider、协议和默认模型。</p>
          </div>

          <div className="workspace-model-modal__header-actions">
            <button
              type="button"
              className="workspace-model-modal__ghost"
              onClick={() => void handleRefresh()}
              disabled={refreshing || saving || loading}
            >
              <WorkspaceCloneIcon name="refresh" size={14} strokeWidth={1.9} />
              <span>{refreshing ? "刷新中..." : "刷新"}</span>
            </button>
            <button type="button" className="workspace-model-modal__icon" onClick={onClose} aria-label="关闭模型配置">
              <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="workspace-model-modal__body">
            <section className="workspace-model-modal__cards">
              <div className="workspace-model-modal__cards-grid">
                {["one", "two", "three"].map((item) => (
                  <article key={item} className="workspace-model-card">
                    <button type="button" className="workspace-model-card__main" disabled>
                      <div className="workspace-model-card__title-row">
                        <strong>正在加载...</strong>
                      </div>
                      <p>模型配置准备中</p>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : (
        <div className="workspace-model-modal__body">
          <section className="workspace-model-modal__cards">
            <div className="workspace-model-modal__cards-grid">
              {cards.map((card) => (
                <article
                  key={card.providerKey}
                  className={[
                    "workspace-model-card",
                    card.isActive ? "is-active" : "",
                    card.syncState === "pending" ? "is-pending" : "",
                    editingProviderId === card.providerKey ? "is-editing" : "",
                    deletePendingProviderId === card.providerKey ? "is-delete-pending" : "",
                  ].join(" ").trim()}
                >
                  <button
                    type="button"
                    className="workspace-model-card__main"
                    onClick={() => handleSelectCard(card.providerKey)}
                    disabled={saving || Boolean(pendingProviderSaves[card.providerKey])}
                  >
                    <div className="workspace-model-card__title-row">
                      <strong>{card.modelId || "未选择模型"}</strong>
                      {card.isActive && (
                        <span className="workspace-model-card__state">
                          <i />
                          当前
                        </span>
                      )}
                      {card.syncState === "pending" && <span className="workspace-model-card__state is-pending">同步中</span>}
                    </div>
                  </button>

                  <div className="workspace-model-card__actions">
                    <button
                      type="button"
                      onClick={() => handleEditCard(card.providerKey)}
                      aria-label="编辑模型配置"
                      disabled={saving || Boolean(pendingProviderSaves[card.providerKey])}
                    >
                      <WorkspaceCloneIcon name="edit" size={14} strokeWidth={1.9} />
                    </button>
                    <button
                      type="button"
                      className={deletePendingProviderId === card.providerKey ? "is-danger" : ""}
                      onClick={() => void handleDelete(card.providerKey)}
                      aria-label="删除模型配置"
                      disabled={saving || Boolean(pendingProviderSaves[card.providerKey])}
                    >
                      <WorkspaceCloneIcon name="trash" size={14} strokeWidth={1.9} />
                    </button>
                  </div>
                </article>
              ))}

              <button
                type="button"
                className={`workspace-model-card workspace-model-card--add ${editingProviderId ? "" : "is-editing"}`}
                onClick={handleAddConfig}
              >
                <span className="workspace-model-card__add-icon">
                  <WorkspaceCloneIcon name="plus" size={16} strokeWidth={2} />
                </span>
                <strong>新增配置</strong>
                <span>创建新配置卡片</span>
              </button>
            </div>
          </section>

          <section className="workspace-model-modal__form-shell">
            <div className="workspace-model-modal__form-head">
              <strong>{editingProviderId ? "编辑配置" : "新增配置"}</strong>
            </div>

            <div className="workspace-model-modal__form-grid">
              <label className="workspace-model-modal__field">
                <span>模型厂商</span>
                <select value={selectedVendorPresetId} onChange={(event) => handleSelectVendorPreset(event.target.value)}>
                  {WORKSPACE_MODEL_VENDOR_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="workspace-model-modal__field">
                <span>名称</span>
                <input
                  value={draft.providerDisplayName}
                  readOnly={!isCustomPreset}
                  onChange={(event) => setDraft((current) => ({ ...current, providerDisplayName: event.target.value }))}
                  placeholder="例如：自定义 Provider"
                />
              </label>

              <label className="workspace-model-modal__field">
                <span>请求地址</span>
                <input
                  value={draft.providerBaseUrl}
                  readOnly={!isCustomPreset}
                  onChange={(event) => setDraft((current) => ({ ...current, providerBaseUrl: event.target.value }))}
                  placeholder="https://api.example.com/v1"
                />
              </label>

              <label className="workspace-model-modal__field">
                <span>API Key</span>
                <input
                  value={draft.apiKey}
                  type="password"
                  onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={draft.apiKeyConfigured ? "留空则保留当前输入状态" : "sk-..."}
                />
              </label>

              <label className="workspace-model-modal__field">
                <span>模型 ID</span>
                {selectedPreset.modelOptions.length > 0 && !isCustomPreset ? (
                  <select
                    value={draft.modelId}
                    onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}
                  >
                    {selectedPreset.modelOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={draft.modelId}
                    onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}
                    placeholder="model-id"
                  />
                )}
              </label>

              <label className="workspace-model-modal__field">
                <span>协议</span>
                <select
                  value={draft.providerApi}
                  disabled={!isCustomPreset}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      providerApi: event.target.value as WorkspaceModelProviderApi,
                    }))
                  }
                >
                  {WORKSPACE_MODEL_PROTOCOL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="workspace-model-modal__footer">
              <button type="button" className="workspace-model-modal__ghost" onClick={handleAddConfig}>
                重置表单
              </button>
              <button type="button" className="workspace-model-modal__primary" onClick={() => void handleSave()} disabled={saving || hasPendingEditingSave}>
                {saving ? "保存中..." : editingProviderId ? "更新配置" : "保存配置"}
              </button>
            </div>
          </section>
        </div>
        )}
      </div>
    </Modal>
  );
}
