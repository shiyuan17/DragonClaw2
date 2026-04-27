// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * ModelsTab Component — AI Engine Page
 *
 * Shows saved providers as card list with clickable model chips.
 * Active model highlighted with project accent color.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, Plus, Trash2, Server, Key, ChevronDown, ChevronUp, Edit3, X } from "lucide-react";
import { motion } from "framer-motion";
import { Modal } from "./ui/Modal";
import type { SavedProvider, ProviderInfo, CurrentConfig } from "../types";

interface ModelsTabProps {
    providers: ProviderInfo[];
    filteredProviders: ProviderInfo[];
    currentConfig: CurrentConfig | null;
    selectedCategory: string;
    setSelectedCategory: (v: string) => void;
    selectedProvider: string;
    setSelectedProvider: (v: string) => void;
    apiKeyInput: string;
    setApiKeyInput: (v: string) => void;
    baseUrlInput: string;
    setBaseUrlInput: (v: string) => void;
    selectedModel: string;
    setSelectedModel: (v: string) => void;
    configSaving: boolean;
    setConfigStatus: (v: string) => void;
    setShowKeyModal: (v: boolean) => void;
    handleSaveConfig: () => void;
    configVersion: number;
    resetModalState: () => void;
    onConfigChanged?: () => void;
    running?: boolean;
    addLog?: (level: string, msg: string) => void;
    setRunning?: (r: boolean) => void;
    setStartingUp?: (v: boolean) => void;
}

