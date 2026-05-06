import { useEffect, useMemo, useState } from "react";

import { Modal } from "../ui/Modal";
import {
  buildWorkspaceCronPatch,
  formatWorkspaceCronScheduleSummary,
} from "./workspaceCloneCron";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceCronJob,
  WorkspaceCronJobPatch,
  WorkspaceCronPayload,
  WorkspaceCronSchedule,
} from "./workspaceCloneTypes";

interface WorkspaceCloneTaskEditorModalProps {
  show: boolean;
  job: WorkspaceCronJob | null;
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
  scheduleKind: WorkspaceCronSchedule["kind"];
  scheduleAt: string;
  scheduleEverySeconds: string;
  scheduleCronExpr: string;
  scheduleCronTz: string;
  sessionTarget: WorkspaceCronJob["sessionTarget"];
  useCustomSessionTarget: boolean;
  customSessionTarget: string;
  wakeMode: WorkspaceCronJob["wakeMode"];
  payloadText: string;
}

function buildDraft(job: WorkspaceCronJob): TaskEditorDraft {
  return {
    name: job.name,
    description: job.description ?? "",
    enabled: job.enabled,
    scheduleKind: job.schedule.kind,
    scheduleAt: job.schedule.kind === "at" ? job.schedule.at : "",
    scheduleEverySeconds: job.schedule.kind === "every" ? String(Math.max(1, Math.round(job.schedule.everyMs / 1000))) : "60",
    scheduleCronExpr: job.schedule.kind === "cron" ? job.schedule.expr : "",
    scheduleCronTz: job.schedule.kind === "cron" ? job.schedule.tz ?? "" : "",
    sessionTarget: job.sessionTarget.startsWith("session:") ? "main" : job.sessionTarget,
    useCustomSessionTarget: job.sessionTarget.startsWith("session:"),
    customSessionTarget: job.sessionTarget.startsWith("session:") ? job.sessionTarget : "",
    wakeMode: job.wakeMode,
    payloadText: job.payload.kind === "systemEvent" ? job.payload.text : "",
  };
}

function buildSchedule(draft: TaskEditorDraft): WorkspaceCronSchedule {
  if (draft.scheduleKind === "at") {
    return {
      kind: "at",
      at: draft.scheduleAt.trim(),
    };
  }

  if (draft.scheduleKind === "every") {
    return {
      kind: "every",
      everyMs: Math.max(1, Math.round(Number(draft.scheduleEverySeconds) * 1000)),
    };
  }

  return {
    kind: "cron",
    expr: draft.scheduleCronExpr.trim(),
    tz: draft.scheduleCronTz.trim() || undefined,
  };
}

