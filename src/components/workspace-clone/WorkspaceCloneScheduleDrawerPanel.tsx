import { useEffect, useRef, useState } from "react";

import {
  formatWorkspaceCronTimestamp,
  getWorkspaceCronDisplayStatus,
  getWorkspaceCronEditDisabledReason,
  getWorkspaceCronStatusTone,
} from "./workspaceCloneCron";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { resolveWorkspaceTaskScheduleView } from "./workspaceCloneTaskSchedule";
import { formatWorkspaceTaskScheduleLine } from "./workspaceCloneTaskScheduleDisplay";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";
import type { WorkspaceCronJob, WorkspaceEntity } from "./workspaceCloneTypes";

interface WorkspaceCloneScheduleDrawerPanelProps {
  selectedEntity: WorkspaceEntity | null;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  taskLoading: boolean;
  taskActionJobId: string | null;
  optimisticRunningTaskIds: string[];
  gatewayConnected: boolean;
  onSelectTask: (taskId: string) => void;
  onToggleTaskEnabled: (task: WorkspaceCronJob) => void;
  onEditTask: (task: WorkspaceCronJob) => void;
  onRunTask: (task: WorkspaceCronJob) => void;
  onDeleteTask: (task: WorkspaceCronJob) => void;
}

const TASK_FILTERS = [
  { key: "enabled", label: "启用中" },
  { key: "disabled", label: "已停用" },
] as const;

type TaskFilterKey = typeof TASK_FILTERS[number]["key"];

export function WorkspaceCloneScheduleDrawerPanel({
  selectedEntity,
  tasks,
  selectedTaskId,
  taskLoading,
  taskActionJobId,
  optimisticRunningTaskIds,
  gatewayConnected,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
}: WorkspaceCloneScheduleDrawerPanelProps) {
  const enabledTaskCount = tasks.filter((task) => task.enabled).length;
  const [taskFilter, setTaskFilter] = useState<TaskFilterKey>(enabledTaskCount > 0 ? "enabled" : "disabled");
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTaskFilter(enabledTaskCount > 0 ? "enabled" : "disabled");
  }, [enabledTaskCount, selectedEntity?.id]);

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
    if (!openTaskMenuId) {
      return;
    }

    if (!tasks.some((task) => task.id === openTaskMenuId)) {
      setOpenTaskMenuId(null);
    }
  }, [openTaskMenuId, tasks]);

  useEffect(() => {
    setOpenTaskMenuId(null);
  }, [taskFilter]);

  const visibleTasks = taskFilter === "enabled"
    ? tasks.filter((task) => task.enabled)
    : tasks.filter((task) => !task.enabled);

  return (
    <>
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

      <div className="workspace-clone__drawer-body">
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
      </div>
    </>
  );
}
