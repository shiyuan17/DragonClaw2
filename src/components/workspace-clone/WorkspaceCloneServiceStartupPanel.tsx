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

interface WorkspaceCloneServiceStartupPanelProps {
  phase: WorkspaceServiceStartupPhase;
  message: string;
  logs: WorkspaceServiceStartupLogLine[];
  error: string | null;
  onRetry: () => void;
  onOpenLogs: () => void;
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
  logs,
  error,
  onRetry,
  onOpenLogs,
}: WorkspaceCloneServiceStartupPanelProps) {
  const busy = phase === "starting" || phase === "checking" || phase === "connecting";

  return (
    <section className={`workspace-clone__service-startup is-${phase}`} aria-live="polite">
      <div className="workspace-clone__service-startup-head">
        <span className="workspace-clone__service-startup-icon">
          <WorkspaceCloneIcon name={PHASE_ICONS[phase]} size={18} strokeWidth={1.9} />
        </span>
        <div>
          <strong>{PHASE_LABELS[phase]}</strong>
          <p>{error || message}</p>
        </div>
      </div>

      {logs.length > 0 ? (
        <div className="workspace-clone__service-startup-log" aria-label="最近启动日志">
          {logs.map((log) => (
            <div key={log.id} className={`workspace-clone__service-startup-log-line is-${log.level}`}>
              <span>{log.level}</span>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="workspace-clone__service-startup-actions">
        {phase === "stopped" || phase === "error" ? (
          <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onRetry}>
            {phase === "error" ? "重试启动" : "启动服务"}
          </button>
        ) : null}
        <button type="button" className="workspace-clone__composer-action-text" onClick={onOpenLogs}>
          查看日志
        </button>
      </div>

      {busy ? <div className="workspace-clone__service-startup-progress" aria-hidden="true" /> : null}
    </section>
  );
}
