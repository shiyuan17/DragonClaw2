import { createAgentSessionKey, filterAgentSessions } from "./client";
import type {
  WorkspaceGatewaySessionRow,
  WorkspaceGatewaySessionsListResult,
  WorkspaceHistoryItem,
  WorkspaceMessage,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { extractWorkspaceMessageAttachments } from "../../components/workspace-clone/workspaceCloneChatAttachments";
import { stripWorkspaceHiddenPromptBlocks } from "../../components/workspace-clone/workspaceCloneManualTaskExecution";
import { stripWorkspaceComposerTransportBlocks } from "../../components/workspace-clone/workspaceCloneSlashCommands";
import { isWorkspaceRawProcessEcho, sanitizeWorkspaceAssistantContent } from "../../components/workspace-clone/workspaceCloneMessageVisibility";
import { looksLikeMojibakeText, normalizeVisibleText } from "../../utils/text-mojibake";
import { formatClockTime, formatHistorySessionTime, formatRelativeSessionTime } from "./time-formatters";

const SESSION_TITLE_MAX_LENGTH = 56;
const AGENT_LAST_MESSAGE_MAX_LENGTH = 44;
const NON_MEANINGFUL_SESSION_TITLES = new Set([
  "undefined",
  "null",
  "nan",
  "[object object]",
]);
type WorkspaceSessionTitleSource = Pick<WorkspaceGatewaySessionRow, "key" | "displayName" | "label">;
export type WorkspaceSessionHistoryTitleSource = "cache" | "memory" | "persisted" | "fallback";

export function extractAgentIdFromSessionKey(sessionKey: string) {
  const match = /^agent:([^:]+):/.exec(sessionKey);
  return match?.[1] ?? null;
}

export function isRawSessionDisplayTitle(value?: string | null) {
  const normalized = value?.trim() || "";
  return !normalized || /^agent:[^:]+:/.test(normalized);
}

export function normalizeSessionTitle(value: string) {
  const normalized = normalizeVisibleText(value)
    .replace(/^[`"'+]+|[`"'+]+$/g, "")
    .trim();

  if (normalized.length <= SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SESSION_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

export function isMeaningfulSessionTitle(value: string) {
  return /[A-Za-z0-9\u4E00-\u9FFF]/.test(value);
}

export function sanitizeMeaningfulSessionTitle(value?: string | null) {
  const normalized = normalizeSessionTitle(value?.trim() || "");
  if (
    !normalized
    || isRawSessionDisplayTitle(normalized)
    || looksLikeMojibakeText(normalized)
    || NON_MEANINGFUL_SESSION_TITLES.has(normalized.toLowerCase())
    || !isMeaningfulSessionTitle(normalized)
  ) {
    return null;
  }

  return normalized;
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractTextValue).filter(Boolean).join("\n\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = value as {
    text?: unknown;
    value?: unknown;
    content?: unknown;
    input?: unknown;
    output?: unknown;
    title?: unknown;
    prompt?: unknown;
  };

  return [
    candidate.text,
    candidate.value,
    candidate.content,
    candidate.input,
    candidate.output,
    candidate.title,
    candidate.prompt,
  ]
    .map(extractTextValue)
    .find(Boolean) ?? "";
}

function extractTextFromContentBlock(block: unknown): string {
  return extractTextValue(block);
}

export function extractGatewayMessageText(message: unknown): string {
  if (typeof message === "string") {
    return stripWorkspaceComposerTransportBlocks(stripWorkspaceHiddenPromptBlocks(message));
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
    return stripWorkspaceComposerTransportBlocks(stripWorkspaceHiddenPromptBlocks(candidate.text));
  }

  if (Array.isArray(candidate.content)) {
    return stripWorkspaceComposerTransportBlocks(stripWorkspaceHiddenPromptBlocks(candidate.content.map(extractTextFromContentBlock).filter(Boolean).join("\n\n")));
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
    timestamp?: unknown;
    sessionKey?: unknown;
  };

  const role =
    typeof message.role === "string" &&
    ["assistant", "user", "system", "tool"].includes(message.role)
      ? (message.role as WorkspaceMessage["role"])
      : "assistant";
  const assistantContent = role === "assistant" ? sanitizeWorkspaceAssistantContent(message) : null;
  const text = (assistantContent?.text ?? extractGatewayMessageText(message)).trim();
  const attachments = extractWorkspaceMessageAttachments(message);

  if ((!text && attachments.length === 0) || role === "tool") {
    return null;
  }

  if (role === "assistant" && (assistantContent?.shouldHide || isWorkspaceRawProcessEcho(text))) {
    return null;
  }

  const sessionKey = typeof message.sessionKey === "string" ? message.sessionKey : null;
  const author =
    role === "assistant"
      ? resolveAssistantAuthor(sessionKey)
      : role === "user"
        ? "\u4f60"
        : "\u7cfb\u7edf";
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : null;

  return {
    id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
    role,
    author,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
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

    const normalized = sanitizeMeaningfulSessionTitle(extractGatewayMessageText(rawMessage));
    if (normalized) {
      return normalized;
    }
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

    const text =
      message.role === "assistant"
        ? sanitizeWorkspaceAssistantContent(rawMessage).text.trim()
        : extractGatewayMessageText(rawMessage).trim();
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

export function getSessionGenericTitle(sessionKey: string) {
  return sessionKey.endsWith(":main") ? "\u4e3b\u4f1a\u8bdd" : "\u5386\u53f2\u4f1a\u8bdd";
}

export function isSessionGenericTitle(title: string, sessionKey: string) {
  return title === getSessionGenericTitle(sessionKey);
}

export function hasStableMeaningfulSessionTitle(sessionKey: string, value?: string | null) {
  const normalized = sanitizeMeaningfulSessionTitle(value);
  return Boolean(normalized && !isSessionGenericTitle(normalized, sessionKey));
}

export function shouldReplaceSessionHistoryTitle(
  sessionKey: string,
  currentTitle?: string | null,
  nextTitle?: string | null,
) {
  const normalizedNextTitle = sanitizeMeaningfulSessionTitle(nextTitle);
  if (!normalizedNextTitle) {
    return false;
  }

  return !hasStableMeaningfulSessionTitle(sessionKey, currentTitle);
}

export function resolveSessionFallbackTitle(session: WorkspaceSessionTitleSource) {
  const candidates = [session.displayName, session.label];

  for (const candidate of candidates) {
    const normalized = sanitizeMeaningfulSessionTitle(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return getSessionGenericTitle(session.key);
}

export function resolveSessionHistoryTitle(
  session: WorkspaceSessionTitleSource,
  params?: {
    cachedTitle?: string | null;
    memoryMessages?: unknown[];
    persistedMessages?: unknown[];
  },
) {
  return resolveSessionHistoryTitleDetails(session, params).title;
}

export function resolveSessionHistoryTitleDetails(
  session: WorkspaceSessionTitleSource,
  params?: {
    cachedTitle?: string | null;
    memoryMessages?: unknown[];
    persistedMessages?: unknown[];
  },
): { title: string; source: WorkspaceSessionHistoryTitleSource } {
  const cachedTitle = sanitizeMeaningfulSessionTitle(params?.cachedTitle);
  if (cachedTitle && !isSessionGenericTitle(cachedTitle, session.key)) {
    return { title: cachedTitle, source: "cache" };
  }

  if (params?.memoryMessages?.length) {
    const memoryTitle = extractFirstMeaningfulSessionTitle(params.memoryMessages);
    if (memoryTitle) {
      return { title: memoryTitle, source: "memory" };
    }
  }

  if (params?.persistedMessages?.length) {
    const persistedTitle = extractFirstMeaningfulSessionTitle(params.persistedMessages);
    if (persistedTitle) {
      return { title: persistedTitle, source: "persisted" };
    }
  }

  return {
    title: resolveSessionFallbackTitle(session),
    source: "fallback",
  };
}

export function resolveStableSessionHistoryTitleDetails(
  session: WorkspaceSessionTitleSource,
  params?: {
    currentTitle?: string | null;
    cachedTitle?: string | null;
    memoryMessages?: unknown[];
    persistedMessages?: unknown[];
  },
): { title: string; source: WorkspaceSessionHistoryTitleSource } {
  const currentTitle = sanitizeMeaningfulSessionTitle(params?.currentTitle);
  if (currentTitle && !isSessionGenericTitle(currentTitle, session.key)) {
    return { title: currentTitle, source: "cache" };
  }

  return resolveSessionHistoryTitleDetails(session, params);
}

export function buildSessionHistorySubtitle(session: WorkspaceGatewaySessionRow) {
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");
  if (modelLabel) {
    return modelLabel;
  }

  return session.key.endsWith(":main") ? "\u9ed8\u8ba4\u4f1a\u8bdd" : "\u5386\u53f2\u4f1a\u8bdd";
}

export function buildSessionHistoryItem(
  session: WorkspaceGatewaySessionRow,
  params: {
    cachedTitle?: string | null;
    memoryMessages?: unknown[];
    persistedMessages?: unknown[];
    currentSessionKey: string;
  },
): WorkspaceHistoryItem {
  const resolvedTitle = resolveSessionHistoryTitleDetails(session, {
    cachedTitle: params.cachedTitle,
    memoryMessages: params.memoryMessages,
    persistedMessages: params.persistedMessages,
  });

  return {
    id: session.key,
    sessionKey: session.key,
    updatedAt: session.updatedAt,
    active: session.key === params.currentSessionKey,
    isMain: session.key.endsWith(":main"),
    kind: "gateway",
    title: resolvedTitle.title,
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
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");

  return {
    id: session.key,
    title: resolveSessionFallbackTitle(session),
    subtitle: modelLabel || session.key,
    time: formatRelativeSessionTime(session.updatedAt),
  };
}

void buildLegacySessionHistoryItem;