export function WorkspaceCloneTaskEditorModal({
  show,
  job,
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

  const schedulePreview = useMemo(() => {
    if (!draft) {
      return "";
    }

    try {
      return formatWorkspaceCronScheduleSummary(buildSchedule(draft));
    } catch {
      return "";
    }
  }, [draft]);

  if (!job || !draft || job.payload.kind !== "systemEvent") {
    return null;
  }

  const handleSave = async () => {
    const nextPayload: WorkspaceCronPayload = {
      kind: "systemEvent",
      text: draft.payloadText.trim(),
    };
    const nextSessionTarget = draft.useCustomSessionTarget
      ? draft.customSessionTarget.trim()
      : draft.sessionTarget;

    if (!draft.name.trim()) {
      setValidationError("请输入任务名称");
      return;
    }
    if (!nextPayload.text) {
      setValidationError("请输入任务内容");
      return;
    }
    if (draft.scheduleKind === "at" && !draft.scheduleAt.trim()) {
      setValidationError("请输入单次执行时间");
      return;
    }
    if (draft.scheduleKind === "every" && (!Number.isFinite(Number(draft.scheduleEverySeconds)) || Number(draft.scheduleEverySeconds) <= 0)) {
      setValidationError("请输入有效的执行间隔秒数");
      return;
    }
    if (draft.scheduleKind === "cron" && !draft.scheduleCronExpr.trim()) {
      setValidationError("请输入 Cron 表达式");
      return;
    }
    if (!nextSessionTarget) {
      setValidationError("请选择会话目标");
      return;
    }

    const resolvedSessionTarget = nextSessionTarget as WorkspaceCronJob["sessionTarget"];
    setValidationError("");
    await onSave(buildWorkspaceCronPatch({
      name: draft.name,
      description: draft.description,
      enabled: draft.enabled,
      schedule: buildSchedule(draft),
      sessionTarget: resolvedSessionTarget,
      wakeMode: draft.wakeMode,
      payload: nextPayload,
    }));
  };

  return (
    <Modal
      show={show}
      onClose={saving ? undefined : onClose}
      maxWidth={760}
      overlayClassName="workspace-task-editor-modal__overlay"
      contentClassName="workspace-task-editor-modal__surface"
    >
      <div className="workspace-task-editor-modal">
        <div className="workspace-task-editor-modal__header">
          <div>
            <h3>编辑任务</h3>
            <p>当前仅支持编辑 systemEvent 类型任务，保存后会直接写回 OpenClaw 的真实 cron 配置。</p>
          </div>
          <button
            type="button"
            className="workspace-model-modal__icon"
            aria-label="关闭任务编辑弹窗"
            onClick={onClose}
            disabled={saving}
          >
            <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
          </button>
        </div>

        <div className="workspace-task-editor-modal__body">
          <div className="workspace-task-editor-modal__grid">
            <label className="workspace-task-editor-modal__field">
              <span>任务名称</span>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                disabled={saving}
              />
            </label>

            <label className="workspace-task-editor-modal__field">
              <span>启用状态</span>
              <select
                value={draft.enabled ? "enabled" : "disabled"}
                onChange={(event) => setDraft((current) => current ? { ...current, enabled: event.target.value === "enabled" } : current)}
                disabled={saving}
              >
                <option value="enabled">启用中</option>
                <option value="disabled">已停用</option>
              </select>
            </label>
          </div>

          <label className="workspace-task-editor-modal__field">
            <span>描述</span>
            <textarea
              value={draft.description}
              placeholder="补充任务用途、触发上下文或执行说明"
              onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)}
              disabled={saving}
            />
          </label>

          <div className="workspace-task-editor-modal__grid">
            <label className="workspace-task-editor-modal__field">
              <span>调度类型</span>
              <select
                value={draft.scheduleKind}
                onChange={(event) =>
                  setDraft((current) => current ? {
                    ...current,
                    scheduleKind: event.target.value as WorkspaceCronSchedule["kind"],
                  } : current)}
                disabled={saving}
              >
                <option value="cron">Cron</option>
                <option value="every">固定间隔</option>
                <option value="at">单次执行</option>
              </select>
            </label>

            <label className="workspace-task-editor-modal__field">
              <span>会话目标</span>
              <select
                value={draft.useCustomSessionTarget ? "custom" : draft.sessionTarget}
                onChange={(event) =>
                  setDraft((current) => current ? {
                    ...current,
                    useCustomSessionTarget: event.target.value === "custom",
                    sessionTarget: (event.target.value === "custom" ? current.sessionTarget : event.target.value) as WorkspaceCronJob["sessionTarget"],
                    customSessionTarget: event.target.value === "custom" ? current.customSessionTarget : "",
                  } : current)}
                disabled={saving}
              >
                <option value="main">主会话</option>
                <option value="current">当前会话</option>
                <option value="isolated">独立会话</option>
                <option value="custom">指定 session</option>
              </select>
            </label>
          </div>

          {draft.scheduleKind === "cron" ? (
            <div className="workspace-task-editor-modal__grid">
              <label className="workspace-task-editor-modal__field">
                <span>Cron 表达式</span>
                <input
                  type="text"
                  value={draft.scheduleCronExpr}
                  placeholder="例如：0 9 * * 1-5"
                  onChange={(event) => setDraft((current) => current ? { ...current, scheduleCronExpr: event.target.value } : current)}
                  disabled={saving}
                />
              </label>

              <label className="workspace-task-editor-modal__field">
                <span>时区</span>
                <input
                  type="text"
                  value={draft.scheduleCronTz}
                  placeholder="例如：Asia/Shanghai"
                  onChange={(event) => setDraft((current) => current ? { ...current, scheduleCronTz: event.target.value } : current)}
                  disabled={saving}
                />
              </label>
            </div>
          ) : null}

          {draft.scheduleKind === "every" ? (
            <label className="workspace-task-editor-modal__field">
              <span>执行间隔（秒）</span>
              <input
                type="number"
                min="1"
                step="1"
                value={draft.scheduleEverySeconds}
                onChange={(event) => setDraft((current) => current ? { ...current, scheduleEverySeconds: event.target.value } : current)}
                disabled={saving}
              />
            </label>
          ) : null}

          {draft.scheduleKind === "at" ? (
            <label className="workspace-task-editor-modal__field">
              <span>单次执行时间</span>
              <input
                type="text"
                value={draft.scheduleAt}
                placeholder="例如：2026-05-06T09:00:00+08:00"
                onChange={(event) => setDraft((current) => current ? { ...current, scheduleAt: event.target.value } : current)}
                disabled={saving}
              />
            </label>
          ) : null}

          {draft.useCustomSessionTarget ? (
            <label className="workspace-task-editor-modal__field">
              <span>指定 Session Key</span>
              <input
                type="text"
                value={draft.customSessionTarget}
                placeholder="session:..."
                onChange={(event) => setDraft((current) => current ? { ...current, customSessionTarget: event.target.value } : current)}
                disabled={saving}
              />
            </label>
          ) : null}

          <label className="workspace-task-editor-modal__field">
            <span>唤醒模式</span>
            <select
              value={draft.wakeMode}
              onChange={(event) => setDraft((current) => current ? { ...current, wakeMode: event.target.value as WorkspaceCronJob["wakeMode"] } : current)}
              disabled={saving}
            >
              <option value="next-heartbeat">next-heartbeat</option>
              <option value="now">now</option>
            </select>
          </label>

          <label className="workspace-task-editor-modal__field">
            <span>任务内容</span>
            <textarea
              value={draft.payloadText}
              placeholder="systemEvent 会发送的文本内容"
              onChange={(event) => setDraft((current) => current ? { ...current, payloadText: event.target.value } : current)}
              disabled={saving}
            />
          </label>

          <div className="workspace-task-editor-modal__meta">
            <div>
              <strong>当前任务</strong>
              <small>{formatWorkspaceCronScheduleSummary(job.schedule)}</small>
            </div>
            <div>
              <strong>保存后预览</strong>
              <small>{schedulePreview || "请完善调度字段"}</small>
            </div>
          </div>

          {(validationError || notice.trim() || error.trim()) && (
            <div className="workspace-task-editor-modal__feedback">
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

        <div className="workspace-resource-modal__footer workspace-task-editor-modal__footer">
          <button
            type="button"
            className="workspace-model-modal__ghost"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="workspace-model-modal__primary"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存任务"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
