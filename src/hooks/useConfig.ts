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

interface UseConfigOptions {
    addLog: (level: string, message: string) => void;
    running: boolean;
    setRunning: (r: boolean) => void;
    setStartingUp?: (v: boolean) => void;
}

export function useConfig({ addLog, running, setRunning, setStartingUp }: UseConfigOptions) {
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
            setConfigStatus("[!] 璇疯緭鍏?API Key");
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

            setConfigStatus(result);
            addLog("success", result);
            await refreshCurrentConfig().catch((error) => {
                addLog("error", `鍒锋柊褰撳墠閰嶇疆澶辫触: ${error}`);
            });
            setShowKeyModal(false);
            setConfigVersion((value) => value + 1);

            if (running) {
                addLog("info", "姝ｅ湪閲嶅惎鏈嶅姟浠ュ姞杞芥柊閰嶇疆...");
                try {
                    await invoke("stop_service");
                    setRunning(false);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await invoke("start_service_silent");
                    setRunning(true);
                    addLog("success", "[OK] 鏈嶅姟宸查噸鍚紝鏂伴厤缃敓鏁?");
                } catch (err) {
                    addLog("error", `閲嶅惎鏈嶅姟澶辫触: ${err}`);
                }
            }
        } catch (err) {
            setConfigStatus(`[!] 淇濆瓨澶辫触: ${err}`);
        } finally {
            setConfigSaving(false);
        }
    }, [apiKeyInput, selectedProvider, baseUrlInput, selectedModel, addLog, refreshCurrentConfig, running, setRunning]);

    const handleSetModel = useCallback(async (modelId: string) => {
        try {
            const result = await invoke<string>("set_default_model", { modelId });
            setSelectedModel(modelId);
            setConfigStatus(result);
            addLog("success", result);
            await refreshCurrentConfig().catch((error) => {
                addLog("error", `鍒锋柊褰撳墠閰嶇疆澶辫触: ${error}`);
            });
            setConfigVersion((value) => value + 1);

            if (running) {
                setStartingUp?.(true);
                addLog("info", "姝ｅ湪閲嶅惎鏈嶅姟浠ュ姞杞芥柊妯″瀷...");
                try {
                    await invoke("stop_service");
                    setRunning(false);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await invoke("start_service_silent");
                    setRunning(true);
                    addLog("success", "[OK] 鏈嶅姟宸查噸鍚紝鏂版ā鍨嬮厤缃敓鏁?");
                } catch (restartErr) {
                    addLog("error", `閲嶅惎鏈嶅姟澶辫触: ${restartErr}`);
                    setStartingUp?.(false);
                }
            }
        } catch (err) {
            setConfigStatus(`[!] 鍒囨崲澶辫触: ${err}`);
        }
    }, [addLog, refreshCurrentConfig, running, setRunning, setStartingUp]);

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

        setConfigStatus(result);
        addLog("success", result);
        await refreshCurrentConfig().catch((error) => {
            addLog("error", `閸掗攱鏌婅ぐ鎾冲闁板秶鐤嗘径杈Е: ${error}`);
        });
        setConfigVersion((value) => value + 1);

        if (running) {
            setStartingUp?.(true);
            addLog("info", "姝ｅ湪閲嶅惎鏈嶅姟浠ュ簲鐢ㄦ柊妯″瀷閰嶇疆...");
            try {
                await invoke("stop_service");
                setRunning(false);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await invoke("start_service_silent");
                setRunning(true);
                addLog("success", "[OK] Workspace 妯″瀷閰嶇疆宸叉洿鏂板苟閲嶅惎鏈嶅姟");
            } catch (restartErr) {
                addLog("error", `闁插秴鎯庨張宥呭婢惰精瑙? ${restartErr}`);
                setStartingUp?.(false);
            }
        }

        return result;
    }, [addLog, refreshCurrentConfig, running, setRunning, setStartingUp]);

    const handleDeleteSavedProviderConfig = useCallback(async (providerKey: string) => {
        const result = await invoke<string>("delete_saved_provider_config", { providerKey });

        setConfigStatus(result);
        addLog("success", result);
        await refreshCurrentConfig().catch((error) => {
            addLog("error", `閸掗攱鏌婅ぐ鎾冲闁板秶鐤嗘径杈Е: ${error}`);
        });
        setConfigVersion((value) => value + 1);

        if (running) {
            setStartingUp?.(true);
            addLog("info", "姝ｅ湪閲嶅惎鏈嶅姟浠ュ簲鐢ㄥ垹闄ゅ悗鐨勬ā鍨嬮厤缃?...");
            try {
                await invoke("stop_service");
                setRunning(false);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await invoke("start_service_silent");
                setRunning(true);
                addLog("success", "[OK] Workspace 妯″瀷閰嶇疆宸插垹闄ゅ苟閲嶅惎鏈嶅姟");
            } catch (restartErr) {
                addLog("error", `闁插秴鎯庨張宥呭婢惰精瑙? ${restartErr}`);
                setStartingUp?.(false);
            }
        }

        return result;
    }, [addLog, refreshCurrentConfig, running, setRunning, setStartingUp]);

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
            addLog("error", `閲嶇疆澶辫触: ${err}`);
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
        handleDeleteSavedProviderConfig,
        handleOpenRegister,
        handleReset,
        confirmReset,
        handleReinstall,
        configVersion,
        resetModalState,
    };
}