export function ModelsTab({
    providers,
    setShowKeyModal,
    currentConfig,
    configVersion,
    resetModalState,
    onConfigChanged,
    running,
    addLog,
    setRunning,
    setStartingUp,
}: ModelsTabProps) {
    const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Model selection state
    const [pendingModel, setPendingModel] = useState<string | null>(null);
    const [customModelInput, setCustomModelInput] = useState("");
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [switching, setSwitching] = useState(false);

    const loadProviders = useCallback(async () => {
        setLoading(true);
        try {
            const list = await invoke<SavedProvider[]>("list_saved_providers");
            setSavedProviders(list);
        } catch (err) {
            console.error("Failed to load providers:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProviders();
        // Auto-expand the current provider card after save/switch
        if (currentConfig?.provider) {
            setExpandedProvider(currentConfig.provider);
        }
    }, [loadProviders, configVersion]);

    // Also reload when currentConfig changes (e.g. from dashboard switch)
    useEffect(() => { loadProviders(); }, [currentConfig?.model]);

    const handleOpenAddModal = () => {
        resetModalState();
        setShowKeyModal(true);
    };

    const handleDelete = async (name: string) => {
        setDeleting(true);
        try {
            await invoke("delete_provider", { name });
            setShowDeleteConfirm(null);
            await loadProviders();
            // Refresh currentConfig — if last provider deleted, hint clears
            onConfigChanged?.();
        } catch (err) {
            console.error("Delete failed:", err);
        } finally {
            setDeleting(false);
        }
    };

    // Current active model from config
    const currentFullModel = currentConfig?.model || "";
    const currentProviderName = currentConfig?.provider || "";

    const isActiveModel = (providerName: string, modelId: string) =>
        currentFullModel === `${providerName}/${modelId}`;

    // Check if a model is custom (not from built-in catalog)
    const isCustomModel = (providerName: string, modelId: string): boolean => {
        const catalogProvider = providers.find(p => p.id === providerName);
        if (!catalogProvider) return true; // Entire provider is custom
        return !catalogProvider.models?.some(cm => cm.id === modelId);
    };

    const handleSwitchModel = async (providerName: string, modelId: string) => {
        const fullId = `${providerName}/${modelId}`;
        if (fullId === currentFullModel) return;
        setSwitching(true);
        try {
            await invoke("set_default_model", { modelId: fullId });
            setPendingModel(null);
            setCustomModelInput("");
            setShowCustomInput(false);
            onConfigChanged?.();
            // Auto-restart service if running so new model takes effect
            if (running && setRunning) {
                setStartingUp?.(true);
                addLog?.("info", "正在重启服务以加载新模型...");
                try {
                    await invoke("stop_service");
                    setRunning(false);
                    await new Promise(r => setTimeout(r, 1000));
                    await invoke("start_service");
                    setRunning(true);
                    // Don't clear startingUp — useService event listener
                    // clears it when service emits "started on" / "ready on"
                    addLog?.("success", "[OK] 服务已重启，新模型配置生效");
                } catch (restartErr) {
                    addLog?.("error", `重启服务失败: ${restartErr}`);
                    setStartingUp?.(false);
                }
            }
        } catch (err) {
            console.error("Switch failed:", err);
        } finally {
            setSwitching(false);
        }
    };

    return (
        <motion.div
            key="models"
            className="models-page"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
        >
            {/* Header */}
            <div className="agents-header">
                <div>
                    <h2 className="agents-title">
                        <Cpu size={20} strokeWidth={1.5} /> AI 引擎
                    </h2>
                    <p className="page-desc" style={{ margin: "6px 0 0" }}>管理已配置的模型提供商，添加新的 API Key 接入更多模型。</p>
                </div>
                <button className="btn-primary" onClick={handleOpenAddModal}>
                    <Plus size={14} strokeWidth={2} /> 添加模型商
                </button>
            </div>

            {/* Current Active */}
            {currentConfig?.provider && (
                <div className="provider-active-hint">
                    <Server size={14} strokeWidth={1.5} />
                    <span>当前使用：<strong>{currentConfig.provider}</strong> / {currentConfig.model || "未选择模型"}</span>
                </div>
            )}

            {/* Provider Cards */}
            {loading ? (
                <div className="agents-empty">正在加载...</div>
            ) : savedProviders.length === 0 ? (
                <div className="agents-empty">
                    暂无已保存的模型商
                    <br />
                    <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleOpenAddModal}>
                        <Plus size={14} strokeWidth={2} /> 添加第一个模型商
                    </button>
                </div>
            ) : (
                <div className="provider-cards-list">
                    {savedProviders.map((sp) => {
                        const isActive = currentProviderName === sp.name;
                        const isExpanded = expandedProvider === sp.name;
                        return (
                            <div
                                key={sp.name}
                                className={`provider-saved-card ${isActive ? "active" : ""}`}
                            >
                                <div className="provider-saved-header" onClick={() => {
                                    setExpandedProvider(isExpanded ? null : sp.name);
                                    setPendingModel(null);
                                    setCustomModelInput("");
                                    setShowCustomInput(false);
                                }}>
                                    <div className="provider-saved-icon">
                                        <Server size={18} strokeWidth={1.5} />
                                    </div>
                                    <div className="provider-saved-info">
                                        <div className="provider-saved-name">
                                            {sp.name}
                                            {isActive && <span className="agent-badge">当前使用</span>}
                                            {sp.has_api_key && <Key size={12} strokeWidth={1.5} style={{ color: "var(--accent-success)", marginLeft: 4 }} />}
                                        </div>
                                        <div className="provider-saved-url">{sp.base_url || "无 Base URL"}</div>
                                    </div>
                                    <div className="provider-saved-meta">
                                        <span className="agent-meta-tag">{sp.model_count} 个模型</span>
                                        {sp.api && <span className="agent-meta-tag">{sp.api}</span>}
                                    </div>
                                    <div className="provider-saved-expand">
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>

                                {/* Expanded: clickable model chips — no framer-motion to avoid jitter */}
                                {isExpanded && (
                                    <div className="provider-saved-models">
                                        <div className="provider-model-grid">
                                            {sp.models.map((m) => {
                                                const active = isActiveModel(sp.name, m.id);
                                                const pending = pendingModel === m.id;
                                                return (
                                                    <div key={m.id} className="model-chip-wrapper">
                                                        <button
                                                            className={`model-select-btn ${active ? "active" : ""} ${pending ? "pending" : ""}`}
                                                            data-text={m.name || m.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (active) return;
                                                                setPendingModel(m.id);
                                                                setCustomModelInput("");
                                                                setShowCustomInput(false);
                                                            }}
                                                        >
                                                            {m.name || m.id}
                                                        </button>
                                                        {isCustomModel(sp.name, m.id) && (
                                                            <button
                                                                className="model-chip-delete"
                                                                title="删除此模型"
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        await invoke("remove_model_from_provider", {
                                                                            providerName: sp.name,
                                                                            modelId: m.id,
                                                                        });
                                                                        await loadProviders();
                                                                        onConfigChanged?.();
                                                                    } catch (err) {
                                                                        console.error("Remove model failed:", err);
                                                                    }
                                                                }}
                                                            >
                                                                <X size={10} strokeWidth={2} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {/* Custom model toggle — same style as hand-input */}
                                            <button
                                                className={`model-select-btn model-custom-toggle ${showCustomInput ? "active" : ""}`}
                                                data-text="自定义"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowCustomInput(!showCustomInput);
                                                    setPendingModel(null);
                                                }}
                                            >
                                                <Edit3 size={12} strokeWidth={2} style={{ marginRight: 4 }} /> 自定义
                                            </button>
                                        </div>

                                        {/* Custom model input + confirm add */}
                                        {showCustomInput && (
                                            <div style={{ display: "flex", gap: 6, marginBottom: 8, marginTop: 6, alignItems: "center" }}>
                                                <input
                                                    type="text"
                                                    placeholder="输入自定义模型 ID..."
                                                    value={customModelInput}
                                                    onChange={(e) => { setCustomModelInput(e.target.value); }}
                                                    className="input-field"
                                                    style={{ flex: 1, fontSize: 13 }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && customModelInput.trim()) {
                                                            e.stopPropagation();
                                                            (async () => {
                                                                const mid = customModelInput.trim();
                                                                await invoke("add_model_to_provider", { providerName: sp.name, modelId: mid });
                                                                setCustomModelInput("");
                                                                setShowCustomInput(false);
                                                                await loadProviders();
                                                                onConfigChanged?.();
                                                            })();
                                                        }
                                                    }}
                                                />
                                                <button
                                                    className="btn-primary"
                                                    style={{ fontSize: 12, padding: "6px 12px", whiteSpace: "nowrap" }}
                                                    disabled={!customModelInput.trim()}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const mid = customModelInput.trim();
                                                        if (!mid) return;
                                                        // Add the model to provider list without switching
                                                        await invoke("add_model_to_provider", { providerName: sp.name, modelId: mid });
                                                        setCustomModelInput("");
                                                        setShowCustomInput(false);
                                                        await loadProviders();
                                                        onConfigChanged?.();
                                                    }}
                                                >
                                                    确认添加
                                                </button>
                                            </div>
                                        )}

                                        <div className="provider-saved-actions">
                                            {/* Switch model button — only when a chip is selected */}
                                            {pendingModel && (
                                                <button
                                                    className="btn-primary"
                                                    style={{ fontSize: 13, padding: "6px 16px" }}
                                                    disabled={switching}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (pendingModel) handleSwitchModel(sp.name, pendingModel);
                                                    }}
                                                >
                                                    {switching ? "切换中..." : "确认切换"}
                                                </button>
                                            )}
                                            {/* Switch to this provider (non-active, no model pending) */}
                                            {!isActive && !pendingModel && sp.models.length > 0 && (
                                                <button
                                                    className="btn-primary"
                                                    style={{ fontSize: 13, padding: "6px 16px" }}
                                                    disabled={switching}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSwitchModel(sp.name, sp.models[0].id);
                                                    }}
                                                >
                                                    {switching ? "切换中..." : "切换到此模型商"}
                                                </button>
                                            )}
                                            <button
                                                className="btn-ghost btn-danger-ghost"
                                                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(sp.name); }}
                                            >
                                                <Trash2 size={14} strokeWidth={1.5} /> 删除
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete Confirm */}
            <Modal show={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="确认删除" maxWidth={400}>
                <div className="modal-form">
                    <p style={{ color: "var(--text-secondary)", margin: "12px 0 20px" }}>
                        确定要删除模型商 <strong style={{ color: "var(--text-primary)" }}>{showDeleteConfirm}</strong> 吗？
                        <br />删除后使用该模型商的 Agent 将需要重新配置。
                    </p>
                    <div className="form-actions">
                        <button className="btn-secondary" onClick={() => setShowDeleteConfirm(null)}>取消</button>
                        <button className="btn-danger" onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)} disabled={deleting}>
                            {deleting ? "删除中..." : "确认删除"}
                        </button>
                    </div>
                </div>
            </Modal>
        </motion.div>
    );
}
