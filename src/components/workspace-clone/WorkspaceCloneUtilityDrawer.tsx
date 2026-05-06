import { useEffect, useRef, useState } from "react";

import {
  formatWorkspaceCronPayloadPreview,
  formatWorkspaceCronScheduleSummary,
  formatWorkspaceCronTimestamp,
  getWorkspaceCronDisplayStatus,
  getWorkspaceCronEditDisabledReason,
  getWorkspaceCronStatusLabel,
  getWorkspaceCronStatusTone,
} from "./workspaceCloneCron";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceEntity,
  WorkspaceHistoryFilter,
  WorkspaceHistoryItem,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
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
  logs: Array<{ id: string; title: string; subtitle: string }>;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  taskLoading: boolean;
  taskNotice: string;
  taskError: string;
  taskRunsError: string;
  taskRunsLoading: boolean;
  taskRunsLoadingId: string | null;
  taskActionJobId: string | null;
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

function getRunSummary(run: WorkspaceCronRunRecord | undefined, task?: WorkspaceCronJob) {
  if (!run) {
    if (task?.state.lastError?.trim()) {
      return task.state.lastError.trim();
    }

    const fallbackStatus = task?.state.lastRunStatus ?? task?.state.lastStatus;
    switch (fallbackStatus) {
      case "error":
        return "最近一次运行失败";
      case "skipped":
        return "最近一次运行被跳过";
      case "ok":
        return "最近一次运行完成";
      default:
        return "暂无运行记录";
    }
  }

  if (run.summary?.trim()) {
    return run.summary.trim();
  }

  if (run.error?.trim()) {
    return run.error.trim();
  }

  switch (run.status) {
    case "error":
      return "最近一次运行失败";
    case "skipped":
      return "最近一次运行被跳过";
    case "ok":
      return "最近一次运行完成";
    default:
      return "最近一次运行已结束";
  }
}

