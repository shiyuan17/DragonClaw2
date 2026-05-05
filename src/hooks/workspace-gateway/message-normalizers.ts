import { createAgentSessionKey, filterAgentSessions } from "./client";
import type { WorkspaceGatewaySessionRow, WorkspaceGatewaySessionsListResult, WorkspaceHistoryItem, WorkspaceMessage } from "../../components/workspace-clone/workspaceCloneTypes";
import { isWorkspaceRawProcessEcho } from "../../components/workspace-clone/workspaceCloneMessageVisibility";
import { formatClockTime, formatHistorySessionTime, formatRelativeSessionTime } from "./time-formatters";

const SESSION_TITLE_MAX_LENGTH = 56;
const AGENT_LAST_MESSAGE_MAX_LENGTH = 44;

export function extractAgentIdFromSessionKey(sessionKey: string) {
  const match = /^agent:([^:]+):/.exec(sessionKey);
  return match?.[1] ?? null;
}

export function isRawSessionDisplayTitle(value?: string | null) {
  const normalized = value?.trim() || "";
  return !normalized || /^agent:[^:]+:/.test(normalized);
}

export function normalizeSessionTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
    .trim();

  if (normalized.length <= SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

export function isMeaningfulSessionTitle(value: string) {
  return /[A-Za-z0-9\u4E00-\u9FFF]/.test(value);
}

function extractTextFromContentBlock(block: unknown): string {
  if (typeof block === "string") {
    return block;
  }

  if (!block || typeof block !== "object") {
    return "";
  }

  const candidate = block as {
    type?: unknown;
    text?: unknown;
    content?: unknown;
    input?: unknown;
    output?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  if (typeof candidate.content === "string") {
    return candidate.content;
  }

  if (typeof candidate.input === "string") {
    return candidate.input;
  }

  if (typeof candidate.output === "string") {
    return candidate.output;
  }

  return "";
}

export function extractGatewayMessageText(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (!message || typeof message !== "object") {
    return "";
  }

  const candidate = message as {
    text?: unknown;
    content?: unknown;
    message?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content.map(extractTextFromContentBlock).filter(Boolean).join("\n\n");
  }

  if (candidate.message) {
    return extractGatewayMessageText(candidate.message);
  }

  return "";
}

export function normalizeGatewayMessage(
  raw: unknown,
  resolveAssistantAuthor: (sessionKey?: string | null) => string,
): WorkspaceMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const message = raw as {
    id?: unknown;
    role?: unknown;
    content?: unknown;
    timestamp?: unknown;
    sessionKey?: unknown;
  };

  const role =
    typeof message.role === "string" &&
    ["assistant", "user", "system", "tool"].includes(message.role)
      ? (message.role as WorkspaceMessage["role"])
      : "assistant";
  const text = extractGatewayMessageText(message).trim();

  if (!text) {
    return null;
  }

  if (role === "tool") {
    return null;
  }

  if (role === "assistant" && isWorkspaceRawProcessEcho(text)) {
    return null;
  }

  const sessionKey = typeof message.sessionKey === "string" ? message.sessionKey : null;
  const author =
    role === "assistant"
      ? resolveAssistantAuthor(sessionKey)
      : role === "user"
        ? "你"
        : "系统";

  const timestamp = typeof message.timestamp === "number" ? message.timestamp : null;

  return {
    id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
    role,
    author,
    text,
    time: formatClockTime(timestamp),
  };
}

export function extractFirstMeaningfulSessionTitle(messages: unknown[]) {
  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") {
      continue;
    }

    const message = rawMessage as { role?: unknown };
    if (message.role !== "user") {
      continue;
    }

    const normalized = normalizeSessionTitle(extractGatewayMessageText(rawMessage));
    if (!normalized || !isMeaningfulSessionTitle(normalized)) {
      continue;
    }

    return normalized;
  }

  return null;
}

function normalizeAgentLastMessage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= AGENT_LAST_MESSAGE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, AGENT_LAST_MESSAGE_MAX_LENGTH - 1).trimEnd()}...`;
}

export function extractLastMeaningfulMessageSummary(messages: unknown[]) {
  for (const rawMessage of [...messages].reverse()) {
    if (!rawMessage || typeof rawMessage !== "object") {
      continue;
    }

    const message = rawMessage as { role?: unknown };
    if (message.role === "tool") {
      continue;
    }

    const text = extractGatewayMessageText(rawMessage).trim();
    if (!text || isWorkspaceRawProcessEcho(text)) {
      continue;
    }

    const normalized = normalizeAgentLastMessage(text);
    if (normalized && isMeaningfulSessionTitle(normalized)) {
      return normalized;
    }
  }

  return null;
}

export function resolveSessionFallbackTitle(session: WorkspaceGatewaySessionRow) {
  const candidates = [session.displayName, session.label];

  for (const candidate of candidates) {
    const normalized = normalizeSessionTitle(candidate?.trim() || "");
    if (!normalized || isRawSessionDisplayTitle(normalized) || !isMeaningfulSessionTitle(normalized)) {
      continue;
    }

    return normalized;
  }

  if (session.key.endsWith(":main")) {
    return "主会话";
  }

  return session.key;
}

export function buildSessionHistorySubtitle(session: WorkspaceGatewaySessionRow) {
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");
  if (modelLabel) {
    return modelLabel;
  }

  return session.key.endsWith(":main") ? "默认会话" : "历史会话";
}

export function buildSessionHistoryItem(
  session: WorkspaceGatewaySessionRow,
  params: {
    cachedTitle?: string;
    currentSessionKey: string;
  },
): WorkspaceHistoryItem {
  return {
    id: session.key,
    sessionKey: session.key,
    updatedAt: session.updatedAt,
    active: session.key === params.currentSessionKey,
    isMain: session.key.endsWith(":main"),
    title: params.cachedTitle || resolveSessionFallbackTitle(session),
    subtitle: buildSessionHistorySubtitle(session),
    time: formatHistorySessionTime(session.updatedAt),
  };
}

export function resolveAgentSessionKey(
  result: WorkspaceGatewaySessionsListResult | null,
  agentId: string,
  preferredSessionKey?: string | null,
) {
  const sessions = filterAgentSessions(result, agentId);
  if (preferredSessionKey && sessions.some((session) => session.key === preferredSessionKey)) {
    return preferredSessionKey;
  }

  const mainKey = createAgentSessionKey(agentId);
  if (sessions.some((session) => session.key === mainKey)) {
    return mainKey;
  }

  return sessions[0]?.key ?? mainKey;
}

export function buildLegacySessionHistoryItem(session: WorkspaceGatewaySessionRow): WorkspaceHistoryItem {
  const title =
    session.displayName?.trim() ||
    session.label?.trim() ||
    (session.key.endsWith(":main") ? "主会话" : session.key);
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");

  return {
    id: session.key,
    title,
    subtitle: modelLabel || session.key,
    time: formatRelativeSessionTime(session.updatedAt),
  };
}

void buildLegacySessionHistoryItem;
