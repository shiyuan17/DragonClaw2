import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "../ui/Modal";
import { buildWorkspaceCronPatch } from "./workspaceCloneCron";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import {
  buildWorkspaceTaskScheduleFromView,
  resolveWorkspaceTaskScheduleView,
  WORKSPACE_TASK_MONTHDAY_OPTIONS,
  WORKSPACE_TASK_TIME_OPTIONS,
  WORKSPACE_TASK_WEEKDAY_OPTIONS,
  type WorkspaceTaskScheduleMode,
} from "./workspaceCloneTaskSchedule";
import type {
  WorkspaceCronJob,
  WorkspaceCronJobPatch,
  WorkspaceCronPayload,
} from "./workspaceCloneTypes";

interface WorkspaceCloneTaskEditorModalProps {
  show: boolean;
  job: WorkspaceCronJob | null;
  agentLabel: string;
  saving: boolean;
  notice?: string;
  error?: string;
  onClose: () => void;
  onSave: (patch: WorkspaceCronJobPatch) => Promise<void> | void;
}

interface TaskEditorDraft {
  name: string;
  description: string;
  enabled: boolean;
  sessionTarget: WorkspaceCronJob["sessionTarget"];
  wakeMode: WorkspaceCronJob["wakeMode"];
  payloadText: string;
  scheduleMode: WorkspaceTaskScheduleMode;
  scheduleDate: string;
  scheduleTime: string;
  scheduleWeekday: string;
  scheduleMonthDay: string;
  scheduleAtSuffix: string;
  scheduleCronTz: string;
  scheduleRawSummary: string;
}

function buildDraft(job: WorkspaceCronJob): TaskEditorDraft {
  const scheduleView = resolveWorkspaceTaskScheduleView(job.schedule);
  return {
    name: job.name,
    description: job.description ?? "",
    enabled: job.enabled,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadText: job.payload.kind === "agentTurn" ? job.payload.message : job.payload.text,
    scheduleMode: scheduleView.mode,
    scheduleDate: scheduleView.dateValue,
    scheduleTime: scheduleView.timeValue,
    scheduleWeekday: scheduleView.weekdayValue,
    scheduleMonthDay: scheduleView.monthDayValue,
    scheduleAtSuffix: scheduleView.atSuffix,
    scheduleCronTz: scheduleView.cronTz,
    scheduleRawSummary: scheduleView.rawSummary,
  };
}

