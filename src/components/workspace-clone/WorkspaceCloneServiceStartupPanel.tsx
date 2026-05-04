import { useState } from "react";

import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

export type WorkspaceServiceStartupPhase =
  | "stopped"
  | "starting"
  | "checking"
  | "connecting"
  | "error";

export interface WorkspaceServiceStartupLogLine {
  id: string;
  level: string;
  message: string;
}

export type WorkspaceServiceStartupStepState = "pending" | "active" | "done" | "error";

export interface WorkspaceServiceStartupStep {
  id: string;
  label: string;
  description: string;
  state: WorkspaceServiceStartupStepState;
}

interface WorkspaceCloneServiceStartupPanelProps {
  phase: WorkspaceServiceStartupPhase;
  message: string;
  steps: WorkspaceServiceStartupStep[];
  logs: WorkspaceServiceStartupLogLine[];
  error: string | null;
  onRetry: () => void;
}

const PHASE_LABELS: Record<WorkspaceServiceStartupPhase, string> = {
  stopped: "服务尚未启动",
  starting: "正在启动 OpenClaw",
  checking: "正在验证网关",
  connecting: "正在连接首页聊天",
  error: "连接暂时不可用",
};

const PHASE_ICONS: Record<WorkspaceServiceStartupPhase, Parameters<typeof WorkspaceCloneIcon>[0]["name"]> = {
  stopped: "panel",
  starting: "terminal",
  checking: "sparkles",
  connecting: "sparkles",
  error: "info",
};

export function WorkspaceCloneServiceStartupPanel({
  phase,
  message,
  steps,
  logs,
  error,
  onRetry,
}: WorkspaceCloneServiceStartupPanelProps) {
  const [showLogs, setShowLogs] = useState(false);
  const busy = phase === "starting" || phase === "checking" || phase === "connecting";
  const hasLogs = logs.length > 0;

  return (
    <section className={`workspace-clone__service-startup is-${phase}`} aria-live="polite">
      <div className="workspace-clone__service-startup-head">
        <span className="workspace-clone__service-startup-icon">
          <WorkspaceCloneIcon name={PHASE_ICONS[phase]} size={18} strokeWidth={1.9} />
        </span>
        <div className="workspace-clone__service-startup-copy">
          <strong>{PHASE_LABELS[phase]}</strong>
          <p>{error || message}</p>
        </div>
        <button
          type="button"
          className="workspace-clone__service-startup-log-toggle"
          onClick={() => setShowLogs((current) => !current)}
          aria-label={showLogs ? "收起最近日志" : "展开最近日志"}
          aria-pressed={showLogs}
          disabled={!hasLogs}
        >
          <WorkspaceCloneIcon name="notebook" size={16} strokeWidth={1.9} />
        </button>
      </div>

      <div className="workspace-clone__service-startup-steps" aria-label="启动连接步骤">
        {steps.map((step) => (
          <div key={step.id} className={`workspace-clone__service-startup-step is-${step.state}`}>
            <span className="workspace-clone__service-startup-step-dot" aria-hidden="true" />
            <div>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {showLogs && hasLogs ? (
        <div className="workspace-clone__service-startup-log" aria-label="最近启动日志">
          {logs.map((log) => (
            <div key={log.id} className={`workspace-clone__service-startup-log-line is-${log.level}`}>
              <span>{log.level}</span>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {phase === "stopped" || phase === "error" ? (
        <div className="workspace-clone__service-startup-actions">
          <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onRetry}>
            {phase === "error" ? "重试启动" : "启动服务"}
          </button>
        </div>
      ) : null}

      {busy ? <div className="workspace-clone__service-startup-progress" aria-hidden="true" /> : null}
    </section>
  );
}
