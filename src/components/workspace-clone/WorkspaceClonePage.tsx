// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  BookOpen,
  Bot,
  CalendarClock,
  Cpu,
  LayoutDashboard,
  MessageCircle,
  Radio,
  Search,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import logo from "../../assets/dragonclaw-logo.png";
import type { LogEntry, WorkspaceEntityType, WorkspaceMenuKey } from "../../types";
import { formatUptime } from "../../utils/log-humanizer";

export interface WorkspaceClonePageProps {
  running: boolean;
  loading: boolean;
  servicePort: number;
  uptime: number;
  currentModelName: string;
  currentProviderName: string;
  workspacePath: string;
  logs: LogEntry[];
  handleStart: () => void;
  handleStop: () => void;
  setShowKeyModal: (value: boolean) => void;
  setShowModelSwitchModal: (value: boolean) => void;
}

interface WorkspaceCloneEntity {
  id: string;
  name: string;
  subtitle: string;
  tone?: "online" | "busy" | "offline";
  avatarLabel?: string;
  accent?: string;
}

const MENU_ITEMS: Array<{
  key: WorkspaceMenuKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "chat", label: "聊天", icon: MessageCircle },
  { key: "schedule", label: "定时任务", icon: CalendarClock },
  { key: "knowledge", label: "知识库管理", icon: BookOpen },
  { key: "employees", label: "数字员工", icon: Users },
  { key: "skills", label: "技能市场", icon: Sparkles },
  { key: "tasks", label: "产品落地", icon: LayoutDashboard },
];

const TYPE_TABS: Array<{ key: WorkspaceEntityType; label: string; icon: LucideIcon }> = [
  { key: "agents", label: "数字员工", icon: Users },
  { key: "channels", label: "频道", icon: Radio },
  { key: "teams", label: "团队", icon: Bot },
];

const CHANNEL_ENTITIES: WorkspaceCloneEntity[] = [
  { id: "wechat", name: "微信", subtitle: "消息触达与机器人接入", tone: "online", avatarLabel: "微", accent: "wechat" },
  { id: "feishu", name: "飞书", subtitle: "企业通知与工作流编排", tone: "busy", avatarLabel: "飞", accent: "feishu" },
  { id: "discord", name: "Discord", subtitle: "Guild / Channel 协作占位", tone: "offline", avatarLabel: "D", accent: "discord" },
  { id: "telegram", name: "Telegram", subtitle: "Bot API 多账号接入占位", tone: "offline", avatarLabel: "T", accent: "telegram" },
];

const SECTION_COPY: Record<Exclude<WorkspaceMenuKey, "chat">, { title: string; description: string; bullets: string[] }> = {
  schedule: {
    title: "定时任务工作区骨架",
    description: "保留 DragonClaw 定时任务栏目名称、层级和工作区视觉节奏，本阶段只提供纯骨架占位，不接任务创建与调度逻辑。",
    bullets: [
      "后续迁移任务列表、启停状态和调度面板。",
      "当前保留工作区标题、说明卡片与状态占位。",
    ],
  },
  knowledge: {
    title: "知识库管理工作区骨架",
    description: "这里先完整保留知识类工作区的分区结构，预留后续资料树、上传区和知识面板的接线空间。",
    bullets: [
      "占位卡片模拟知识源、文档集和索引状态。",
      "本次不接任何真实文档或后端命令。",
    ],
  },
  employees: {
    title: "数字员工工作区骨架",
    description: "先把 DragonClaw 的数字员工首页壳保留下来，后续再逐步把 DragonClaw2 的 Agent 管理能力映射进来。",
    bullets: [
      "当前只展示静态员工视图说明。",
      "后续再逐项对接已有 agents 能力。",
    ],
  },
  skills: {
    title: "技能市场工作区骨架",
    description: "保留技能市场的栏目名、工作区层级和卡片节奏，但暂不接入安装、管理或检索行为。",
    bullets: [
      "为后续迁移技能列表、筛选和安装入口预留位置。",
      "当前仅展示静态推荐卡片与占位文案。",
    ],
  },
  tasks: {
    title: "产品落地工作区骨架",
    description: "保留产品落地栏目的主体结构，为后续承接多阶段项目编排和落地流程预留骨架。",
    bullets: [
      "当前不提供真实任务流。",
      "后续按 DragonClaw 功能逐项接入。",
    ],
  },
};