export function WorkspaceCloneUtilityDrawer({
  panel,
  selectedEntity,
  activeSessionSection,
  historyItems,
  logs,
  tasks,
  selectedTaskId,
  selectedTaskRuns,
  taskLoading,
  taskNotice,
  taskError,
  taskRunsError,
  taskRunsLoading,
  taskRunsLoadingId,
  taskActionJobId,
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
  onRefreshTasks,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
}: WorkspaceCloneUtilityDrawerProps) {
  const [taskFilter, setTaskFilter] = useState<TaskFilterKey>("enabled");
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (panel !== "schedule") {
      return;
    }

    if (taskFilter === "enabled" && tasks.some((task) => task.enabled)) {
      return;
    }

    if (taskFilter === "disabled" && tasks.some((task) => !task.enabled)) {
      return;
    }

    setTaskFilter(tasks.some((task) => task.enabled) ? "enabled" : "disabled");
  }, [panel, taskFilter, tasks]);

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

  if (!panel) {
    return null;
  }

  const enabledSkillCount = skillItems.filter((item) => item.tag === "已启用").length;
  const enabledToolCount = toolItems.filter((item) => item.enabled).length;
  const enabledTaskCount = tasks.filter((item) => item.enabled).length;
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
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) ?? null;

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
          <div className="workspace-clone__drawer-filters" role="tablist" aria-label="任务启停筛选">
            {TASK_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`workspace-clone__drawer-filter ${taskFilter === filter.key ? "is-active" : ""}`}
                onClick={() => setTaskFilter(filter.key)}
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

        {panel === "logs" && logs.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </section>
        ))}

        {panel === "schedule" ? (
          <>
            {(taskNotice.trim() || taskError.trim() || taskRunsError.trim()) && (
              <div className="workspace-clone__task-feedback">
                {taskNotice.trim() ? (
                  <div className="workspace-clone__task-feedback-card is-notice">{taskNotice}</div>
                ) : null}
                {taskError.trim() ? (
                  <div className="workspace-clone__task-feedback-card is-error">{taskError}</div>
                ) : null}
                {!taskError.trim() && taskRunsError.trim() ? (
                  <div className="workspace-clone__task-feedback-card is-error">{taskRunsError}</div>
                ) : null}
              </div>
            )}

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
                  const displayStatus = getWorkspaceCronDisplayStatus(task);
                  const statusTone = getWorkspaceCronStatusTone(displayStatus);
                  const editDisabledReason = getWorkspaceCronEditDisabledReason(task);
                  const taskRuns = selectedTask?.id === task.id ? selectedTaskRuns.slice(0, 3) : [];
                  const latestRun = selectedTask?.id === task.id ? selectedTaskRuns[0] : undefined;
                  const expanded = selectedTask?.id === task.id;
                  const busy = taskActionJobId === task.id;
                  const menuOpen = openTaskMenuId === task.id;

                  return (
                    <section
                      key={task.id}
                      className={`workspace-clone__drawer-card workspace-clone__task-card ${expanded ? "is-expanded" : ""}`}
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
                          <div className="workspace-clone__task-card-head">
                            <div className="workspace-clone__task-card-copy">
                              <strong>{task.name}</strong>
                              <small className="workspace-clone__task-card-summary">
                                {task.description?.trim() || formatWorkspaceCronPayloadPreview(task)}
                              </small>
                            </div>
                            <span className={`workspace-clone__status-inline workspace-clone__task-status is-${statusTone}`}>
                              {getWorkspaceCronStatusLabel(displayStatus)}
                            </span>
                          </div>

                          <div className="workspace-clone__task-card-meta">
                            <div className="workspace-clone__task-card-meta-item">
                              <span>调度</span>
                              <strong>{formatWorkspaceCronScheduleSummary(task.schedule)}</strong>
                            </div>
                            <div className="workspace-clone__task-card-meta-item">
                              <span>下次运行</span>
                              <strong>{formatWorkspaceCronTimestamp(task.state.nextRunAtMs)}</strong>
                            </div>
                            <div className="workspace-clone__task-card-meta-item workspace-clone__task-card-meta-item--wide">
                              <span>结果摘要</span>
                              <strong>{getRunSummary(latestRun, task)}</strong>
                            </div>
                          </div>
                        </button>

                        <div className="workspace-clone__task-card-actions">
                          <button
                            type="button"
                            className="workspace-clone__task-action workspace-clone__task-action--run"
                            onClick={() => {
                              setOpenTaskMenuId(null);
                              onRunTask(task);
                            }}
                            disabled={busy}
                          >
                            立即运行
                          </button>

                          <div className="workspace-clone__more-wrap" ref={menuOpen ? taskMenuRef : null}>
                            <button
                              type="button"
                              className={`workspace-clone__task-more-button ${menuOpen ? "is-active" : ""}`}
                              aria-label={`打开 ${task.name} 更多操作`}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={() => setOpenTaskMenuId((current) => (current === task.id ? null : task.id))}
                              disabled={busy}
                            >
                              <WorkspaceCloneIcon name="more" size={14} strokeWidth={1.9} />
                            </button>

                            {menuOpen ? (
                              <div className="workspace-clone__more-menu workspace-clone__task-more-menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onToggleTaskEnabled(task);
                                  }}
                                  disabled={busy}
                                >
                                  {task.enabled ? "停用" : "启用"}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onEditTask(task);
                                  }}
                                  disabled={Boolean(editDisabledReason) || busy}
                                  title={editDisabledReason || undefined}
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="workspace-clone__task-menu-danger"
                                  onClick={() => {
                                    setOpenTaskMenuId(null);
                                    onDeleteTask(task);
                                  }}
                                  disabled={busy}
                                >
                                  删除
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="workspace-clone__task-footer">
                          <div className="workspace-clone__task-runs-head">
                            <strong>最近运行</strong>
                            {taskRunsLoading && taskRunsLoadingId === task.id ? (
                              <small>正在同步...</small>
                            ) : taskRuns.length > 0 ? (
                              <small>展示最近 {taskRuns.length} 条</small>
                            ) : null}
                          </div>

                          {taskRuns.length === 0 ? (
                            <div className="workspace-clone__task-run-empty">暂无运行记录</div>
                          ) : (
                            <div className="workspace-clone__task-run-list">
                              {taskRuns.map((run) => {
                                const runTone = getWorkspaceCronStatusTone(
                                  run.status === "error"
                                    ? "error"
                                    : run.status === "skipped"
                                      ? "skipped"
                                      : "ok",
                                );

                                return (
                                  <div key={`${run.jobId}-${run.ts}`} className="workspace-clone__task-run-row">
                                    <div className="workspace-clone__task-run-copy">
                                      <div className="workspace-clone__task-run-head">
                                        <strong>{formatWorkspaceCronTimestamp(run.runAtMs ?? run.ts)}</strong>
                                        <span className={`workspace-clone__status-inline is-${runTone}`}>
                                          {run.status === "error" ? "异常" : run.status === "skipped" ? "已跳过" : "正常"}
                                        </span>
                                      </div>
                                      <small>{getRunSummary(run)}</small>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
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
