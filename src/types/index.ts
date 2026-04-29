// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * Shared TypeScript type definitions for DragonClaw
 *
 * These types are the contract between the Tauri backend and
 * React frontend. Do NOT modify without updating both sides.
 */

// ===== App State =====
export type AppPhase = "checking" | "initializing" | "workspace" | "launching" | "ready";
export type TabId = "dashboard" | "models" | "agents" | "analytics" | "settings";
export type HomeView = "workspace-clone" | "legacy-tabs";
export type WorkspaceMenuKey = "chat" | "schedule" | "knowledge" | "employees" | "skills" | "tasks";
export type WorkspaceEntityType = "agents" | "channels" | "teams";

// ===== Data Models =====
export interface LogEntry {
    time: string;
    level: string;
    message: string;
    humanized?: string;
}

export interface AgentInfo {
    name: string;
    model: string | null;
    has_sessions: boolean;
    is_default: boolean;
}

export interface AgentDetail {
    name: string;
    model: string | null;
    provider: string | null;
    system_prompt: string | null;
    has_sessions: boolean;
    is_default: boolean;
}

export interface SkillInfo {
    name: string;
    description: string;
    path: string;
}

export interface MemoryFileSnapshotItem {
    id: string;
    title: string;
    summary: string;
    source_path: string;
    relative_path: string;
    updated_at_ms: number;
    content: string;
    exists: boolean;
}

export interface MemoryFileSnapshotResponse {
    source_path: string;
    items: MemoryFileSnapshotItem[];
}

export interface SavedProvider {
    name: string;
    display_name?: string | null;
    base_url: string;
    api: string | null;
    has_api_key: boolean;
    model_count: number;
    models: SavedModel[];
}

export interface SavedModel {
    id: string;
    name: string | null;
}

export interface ProviderInfo {
    id: string;
    name: string;
    category: string;
    base_url: string;
    register_url: string;
    description: string;
    models: ModelInfo[];
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    is_free: boolean;
}

export interface CurrentConfig {
    has_api_key: boolean;
    provider: string | null;
    model: string | null;
    base_url: string | null;
    gateway_token?: string | null;
}

export interface OnboardingSkillInstallResultItem {
    name: string;
    status: string;
    detail?: string | null;
}

export interface OnboardingSkillInstallState {
    required: boolean;
    completed: boolean;
    skipped: boolean;
    results: OnboardingSkillInstallResultItem[];
    lastAttemptAt?: number | null;
}

// ===== UI Constants =====
export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
    free: { label: "免费注册", icon: "gift" },
    provider: { label: "Coding Plan", icon: "credit-card" },
    custom: { label: "自定义中转站", icon: "globe" },
};
