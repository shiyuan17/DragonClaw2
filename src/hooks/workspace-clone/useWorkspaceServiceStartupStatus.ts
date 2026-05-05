import { useMemo } from "react";

import type { LogEntry } from "../../types";
import type { WorkspaceGatewayStatus } from "../../components/workspace-clone/workspaceCloneTypes";
import type {
  WorkspaceServiceStartupLogLine,
  WorkspaceServiceStartupPhase,
  WorkspaceServiceStartupStep,
  WorkspaceServiceStartupStepState,
} from "../../components/workspace-clone/WorkspaceCloneServiceStartupPanel";

interface UseWorkspaceServiceStartupStatusOptions {
  running: boolean;
  loading: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  connectionError: string | null;
  logs: LogEntry[];
}

const STARTUP_LOG_PATTERN =
  /openclaw|gateway|service|websocket|connection|timeout|auth|closed|disconnected|failed|启动|服务|网关|端口|listening|ready|rpc|token|unauthorized/i;

const STARTUP_STEP_DEFINITIONS: Array<Omit<WorkspaceServiceStartupStep, "state">> = [
  {
    id: "start",
    label: "启动服务",
    description: "拉起本地 OpenClaw 网关进程",
  },
  {
    id: "check",
    label: "验证网关",
    description: "确认端口、RPC 和 token 可用",
  },
  {
    id: "connect",
    label: "连接聊天",
    description: "拉取 Agent 列表和主会话历史",
  },
];

function normalizeLogLevel(level: string) {
  const normalized = level.trim().toLowerCase();
  if (normalized.includes("error") || normalized.includes("fail")) {
    return "error";
  }
  if (normalized.includes("warn")) {
    return "warn";
  }
  if (normalized.includes("success")) {
    return "success";
  }
  return "info";
}

function resolveRecentStartupLogs(logs: LogEntry[]): WorkspaceServiceStartupLogLine[] {
  const recent = logs
    .map((log, index) => ({
      id: `${log.time || index}-${index}`,
      level: normalizeLogLevel(log.level),
      message: (log.humanized || log.message || "").trim(),
    }))
    .filter((log) => log.message && STARTUP_LOG_PATTERN.test(log.message))
    .slice(-4);

  return recent;
}

function resolveLatestStartupError(logs: WorkspaceServiceStartupLogLine[]) {
  const latestError = [...logs].reverse().find((log) => log.level === "error");
  return latestError?.message || null;
}

function resolveStartupPhase(params: {
  running: boolean;
  loading: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  connectionError: string | null;
}): WorkspaceServiceStartupPhase | "ready" {
  if (params.connectionStatus === "error" || params.connectionError) {
    return "error";
  }

  if (params.connectionStatus === "connected") {
    return "ready";
  }

  if (params.loading && !params.running) {
    return "starting";
  }

  if (params.loading && params.running) {
    return "checking";
  }

  if (!params.running) {
    return "stopped";
  }

  return "connecting";
}

function resolveStepState(
  stepId: string,
  phase: WorkspaceServiceStartupPhase | "ready",
  running: boolean,
): WorkspaceServiceStartupStepState {
  if (phase === "ready") {
    return "done";
  }

  if (phase === "stopped") {
    return "pending";
  }

  if (phase === "error") {
    if (!running) {
      return stepId === "start" ? "error" : "pending";
    }
    return stepId === "connect" ? "error" : "done";
  }

  if (phase === "starting") {
    return stepId === "start" ? "active" : "pending";
  }

  if (phase === "checking") {
    return stepId === "start" ? "done" : stepId === "check" ? "active" : "pending";
  }

  return stepId === "connect" ? "active" : "done";
}

function resolveStartupSteps(
  phase: WorkspaceServiceStartupPhase | "ready",
  running: boolean,
): WorkspaceServiceStartupStep[] {
  return STARTUP_STEP_DEFINITIONS.map((step) => ({
    ...step,
    state: resolveStepState(step.id, phase, running),
  }));
}

function injectConnectionError(
  logs: WorkspaceServiceStartupLogLine[],
  connectionError: string | null,
): WorkspaceServiceStartupLogLine[] {
  if (!connectionError) {
    return logs;
  }

  const errorLine: WorkspaceServiceStartupLogLine = {
    id: `connection-error-${connectionError}`,
    level: "error",
    message: connectionError,
  };

  const merged = [errorLine, ...logs.filter((log) => log.message !== connectionError)];
  return merged.slice(0, 4);
}

export function useWorkspaceServiceStartupStatus({
  running,
  loading,
  connectionStatus,
  connectionError,
  logs,
}: UseWorkspaceServiceStartupStatusOptions) {
  return useMemo(() => {
    const phase = resolveStartupPhase({ running, loading, connectionStatus, connectionError });
    const recentLogs = injectConnectionError(resolveRecentStartupLogs(logs), connectionError);
    const latestStartupError = resolveLatestStartupError(recentLogs);
    const error = connectionError || (phase === "error" ? latestStartupError : null);

    const message =
      phase === "stopped"
        ? "启动后会在这里接入当前 Agent 的主会话。"
        : phase === "starting"
          ? "OpenClaw 服务正在启动，当前进度会显示在这里。"
          : phase === "checking"
            ? "服务已拉起，正在等待网关 RPC 就绪。"
            : phase === "connecting"
              ? "网关就绪后会自动拉取真实 Agent 列表和主会话历史。"
              : phase === "ready"
                ? "OpenClaw 已连接。"
                : "可以重试启动，或展开最近日志查看失败原因。";

    return {
      phase,
      message,
      steps: resolveStartupSteps(phase, running),
      logs: recentLogs,
      error,
      showPanel: phase !== "ready",
    };
  }, [connectionError, connectionStatus, loading, logs, running]);
}