interface TaskTimeFieldProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function TaskTimeField({ value, disabled, onChange }: TaskTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`workspace-task-editor-modal__time-picker ${open ? "is-open" : ""}`}>
      <div className="workspace-task-editor-modal__time-field">
        <input
          type="text"
          value={value}
          placeholder="20:00"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          className="workspace-task-editor-modal__time-toggle"
          aria-label="展开时间选项"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
        >
          <WorkspaceCloneIcon name="chevron" size={14} strokeWidth={2} />
        </button>
      </div>

      {open && !disabled ? (
        <div className="workspace-task-editor-modal__time-menu">
          <div className="workspace-task-editor-modal__time-menu-list">
            {WORKSPACE_TASK_TIME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`workspace-task-editor-modal__time-option ${value === option ? "is-active" : ""}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceCloneTaskEditorModal({
  show,
  job,
  agentLabel,
  saving,
  notice = "",
  error = "",
  onClose,
  onSave,
}: WorkspaceCloneTaskEditorModalProps) {
  const [draft, setDraft] = useState<TaskEditorDraft | null>(null);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (job && show) {
      setDraft(buildDraft(job));
      setValidationError("");
    }
  }, [job, show]);

  const advancedScheduleMessage = useMemo(
    () => (draft?.scheduleMode === "advanced" ? "当前高级 Cron 规则仅支持查看，暂不支持在此弹窗编辑" : ""),
    [draft?.scheduleMode],
  );

  if (!job || !draft) {
    return null;
  }

  const formLocked = saving || draft.scheduleMode === "advanced";

  const handleSave = async () => {
    const nextPayload: WorkspaceCronPayload = job.payload.kind === "agentTurn"
      ? {
          ...(job.payload.kind === "agentTurn" ? job.payload : {}),
          kind: "agentTurn",
          message: draft.payloadText.trim(),
        }
      : {
          kind: "systemEvent",
          text: draft.payloadText.trim(),
        };

    if (!draft.name.trim()) {
      setValidationError("请输入任务名称");
      return;
    }

    const payloadText = draft.payloadText.trim();
    if (!payloadText) {
      setValidationError("请输入任务指令");
      return;
    }

    if (draft.scheduleMode === "advanced") {
      setValidationError(advancedScheduleMessage || "当前规则暂不支持在此弹窗编辑");
      return;
    }

    try {
      const schedule = buildWorkspaceTaskScheduleFromView({
        mode: draft.scheduleMode,
        dateValue: draft.scheduleDate,
        timeValue: draft.scheduleTime,
        weekdayValue: draft.scheduleWeekday,
        monthDayValue: draft.scheduleMonthDay,
        atSuffix: draft.scheduleAtSuffix,
        cronTz: draft.scheduleCronTz,
      });

      setValidationError("");
      await onSave(buildWorkspaceCronPatch({
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        schedule,
        sessionTarget: draft.sessionTarget,
        wakeMode: draft.wakeMode,
        payload: nextPayload,
      }));
    } catch (saveError) {
      setValidationError(saveError instanceof Error ? saveError.message : "保存任务失败");
    }
  };

  return (
    <Modal
      show={show}
      onClose={saving ? undefined : onClose}
      maxWidth={720}
      overlayClassName="workspace-task-editor-modal__overlay"
      contentClassName="workspace-task-editor-modal__surface"
    >
      <div className="workspace-task-editor-modal">
        <div className="workspace-task-editor-modal__header">
          <div>
            <h3>编辑任务</h3>
          </div>
          <button
            type="button"
            className="workspace-task-editor-modal__close"
            aria-label="关闭任务编辑弹窗"
            onClick={onClose}
            disabled={saving}
          >
            <WorkspaceCloneIcon name="x" size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="workspace-task-editor-modal__body">
          <div className="workspace-task-editor-modal__grid workspace-task-editor-modal__grid--top">
            <label className="workspace-task-editor-modal__field">
              <span>名称 *</span>
              <input
                type="text"
                value={draft.name}
                disabled={formLocked}
                onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
              />
            </label>

            <div className="workspace-task-editor-modal__field">
              <span>Agent *</span>
              <div className="workspace-task-editor-modal__readonly">
                <span>{agentLabel || "当前 Agent"}</span>
                <WorkspaceCloneIcon name="chevron" size={14} strokeWidth={2} />
              </div>
            </div>
          </div>

          <label className="workspace-task-editor-modal__field">
            <span>指令 *</span>
            <textarea
              value={draft.payloadText}
              disabled={formLocked}
              onChange={(event) => setDraft((current) => current ? { ...current, payloadText: event.target.value } : current)}
            />
          </label>

          <div className="workspace-task-editor-modal__field">
            <span>执行时间 *</span>

            {draft.scheduleMode === "advanced" ? (
              <div className="workspace-task-editor-modal__advanced-card">
                <strong>高级 Cron 规则</strong>
                <small>{draft.scheduleRawSummary || "当前任务规则无法映射为单次 / 每天 / 每周 / 每月"}</small>
              </div>
            ) : (
              <div className="workspace-task-editor-modal__schedule-grid">
                <label className="workspace-task-editor-modal__field">
                  <span>周期</span>
                  <select
                    value={draft.scheduleMode}
                    disabled={formLocked}
                    onChange={(event) =>
                      setDraft((current) => current ? {
                        ...current,
                        scheduleMode: event.target.value as Exclude<WorkspaceTaskScheduleMode, "advanced">,
                      } : current)}
                  >
                    <option value="once">单次</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                  </select>
                </label>

                {draft.scheduleMode === "once" ? (
                  <label className="workspace-task-editor-modal__field">
                    <span>日期</span>
                    <input
                      type="date"
                      value={draft.scheduleDate}
                      disabled={formLocked}
                      onChange={(event) =>
                        setDraft((current) => current ? { ...current, scheduleDate: event.target.value } : current)}
                    />
                  </label>
                ) : null}

                {draft.scheduleMode === "weekly" ? (
                  <label className="workspace-task-editor-modal__field">
                    <span>星期</span>
                    <select
                      value={draft.scheduleWeekday}
                      disabled={formLocked}
                      onChange={(event) =>
                        setDraft((current) => current ? { ...current, scheduleWeekday: event.target.value } : current)}
                    >
                      {WORKSPACE_TASK_WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {draft.scheduleMode === "monthly" ? (
                  <label className="workspace-task-editor-modal__field">
                    <span>日期</span>
                    <select
                      value={draft.scheduleMonthDay}
                      disabled={formLocked}
                      onChange={(event) =>
                        setDraft((current) => current ? { ...current, scheduleMonthDay: event.target.value } : current)}
                    >
                      {WORKSPACE_TASK_MONTHDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="workspace-task-editor-modal__field">
                  <span>时间</span>
                  <TaskTimeField
                    value={draft.scheduleTime}
                    disabled={formLocked}
                    onChange={(value) =>
                      setDraft((current) => current ? { ...current, scheduleTime: value } : current)}
                  />
                </label>
              </div>
            )}
          </div>

          {(validationError || error.trim() || notice.trim() || advancedScheduleMessage) && (
            <div className="workspace-task-editor-modal__feedback">
              {advancedScheduleMessage ? (
                <div className="workspace-task-editor-modal__feedback-card is-note">{advancedScheduleMessage}</div>
              ) : null}
              {validationError ? (
                <div className="workspace-task-editor-modal__feedback-card is-error">{validationError}</div>
              ) : null}
              {!validationError && error.trim() ? (
                <div className="workspace-task-editor-modal__feedback-card is-error">{error}</div>
              ) : null}
              {notice.trim() ? (
                <div className="workspace-task-editor-modal__feedback-card is-notice">{notice}</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="workspace-task-editor-modal__footer">
          <button
            type="button"
            className="workspace-task-editor-modal__secondary"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="workspace-task-editor-modal__primary"
            onClick={() => {
              void handleSave();
            }}
            disabled={formLocked}
          >
            {saving ? "保存中..." : "确认"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
