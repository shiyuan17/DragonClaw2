import type { WorkspaceHistoryItem, WorkspaceMessage } from "../../components/workspace-clone/workspaceCloneTypes";
import { formatClockTime, formatHistorySessionTime } from "./time-formatters";

export type WorkspaceTaskRunSessionStatus = "pending" | "resolved" | "skipped" | "error";

export interface WorkspaceTaskRunSession {
  key: string;
  agentId: string;
  taskId: string;
  taskName: string;
  taskDisplayTitle: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: WorkspaceTaskRunSessionStatus;
  systemMessages: WorkspaceMessage[];
  boundSessionKey: string | null;
}

export const TASK_RUN_SESSION_KEY_PREFIX = "task-run:";

export function isTaskRunSessionKey(sessionKey: string) {
  return sessionKey.startsWith(TASK_RUN_SESSION_KEY_PREFIX);
}

export function buildTaskRunSessionKey(taskId: string, createdAt: number) {
  return `${TASK_RUN_SESSION_KEY_PREFIX}${taskId}:${createdAt}`;
}

export function buildTaskRunSystemMessage(text: string, createdAt = Date.now()): WorkspaceMessage {
  return {
    id: `task-run-system:${createdAt}:${crypto.randomUUID()}`,
    role: "system",
    author: "系统",
    text,
    time: formatClockTime(createdAt),
  };
}

export function createTaskRunSession(params: {
  agentId: string;
  taskId: string;
  taskName: string;
  taskDisplayTitle: string;
  initialMessage: string;
  createdAt?: number;
}): WorkspaceTaskRunSession {
  const createdAt = params.createdAt ?? Date.now();
  return {
    key: buildTaskRunSessionKey(params.taskId, createdAt),
    agentId: params.agentId,
    taskId: params.taskId,
    taskName: params.taskName,
    taskDisplayTitle: params.taskDisplayTitle,
    title: `任务运行 · ${params.taskDisplayTitle} · ${formatClockTime(createdAt)}`,
    createdAt,
    updatedAt: createdAt,
    status: "pending",
    systemMessages: [buildTaskRunSystemMessage(params.initialMessage, createdAt)],
    boundSessionKey: null,
  };
}

export function buildTaskRunHistoryItem(
  session: WorkspaceTaskRunSession,
  currentSessionKey: string,
  boundSessionUpdatedAt?: number | null,
): WorkspaceHistoryItem {
  const updatedAt = Math.max(session.updatedAt, boundSessionUpdatedAt ?? 0);
  return {
    id: session.key,
    sessionKey: session.key,
    title: session.title,
    subtitle: session.taskDisplayTitle,
    time: formatHistorySessionTime(updatedAt),
    updatedAt,
    active: session.key === currentSessionKey,
    isMain: false,
    kind: "task-run",
    boundSessionKey: session.boundSessionKey,
  };
}

