import { useMemo } from "react";

import type { LogEntry } from "../../types";
import type { WorkspaceGatewayStatus } from "./workspaceCloneTypes";
import type {
  WorkspaceServiceStartupLogLine,
  WorkspaceServiceStartupPhase,
} from "./WorkspaceCloneServiceStartupPanel";

interface UseWorkspaceServiceStartupStatusOptions {
  running: boolean;
  loading: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  connectionError: string | null;
  logs: LogEntry[];
}

const STARTUP_LOG_PATTERN =
  /openclaw|gateway|service|服务|网关|启动|端口|listening|ready|rpc|token|unauthorized/i;

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
  return logs
    .map((log, index) => ({
      id: `${log.time || index}-${index}`,
      level: normalizeLogLevel(log.level),
      message: (log.humanized || log.message || "").trim(),
    }))
    .filter((log) => log.message && STARTUP_LOG_PATTERN.test(log.message))
    .slice(-4);
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
  if (params.connectionError && params.connectionStatus === "error") {
    return "error";
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

  if (params.connectionStatus === "connected") {
    return "ready";
  }

  if (params.connectionStatus === "error") {
    return "error";
  }

  return "connecting";
}

export function useWorkspaceServiceStartupStatus({
  running,
  loading,
  connectionStatus,
  connectionError,
  logs,
}: UseWorkspaceServiceStartupStatusOptions) {
  return useMemo(() => {
    const recentLogs = resolveRecentStartupLogs(logs);
    const phase = resolveStartupPhase({ running, loading, connectionStatus, connectionError });
    const latestStartupError = resolveLatestStartupError(recentLogs);
    const error = connectionError || (phase === "error" ? latestStartupError : null);

    const message =
      phase === "stopped"
        ? "启动后会在这里接入当前 Agent 的主会话。"
        : phase === "starting"
          ? "OpenClaw 服务正在启动，最近状态会显示在这里。"
          : phase === "checking"
            ? "服务已拉起，正在等待网关 RPC 就绪。"
            : phase === "connecting"
              ? "网关就绪后会自动拉取真实 Agent 列表和主会话历史。"
              : phase === "ready"
                ? "OpenClaw 已连接。"
                : "可以重试启动，或打开日志查看失败原因。";

    return {
      phase,
      message,
      logs: recentLogs,
      error,
      showPanel: phase !== "ready",
    };
  }, [connectionError, connectionStatus, loading, logs, running]);
}
