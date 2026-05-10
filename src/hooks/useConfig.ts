// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * useConfig Hook
 *
 * Manages provider/model configuration state and API key operations.
 * All Tauri command calls match the actual backend API exactly.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CurrentConfig, ProviderInfo } from "../types";
import { captureTelemetryEvent } from "../utils/telemetry";

interface UseConfigOptions {
    addLog: (level: string, message: string) => void;
    running: boolean;
    setRunning: (r: boolean) => void;
}

export function useConfig({ addLog, running, setRunning }: UseConfigOptions) {
    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [selectedCategory, setSelectedCategory] = useState("free");
    const [selectedProvider, setSelectedProvider] = useState("");
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [baseUrlInput, setBaseUrlInput] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [configSaving, setConfigSaving] = useState(false);
    const [configStatus, setConfigStatus] = useState("");
    const [currentConfig, setCurrentConfig] = useState<CurrentConfig | null>(null);

    const [showKeyModal, setShowKeyModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [showReinstallModal, setShowReinstallModal] = useState(false);
    const [showModelSwitchModal, setShowModelSwitchModal] = useState(false);
    const [infoModalTitle, setInfoModalTitle] = useState("");
    const [configVersion, setConfigVersion] = useState(0);

    const filteredProviders = providers.filter((p) => p.category === selectedCategory);

    useEffect(() => {
        invoke<ProviderInfo[]>("get_providers").then(setProviders).catch(() => { });
    }, []);

    const refreshCurrentConfig = useCallback(async () => {
        const config = await invoke<CurrentConfig>("get_current_config");
        setCurrentConfig(config);
        return config;
    }, []);

    const checkApiKey = useCallback(async () => {
        try {
            await invoke("migrate_gateway_config").catch(() => { });
            const config = await refreshCurrentConfig();
            if (!config.has_api_key) {
                setShowKeyModal(true);
            }
        } catch {
            setShowKeyModal(true);
        }
    }, [refreshCurrentConfig]);

    const handleSaveConfig = useCallback(async () => {
        if (!apiKeyInput.trim()) {
            setConfigStatus("[!] 请输入 API Key");
            return;
        }

        setConfigSaving(true);
        setConfigStatus("");

        try {
            const result = await invoke<string>("save_api_config", {
                provider: selectedProvider || "custom",
                apiKey: apiKeyInput,
                baseUrl: baseUrlInput || null,
                model: selectedModel || null,
            });

            captureTelemetryEvent("launcher_api_config_saved", {
                provider: selectedProvider || "custom",
                has_base_url: Boolean(baseUrlInput.trim()),
                has_model: Boolean(selectedModel.trim()),
            });
            setConfigStatus(result);
            addLog("success", result);
            await refreshCurrentConfig().catch((error) => {
                addLog("error", `刷新当前配置失败: ${error}`);
            });
            setShowKeyModal(false);
            setConfigVersion((value) => value + 1);

            if (running) {
                addLog("info", "正在重启服务以加载新配置...");
                try {
                    await invoke("stop_service");
                    setRunning(false);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await invoke("start_service_silent");
                    addLog("success", "[OK] 服务重启请求已提交，新配置将随生命周期恢复生效");
                } catch (err) {
                    addLog("error", `重启服务失败: ${err}`);
                }
            }
        } catch (err) {
            setConfigStatus(`[!] 保存失败: ${err}`);
        } finally {
            setConfigSaving(false);
        }
    }, [apiKeyInput, selectedProvider, baseUrlInput, selectedModel, addLog, refreshCurrentConfig, running, setRunning]);

    const handleSetModel = useCallback(async (modelId: string) => {
        try {
            const result = await invoke<string>("set_default_model", { modelId });
            captureTelemetryEvent("launcher_default_model_changed");
            setSelectedModel(modelId);
            setConfigStatus(result);
            addLog("success", result);
            await refreshCurrentConfig().catch((error) => {
                addLog("error", `刷新当前配置失败: ${error}`);
            });
            setConfigVersion((value) => value + 1);

            if (running) {
                addLog("info", "正在重启服务以加载新模型...");
                try {
                    await invoke("stop_service");
                    setRunning(false);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await invoke("start_service_silent");
                    addLog("success", "[OK] 服务重启请求已提交，新模型配置将随生命周期恢复生效");
                } catch (restartErr) {
                    addLog("error", `重启服务失败: ${restartErr}`);
                }
            }
        } catch (err) {
            setConfigStatus(`[!] 切换失败: ${err}`);
        }
    }, [addLog, refreshCurrentConfig, running, setRunning]);

    const handleUpsertSavedProviderConfig = useCallback(async (payload: {
        providerKey: string;
        displayName?: string | null;
        baseUrl: string;
        api: string;
        apiKey: string;
        modelId: string;
        modelOptions?: string[];
    }) => {
        const result = await invoke<string>("upsert_saved_provider_config", {
            providerKey: payload.providerKey,
            displayName: payload.displayName ?? null,
            baseUrl: payload.baseUrl,
            api: payload.api,
            apiKey: payload.apiKey,
            modelId: payload.modelId,
            modelOptions: payload.modelOptions ?? [],
        });

        captureTelemetryEvent("launcher_saved_provider_upserted");
        setConfigStatus(result);
        addLog("success", result);
        await refreshCurrentConfig().catch((error) => {
            addLog("error", `刷新当前配置失败: ${error}`);
        });
        setConfigVersion((value) => value + 1);

        if (running) {
            addLog("info", "正在重启服务以应用新模型配置...");
            try {
                await invoke("stop_service");
                setRunning(false);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await invoke("start_service_silent");
                addLog("success", "[OK] Workspace 模型配置已更新，服务将随生命周期恢复");
            } catch (restartErr) {
                addLog("error", `重启服务失败: ${restartErr}`);
            }
        }

        return result;
    }, [addLog, refreshCurrentConfig, running, setRunning]);

    const handleEnqueueWorkspaceSavedProviderConfig = useCallback(async (payload: {
        providerKey: string;
        displayName?: string | null;
        baseUrl: string;
        api: string;
        apiKey: string;
        modelId: string;
        modelOptions?: string[];
    }) => {
        const result = await invoke<string>("enqueue_workspace_saved_provider_config", {
            providerKey: payload.providerKey,
            displayName: payload.displayName ?? null,
            baseUrl: payload.baseUrl,
            api: payload.api,
            apiKey: payload.apiKey,
            modelId: payload.modelId,
            modelOptions: payload.modelOptions ?? [],
        });

        captureTelemetryEvent("launcher_saved_provider_upserted");
        setConfigStatus(result);
        addLog("info", result);
        return result;
    }, [addLog]);

    const handleDeleteSavedProviderConfig = useCallback(async (providerKey: string) => {
        const result = await invoke<string>("delete_saved_provider_config", { providerKey });

        captureTelemetryEvent("launcher_saved_provider_deleted");
        setConfigStatus(result);
        addLog("success", result);
        await refreshCurrentConfig().catch((error) => {
            addLog("error", `刷新当前配置失败: ${error}`);
        });
        setConfigVersion((value) => value + 1);

        if (running) {
            addLog("info", "正在重启服务以应用删除后的模型配置...");
            try {
                await invoke("stop_service");
                setRunning(false);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await invoke("start_service_silent");
                addLog("success", "[OK] Workspace 模型配置已删除，服务将随生命周期恢复");
            } catch (restartErr) {
                addLog("error", `重启服务失败: ${restartErr}`);
            }
        }

        return result;
    }, [addLog, refreshCurrentConfig, running, setRunning]);

    const handleOpenRegister = useCallback(async (providerId: string) => {
        try {
            await invoke("open_provider_register", { providerId });
        } catch {
            // ignore
        }
    }, []);

    const handleReset = useCallback(() => {
        setShowResetModal(true);
    }, []);

    const confirmReset = useCallback(async () => {
        setShowResetModal(false);
        try {
            const result = await invoke<string>("reset_config");
            captureTelemetryEvent("launcher_config_reset_confirmed");
            await refreshCurrentConfig().catch(() => {
                setCurrentConfig({
                    has_api_key: false,
                    provider: null,
                    model: null,
                    base_url: null,
                    gateway_token: null,
                    workspace_path: null,
                });
            });
            setApiKeyInput("");
            setSelectedProvider("");
            setSelectedModel("");
            setBaseUrlInput("");
            setConfigStatus("");
            addLog("success", result);
            setShowKeyModal(true);
        } catch (err) {
            addLog("error", `重置失败: ${err}`);
        }
    }, [addLog, refreshCurrentConfig]);

    const handleReinstall = useCallback(() => {
        setShowReinstallModal(true);
    }, []);

    const resetModalState = useCallback(() => {
        setSelectedCategory("free");
        setSelectedProvider("");
        setApiKeyInput("");
        setBaseUrlInput("");
        setSelectedModel("");
        setConfigStatus("");
    }, []);

    const bumpConfigVersion = useCallback(() => {
        setConfigVersion((value) => value + 1);
    }, []);

    return {
        providers,
        selectedCategory, setSelectedCategory,
        selectedProvider, setSelectedProvider,
        apiKeyInput, setApiKeyInput,
        baseUrlInput, setBaseUrlInput,
        selectedModel, setSelectedModel,
        configSaving, configStatus, setConfigStatus,
        currentConfig, setCurrentConfig,
        filteredProviders,
        showKeyModal, setShowKeyModal,
        showResetModal, setShowResetModal,
        showReinstallModal, setShowReinstallModal,
        showModelSwitchModal, setShowModelSwitchModal,
        infoModalTitle, setInfoModalTitle,
        refreshCurrentConfig,
        checkApiKey,
        handleSaveConfig,
        handleSetModel,
        handleUpsertSavedProviderConfig,
        handleEnqueueWorkspaceSavedProviderConfig,
        handleDeleteSavedProviderConfig,
        handleOpenRegister,
        handleReset,
        confirmReset,
        handleReinstall,
        configVersion,
        bumpConfigVersion,
        resetModalState,
    };
}
