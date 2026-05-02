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
export type WorkspaceMenuKey = "chat" | "schedule" | "knowledge" | "employees" | "skills" | "tasks";
export type WorkspaceEntityType = "agents" | "channels" | "teams";
export type WorkspaceChannelId =
    | "weixin"
    | "feishu"
    | "wecom"
    | "dingtalk"
    | "qq"
    | "telegram"
    | "whatsapp"
    | "discord";

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
    workspace_path?: string | null;
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

export interface OnboardingSkillInstallDiagnostics {
    stateFileExists: boolean;
    stateRequired: boolean;
    stateCompleted: boolean;
    mainAgentHasSkills: boolean;
    skillHubInstalled: boolean;
    installedTargetSkillCount: number;
    shouldBackfill: boolean;
}

export interface SkillHubInstallRuntimeInfo {
    bashAvailable: boolean;
    bashVersion?: string | null;
    isWslBash: boolean;
    homeDir: string;
    openclawConfigPath: string;
    workspaceDir: string;
    workspaceSkillsDir: string;
    skillhubCliHomeDir: string;
    skillhubWrapperPath: string;
    skillhubCliScriptPath: string;
}

export interface SkillHubCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    runtimeInfo: SkillHubInstallRuntimeInfo;
}

export interface OpenClawChannelAccountSnapshotItem {
    accountId: string;
    name: string;
    configured: boolean;
    status: string;
    isDefault: boolean;
    agentId?: string | null;
}

export interface OpenClawChannelGroupSnapshotItem {
    channelType: string;
    defaultAccountId: string;
    status: string;
    accounts: OpenClawChannelAccountSnapshotItem[];
}

export interface OpenClawChannelAccountsSnapshotResponse {
    sourcePath: string;
    detail: string;
    channels: OpenClawChannelGroupSnapshotItem[];
}

export interface OpenClawChannelConfigPayload {
    channelType: string;
    accountId?: string | null;
    config: Record<string, string>;
}

export interface OpenClawChannelBindingPayload {
    channelType: string;
    accountId: string;
    agentId?: string | null;
    preferredDmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer" | null;
}

export interface OpenClawChannelQrBindingSessionSnapshot {
    sessionId: string;
    channelType: string;
    status: string;
    qrUrl?: string | null;
    qrAscii?: string | null;
    detail?: string | null;
    logs: string[];
    startedAtMs: number;
    updatedAtMs: number;
}

export interface FeishuOnboardingQrResponse {
    qrUrl: string;
    userCode: string;
    deviceCode: string;
    pollIntervalSeconds: number;
    expiresInSeconds: number;
    expiresAtMs: number;
}

export interface FeishuOnboardingPollResponse {
    status: string;
    message?: string | null;
    appId?: string | null;
    credentialsSaved?: boolean | null;
    tenantBrand?: string | null;
}

export interface AgencyAgentInfo {
    name?: string;
    mission?: string;
    workflow?: string[];
    tags?: string[];
}

export interface AgencyAgentInfoRecord {
    locale: string;
    agentId: string;
    info: AgencyAgentInfo;
}

export interface AgencyAgentTemplate {
    locale: string;
    AGENTS_MD: string;
    IDENTITY_MD: string;
    SOUL_MD: string;
}

export interface AgencyAgentManifest {
    schemaVersion: number;
    sourceRoot: string;
    rosterZhRaw: string;
    agentInfos: AgencyAgentInfoRecord[];
    templates: Record<string, AgencyAgentTemplate>;
}

export interface AgencyRosterRole {
    id: string;
    agentId: string;
    divisionId: string;
    divisionTitle: string;
    source: string;
    locale: string;
    name: string;
    description: string;
    tags: string[];
}

export interface AgencyRosterDivision {
    id: string;
    title: string;
    count: number;
    roles: AgencyRosterRole[];
}

export interface InstalledAgencyEmployee {
    id: string;
    name: string;
    subtitle: string;
    divisionTitle: string;
}

// ===== UI Constants =====
export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
    free: { label: "免费注册", icon: "gift" },
    provider: { label: "Coding Plan", icon: "credit-card" },
    custom: { label: "自定义中转站", icon: "globe" },
};
