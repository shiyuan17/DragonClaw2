import { useEffect, useRef, useState } from "react";

import {
  formatWorkspaceCronTimestamp,
  getWorkspaceCronDisplayStatus,
  getWorkspaceCronEditDisabledReason,
  getWorkspaceCronStatusTone,
} from "./workspaceCloneCron";
import {
  filterWorkspaceRuntimeLogs,
  getWorkspaceRuntimeLogCategoryLabel,
  getWorkspaceRuntimeLogRawTypeLabel,
  WORKSPACE_RUNTIME_LOG_FILTERS,
} from "./workspaceCloneLogs";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { formatWorkspaceTaskScheduleLine } from "./workspaceCloneTaskScheduleDisplay";
import { resolveWorkspaceTaskScheduleView } from "./workspaceCloneTaskSchedule";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceEntity,
  WorkspaceHistoryFilter,
  WorkspaceHistoryItem,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceRuntimeLogCategoryFilter,
  WorkspaceRuntimeLogItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";

interface WorkspaceCloneUtilityDrawerProps {
  panel: WorkspaceUtilityPanel;
  selectedEntity: WorkspaceEntity | null;
  activeSessionSection: WorkspaceSessionSectionKey;
  historyItems: WorkspaceHistoryItem[];
  logs: WorkspaceRuntimeLogItem[];
  selectedRuntimeLogId: string | null;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  taskLoading: boolean;
  taskRunsLoading: boolean;
  taskRunsLoadingId: string | null;
  taskActionJobId: string | null;
  optimisticRunningTaskIds: string[];
  gatewayConnected: boolean;
  workbenchItems: WorkspaceWorkbenchItem[];
  memoryItems: WorkspaceResourceItem[];
  skillItems: WorkspaceResourceItem[];
  commandItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  toolItems: WorkspaceToolItem[];
  currentModelName: string;
  currentProviderName: string;
  historyFilter: WorkspaceHistoryFilter;
  onClose: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistoryFilter: (filter: WorkspaceHistoryFilter) => void;
  onSelectHistorySession: (sessionKey: string) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenModelConfig: () => void;
  onOpenRuntimeLogDetail: (logId: string) => void;
  onRefreshTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskEnabled: (task: WorkspaceCronJob) => void;
  onEditTask: (task: WorkspaceCronJob) => void;
  onRunTask: (task: WorkspaceCronJob) => void;
  onDeleteTask: (task: WorkspaceCronJob) => void;
}

const PANEL_TITLES: Record<Exclude<WorkspaceUtilityPanel, null>, string> = {
  history: "历史会话",
  logs: "运行日志",
  session: "会话菜单",
  schedule: "任务",
  workbench: "工作台",
};

const SECTION_TITLES: Record<WorkspaceSessionSectionKey, string> = {
  model: "模型",
  memory: "记忆",
  skills: "技能库",
  commands: "命令",
  tools: "工具权限",
  channel: "频道",
  schedule: "任务",
};

const HISTORY_FILTERS: Array<{ key: WorkspaceHistoryFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
];

const TASK_FILTERS = [
  { key: "enabled", label: "启用中" },
  { key: "disabled", label: "已停用" },
] as const;

type TaskFilterKey = typeof TASK_FILTERS[number]["key"];

function buildCalendarKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function WorkspaceCloneUtilityDrawer({
  panel,
  selectedEntity,
  activeSessionSection,
  historyItems,
  logs,
  selectedRuntimeLogId,
  tasks,
  selectedTaskId,
  taskLoading,
  taskActionJobId,
  optimisticRunningTaskIds,
  gatewayConnected,
  workbenchItems,
  memoryItems,
  skillItems,
  commandItems,
  channelItems,
  toolItems,
  currentModelName,
  currentProviderName,
  historyFilter,
  onClose,
  onSelectSessionSection,
  onSelectHistoryFilter,
  onSelectHistorySession,
  onOpenRelatedResource,
  onOpenModelConfig,
  onOpenRuntimeLogDetail,
  onRefreshTasks,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
}: WorkspaceCloneUtilityDrawerProps) {
  const [taskFilter, setTaskFilter] = useState<TaskFilterKey>("enabled");
  const [logFilter, setLogFilter] = useState<WorkspaceRuntimeLogCategoryFilter>("all");
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const taskFilterInitKeyRef = useRef<string | null>(null);
  const enabledTaskCount = tasks.filter((task) => task.enabled).length;
  const taskFilterInitKey = `${selectedEntity?.id ?? "none"}:${panel ?? "none"}`;

  useEffect(() => {
    if (panel !== "schedule") {
      taskFilterInitKeyRef.current = null;
      return;
    }

    if (taskFilterInitKeyRef.current === taskFilterInitKey) {
      return;
    }

    taskFilterInitKeyRef.current = taskFilterInitKey;
    setTaskFilter(enabledTaskCount > 0 ? "enabled" : "disabled");
  }, [enabledTaskCount, panel, taskFilterInitKey]);

  useEffect(() => {
    if (!openTaskMenuId) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      if (!taskMenuRef.current?.contains(event.target as Node)) {
        setOpenTaskMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openTaskMenuId]);

  useEffect(() => {
    if (panel !== "schedule" || !openTaskMenuId) {
      return;
    }

    if (!tasks.some((task) => task.id === openTaskMenuId)) {
      setOpenTaskMenuId(null);
    }
  }, [openTaskMenuId, panel, tasks]);

  useEffect(() => {
    setOpenTaskMenuId(null);
  }, [taskFilter]);

  useEffect(() => {
    if (panel !== "logs") {
      setLogFilter("all");
    }
  }, [panel]);

  if (!panel) {
    return null;
  }

  const enabledSkillCount = skillItems.filter((item) => item.tag === "已启用").length;
  const enabledToolCount = toolItems.filter((item) => item.enabled).length;
  const now = new Date();
  const todayKey = buildCalendarKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayKey = buildCalendarKey(yesterdayDate);
  const filteredHistoryItems = historyItems.filter((item) => {
    if (historyFilter === "all") {
      return true;
    }

    if (!item.updatedAt) {
      return false;
    }

    const itemKey = buildCalendarKey(new Date(item.updatedAt));
    return historyFilter === "today" ? itemKey === todayKey : itemKey === yesterdayKey;
  });

  const sessionCards: Array<{
    key: WorkspaceSessionSectionKey;
    icon: Parameters<typeof WorkspaceCloneIcon>[0]["name"];
    summary: string;
  }> = [
    { key: "model", icon: "sparkles", summary: `${currentProviderName || "未配置"} / ${currentModelName || "未选择"}` },
    { key: "memory", icon: "book-open", summary: `${memoryItems.length} 条记忆摘要` },
    { key: "skills", icon: "cpu", summary: `${enabledSkillCount}/${skillItems.length} 项已启用` },
    { key: "commands", icon: "wand", summary: `${commandItems.length} 个常用命令` },
    { key: "tools", icon: "settings", summary: `${enabledToolCount}/${toolItems.length} 项已启用` },
    { key: "channel", icon: "message-circle", summary: `${channelItems.length} 个绑定入口` },
    { key: "schedule", icon: "calendar-clock", summary: `${enabledTaskCount}/${tasks.length} 个启用任务` },
  ];

  const visibleTasks = taskFilter === "enabled"
    ? tasks.filter((task) => task.enabled)
    : tasks.filter((task) => !task.enabled);
  const filteredLogs = filterWorkspaceRuntimeLogs(logs, logFilter);

  return (
    <aside className="workspace-clone__drawer">
      <header className="workspace-clone__drawer-head">
        <div className="workspace-clone__drawer-head-top">
          <div>
            <strong>{PANEL_TITLES[panel]}</strong>
          </div>
          <div className="workspace-clone__drawer-head-actions">
            {panel === "schedule" ? (
              <button type="button" aria-label="刷新任务列表" onClick={onRefreshTasks}>
                <WorkspaceCloneIcon name="refresh" size={15} strokeWidth={1.9} />
              </button>
            ) : null}
            <button type="button" aria-label="关闭侧栏" onClick={onClose}>
              <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
            </button>
          </div>
        </div>
        {panel === "history" ? (
          <div className="workspace-clone__drawer-filters" role="tablist" aria-label="历史会话时间筛选">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`workspace-clone__drawer-filter ${historyFilter === filter.key ? "is-active" : ""}`}
                onClick={() => onSelectHistoryFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
        {panel === "schedule" ? (
          <div className="workspace-clone__drawer-filters workspace-clone__drawer-filters--task" role="tablist" aria-label="任务启停筛选">
            {TASK_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`workspace-clone__drawer-filter workspace-clone__drawer-filter--task ${taskFilter === filter.key ? "is-active" : ""}`}
                aria-selected={taskFilter === filter.key}
                onClick={() => setTaskFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
        {panel === "logs" ? (
          <div className="workspace-clone__drawer-filters workspace-clone__drawer-filters--logs" role="tablist" aria-label="运行日志分类筛选">
            {WORKSPACE_RUNTIME_LOG_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`workspace-clone__drawer-filter workspace-clone__drawer-filter--logs ${logFilter === filter.key ? "is-active" : ""}`}
                aria-selected={logFilter === filter.key}
                onClick={() => setLogFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="workspace-clone__drawer-body">
        {panel === "session" && (
          <section className="workspace-clone__drawer-section">
            <div className="workspace-clone__session-grid">
              {sessionCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  className={`workspace-clone__session-tile ${activeSessionSection === card.key ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectSessionSection(card.key);
                    if (card.key === "model") {
                      onOpenModelConfig();
                      return;
                    }
                    if (card.key === "memory") {
                      onOpenRelatedResource("memory");
                      return;
                    }
                    if (card.key === "skills") {
                      onOpenRelatedResource("skills");
                      return;
                    }
                    if (card.key === "tools") {
                      onOpenRelatedResource("tools");
                      return;
                    }
                    if (card.key === "commands") {
                      onOpenRelatedResource("commands");
                      return;
                    }
                    if (card.key === "channel") {
                      onOpenRelatedResource("channel");
                      return;
                    }
                    if (card.key === "schedule") {
                      onOpenRelatedResource("schedule");
                    }
                  }}
                >
                  <span className="workspace-clone__session-tile-icon">
                    <WorkspaceCloneIcon name={card.icon} size={15} strokeWidth={1.9} />
                  </span>
                  <div className="workspace-clone__session-tile-copy">
                    <strong>{SECTION_TITLES[card.key]}</strong>
                    <small>{card.summary}</small>
                  </div>
                  <WorkspaceCloneIcon name="chevron-right" size={13} strokeWidth={2} />
                </button>
              ))}
            </div>
          </section>
        )}

        {panel === "history" && filteredHistoryItems.map((item) => {
          const sessionKey = item.sessionKey || item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--history ${item.active ? "is-active" : ""}`}
              onClick={() => onSelectHistorySession(sessionKey)}
            >
              <strong className="workspace-clone__drawer-card-title">{item.title}</strong>
              <span className="workspace-clone__drawer-card-time">{item.time}</span>
            </button>
          );
        })}

        {panel === "history" && filteredHistoryItems.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>暂无会话</strong>
            <small>{historyFilter === "all" ? "当前还没有可展示的历史会话。" : "当前筛选条件下没有匹配的历史会话。"}</small>
          </section>
        ) : null}

        {panel === "logs" && filteredLogs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--log ${selectedRuntimeLogId === item.id ? "is-active" : ""}`}
            onClick={() => onOpenRuntimeLogDetail(item.id)}
          >
            <p className="workspace-clone__runtime-log-summary">{item.summary}</p>
            <div className="workspace-clone__runtime-log-meta">
              <span>{item.time}</span>
              <span>{getWorkspaceRuntimeLogCategoryLabel(item.category)}</span>
              <span>{getWorkspaceRuntimeLogRawTypeLabel(item.rawType)}</span>
            </div>
          </button>
        ))}

        {panel === "logs" && logs.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>暂无运行日志</strong>
            <small>当前还没有可展示的运行日志。</small>
          </section>
        ) : null}

        {panel === "logs" && logs.length > 0 && filteredLogs.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>当前分类暂无日志</strong>
            <small>{`没有命中“${WORKSPACE_RUNTIME_LOG_FILTERS.find((item) => item.key === logFilter)?.label || "当前分类"}”的日志。`}</small>
          </section>
        ) : null}

        {panel === "schedule" ? (
          <>
            {!gatewayConnected ? (
              <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
                <strong>无法读取任务</strong>
                <small>Gateway 未连接，当前无法获取 OpenClaw 的真实任务数据。</small>
              </section>
            ) : taskLoading ? (
              <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
                <strong>正在加载任务</strong>
                <small>正在从 OpenClaw Gateway 同步当前 Agent 的真实 cron 任务。</small>
              </section>
            ) : visibleTasks.length === 0 ? (
              <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
                <strong>{taskFilter === "enabled" ? "暂无启用任务" : "暂无已停用任务"}</strong>
                <small>{selectedEntity?.name ? `${selectedEntity.name} 当前没有${taskFilter === "enabled" ? "启用中" : "已停用"}的真实任务。` : "当前 Agent 没有匹配的真实任务。"}</small>
              </section>
            ) : (
              <div className="workspace-clone__task-list">
                {visibleTasks.map((task) => {
                  const optimisticRunning = optimisticRunningTaskIds.includes(task.id);
                  const displayStatus = getWorkspaceCronDisplayStatus(task, { optimisticRunning });
                  const statusTone = getWorkspaceCronStatusTone(displayStatus);
                  const scheduleView = resolveWorkspaceTaskScheduleView(task.schedule);
                  const editDisabledReason = getWorkspaceCronEditDisabledReason(task)
                    || (!scheduleView.editable ? "当前高级 Cron 规则暂不支持在此弹窗编辑" : null);
                  const selected = selectedTaskId === task.id;
                  const busy = taskActionJobId === task.id;
                  const menuOpen = openTaskMenuId === task.id;
                  const showRunningIndicator = displayStatus === "running";

                  return (
                    <section
                      key={task.id}
                      className={`workspace-clone__drawer-card workspace-clone__task-card is-${statusTone} ${selected ? "is-selected" : ""} ${menuOpen ? "is-menu-open" : ""}`}
                    >
                      <div className="workspace-clone__task-card-row">
                        <button
                          type="button"
                          className="workspace-clone__task-card-main"
                          onClick={() => {
                            setOpenTaskMenuId(null);
                            onSelectTask(task.id);
                          }}
                        >
                          <div className="workspace-clone__task-card-icon">
                            <WorkspaceCloneIcon name="calendar-clock" size={16} strokeWidth={1.9} />
                          </div>

                          <div className="workspace-clone__task-card-copy">
                            <div className="workspace-clone__task-card-head">
                              <strong className="workspace-clone__task-card-title">{resolveWorkspaceTaskDisplayTitle(task)}</strong>
                            </div>

                            <div className="workspace-clone__task-card-meta">
                              <span className="workspace-clone__task-card-meta-line">
                                <span className="workspace-clone__task-card-meta-label">下次执行</span>
                                <strong>{formatWorkspaceCronTimestamp(task.state.nextRunAtMs)}</strong>
                              </span>
                              <span className="workspace-clone__task-card-meta-line">
                                <span className="workspace-clone__task-card-meta-label">循环</span>
                                <strong>{formatWorkspaceTaskScheduleLine(task.schedule)}</strong>
                              </span>
                            </div>
                          </div>
                        </button>

                        <div className="workspace-clone__task-card-actions">
                          {showRunningIndicator ? (
                            <span className="workspace-clone__task-running-indicator" aria-label="正在运行" title="正在运行">
                              <span className="workspace-clone__task-running-dot" aria-hidden="true" />
                              <span>运行中</span>
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="workspace-clone__task-action workspace-clone__task-action--run"
                            onClick={() => {
                              setOpenTaskMenuId(null);
                              onRunTask(task);
                            }}
                            disabled={busy}
                            aria-label={`立即执行 ${resolveWorkspaceTaskDisplayTitle(task)}`}
                          >
                            <WorkspaceCloneIcon name="play" size={14} strokeWidth={2} />
                          </button>

                          <div className="workspace-clone__more-wrap" ref={menuOpen ? taskMenuRef : null}>
                            <button
                              type="button"
                              className={`workspace-clone__task-more-button ${menuOpen ? "is-active" : ""}`}
                              aria-label={`打开 ${resolveWorkspaceTaskDisplayTitle(task)} 更多操作`}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={() => setOpenTaskMenuId((current) => (current === task.id ? null : task.id))}
                              disabled={busy}
                            >
                              <WorkspaceCloneIcon name="more" size={14} strokeWidth={1.9} />
                            </button>

                            {menuOpen ? (
                              <div className="workspace-clone__task-more-menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="workspace-clone__task-menu-item"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onRunTask(task);
                                  }}
                                  disabled={busy}
                                >
                                  <WorkspaceCloneIcon name="play" size={14} strokeWidth={2} />
                                  <span>立即执行</span>
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="workspace-clone__task-menu-item"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onToggleTaskEnabled(task);
                                  }}
                                  disabled={busy}
                                >
                                  <WorkspaceCloneIcon name={task.enabled ? "pause" : "play"} size={14} strokeWidth={2} />
                                  <span>{task.enabled ? "暂停" : "启用"}</span>
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="workspace-clone__task-menu-item"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onEditTask(task);
                                  }}
                                  disabled={Boolean(editDisabledReason) || busy}
                                  title={editDisabledReason || undefined}
                                >
                                  <WorkspaceCloneIcon name="edit" size={14} strokeWidth={2} />
                                  <span>编辑</span>
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="workspace-clone__task-menu-item workspace-clone__task-menu-danger"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onDeleteTask(task);
                                  }}
                                  disabled={busy}
                                >
                                  <WorkspaceCloneIcon name="trash" size={14} strokeWidth={2} />
                                  <span>删除</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        {panel === "workbench" && workbenchItems.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            <span>{item.time}</span>
          </section>
        ))}
      </div>
    </aside>
  );
}