function getMenuIcon(key: WorkspaceMenuKey) {
  return MENU_ITEMS.find((item) => item.key === key)?.icon ?? MessageCircle;
}

export function WorkspaceClonePage({
  running,
  loading,
  servicePort,
  uptime,
  currentModelName,
  currentProviderName,
  workspacePath,
  logs,
  handleStart,
  handleStop,
  setShowKeyModal,
  setShowModelSwitchModal,
}: WorkspaceClonePageProps) {
  const [activeMenu, setActiveMenu] = useState<WorkspaceMenuKey>("chat");
  const [activeType, setActiveType] = useState<WorkspaceEntityType>("agents");
  const [selectedEntityId, setSelectedEntityId] = useState("main");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDirectoryCollapsed, setIsDirectoryCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const agentEntities = useMemo<WorkspaceCloneEntity[]>(
    () => [
      {
        id: "main",
        name: "主 Agent",
        subtitle: `${currentModelName} · ${currentProviderName}`,
        tone: running ? "busy" : "offline",
        avatarLabel: "主",
        accent: "main",
      },
      {
        id: "ops",
        name: "运营协作 Agent",
        subtitle: "承接日常任务流与运营动作的占位卡",
        tone: "online",
        avatarLabel: "运",
        accent: "ops",
      },
      {
        id: "channel",
        name: "渠道接待 Agent",
        subtitle: "预留后续频道侧消息接待能力",
        tone: "offline",
        avatarLabel: "渠",
        accent: "channel",
      },
    ],
    [currentModelName, currentProviderName, running],
  );

  const currentEntities = useMemo<Record<WorkspaceEntityType, WorkspaceCloneEntity[]>>(
    () => ({
      agents: agentEntities,
      channels: CHANNEL_ENTITIES,
      teams: [],
    }),
    [agentEntities],
  );

  useEffect(() => {
    const nextDefaultId = currentEntities[activeType][0]?.id ?? "";
    if (!currentEntities[activeType].some((item) => item.id === selectedEntityId)) {
      setSelectedEntityId(nextDefaultId);
    }
  }, [activeType, currentEntities, selectedEntityId]);

  const filteredEntities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = currentEntities[activeType];
    if (!query) return list;
    return list.filter((item) => `${item.name} ${item.subtitle}`.toLowerCase().includes(query));
  }, [activeType, currentEntities, searchQuery]);

  const selectedEntity = useMemo(
    () => currentEntities[activeType].find((item) => item.id === selectedEntityId) ?? filteredEntities[0] ?? null,
    [activeType, currentEntities, filteredEntities, selectedEntityId],
  );

  const showDirectory = activeMenu === "chat";
  const latestLog = logs[logs.length - 1];
  const latestLogText = latestLog?.humanized || latestLog?.message || "当前还没有可展示的运行日志。";
  const uptimeLabel = running ? formatUptime(uptime) : "未启动";
  const activeMenuLabel = MENU_ITEMS.find((item) => item.key === activeMenu)?.label ?? "聊天";
  const ActiveMenuIcon = getMenuIcon(activeMenu);

  const handleOpenConsole = () => {
    invoke("open_url", { url: `http://localhost:${servicePort}?token=dragonclaw-local` });
  };

  const renderChatWorkspace = () => (
    <>
      <div className="workspace-clone__top">
        {selectedEntity && (
          <header className="workspace-clone__header">
            <div className="workspace-clone__header-entity">
              <span className="workspace-clone__avatar">
                {selectedEntity.avatarLabel || selectedEntity.name.slice(0, 1)}
              </span>
              <div>
                <h2>{selectedEntity.name}</h2>
                <p>{selectedEntity.subtitle}</p>
              </div>
            </div>

            <div className="workspace-clone__header-actions">
              <button className="workspace-clone__ghost-btn" type="button" onClick={() => setShowModelSwitchModal(true)}>
                <Cpu size={14} strokeWidth={1.9} />
                模型
              </button>
              <button className="workspace-clone__ghost-btn" type="button" onClick={() => setShowKeyModal(true)}>
                <Wrench size={14} strokeWidth={1.9} />
                Provider
              </button>
            </div>
          </header>
        )}
      </div>

      <div className="workspace-clone__body workspace-clone__body--chat">
        <div className="workspace-clone__welcome">
          <div className="workspace-clone__welcome-logo">
            <img src={logo} alt="DragonClaw" />
          </div>
          <h1>DragonClaw 工作台首页</h1>
          <p>
            这里完整保留了 DragonClaw 主控制界面的栏目框架。当前版本先接入最小可用动作，
            后续会把 legacy 页面里的功能逐项迁移到这个新的工作台首页。
          </p>

          <div className="workspace-clone__welcome-tags">
            <span>聊天</span>
            <span>频道</span>
            <span>团队</span>
            <span>工作台首页</span>
          </div>

          <div className="workspace-clone__hero-cards">
            <button
              className={`workspace-clone__hero-card ${running ? "is-danger" : "is-primary"}`}
              type="button"
              onClick={running ? handleStop : handleStart}
              disabled={loading}
            >
              <div className="workspace-clone__hero-icon">
                <ActiveMenuIcon size={16} strokeWidth={1.9} />
              </div>
              <div>
                <strong>{running ? "停止本地服务" : "启动本地服务"}</strong>
                <small>
                  {loading
                    ? "正在处理当前服务状态..."
                    : running
                      ? "保持现有服务逻辑不变，仅从新首页触发停止动作。"
                      : "从新的工作台首页直接启动服务。"}
                </small>
              </div>
            </button>

            <button
              className="workspace-clone__hero-card"
              type="button"
              onClick={handleOpenConsole}
              disabled={!running}
            >
              <div className="workspace-clone__hero-icon">
                <Radio size={16} strokeWidth={1.9} />
              </div>
              <div>
                <strong>打开本地控制台</strong>
                <small>
                  {running
                    ? `当前服务运行在 localhost:${servicePort}`
                    : "服务未启动时该入口保持禁用。"}
                </small>
              </div>
            </button>

            <button className="workspace-clone__hero-card" type="button" onClick={() => setShowModelSwitchModal(true)}>
              <div className="workspace-clone__hero-icon">
                <Cpu size={16} strokeWidth={1.9} />
              </div>
              <div>
                <strong>切换模型</strong>
                <small>{currentModelName}</small>
              </div>
            </button>

            <button className="workspace-clone__hero-card" type="button" onClick={() => setShowKeyModal(true)}>
              <div className="workspace-clone__hero-icon">
                <Sparkles size={16} strokeWidth={1.9} />
              </div>
              <div>
                <strong>配置 Provider</strong>
                <small>{currentProviderName}</small>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="workspace-clone__composer">
        <div className="workspace-clone__composer-toolbar">
          <button type="button">+ 附件</button>
          <button type="button">/ 指令</button>
          <button type="button">技能</button>
          <span className="workspace-clone__composer-status">
            {running ? `运行中 · ${uptimeLabel}` : "服务未启动"}
          </span>
        </div>

        <div className="workspace-clone__composer-shell">
          <textarea
            readOnly
            value="这里是 DragonClaw 聊天输入区的骨架占位。后续会把真实消息发送、技能交互和频道接入能力逐步迁移到这个新首页。"
          />
          <button type="button" className="workspace-clone__composer-send">发送</button>
        </div>
      </div>
    </>
  );

  const renderCompactWorkspace = () => {
    const section = SECTION_COPY[activeMenu as Exclude<WorkspaceMenuKey, "chat">];

    return (
      <div className="workspace-clone__compact-panel">
        <div className="workspace-clone__compact-hero">
          <div className="workspace-clone__compact-badge">{activeMenuLabel}</div>
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        </div>

        <div className="workspace-clone__compact-grid">
          {section.bullets.map((bullet, index) => (
            <div key={`${activeMenu}-${index}`} className="workspace-clone__compact-card">
              <div className="workspace-clone__compact-card-icon">
                <ActiveMenuIcon size={15} strokeWidth={1.9} />
              </div>
              <div>
                <strong>{activeMenuLabel}</strong>
                <small>{bullet}</small>
              </div>
            </div>
          ))}

          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">
              <Cpu size={15} strokeWidth={1.9} />
            </div>
            <div>
              <strong>工作台状态</strong>
              <small>{running ? `运行中 · ${currentModelName}` : "服务未启动，当前仅保留静态骨架。"}</small>
            </div>
          </div>

          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">
              <Wrench size={15} strokeWidth={1.9} />
            </div>
            <div>
              <strong>最近日志摘要</strong>
              <small>{latestLogText}</small>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.main
      key="workspace-clone-home"
      className={[
        "workspace-clone",
        isSidebarCollapsed ? "workspace-clone--sidebar-collapsed" : "",
        isDirectoryCollapsed ? "workspace-clone--directory-collapsed" : "",
      ].join(" ").trim()}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <aside className={`workspace-clone__sidebar ${isSidebarCollapsed ? "is-collapsed" : ""}`}>
        <div className={`workspace-clone__sidebar-topbar ${isSidebarCollapsed ? "is-collapsed" : ""}`}>
          <button
            className="workspace-clone__toggle-btn"
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          >
            <LayoutDashboard size={16} strokeWidth={1.9} />
          </button>
        </div>

        <div className="workspace-clone__sidebar-menu">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`workspace-clone__menu-item ${activeMenu === item.key ? "is-active" : ""} ${isSidebarCollapsed ? "is-collapsed" : ""}`}
                type="button"
                onClick={() => setActiveMenu(item.key)}
                title={item.label}
              >
                <Icon size={17} strokeWidth={1.9} />
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>

        <div className="workspace-clone__sidebar-fill">
          <button className={`workspace-clone__brand-watermark ${isSidebarCollapsed ? "is-collapsed" : ""}`} type="button">
            <span className="workspace-clone__brand-logo">
              <img src={logo} alt="DragonClaw" />
              {!isSidebarCollapsed && <span className="workspace-clone__brand-badge">Beta</span>}
            </span>
            {!isSidebarCollapsed && (
              <span className="workspace-clone__brand-meta">
                <strong>DragonClaw</strong>
              </span>
            )}
          </button>
        </div>

        <button className={`workspace-clone__profile-switch workspace-clone__feedback-btn ${isSidebarCollapsed ? "is-collapsed" : ""}`} type="button">
          <span className="workspace-clone__avatar-wrap">反</span>
          {!isSidebarCollapsed && <span>反馈</span>}
        </button>

        <button className={`workspace-clone__profile-switch ${isSidebarCollapsed ? "is-collapsed" : ""}`} type="button">
          <span className="workspace-clone__avatar-wrap">管</span>
          {!isSidebarCollapsed && <span>管理台</span>}
        </button>
      </aside>

      {showDirectory && (
        <aside className={`workspace-clone__directory ${isDirectoryCollapsed ? "is-collapsed" : ""}`}>
          {isDirectoryCollapsed ? (
            <>
              <div className="workspace-clone__directory-mini-head">
                <button className="workspace-clone__mini-create" type="button" title="快捷新建">+</button>
              </div>

              <div className="workspace-clone__mini-tabs">
                {TYPE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      className={`workspace-clone__mini-tab ${activeType === tab.key ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setActiveType(tab.key)}
                      title={tab.label}
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </button>
                  );
                })}
              </div>

              <div className="workspace-clone__mini-entities">
                {filteredEntities.length > 0 ? (
                  filteredEntities.map((entity) => (
                    <button
                      key={entity.id}
                      className={`workspace-clone__mini-entity ${selectedEntity?.id === entity.id ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedEntityId(entity.id)}
                      title={entity.name}
                    >
                      <span>{entity.avatarLabel || entity.name.slice(0, 1)}</span>
                    </button>
                  ))
                ) : (
                  <div className="workspace-clone__mini-empty">-</div>
                )}
              </div>
            </>
          ) : (
            <>
              <header className="workspace-clone__directory-head">
                <label className="workspace-clone__search-box">
                  <Search size={14} strokeWidth={1.9} />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={
                      activeType === "channels"
                        ? "搜索频道"
                        : activeType === "teams"
                          ? "搜索团队"
                          : "搜索数字员工"
                    }
                  />
                </label>
                <button className="workspace-clone__icon-btn" type="button" title="快捷新建">+</button>
              </header>

              <div className="workspace-clone__type-tabs">
                {TYPE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`workspace-clone__type-tab ${activeType === tab.key ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setActiveType(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <section className="workspace-clone__entity-list">
                {filteredEntities.length > 0 ? (
                  filteredEntities.map((entity) => (
                    <button
                      key={entity.id}
                      className={`workspace-clone__entity-item ${selectedEntity?.id === entity.id ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedEntityId(entity.id)}
                    >
                      <span className={`workspace-clone__entity-avatar ${entity.accent ? `is-${entity.accent}` : ""}`}>
                        {entity.avatarLabel || entity.name.slice(0, 1)}
                      </span>
                      <span className="workspace-clone__entity-text">
                        <strong>{entity.name}</strong>
                        <small>{entity.subtitle}</small>
                      </span>
                      {entity.tone && <i className={`workspace-clone__entity-status is-${entity.tone}`} />}
                    </button>
                  ))
                ) : (
                  <div className="workspace-clone__entity-empty">
                    <div className="workspace-clone__empty-card">
                      <strong>{activeType === "teams" ? "暂无团队" : activeType === "channels" ? "暂无频道结果" : "暂无数字员工结果"}</strong>
                      <small>
                        {activeType === "teams"
                          ? "团队栏位先保留骨架，后续再迁移真实团队能力。"
                          : activeType === "channels"
                            ? "频道列表当前使用静态 mock，占位真实渠道接入。"
                            : "当前目录只保留首页骨架与占位实体。"}
                      </small>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          <button
            className="workspace-clone__directory-edge-btn"
            type="button"
            onClick={() => setIsDirectoryCollapsed((value) => !value)}
            title={isDirectoryCollapsed ? "展开目录栏" : "收起目录栏"}
          >
            {isDirectoryCollapsed ? ">" : "<"}
          </button>
        </aside>
      )}

      <section className={`workspace-clone__workspace ${!showDirectory ? "is-compact" : ""}`}>
        {activeMenu === "chat" ? renderChatWorkspace() : renderCompactWorkspace()}
      </section>

      <div className="workspace-clone__status-rail">
        <div className="workspace-clone__status-chip">
          <span className={`workspace-clone__status-dot ${running ? "is-running" : "is-idle"}`} />
          <span>{running ? `运行中 · ${uptimeLabel}` : "未启动"}</span>
        </div>
        <div className="workspace-clone__status-chip">
          <span>{workspacePath || "~/Documents/OpenClaw-Projects"}</span>
        </div>
      </div>
    </motion.main>
  );
}
