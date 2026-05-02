// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import type {
  CurrentConfig,
  LogEntry,
  ProviderInfo,
  SavedProvider,
  WorkspaceChannelId,
  WorkspaceEntityType,
  WorkspaceMenuKey,
} from "../../types";
import { useWorkspaceGatewayChat } from "../../hooks/useWorkspaceGatewayChat";
import { formatUptime } from "../../utils/log-humanizer";
import {
  buildWorkspaceEntities,
  buildWorkspaceLogs,
  WORKSPACE_COMMAND_ITEMS,
  WORKSPACE_HISTORY,
  WORKSPACE_MENU_ITEMS,
  WORKSPACE_SCHEDULES,
  WORKSPACE_TYPE_TABS,
  WORKSPACE_WORKBENCH,
} from "./workspaceCloneData";
import {
  buildSkillOptions,
  buildSkillSummaryItems,
  buildToolOptions,
  buildToolSummaryItems,
  getWorkspaceToolProfileLabel,
  normalizeWorkspaceStringList,
} from "./workspaceCloneAgentResources";
import { formatAgentAvatar, isGatewaySkillStatusResult } from "./workspaceCloneGateway";
import {
  buildWorkspaceMemoryResourceItems,
  createWorkspaceFallbackMemoryFiles,
  loadWorkspaceMemorySnapshot,
  normalizeWorkspaceMemoryFile,
  saveWorkspaceMemoryFile,
} from "./workspaceCloneMemory";
import { WorkspaceCloneChatView } from "./WorkspaceCloneChatView";
import { WorkspaceCloneComposer } from "./WorkspaceCloneComposer";
import { WorkspaceCloneDirectory } from "./WorkspaceCloneDirectory";
import { WorkspaceCloneEmployeesView } from "./WorkspaceCloneEmployeesView";
import { WorkspaceCloneHeader } from "./WorkspaceCloneHeader";
import { WorkspaceCloneModelConfigModal } from "./WorkspaceCloneModelConfigModal";
import { WorkspaceCloneOverlayStack } from "./WorkspaceCloneOverlayStack";
import { WorkspaceCloneSidebar } from "./WorkspaceCloneSidebar";
import { useWorkspaceChannels } from "./useWorkspaceChannels";
import type {
  WorkspaceEntity,
  WorkspaceAgentSkillConfig,
  WorkspaceAgentSkillSaveResult,
  WorkspaceAgentToolConfig,
  WorkspaceGatewaySkillStatusResult,
  WorkspaceInstalledSkillInfo,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
  WorkspaceSessionSectionKey,
  WorkspaceSidebarAdminPanel,
  WorkspaceToolCategory,
  WorkspaceToolOption,
  WorkspaceUtilityPanel,
} from "./workspaceCloneTypes";

export interface WorkspaceClonePageProps {
  running: boolean;
  loading: boolean;
  servicePort: number;
  gatewayToken?: string | null;
  uptime: number;
  currentModelName: string;
  currentProviderName: string;
  currentConfig: CurrentConfig | null;
  configVersion: number;
  providers: ProviderInfo[];
  workspacePath: string;
  logs: LogEntry[];
  handleStart: () => void;
  handleStop: () => void;
  refreshCurrentConfig: () => Promise<CurrentConfig>;
  handleSetModel: (modelId: string) => Promise<void>;
  handleUpsertSavedProviderConfig: (payload: {
    providerKey: string;
    displayName?: string | null;
    baseUrl: string;
    api: string;
    apiKey: string;
    modelId: string;
    modelOptions?: string[];
  }) => Promise<string>;
  handleDeleteSavedProviderConfig: (providerKey: string) => Promise<string>;
}

const COMPACT_COPY: Record<Exclude<WorkspaceMenuKey, "chat" | "employees">, { title: string; description: string; bullets: string[] }> = {
  schedule: {
    title: "定时任务工作区骨架",
    description: "这里先保留定时任务栏目结构与信息节奏，后续再逐步迁移真实调度能力。",
    bullets: ["后续迁移任务列表、启停状态和调度设置。", "当前仅保留标题、说明卡片和状态占位。"],
  },
  knowledge: {
    title: "知识库管理工作区骨架",
    description: "先保留知识类工作区的分区结构，为后续资料树、上传区和知识面板预留接口位置。",
    bullets: ["占位卡片模拟知识源、文档集和索引状态。", "本次不接入任何真实文档或后端命令。"],
  },
  skills: {
    title: "技能市场工作区骨架",
    description: "保留技能市场的栏目名称、区块层级和卡片节奏，但暂不接入安装、搜索或管理逻辑。",
    bullets: ["为后续迁移技能列表、筛选和安装入口预留空间。", "当前仅展示静态推荐卡片和说明文案。"],
  },
  tasks: {
    title: "产品落地工作区骨架",
    description: "保留产品落地栏目的主体结构，为后续承接项目编排、分阶段推进和结果沉淀预留骨架。",
    bullets: ["当前不提供真实任务流。", "后续按 DragonClaw 的能力逐项接入。"],
  },
};

function formatRecentLabel(timestamp?: number | null) {
  if (!timestamp) {
    return "主会话";
  }

  const date = new Date(timestamp);
  return `最近活跃 ${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function resolveWorkspaceModelName(currentConfig: CurrentConfig | null, fallbackModelName: string) {
  const primaryModel = currentConfig?.model || fallbackModelName;
  if (!primaryModel) {
    return fallbackModelName;
  }
  return primaryModel.includes("/") ? primaryModel.split("/").slice(1).join("/") : primaryModel;
}

function buildGatewayAgentEntities(params: {
  agents: NonNullable<ReturnType<typeof useWorkspaceGatewayChat>["agents"]>;
  selectedAgentId: string;
  currentSessionKey: string;
  currentMainSession: ReturnType<typeof useWorkspaceGatewayChat>["currentMainSession"];
  sessionsResult: ReturnType<typeof useWorkspaceGatewayChat>["sessionsResult"];
  running: boolean;
  isGenerating: boolean;
  currentModelName: string;
  currentProviderName: string;
}) {
  const {
    agents,
    selectedAgentId,
    currentSessionKey,
    currentMainSession,
    sessionsResult,
    running,
    isGenerating,
    currentModelName,
    currentProviderName,
  } = params;

  return agents.map<WorkspaceEntity>((agent) => {
    const sessionKey = `agent:${agent.id}:main`;
    const mainSession = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
    const modelLabel =
      [mainSession?.modelProvider || currentProviderName, mainSession?.model || currentModelName]
        .filter(Boolean)
        .join(" / ") || "OpenClaw 主会话";

    return {
      id: agent.id,
      entityType: "agents",
      name: agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
      subtitle:
        !running
          ? "待命中"
          : isGenerating && currentSessionKey === sessionKey
            ? "生成中"
            : formatRecentLabel(mainSession?.updatedAt),
      status:
        !running
          ? "offline"
          : isGenerating && currentSessionKey === sessionKey
            ? "busy"
            : agent.id === selectedAgentId && currentMainSession?.abortedLastRun
              ? "busy"
              : "online",
      avatarLabel: formatAgentAvatar(agent),
      accent: agent.id,
      currentWork:
        !running
          ? "服务尚未启动，首页聊天暂不可用。"
          : isGenerating && currentSessionKey === sessionKey
            ? "正在生成当前主会话回复。"
            : "首页已接入当前 Agent 的主会话。",
      recentOutput: modelLabel,
    };
  });
}

export function WorkspaceClonePage({
  running,
  servicePort,
  gatewayToken,
  uptime,
  currentModelName,
  currentProviderName,
  currentConfig,
  configVersion,
  providers,
  logs,
  handleStart,
  refreshCurrentConfig,
  handleSetModel,
  handleUpsertSavedProviderConfig,
  handleDeleteSavedProviderConfig,
}: WorkspaceClonePageProps) {
  const [activeMenu, setActiveMenu] = useState<WorkspaceMenuKey>("chat");
  const [activeType, setActiveType] = useState<WorkspaceEntityType>("agents");
  const [selectedEntityId, setSelectedEntityId] = useState("main");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDirectoryCollapsed, setIsDirectoryCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [utilityPanel, setUtilityPanel] = useState<WorkspaceUtilityPanel>(null);
  const [activeSessionSection, setActiveSessionSection] = useState<WorkspaceSessionSectionKey>("model");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPanel, setAdminPanel] = useState<WorkspaceSidebarAdminPanel>(null);
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showRuntimeLogDetail, setShowRuntimeLogDetail] = useState(false);
  const [showSettingsTextPreview, setShowSettingsTextPreview] = useState(false);
  const [relatedResource, setRelatedResource] = useState<WorkspaceRelatedResource>(null);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<WorkspaceMemoryFile[]>(createWorkspaceFallbackMemoryFiles);
  const [selectedMemoryFileId, setSelectedMemoryFileId] = useState("agents.md");
  const [memoryDraftContent, setMemoryDraftContent] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [skillOptions, setSkillOptions] = useState<WorkspaceSkillOption[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategory, setSkillCategory] = useState<WorkspaceSkillCategory>("builtIn");
  const [skillDraftIds, setSkillDraftIds] = useState<string[]>([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillNotice, setSkillNotice] = useState("");
  const [skillError, setSkillError] = useState("");
  const [toolOptions, setToolOptions] = useState<WorkspaceToolOption[]>([]);
  const [toolCategory, setToolCategory] = useState<WorkspaceToolCategory>("all");
  const [toolProfileLabel, setToolProfileLabel] = useState("全量");
  const [toolDraftIds, setToolDraftIds] = useState<string[]>([]);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolNotice, setToolNotice] = useState("");
  const [toolError, setToolError] = useState("");
  const homepageChat = useWorkspaceGatewayChat({ running, servicePort, gatewayToken });
  const workspaceChannels = useWorkspaceChannels({ configVersion });
  const { setContextMenu } = workspaceChannels;
  const currentAgentIdRef = useRef<string | null>(null);
  const memoryLoadSeqRef = useRef(0);
  const skillLoadSeqRef = useRef(0);
  const toolLoadSeqRef = useRef(0);

  const refreshSavedProviders = useCallback(async () => {
    const nextProviders = await invoke<SavedProvider[]>("list_saved_providers");
    setSavedProviders(nextProviders);
  }, []);

  useEffect(() => {
    void refreshSavedProviders().catch(() => {});
  }, [configVersion, refreshSavedProviders]);

  const workspaceModelName = useMemo(
    () => resolveWorkspaceModelName(currentConfig, currentModelName),
    [currentConfig, currentModelName],
  );

  const workspaceProviderName = useMemo(() => {
    const primaryProviderKey = currentConfig?.provider;
    if (!primaryProviderKey) {
      return currentProviderName;
    }

    const savedProvider = savedProviders.find((item) => item.name === primaryProviderKey);
    return savedProvider?.display_name || currentProviderName || primaryProviderKey;
  }, [currentConfig, currentProviderName, savedProviders]);

  const staticEntitiesByType = useMemo(
    () => buildWorkspaceEntities(workspaceModelName, workspaceProviderName, running),
    [workspaceModelName, workspaceProviderName, running],
  );

  const gatewayAgentEntities = useMemo(
    () =>
      homepageChat.agents.length > 0
        ? buildGatewayAgentEntities({
            agents: homepageChat.agents,
            selectedAgentId: homepageChat.selectedAgentId,
            currentSessionKey: homepageChat.currentSessionKey,
            currentMainSession: homepageChat.currentMainSession,
            sessionsResult: homepageChat.sessionsResult,
            running,
            isGenerating: homepageChat.isGenerating,
            currentModelName: workspaceModelName,
            currentProviderName: workspaceProviderName,
          })
        : staticEntitiesByType.agents,
    [
      workspaceModelName,
      workspaceProviderName,
      homepageChat.agents,
      homepageChat.currentMainSession,
      homepageChat.currentSessionKey,
      homepageChat.isGenerating,
      homepageChat.selectedAgentId,
      homepageChat.sessionsResult,
      running,
      staticEntitiesByType.agents,
    ],
  );

  const entitiesByType = useMemo(
    () => ({
      ...staticEntitiesByType,
      agents: gatewayAgentEntities,
      channels: workspaceChannels.channelEntities,
    }),
    [gatewayAgentEntities, staticEntitiesByType, workspaceChannels.channelEntities],
  );

  const filteredEntities = useMemo(() => {
    const source = entitiesByType[activeType];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter((entity) => `${entity.name} ${entity.subtitle}`.toLowerCase().includes(query));
  }, [activeType, entitiesByType, searchQuery]);

  useEffect(() => {
    if (activeType === "agents" && homepageChat.selectedAgentId && selectedEntityId !== homepageChat.selectedAgentId) {
      setSelectedEntityId(homepageChat.selectedAgentId);
      return;
    }

    const nextEntity = filteredEntities[0];
    if (!filteredEntities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(nextEntity?.id || "");
    }
  }, [activeType, filteredEntities, homepageChat.selectedAgentId, selectedEntityId]);

  useEffect(() => {
    if (activeMenu !== "chat") {
      setUtilityPanel(null);
      setContextMenu(null);
      setRelatedResource(null);
      setShowAgentInfo(false);
      setShowMemoryModal(false);
      setShowSkillsModal(false);
      setShowToolsModal(false);
      setMemoryLoading(false);
      setMemorySaving(false);
      setMemoryNotice("");
      setMemoryError("");
      setSkillSearch("");
      setSkillCategory("builtIn");
      setSkillLoading(false);
      setSkillSaving(false);
      setSkillNotice("");
      setSkillError("");
      setToolCategory("all");
      setToolLoading(false);
      setToolSaving(false);
      setToolNotice("");
      setToolError("");
      setShowRuntimeLogDetail(false);
      setShowSettingsTextPreview(false);
    }
  }, [activeMenu, setContextMenu]);

  useEffect(() => {
    const handleDocumentClick = () => {
      setContextMenu(null);
      setAdminOpen(false);
      setAdminPanel(null);
    };

    const handleWindowResize = () => {
      setContextMenu(null);
    };

    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("resize", handleWindowResize);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [setContextMenu]);

  const selectedEntity = useMemo(
    () => entitiesByType[activeType].find((entity) => entity.id === selectedEntityId) ?? filteredEntities[0] ?? null,
    [activeType, entitiesByType, filteredEntities, selectedEntityId],
  );

  const chatEnabled = activeType === "agents"
    || (activeType === "channels" && Boolean(selectedEntity?.runtimeAgentId));

  const chatDisabledReason = activeType === "channels" && !selectedEntity?.runtimeAgentId
    ? "channel-unbound"
    : !chatEnabled
      ? "unsupported"
      : undefined;

  const currentMemoryAgentId = useMemo(
    () => {
      if (activeType === "agents") {
        return selectedEntity?.id || selectedEntityId || homepageChat.selectedAgentId || "main";
      }
      if (activeType === "channels" && selectedEntity?.runtimeAgentId) {
        return selectedEntity.runtimeAgentId;
      }
      return null;
    },
    [activeType, homepageChat.selectedAgentId, selectedEntity?.id, selectedEntity?.runtimeAgentId, selectedEntityId],
  );

  useEffect(() => {
    currentAgentIdRef.current = currentMemoryAgentId;
  }, [currentMemoryAgentId]);

  const activeMemoryFile = useMemo(
    () => memoryFiles.find((file) => file.id === selectedMemoryFileId) ?? memoryFiles[0] ?? null,
    [memoryFiles, selectedMemoryFileId],
  );

  const clearMemoryStatus = useCallback(() => {
    setMemoryNotice("");
    setMemoryError("");
  }, []);

  const clearSkillStatus = useCallback(() => {
    setSkillNotice("");
    setSkillError("");
  }, []);

  const clearToolStatus = useCallback(() => {
    setToolNotice("");
    setToolError("");
  }, []);

  const refreshMemoryFiles = useCallback(async (options?: {
    showLoading?: boolean;
    preferredId?: string;
  }) => {
    const showLoading = options?.showLoading ?? false;
    const preferredId = options?.preferredId;

    if (!currentMemoryAgentId) {
      const fallbackFiles = createWorkspaceFallbackMemoryFiles();
      setMemoryFiles(fallbackFiles);
      setSelectedMemoryFileId(fallbackFiles[0]?.id || "");
      setMemoryDraftContent(fallbackFiles[0]?.content || "");
      return;
    }

    if (showLoading) {
      setMemoryLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = memoryLoadSeqRef.current + 1;
    memoryLoadSeqRef.current = requestId;

    try {
      const snapshot = await loadWorkspaceMemorySnapshot(targetAgentId);
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextFiles = snapshot.items.length > 0
        ? snapshot.items.map((item) => normalizeWorkspaceMemoryFile(item))
        : createWorkspaceFallbackMemoryFiles();
      const nextSelectedId =
        preferredId && nextFiles.some((file) => file.id === preferredId)
          ? preferredId
          : nextFiles.some((file) => file.id === selectedMemoryFileId)
            ? selectedMemoryFileId
            : nextFiles[0]?.id || "";
      const nextActiveFile = nextFiles.find((file) => file.id === nextSelectedId) ?? nextFiles[0] ?? null;

      setMemoryFiles(nextFiles);
      setSelectedMemoryFileId(nextSelectedId);
      setMemoryDraftContent(nextActiveFile?.content || "");
      setMemoryError("");
    } catch (memoryLoadError) {
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setMemoryError(memoryLoadError instanceof Error ? memoryLoadError.message : "读取记忆文件失败");
      if (memoryFiles.length === 0) {
        const fallbackFiles = createWorkspaceFallbackMemoryFiles();
        setMemoryFiles(fallbackFiles);
        setSelectedMemoryFileId(fallbackFiles[0]?.id || "");
        setMemoryDraftContent(fallbackFiles[0]?.content || "");
      }
    } finally {
      if (showLoading && memoryLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setMemoryLoading(false);
      }
    }
  }, [currentMemoryAgentId, memoryFiles.length, selectedMemoryFileId]);

  const refreshSkillOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!currentMemoryAgentId) {
      setSkillOptions([]);
      setSkillDraftIds([]);
      return;
    }

    if (showLoading) {
      setSkillLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = skillLoadSeqRef.current + 1;
    skillLoadSeqRef.current = requestId;

    try {
      const savedConfig = await invoke<WorkspaceAgentSkillConfig>("get_agent_skill_config", {
        agentId: targetAgentId,
      });
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }

      let nextOptions: WorkspaceSkillOption[] = [];
      if (homepageChat.connected) {
        const report = await homepageChat.request<WorkspaceGatewaySkillStatusResult>("skills.status", {
          agentId: targetAgentId,
        });
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        if (!isGatewaySkillStatusResult(report)) {
          throw new Error("skills.status 返回格式不正确");
        }
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills").catch(() => []);
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          statusEntries: report.skills,
          installedSkills,
        });
      } else {
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills");
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          installedSkills,
        });
      }

      setSkillOptions(nextOptions);
      setSkillDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setSkillError("");
    } catch (skillLoadError) {
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setSkillError(skillLoadError instanceof Error ? skillLoadError.message : "读取技能配置失败");
      setSkillOptions((current) =>
        current.length > 0
          ? current
          : buildSkillOptions({
              selectedSkillNames: [],
            }),
      );
      setSkillDraftIds((current) => current);
    } finally {
      if (showLoading && skillLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setSkillLoading(false);
      }
    }
  }, [currentMemoryAgentId, homepageChat.connected, homepageChat.request]);

  const refreshToolOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!currentMemoryAgentId) {
      setToolOptions([]);
      setToolProfileLabel("全量");
      setToolDraftIds([]);
      return;
    }

    if (showLoading) {
      setToolLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = toolLoadSeqRef.current + 1;
    toolLoadSeqRef.current = requestId;

    try {
      const config = await invoke<WorkspaceAgentToolConfig>("get_agent_tool_config", {
        agentId: targetAgentId,
      });
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextOptions = buildToolOptions(config);
      setToolOptions(nextOptions);
      setToolProfileLabel(getWorkspaceToolProfileLabel(config));
      setToolDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setToolError("");
    } catch (toolLoadError) {
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setToolError(toolLoadError instanceof Error ? toolLoadError.message : "读取工具权限失败");
      const fallbackOptions = buildToolOptions({
        agentId: targetAgentId,
        profile: "full",
      });
      setToolOptions(fallbackOptions);
      setToolProfileLabel("全量");
      setToolDraftIds(fallbackOptions.map((item) => item.id));
    } finally {
      if (showLoading && toolLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setToolLoading(false);
      }
    }
  }, [currentMemoryAgentId]);

  const openMemoryModal = useCallback(() => {
    setActiveSessionSection("memory");
    setShowMemoryModal(true);
    clearMemoryStatus();
    void refreshMemoryFiles({
      showLoading: true,
      preferredId: selectedMemoryFileId || undefined,
    });
  }, [clearMemoryStatus, refreshMemoryFiles, selectedMemoryFileId]);

  const closeMemoryModal = useCallback(() => {
    setShowMemoryModal(false);
    setMemoryLoading(false);
    setMemorySaving(false);
    clearMemoryStatus();
  }, [clearMemoryStatus]);

  const openSkillsModal = useCallback(() => {
    setActiveSessionSection("skills");
    setShowSkillsModal(true);
    clearSkillStatus();
    void refreshSkillOptions({ showLoading: true });
  }, [clearSkillStatus, refreshSkillOptions]);

  const closeSkillsModal = useCallback(() => {
    setShowSkillsModal(false);
    setSkillSearch("");
    setSkillLoading(false);
    setSkillSaving(false);
    clearSkillStatus();
  }, [clearSkillStatus]);

  const openToolsModal = useCallback(() => {
    setActiveSessionSection("tools");
    setShowToolsModal(true);
    clearToolStatus();
    void refreshToolOptions({ showLoading: true });
  }, [clearToolStatus, refreshToolOptions]);

  const closeToolsModal = useCallback(() => {
    setShowToolsModal(false);
    setToolLoading(false);
    setToolSaving(false);
    clearToolStatus();
  }, [clearToolStatus]);

  const handleSelectMemoryFile = useCallback((fileId: string) => {
    setSelectedMemoryFileId(fileId);
    const nextFile = memoryFiles.find((file) => file.id === fileId);
    setMemoryDraftContent(nextFile?.content || "");
  }, [memoryFiles]);

  const handleSaveMemoryFile = useCallback(async () => {
    if (!activeMemoryFile || !currentMemoryAgentId) {
      setMemoryError("请先选择一个记忆文件");
      return;
    }

    clearMemoryStatus();
    setMemorySaving(true);

    try {
      await saveWorkspaceMemoryFile({
        sourcePath: activeMemoryFile.sourcePath,
        content: memoryDraftContent,
        agentId: currentMemoryAgentId,
      });
      setMemoryNotice(`记忆文件已保存：${activeMemoryFile.displayName}`);
      await refreshMemoryFiles({ preferredId: activeMemoryFile.id });
    } catch (memorySaveError) {
      setMemoryError(memorySaveError instanceof Error ? memorySaveError.message : "保存记忆文件失败");
    } finally {
      setMemorySaving(false);
    }
  }, [activeMemoryFile, clearMemoryStatus, currentMemoryAgentId, memoryDraftContent, refreshMemoryFiles]);

  const handleToggleSkill = useCallback((skillId: string) => {
    setSkillDraftIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId],
    );
  }, []);

  const handleToggleTool = useCallback((toolId: string) => {
    setToolDraftIds((current) =>
      current.includes(toolId)
        ? current.filter((item) => item !== toolId)
        : [...current, toolId],
    );
  }, []);

  const handleSaveSkills = useCallback(async () => {
    if (!currentMemoryAgentId) {
      setSkillError("当前未选中 Agent");
      return;
    }

    clearSkillStatus();
    setSkillSaving(true);

    try {
      const result = await invoke<WorkspaceAgentSkillSaveResult>("save_agent_skill_config", {
        agentId: currentMemoryAgentId,
        skillNames: normalizeWorkspaceStringList(skillDraftIds),
      });
      setSkillNotice(
        result.appliesOnNextMessage
          ? "技能配置已保存，下一条消息会按新配置生效。"
          : "技能配置已保存。",
      );
      await refreshSkillOptions();
    } catch (saveError) {
      setSkillError(saveError instanceof Error ? saveError.message : "保存技能配置失败");
    } finally {
      setSkillSaving(false);
    }
  }, [clearSkillStatus, currentMemoryAgentId, refreshSkillOptions, skillDraftIds]);

  const handleSaveTools = useCallback(async () => {
    if (!currentMemoryAgentId) {
      setToolError("当前未选中 Agent");
      return;
    }

    clearToolStatus();
    setToolSaving(true);

    try {
      await invoke<WorkspaceAgentToolConfig>("save_agent_tool_config", {
        agentId: currentMemoryAgentId,
        selectedToolNames: normalizeWorkspaceStringList(toolDraftIds),
      });
      setToolNotice("工具权限已保存，下一条消息会按新权限执行。");
      await refreshToolOptions();
    } catch (saveError) {
      setToolError(saveError instanceof Error ? saveError.message : "保存工具权限失败");
    } finally {
      setToolSaving(false);
    }
  }, [clearToolStatus, currentMemoryAgentId, refreshToolOptions, toolDraftIds]);

  useEffect(() => {
    if (!currentMemoryAgentId) {
      return;
    }
    void refreshMemoryFiles({ preferredId: selectedMemoryFileId || undefined });
  }, [currentMemoryAgentId, refreshMemoryFiles, selectedMemoryFileId]);

  useEffect(() => {
    setSkillSearch("");
    setSkillCategory("builtIn");
    setToolCategory("all");
    clearSkillStatus();
    clearToolStatus();
  }, [clearSkillStatus, clearToolStatus, currentMemoryAgentId]);

  useEffect(() => {
    if (!currentMemoryAgentId) {
      return;
    }
    void refreshSkillOptions();
  }, [currentMemoryAgentId, refreshSkillOptions]);

  useEffect(() => {
    if (!currentMemoryAgentId) {
      return;
    }
    void refreshToolOptions();
  }, [currentMemoryAgentId, refreshToolOptions]);

  const uptimeLabel = running ? formatUptime(uptime) : "未启动";
  const derivedLogs = useMemo(() => buildWorkspaceLogs(logs), [logs]);
  const memoryResourceItems = useMemo(() => buildWorkspaceMemoryResourceItems(memoryFiles), [memoryFiles]);
  const skillResourceItems = useMemo(
    () =>
      buildSkillSummaryItems(
        skillOptions.map((item) => ({
          ...item,
          selected: skillDraftIds.includes(item.id),
        })),
      ),
    [skillDraftIds, skillOptions],
  );
  const toolResourceItems = useMemo(
    () =>
      buildToolSummaryItems(
        toolOptions.map((item) => ({
          ...item,
          selected: toolDraftIds.includes(item.id),
        })),
      ),
    [toolDraftIds, toolOptions],
  );
  const openModelConfigModal = () => setIsModelConfigOpen(true);

  const toggleUtilityPanel = (panel: Exclude<WorkspaceUtilityPanel, null>) => {
    setUtilityPanel((current) => current === panel ? null : panel);
  };

  const openSessionPanel = (section: WorkspaceSessionSectionKey = activeSessionSection) => {
    setActiveSessionSection(section);
    setUtilityPanel("session");
  };

  const handleOpenRelatedResource = (resource: WorkspaceRelatedResource) => {
    if (!resource) return;
    if (resource === "memory") {
      openMemoryModal();
      return;
    }
    if (resource === "skills") {
      openSkillsModal();
      return;
    }
    if (resource === "tools") {
      openToolsModal();
      return;
    }
    setActiveSessionSection(resource);
    setRelatedResource(resource);
  };

  const renderCompactWorkspace = () => {
    const section = COMPACT_COPY[activeMenu as Exclude<WorkspaceMenuKey, "chat" | "employees">];
    const menuLabel = WORKSPACE_MENU_ITEMS.find((item) => item.key === activeMenu)?.label || "";

    return (
      <div className="workspace-clone__compact-panel">
        <div className="workspace-clone__compact-hero">
          <div className="workspace-clone__compact-badge">{menuLabel}</div>
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        </div>
        <div className="workspace-clone__compact-grid">
          {section.bullets.map((bullet) => (
            <div key={bullet} className="workspace-clone__compact-card">
              <div className="workspace-clone__compact-card-icon">{menuLabel.slice(0, 1)}</div>
              <div>
                <strong>{menuLabel}</strong>
                <small>{bullet}</small>
              </div>
            </div>
          ))}
          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">模</div>
            <div>
              <strong>当前模型</strong>
              <small>{workspaceModelName}</small>
            </div>
          </div>
          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">运</div>
            <div>
              <strong>运行状态</strong>
              <small>{running ? `运行中 · ${uptimeLabel}` : "服务尚未启动，当前仅保留骨架页面。"}</small>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.section
      key="workspace-clone-home"
      className="workspace-clone-shell"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <main
        className={[
          "workspace-clone",
          isSidebarCollapsed ? "workspace-clone--sidebar-collapsed" : "",
          isDirectoryCollapsed ? "workspace-clone--directory-collapsed" : "",
        ].join(" ").trim()}
      >
        <WorkspaceCloneSidebar
          menuItems={WORKSPACE_MENU_ITEMS}
          activeMenu={activeMenu}
          isCollapsed={isSidebarCollapsed}
          adminOpen={adminOpen}
          adminPanel={adminPanel}
          onSelectMenu={(key) => {
            setActiveMenu(key);
            setAdminOpen(false);
            setAdminPanel(null);
          }}
          onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
          onToggleAdmin={() => {
            setAdminOpen((value) => !value);
            setAdminPanel(null);
          }}
          onSelectAdminPanel={(panel) => {
            setAdminOpen(true);
            setAdminPanel(panel);
          }}
        />

        {activeMenu === "chat" && (
          <WorkspaceCloneDirectory
            typeTabs={WORKSPACE_TYPE_TABS}
            activeType={activeType}
            entities={filteredEntities}
            selectedEntityId={selectedEntity?.id || ""}
            isCollapsed={isDirectoryCollapsed}
            searchQuery={searchQuery}
            contextMenu={workspaceChannels.contextMenu}
            channelBindingModal={workspaceChannels.modal}
            channelBindingAgents={workspaceChannels.agents}
            channelBindingAgentId={workspaceChannels.selectedAgentId}
            channelBindingModalLoading={workspaceChannels.modalLoading}
            channelBindingModalSaving={workspaceChannels.modalSaving}
            channelBindingNotice={workspaceChannels.modalNotice}
            channelBindingError={workspaceChannels.modalError}
            weixinQrStarting={workspaceChannels.weixinQrStarting}
            weixinQrPolling={workspaceChannels.weixinQrPolling}
            weixinQrUrl={workspaceChannels.weixinQrUrl}
            weixinQrImageUrl={workspaceChannels.weixinQrImageUrl}
            weixinQrDetail={workspaceChannels.weixinQrSnapshot?.detail?.trim() || ""}
            weixinQrLogs={workspaceChannels.weixinQrLogs}
            hasActiveWeixinQrSession={workspaceChannels.hasActiveWeixinQrSession}
            isCurrentWeixinChannelAlreadyBound={workspaceChannels.isCurrentWeixinChannelAlreadyBound}
            weixinQrStatusTone={workspaceChannels.weixinQrStatusTone}
            weixinQrStatusText={workspaceChannels.weixinQrStatusText}
            feishuQrRequesting={workspaceChannels.feishuQrRequesting}
            feishuQrChecking={workspaceChannels.feishuQrChecking}
            feishuQrVisible={workspaceChannels.feishuQrVisible}
            feishuQrTargetUrl={workspaceChannels.feishuQrTargetUrl}
            feishuQrUserCode={workspaceChannels.feishuQrUserCode}
            feishuQrExpiresAtMs={workspaceChannels.feishuQrExpiresAtMs}
            feishuAppId={workspaceChannels.feishuAppId}
            feishuAppSecret={workspaceChannels.feishuAppSecret}
            feishuAppSecretConfigured={workspaceChannels.feishuAppSecretConfigured}
            feishuAppSecretVisible={workspaceChannels.feishuAppSecretVisible}
            feishuDmPolicy={workspaceChannels.feishuDmPolicy}
            feishuManualExpanded={workspaceChannels.feishuManualExpanded}
            feishuAllowFromDraft={workspaceChannels.feishuAllowFromDraft}
            feishuAllowFromSessionIds={workspaceChannels.feishuAllowFromSessionIds}
            onToggleCollapsed={() => setIsDirectoryCollapsed((value) => !value)}
            onSelectType={setActiveType}
            onSelectEntity={(entityId) => {
              setSelectedEntityId(entityId);
              if (activeType === "agents") {
                homepageChat.selectAgent(entityId);
                return;
              }
              if (activeType === "channels") {
                const entity = filteredEntities.find((item) => item.id === entityId);
                if (entity?.runtimeAgentId) {
                  homepageChat.selectAgent(entity.runtimeAgentId);
                }
              }
            }}
            onSearchChange={setSearchQuery}
            onOpenContextMenu={(event, entity) => {
              event.stopPropagation();
              setContextMenu({
                kind: entity.entityType === "channels" ? "channel" : entity.entityType === "teams" ? "team" : "agent",
                entityId: entity.id,
                title: entity.name,
                x: event.clientX,
                y: event.clientY,
                configured: entity.status !== "offline",
              });
            }}
            onCloseContextMenu={() => setContextMenu(null)}
            onOpenChannelBindingModal={(entity) => {
              void workspaceChannels.openBindingModal(entity);
            }}
            onCloseChannelBindingModal={() => {
              void workspaceChannels.closeBindingModal();
            }}
            onSelectChannelBindingAgent={workspaceChannels.setSelectedAgentId}
            onStartWeixinQrBinding={() => {
              void workspaceChannels.startWeixinQrBindingFlow();
            }}
            onOpenExternalBindingLink={(url) => {
              void workspaceChannels.handleOpenExternalBindingLink(
                url,
                (workspaceChannels.modal.channelId as WorkspaceChannelId) || "weixin",
              );
            }}
            onRequestFeishuQr={() => {
              void workspaceChannels.handleRequestFeishuQr();
            }}
            onCheckFeishuQr={() => {
              void workspaceChannels.handleCheckFeishuQr();
            }}
            onChangeFeishuAppId={workspaceChannels.setFeishuAppId}
            onChangeFeishuAppSecret={workspaceChannels.setFeishuAppSecret}
            onChangeFeishuDmPolicy={workspaceChannels.setFeishuDmPolicy}
            onChangeFeishuAllowFromDraft={workspaceChannels.setFeishuAllowFromDraft}
            onAddFeishuAllowFromSessionId={workspaceChannels.addFeishuAllowFromSessionId}
            onRemoveFeishuAllowFromSessionId={workspaceChannels.removeFeishuAllowFromSessionId}
            onToggleFeishuManualExpanded={workspaceChannels.toggleFeishuManualExpanded}
            onToggleFeishuAppSecretVisible={workspaceChannels.toggleFeishuAppSecretVisible}
            onSaveChannelBinding={() => {
              void workspaceChannels.handleSaveBinding();
            }}
            onRemoveChannelBinding={(entityId) => {
              const target = entitiesByType.channels.find((item) => item.id === entityId);
              if (target) {
                void workspaceChannels.handleRemoveBinding(target);
              }
            }}
          />
        )}

        <section
          className={[
            "workspace-clone__workspace",
            activeMenu !== "chat" && activeMenu !== "employees" ? "is-compact" : "",
            activeMenu === "employees" ? "is-employees" : "",
          ].join(" ").trim()}
        >
          {activeMenu === "chat" ? (
            <>
              <div className="workspace-clone__top">
                <WorkspaceCloneHeader
                  selectedEntity={selectedEntity}
                  activeUtilityPanel={utilityPanel}
                  onToggleUtilityPanel={toggleUtilityPanel}
                  onOpenAgentInfo={() => setShowAgentInfo(true)}
                  onOpenSessionPanel={() => toggleUtilityPanel("session")}
                  onOpenWorkbench={() => toggleUtilityPanel("workbench")}
                  onOpenMemberManagement={() => {
                    openSessionPanel("channel");
                    setRelatedResource("channel");
                  }}
                />
              </div>

              <WorkspaceCloneChatView
                selectedEntity={selectedEntity}
                chatEnabled={chatEnabled}
                chatDisabledReason={chatDisabledReason}
                messages={chatEnabled ? homepageChat.messages : []}
                connectionStatus={homepageChat.status}
                connectionError={homepageChat.error}
                historyLoading={homepageChat.historyLoading}
                isGenerating={homepageChat.isGenerating}
                utilityPanel={utilityPanel}
                activeSessionSection={activeSessionSection}
                historyItems={chatEnabled ? homepageChat.historyItems : WORKSPACE_HISTORY}
                logs={derivedLogs}
                schedules={WORKSPACE_SCHEDULES}
                workbenchItems={WORKSPACE_WORKBENCH}
                memoryItems={memoryResourceItems}
                skillItems={skillResourceItems}
                commandItems={WORKSPACE_COMMAND_ITEMS}
                channelItems={workspaceChannels.channelResourceItems}
                toolItems={toolResourceItems}
                currentModelName={workspaceModelName}
                currentProviderName={workspaceProviderName}
                running={running}
                onCloseUtilityPanel={() => setUtilityPanel(null)}
                onSelectSessionSection={setActiveSessionSection}
                onOpenRelatedResource={handleOpenRelatedResource}
                onOpenSettingsTextPreview={() => setShowSettingsTextPreview(true)}
                onStart={handleStart}
                onOpenModelConfig={openModelConfigModal}
                onOpenLogs={() => toggleUtilityPanel("logs")}
              />

              <WorkspaceCloneComposer
                running={running}
                chatEnabled={chatEnabled}
                connectionStatus={homepageChat.status}
                selectedEntityName={selectedEntity?.name || null}
                currentModelName={workspaceModelName}
                sending={homepageChat.sending}
                isGenerating={homepageChat.isGenerating}
                resettingSession={homepageChat.resettingSession}
                onOpenSessionSection={openSessionPanel}
                onOpenMemoryModal={openMemoryModal}
                onOpenModelConfig={openModelConfigModal}
                onSend={homepageChat.sendMessage}
                onAbort={homepageChat.abortMessage}
                onResetSession={homepageChat.resetSession}
              />
            </>
          ) : activeMenu === "employees" ? <WorkspaceCloneEmployeesView /> : renderCompactWorkspace()}
        </section>

        <WorkspaceCloneOverlayStack
          selectedEntity={selectedEntity}
          showAgentInfo={showAgentInfo}
          showMemoryModal={showMemoryModal}
          showSkillsModal={showSkillsModal}
          showToolsModal={showToolsModal}
          showRuntimeLogDetail={showRuntimeLogDetail}
          showSettingsTextPreview={showSettingsTextPreview}
          relatedResource={relatedResource}
          memoryFiles={memoryFiles}
          selectedMemoryFileId={selectedMemoryFileId}
          memoryDraftContent={memoryDraftContent}
          memoryLoading={memoryLoading}
          memorySaving={memorySaving}
          memoryNotice={memoryNotice}
          memoryError={memoryError}
          skillSearch={skillSearch}
          skillCategory={skillCategory}
          skillOptions={skillOptions.map((item) => ({
            ...item,
            selected: skillDraftIds.includes(item.id),
          }))}
          skillLoading={skillLoading}
          skillSaving={skillSaving}
          skillNotice={skillNotice}
          skillError={skillError}
          toolCategory={toolCategory}
          toolProfileLabel={toolProfileLabel}
          toolOptions={toolOptions.map((item) => ({
            ...item,
            selected: toolDraftIds.includes(item.id),
          }))}
          toolLoading={toolLoading}
          toolSaving={toolSaving}
          toolNotice={toolNotice}
          toolError={toolError}
          memoryItems={memoryResourceItems}
          commandItems={WORKSPACE_COMMAND_ITEMS}
          channelItems={workspaceChannels.channelResourceItems}
          scheduleItems={WORKSPACE_SCHEDULES.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            tag: item.enabled ? "已启用" : "未启用",
          }))}
          onCloseAgentInfo={() => setShowAgentInfo(false)}
          onCloseMemoryModal={closeMemoryModal}
          onRefreshMemoryModal={() => {
            clearMemoryStatus();
            void refreshMemoryFiles({
              showLoading: true,
              preferredId: selectedMemoryFileId || undefined,
            });
          }}
          onSelectMemoryFile={handleSelectMemoryFile}
          onUpdateMemoryDraftContent={setMemoryDraftContent}
          onSaveMemoryFile={() => {
            void handleSaveMemoryFile();
          }}
          onCloseSkillsModal={closeSkillsModal}
          onRefreshSkillsModal={() => {
            clearSkillStatus();
            void refreshSkillOptions({ showLoading: true });
          }}
          onUpdateSkillSearch={setSkillSearch}
          onChangeSkillCategory={setSkillCategory}
          onToggleSkill={handleToggleSkill}
          onSelectAllSkills={() => setSkillDraftIds(skillOptions.map((item) => item.id))}
          onClearSkills={() => setSkillDraftIds([])}
          onSaveSkills={() => {
            void handleSaveSkills();
          }}
          onCloseToolsModal={closeToolsModal}
          onRefreshToolsModal={() => {
            clearToolStatus();
            void refreshToolOptions({ showLoading: true });
          }}
          onChangeToolCategory={setToolCategory}
          onToggleTool={handleToggleTool}
          onSelectAllTools={() => setToolDraftIds(toolOptions.map((item) => item.id))}
          onClearTools={() => setToolDraftIds([])}
          onSaveTools={() => {
            void handleSaveTools();
          }}
          onCloseRuntimeLogDetail={() => setShowRuntimeLogDetail(false)}
          onCloseSettingsTextPreview={() => setShowSettingsTextPreview(false)}
          onCloseRelatedResource={() => setRelatedResource(null)}
        />

        <WorkspaceCloneModelConfigModal
          show={isModelConfigOpen}
          savedProviders={savedProviders}
          currentConfig={currentConfig}
          providers={providers}
          onClose={() => setIsModelConfigOpen(false)}
          onRefreshSavedProviders={refreshSavedProviders}
          onRefreshCurrentConfig={refreshCurrentConfig}
          onSetModel={handleSetModel}
          onUpsertSavedProviderConfig={handleUpsertSavedProviderConfig}
          onDeleteSavedProviderConfig={handleDeleteSavedProviderConfig}
        />
      </main>
    </motion.section>
  );
}
