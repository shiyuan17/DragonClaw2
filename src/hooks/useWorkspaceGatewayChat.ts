import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WorkspaceGatewayClient,
  buildGatewayUrl,
  createAgentSessionKey,
  filterAgentSessions,
  findMainAgentSession,
  formatAgentAvatar,
  isAgentsListResult,
  isChatEventPayload,
  isSessionsListResult,
} from "../components/workspace-clone/workspaceCloneGateway";
import type {
  WorkspaceChatSessionCacheRow,
  WorkspaceChatSessionCacheSummary,
  WorkspaceGatewayAgentsListResult,
  WorkspaceGatewaySessionRow,
  WorkspaceGatewaySessionsListResult,
  WorkspaceGatewayStatus,
  WorkspaceHistoryItem,
  WorkspaceLiveStep,
  WorkspaceLiveStepKind,
  WorkspaceLiveStepStatus,
  WorkspaceActiveSlashCommand,
  WorkspaceMessage,
} from "../components/workspace-clone/workspaceCloneTypes";
import { buildWorkspaceSlashCommandTransportMessage } from "../components/workspace-clone/workspaceCloneSlashCommands";

interface UseWorkspaceGatewayChatOptions {
  running: boolean;
  servicePort: number;
  gatewayToken?: string | null;
}

interface ChatHistoryPayload {
  messages?: unknown[];
}

const SESSION_TITLE_MAX_LENGTH = 56;
const INITIAL_HISTORY_LIMIT = 50;
const SESSION_CACHE_KEEP_LIMIT = 20;

function parseCachedMessagesJson(messagesJson?: string | null) {
  if (!messagesJson?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeCachedMessages(messages: unknown[]) {
  try {
    return JSON.stringify(messages);
  } catch {
    return "[]";
  }
}

function sortSessionsByUpdatedAt(sessions: WorkspaceGatewaySessionRow[]) {
  return [...sessions].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

function formatClockTime(timestamp?: number | null) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeSessionTime(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const dayLabel = sameDay
    ? "今天"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(date);

  return `${dayLabel} ${formatClockTime(timestamp)}`;
}

function formatHistorySessionTime(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function extractAgentIdFromSessionKey(sessionKey: string) {
  const match = /^agent:([^:]+):/.exec(sessionKey);
  return match?.[1] ?? null;
}

function isRawSessionDisplayTitle(value?: string | null) {
  const normalized = value?.trim() || "";
  return !normalized || /^agent:[^:]+:/.test(normalized);
}

function normalizeSessionTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
    .trim();

  if (normalized.length <= SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

function isMeaningfulSessionTitle(value: string) {
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

function extractGatewayMessageText(message: unknown): string {
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

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function looksLikeProcessPayloadJson(text: string) {
  const parsed = tryParseJsonRecord(text);
  if (!parsed) {
    return false;
  }

  const keys = new Set(Object.keys(parsed));
  const processSignals = [
    "results",
    "externalContent",
    "toolMs",
    "provider",
    "siteName",
    "snippet",
    "toolCallId",
    "itemId",
    "approvalId",
    "cwd",
    "stdout",
    "stderr",
    "exitCode",
  ];
  const userFacingSignals = [
    "answer",
    "reply",
    "final",
    "summary",
    "markdown",
    "content",
  ];

  const processSignalCount = processSignals.filter((key) => keys.has(key)).length;
  const hasUserFacingSignal = userFacingSignals.some((key) => keys.has(key));

  return processSignalCount >= 2 && !hasUserFacingSignal;
}

function normalizeGatewayMessage(
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

  if (role === "assistant" && looksLikeProcessPayloadJson(text)) {
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

function extractFirstMeaningfulSessionTitle(messages: unknown[]) {
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

function resolveSessionFallbackTitle(session: WorkspaceGatewaySessionRow) {
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

function buildSessionHistorySubtitle(session: WorkspaceGatewaySessionRow) {
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");
  if (modelLabel) {
    return modelLabel;
  }

  return session.key.endsWith(":main") ? "默认会话" : "历史会话";
}

function buildSessionHistoryItem(
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

function resolveAgentSessionKey(
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

function buildLegacySessionHistoryItem(session: WorkspaceGatewaySessionRow): WorkspaceHistoryItem {
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

type WorkspaceGatewayAgentEventPayload = {
  runId?: unknown;
  sessionKey?: unknown;
  stream?: unknown;
  ts?: unknown;
  data?: unknown;
};

const LIVE_STEP_LIMIT = 12;
const POST_TOOL_THINKING_STEP_SUFFIX = "post-tool-thinking";
const LIVE_STEP_DEDUPE_WINDOW_MS = 1500;

type WorkspaceLiveStepEventSource = "agent" | "session.tool";

interface WorkspaceLiveStepDedupeEntry {
  source: WorkspaceLiveStepEventSource;
  timestampMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function toFiniteTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPostToolThinkingStepId(runId: string) {
  return `${runId}:${POST_TOOL_THINKING_STEP_SUFFIX}`;
}

function isTerminalLiveStepStatus(status: WorkspaceLiveStepStatus) {
  return status === "success" || status === "error" || status === "aborted";
}

function extractLiveStepStableId(data: Record<string, unknown>) {
  return firstNonEmptyString(data.itemId, data.toolCallId, data.tool_call_id, data.id);
}

function normalizeLiveStepSignaturePart(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function truncateInlineText(value: string, maxLength = 120) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveLiveStepKind(kind: string, title: string): WorkspaceLiveStepKind {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "skill") {
    return "skill";
  }
  if (normalized === "command") {
    return "command";
  }
  if (normalized === "command_output") {
    return "command";
  }
  if (normalized === "search") {
    return "search";
  }
  if (normalized === "analysis") {
    return "thinking";
  }
  if (normalized === "patch") {
    return "patch";
  }
  if (normalized === "plan") {
    return "plan";
  }
  if (normalized === "approval") {
    return "approval";
  }
  if (normalized === "tool") {
    return title.includes("技能") ? "skill" : "tool";
  }
  return "other";
}

function resolveLiveStepStatus(params: {
  phase?: string;
  status?: string;
  isError?: boolean;
}): WorkspaceLiveStepStatus {
  const phase = params.phase?.trim().toLowerCase() ?? "";
  const status = params.status?.trim().toLowerCase() ?? "";

  if (params.isError || phase === "error" || status === "error" || status === "failed" || status === "denied") {
    return "error";
  }
  if (phase === "end" || phase === "result" || phase === "final" || status === "completed" || status === "approved" || status === "success") {
    return "success";
  }
  if (phase === "aborted" || status === "aborted") {
    return "aborted";
  }
  if (phase === "start" || phase === "update" || phase === "delta" || status === "running" || status === "pending") {
    return "running";
  }
  return "pending";
}

function extractCommandSnippet(data: Record<string, unknown>) {
  const args = isRecord(data.args) ? data.args : {};
  const command = firstNonEmptyString(
    data.command,
    args.command,
    data.cmd,
    data.script,
    data.line,
    data.title,
  );
  if (!command) {
    return "";
  }
  return truncateInlineText(command.split("\n", 1)[0] ?? command, 128);
}

function extractLiveStepDetail(data: Record<string, unknown>) {
  const detail = firstNonEmptyString(
    data.summary,
    data.detail,
    data.message,
    data.progressText,
    data.meta,
    data.title,
  );
  return detail ? truncateInlineText(detail, 160) : "";
}

function isCommandLikeTool(data: Record<string, unknown>) {
  const name = firstNonEmptyString(data.name, data.toolName).toLowerCase();
  return Boolean(extractCommandSnippet(data)) || ["exec", "shell", "terminal", "command"].includes(name);
}

function buildLiveStepTitle(params: {
  kind: WorkspaceLiveStepKind;
  data: Record<string, unknown>;
}) {
  const { kind, data } = params;
  if (kind === "thinking") {
    return firstNonEmptyString(data.title, data.message, data.summary, "思考中");
  }
  if (kind === "skill") {
    return firstNonEmptyString(data.name, data.skillName, data.title, "技能");
  }
  if (kind === "tool") {
    return firstNonEmptyString(data.name, data.toolName, data.title, "工具");
  }
  if (kind === "command") {
    return extractCommandSnippet(data) || firstNonEmptyString(data.name, data.title, "命令");
  }
  return firstNonEmptyString(data.title, data.name, data.toolName, data.kind, "步骤");
}

function buildLiveStepDetail(params: {
  kind: WorkspaceLiveStepKind;
  data: Record<string, unknown>;
}) {
  const { kind, data } = params;
  if (kind === "thinking") {
    return "";
  }
  if (kind === "command") {
    const detail = firstNonEmptyString(data.summary, data.detail, data.progressText);
    return detail ? truncateInlineText(detail, 160) : "";
  }
  return extractLiveStepDetail(data);
}

function getLiveStepId(payload: WorkspaceGatewayAgentEventPayload, fallback: string) {
  const data = isRecord(payload.data) ? payload.data : null;
  if (data) {
    const fromData = firstNonEmptyString(data.itemId, data.toolCallId, data.tool_call_id, data.id);
    if (fromData) {
      return fromData;
    }
    if (typeof data.name === "string" && data.name.trim()) {
      return `${fallback}:${data.name.trim()}`;
    }
  }

  const stream = toStringValue(payload.stream, "step");
  return `${fallback}:${stream}`;
}

function buildLiveStepFromAgentEvent(
  payload: WorkspaceGatewayAgentEventPayload,
  fallbackRunId: string,
): WorkspaceLiveStep | null {
  const stream = toStringValue(payload.stream);
  const data = isRecord(payload.data) ? payload.data : {};
  const timestamp = toFiniteTimestamp(payload.ts) ?? Date.now();
  const time = formatClockTime(timestamp);

  if (stream === "lifecycle" || stream === "thinking") {
    const phase = toStringValue(data.phase);
    const status = resolveLiveStepStatus({
      phase,
      status: toStringValue(data.status),
      isError: data.isError === true,
    });
    return {
      id: `${fallbackRunId}:thinking`,
      kind: "thinking",
      status,
      title: buildLiveStepTitle({ kind: "thinking", data }),
      detail: buildLiveStepDetail({ kind: "thinking", data }) || undefined,
      time,
    };
  }

  if (stream === "tool") {
    const phase = toStringValue(data.phase);
    const title = firstNonEmptyString(data.name, data.toolName, data.title, "工具");
    const kind = isCommandLikeTool(data) ? "command" : resolveLiveStepKind("tool", title);
    const status = resolveLiveStepStatus({
      phase,
      status: toStringValue(data.status),
      isError: data.isError === true,
    });
    return {
      id: getLiveStepId(payload, fallbackRunId),
      kind,
      status,
      title: buildLiveStepTitle({ kind, data }),
      detail: buildLiveStepDetail({ kind, data }) || undefined,
      time,
    };
  }

  if (stream === "item" || stream === "command_output" || stream === "plan" || stream === "approval" || stream === "patch") {
    const kind = resolveLiveStepKind(
      firstNonEmptyString(data.kind, stream === "command_output" ? "command" : stream),
      firstNonEmptyString(data.title, data.name, data.toolName, stream),
    );
    const status = resolveLiveStepStatus({
      phase: toStringValue(data.phase),
      status: firstNonEmptyString(data.status, data.state, stream === "command_output" ? "running" : ""),
      isError: data.error !== undefined || data.isError === true,
    });
    return {
      id: getLiveStepId(payload, fallbackRunId),
      kind,
      status,
      title: buildLiveStepTitle({ kind, data }),
      detail: buildLiveStepDetail({ kind, data }) || undefined,
      time,
    };
  }

  return null;
}

function updateLiveStepList(
  current: WorkspaceLiveStep[],
  nextStep: WorkspaceLiveStep,
): WorkspaceLiveStep[] {
  const base =
    nextStep.kind === "thinking"
      ? current
      : current.filter((step) => step.kind !== "thinking" || (step.status !== "running" && step.status !== "pending"));
  const index = base.findIndex((step) => step.id === nextStep.id);
  const next = [...base];
  if (index === -1) {
    next.push(nextStep);
  } else {
    next[index] = { ...next[index], ...nextStep };
  }
  return next.slice(-LIVE_STEP_LIMIT);
}

function buildPostToolThinkingStep(runId: string, timestamp?: number | null): WorkspaceLiveStep {
  return {
    id: getPostToolThinkingStepId(runId),
    kind: "thinking",
    status: "running",
    title: "思考中",
    time: formatClockTime(timestamp ?? Date.now()),
  };
}

function buildLiveStepDedupeKey(params: {
  step: WorkspaceLiveStep;
  payload: WorkspaceGatewayAgentEventPayload;
  runId: string;
}) {
  const { step, payload, runId } = params;
  const data = isRecord(payload.data) ? payload.data : {};
  const stableId = extractLiveStepStableId(data);
  if (stableId) {
    return `stable:${normalizeLiveStepSignaturePart(stableId)}`;
  }

  const sessionScope = toStringValue(payload.sessionKey) || runId;
  return [
    "mirror",
    step.kind,
    normalizeLiveStepSignaturePart(step.title),
    normalizeLiveStepSignaturePart(step.detail),
    step.status,
    normalizeLiveStepSignaturePart(sessionScope),
  ].join(":");
}

const MISSING_GATEWAY_TOKEN_ERROR = "本地网关 token 缺失或未同步，请检查 ~/.openclaw/openclaw.json，或重新保存 Provider 配置后再试。";

export function useWorkspaceGatewayChat({ running, servicePort, gatewayToken }: UseWorkspaceGatewayChatOptions) {
  const clientRef = useRef<WorkspaceGatewayClient | null>(null);
  const currentSessionKeyRef = useRef("");
  const currentRunIdRef = useRef<string | null>(null);
  const activeRunAliasesRef = useRef<Set<string>>(new Set());
  const liveStepDedupeRef = useRef<Map<string, WorkspaceLiveStepDedupeEntry>>(new Map());
  const historyTitleFetchesRef = useRef<Set<string>>(new Set());
  const historyLoadSeqRef = useRef(0);
  const selectedAgentIdRef = useRef("");
  const bootstrapGatewayStateRef = useRef<() => Promise<void>>(async () => {});
  const handleGatewayEventRef = useRef<(event: { event: string; payload?: unknown }) => void>(() => {});
  const hasObservedNonThinkingStepRef = useRef(false);
  const hasAssistantTextDeltaRef = useRef(false);

  const [status, setStatus] = useState<WorkspaceGatewayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentsResult, setAgentsResult] = useState<WorkspaceGatewayAgentsListResult | null>(null);
  const [sessionsResult, setSessionsResult] = useState<WorkspaceGatewaySessionsListResult | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [historyTitleCache, setHistoryTitleCache] = useState<Record<string, string>>({});
  const [sessionHistoryCache, setSessionHistoryCache] = useState<Record<string, unknown[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkspaceMessage | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<WorkspaceLiveStep[]>([]);

  const connected = status === "connected";
  const agents = agentsResult?.agents ?? [];
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const currentSessionKey = selectedSessionKey || (selectedAgentId ? createAgentSessionKey(selectedAgentId) : "");
  const normalizedGatewayToken = gatewayToken?.trim() || "";
  const sessionHistoryCacheRef = useRef<Record<string, unknown[]>>({});

  const resolveAssistantAuthor = useCallback(
    (sessionKey?: string | null) => {
      if (sessionKey) {
        const agentId = extractAgentIdFromSessionKey(sessionKey);
        const match = agentId ? agents.find((agent) => agent.id === agentId) : null;
        if (match) {
          return formatAgentAvatar(match);
        }
      }

      return selectedAgent ? formatAgentAvatar(selectedAgent) : "A";
    },
    [agents, selectedAgent],
  );

  const applyLiveStep = useCallback(
    (
      step: WorkspaceLiveStep,
      options?: {
        insertPostToolThinking?: boolean;
        bridgeRunId?: string;
        bridgeTimestamp?: number | null;
      },
    ) => {
      setLiveSteps((current) => {
        const next = updateLiveStepList(current, step);
        if (
          !options?.insertPostToolThinking ||
          !options.bridgeRunId ||
          hasAssistantTextDeltaRef.current ||
          !hasObservedNonThinkingStepRef.current
        ) {
          return next;
        }

        return updateLiveStepList(
          next,
          buildPostToolThinkingStep(options.bridgeRunId, options.bridgeTimestamp),
        );
      });
    },
    [],
  );

  const removeTransientThinkingBridge = useCallback((runId?: string | null) => {
    if (!runId) {
      return;
    }

    const bridgeStepId = getPostToolThinkingStepId(runId);
    setLiveSteps((current) => current.filter((step) => step.id !== bridgeStepId));
  }, []);

  const shouldSkipMirroredLiveStep = useCallback(
    (params: {
      step: WorkspaceLiveStep;
      payload: WorkspaceGatewayAgentEventPayload;
      source: WorkspaceLiveStepEventSource;
      runId: string;
      timestampMs: number;
    }) => {
      if (params.step.kind === "thinking") {
        return false;
      }

      const data = isRecord(params.payload.data) ? params.payload.data : {};
      const stableId = extractLiveStepStableId(data);
      if (stableId) {
        liveStepDedupeRef.current.set(`stable:${normalizeLiveStepSignaturePart(stableId)}`, {
          source: params.source,
          timestampMs: params.timestampMs,
        });
        return false;
      }

      const dedupeKey = buildLiveStepDedupeKey({
        step: params.step,
        payload: params.payload,
        runId: params.runId,
      });
      const previous = liveStepDedupeRef.current.get(dedupeKey);

      if (
        previous &&
        previous.source !== params.source &&
        Math.abs(params.timestampMs - previous.timestampMs) <= LIVE_STEP_DEDUPE_WINDOW_MS
      ) {
        return true;
      }

      liveStepDedupeRef.current.set(dedupeKey, {
        source: params.source,
        timestampMs: params.timestampMs,
      });
      return false;
    },
    [],
  );

  const finishLiveSteps = useCallback((status: WorkspaceLiveStepStatus) => {
    setLiveSteps((current) =>
      current.map((step) =>
        step.status === "running" || step.status === "pending"
          ? { ...step, status }
          : step,
      ),
    );
  }, []);

  useEffect(() => {
    currentSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  useEffect(() => {
    currentRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

  useEffect(() => {
    sessionHistoryCacheRef.current = sessionHistoryCache;
  }, [sessionHistoryCache]);

  const clearActiveRunRefs = useCallback(() => {
    currentRunIdRef.current = null;
    activeRunAliasesRef.current.clear();
    liveStepDedupeRef.current.clear();
    hasObservedNonThinkingStepRef.current = false;
    hasAssistantTextDeltaRef.current = false;
  }, []);

  const updateSessionHistoryCache = useCallback((sessionKey: string, messages: unknown[]) => {
    if (!sessionKey) {
      return;
    }

    setSessionHistoryCache((current) => {
      const previous = current[sessionKey];
      if (previous === messages) {
        return current;
      }

      return {
        ...current,
        [sessionKey]: messages,
      };
    });
  }, []);

  const saveSessionHistoryCache = useCallback(
    async (
      sessionKey: string,
      agentId: string,
      messages: unknown[],
      updatedAt?: number | null,
      title?: string | null,
    ) => {
      if (!sessionKey || !agentId) {
        return;
      }

      await invoke("upsert_workspace_chat_session_cache", {
        sessionKey,
        agentId,
        updatedAt: updatedAt ?? null,
        title: title ?? null,
        messagesJson: serializeCachedMessages(messages),
      });
    },
    [],
  );

  const loadPersistedSessionHistoryCache = useCallback(
    async (sessionKey: string, agentId: string) => {
      if (!sessionKey || !agentId) {
        return null;
      }

      return invoke<WorkspaceChatSessionCacheRow | null>(
        "load_workspace_chat_session_cache",
        {
          sessionKey,
          agentId,
        },
      );
    },
    [],
  );

  const pruneSessionHistoryCache = useCallback(
    async (
      nextSessionsResult: WorkspaceGatewaySessionsListResult | null,
      pinnedSessionKey?: string | null,
    ) => {
      if (!nextSessionsResult) {
        return;
      }

      const keepSessionKeys = sortSessionsByUpdatedAt(nextSessionsResult.sessions)
        .slice(0, SESSION_CACHE_KEEP_LIMIT)
        .map((session) => session.key);

      if (pinnedSessionKey && !keepSessionKeys.includes(pinnedSessionKey)) {
        keepSessionKeys.push(pinnedSessionKey);
      }

      const normalizedKeepSessionKeys = Array.from(new Set(keepSessionKeys.filter(Boolean)));
      await invoke("prune_workspace_chat_session_cache", {
        keepSessionKeys: normalizedKeepSessionKeys,
      });

      const allowedSessionKeys = new Set(normalizedKeepSessionKeys);
      setSessionHistoryCache((current) => {
        let changed = false;
        const next: Record<string, unknown[]> = {};

        for (const [sessionKey, messages] of Object.entries(current)) {
          if (allowedSessionKeys.has(sessionKey)) {
            next[sessionKey] = messages;
            continue;
          }

          changed = true;
        }

        return changed ? next : current;
      });
    },
    [],
  );

  const isKnownActiveRunId = useCallback((runId?: string | null) => {
    if (!runId) {
      return true;
    }
    return runId === currentRunIdRef.current || activeRunAliasesRef.current.has(runId);
  }, []);

  const loadSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) {
      return null;
    }

    const payload = await client.request("sessions.list", {});
    if (!isSessionsListResult(payload)) {
      throw new Error("sessions.list 返回格式不正确");
    }

    setSessionsResult(payload);
    void pruneSessionHistoryCache(payload, currentSessionKeyRef.current).catch(() => undefined);
    return payload;
  }, [pruneSessionHistoryCache]);

  const loadSessionHistoryMessages = useCallback(
    async (sessionKey: string, limit = INITIAL_HISTORY_LIMIT) => {
      const client = clientRef.current;
      if (!client?.connected || !sessionKey) {
        return [];
      }

      const payload = await client.request<ChatHistoryPayload>("chat.history", {
        sessionKey,
        limit,
      });

      return Array.isArray(payload.messages) ? payload.messages : [];
    },
    [],
  );

  const loadHistory = useCallback(
    async (
      sessionKey: string,
      options?: {
        agentId?: string;
      },
    ) => {
      const agentId = options?.agentId || extractAgentIdFromSessionKey(sessionKey) || selectedAgentId;
      if (!sessionKey || !agentId) {
        return;
      }

      const requestId = ++historyLoadSeqRef.current;
      const memoryCachedMessages = sessionHistoryCacheRef.current[sessionKey];
      let hasAnyCache = Array.isArray(memoryCachedMessages);
      let existingCachedTitle: string | null = null;

      setHistoryLoading(false);

      if (!hasAnyCache) {
        try {
          const cachedRow = await loadPersistedSessionHistoryCache(sessionKey, agentId);
          if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
            return;
          }

          if (cachedRow) {
            const cachedMessages = parseCachedMessagesJson(cachedRow.messagesJson);
            updateSessionHistoryCache(sessionKey, cachedMessages);
            hasAnyCache = true;

            const cachedTitle = cachedRow.title?.trim();
            existingCachedTitle = cachedTitle || null;
            if (cachedTitle) {
              setHistoryTitleCache((current) => (
                current[sessionKey] === cachedTitle
                  ? current
                  : { ...current, [sessionKey]: cachedTitle }
              ));
            }
          }
        } catch {
          // Ignore local cache failures and fall back to gateway refresh.
        }
      }

      if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
        return;
      }

      if (!connected) {
        setHistoryLoading(false);
        return;
      }

      if (!hasAnyCache) {
        setHistoryLoading(true);
      }

      try {
        const messages = await loadSessionHistoryMessages(sessionKey, INITIAL_HISTORY_LIMIT);

        if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
          return;
        }

        updateSessionHistoryCache(sessionKey, messages);

        const sessionRow = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
        const nextTitle = extractFirstMeaningfulSessionTitle(messages);
        if (nextTitle) {
          setHistoryTitleCache((current) => (
            current[sessionKey] === nextTitle
              ? current
              : { ...current, [sessionKey]: nextTitle }
          ));
        }

        await saveSessionHistoryCache(
          sessionKey,
          agentId,
          messages,
          sessionRow?.updatedAt ?? null,
          nextTitle ?? existingCachedTitle,
        ).catch(() => undefined);
        setError(null);
      } catch (loadError) {
        if (!hasAnyCache && historyLoadSeqRef.current === requestId && currentSessionKeyRef.current === sessionKey) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (historyLoadSeqRef.current === requestId && currentSessionKeyRef.current === sessionKey) {
          setHistoryLoading(false);
        }
      }
    },
    [
      connected,
      loadPersistedSessionHistoryCache,
      loadSessionHistoryMessages,
      saveSessionHistoryCache,
      selectedAgentId,
      sessionsResult,
      updateSessionHistoryCache,
    ],
  );

  const bootstrapGatewayState = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) {
      return;
    }

    try {
      await client.request("sessions.subscribe", {}).catch(() => undefined);

      const [agentsPayload, sessionsPayload] = await Promise.all([
        client.request("agents.list", {}),
        client.request("sessions.list", {}),
      ]);

      if (!isAgentsListResult(agentsPayload)) {
        throw new Error("agents.list 返回格式不正确");
      }

      if (!isSessionsListResult(sessionsPayload)) {
        throw new Error("sessions.list 返回格式不正确");
      }

      setAgentsResult(agentsPayload);
      setSessionsResult(sessionsPayload);
      setError(null);

      const currentSelectedAgentId = selectedAgentIdRef.current;
      const nextAgentId =
        agentsPayload.agents.some((agent) => agent.id === currentSelectedAgentId)
          ? currentSelectedAgentId
          : agentsPayload.defaultId || agentsPayload.agents[0]?.id || "";
      const nextSessionKey = nextAgentId
        ? resolveAgentSessionKey(sessionsPayload, nextAgentId, currentSessionKeyRef.current)
        : "";

      setSelectedAgentId(nextAgentId);
      setSelectedSessionKey(nextSessionKey);
      void pruneSessionHistoryCache(sessionsPayload, nextSessionKey).catch(() => undefined);
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError));
    }
  }, [pruneSessionHistoryCache]);

  const handleGatewayEvent = useCallback(
    (event: { event: string; payload?: unknown }) => {
      if ((event.event === "agent" || event.event === "session.tool") && isRecord(event.payload)) {
        const payload = event.payload as WorkspaceGatewayAgentEventPayload;
        const eventSource = event.event as WorkspaceLiveStepEventSource;
        const payloadSessionKey = toStringValue(payload.sessionKey);
        const payloadRunId = toStringValue(payload.runId);
        const currentRunId = currentRunIdRef.current;
        const activeAliases = activeRunAliasesRef.current;

        if (!currentRunId) {
          return;
        }

        if (payloadSessionKey && payloadSessionKey !== currentSessionKeyRef.current) {
          return;
        }

        if (!payloadSessionKey && payloadRunId && payloadRunId !== currentRunId && !activeAliases.has(payloadRunId)) {
          return;
        }

        if (payloadRunId) {
          activeAliases.add(payloadRunId);
        }

        const step = buildLiveStepFromAgentEvent(payload, payloadRunId || currentRunId || "run");
        if (step) {
          const timestampMs = toFiniteTimestamp(payload.ts) ?? Date.now();
          const dedupeRunId = currentRunId || payloadRunId || "run";
          if (
            shouldSkipMirroredLiveStep({
              step,
              payload,
              source: eventSource,
              runId: dedupeRunId,
              timestampMs,
            })
          ) {
            return;
          }

          if (step.kind !== "thinking") {
            hasObservedNonThinkingStepRef.current = true;
          }

          applyLiveStep(step, {
            insertPostToolThinking: step.kind !== "thinking" && isTerminalLiveStepStatus(step.status),
            bridgeRunId: dedupeRunId,
            bridgeTimestamp: timestampMs,
          });
        }
        return;
      }

      if (event.event !== "chat" || !isChatEventPayload(event.payload)) {
        return;
      }

      const payload = event.payload;
      const isCurrentSession = payload.sessionKey === currentSessionKeyRef.current;
      const isCurrentRun = isKnownActiveRunId(payload.runId);

      if (!isCurrentSession) {
        if (payload.state === "final") {
          void loadSessions();
        }
        return;
      }

      if (payload.state === "delta" && isCurrentRun) {
        const nextText = extractGatewayMessageText(payload.message).trim();
        if (nextText && !hasAssistantTextDeltaRef.current) {
          hasAssistantTextDeltaRef.current = true;
          removeTransientThinkingBridge(currentRunIdRef.current);
        }
        setStreamText((current) => {
          if (!nextText) {
            return current;
          }
          if (!current || nextText.length >= current.length) {
            return nextText;
          }
          return current;
        });
        return;
      }

      if (payload.state === "error" && isCurrentRun) {
        finishLiveSteps("error");
        setError(payload.errorMessage ?? "聊天生成失败");
      }

      if (payload.state === "aborted" && isCurrentRun) {
        finishLiveSteps("aborted");
      }

      if (payload.state === "final" || (payload.state !== "delta" && isCurrentRun)) {
        if (isCurrentRun) {
          removeTransientThinkingBridge(currentRunIdRef.current);
          setActiveRunId(null);
          setPendingUserMessage(null);
          setStreamText(null);
          clearActiveRunRefs();
          if (payload.state === "final") {
            setLiveSteps([]);
          }
        }
        void loadSessions();
        void loadHistory(currentSessionKeyRef.current, { agentId: extractAgentIdFromSessionKey(currentSessionKeyRef.current) || selectedAgentId });
      }
    },
    [applyLiveStep, clearActiveRunRefs, finishLiveSteps, isKnownActiveRunId, loadHistory, loadSessions, removeTransientThinkingBridge, selectedAgentId, shouldSkipMirroredLiveStep],
  );

  useEffect(() => {
    bootstrapGatewayStateRef.current = bootstrapGatewayState;
  }, [bootstrapGatewayState]);

  useEffect(() => {
    handleGatewayEventRef.current = handleGatewayEvent;
  }, [handleGatewayEvent]);

  useEffect(() => {
    const resetGatewayState = (nextStatus: WorkspaceGatewayStatus, nextError: string | null) => {
      clientRef.current?.stop();
      clientRef.current = null;
      setStatus(nextStatus);
      setError(nextError);
      setAgentsResult(null);
      setSessionsResult(null);
      setSelectedAgentId("");
      setSelectedSessionKey("");
      setSessionHistoryCache({});
      setHistoryLoading(false);
      setSending(false);
      setResettingSession(false);
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
    };

    if (!running || !servicePort) {
      resetGatewayState("idle", null);
      return;
    }

    if (!normalizedGatewayToken) {
      resetGatewayState("error", MISSING_GATEWAY_TOKEN_ERROR);
      return;
    }

    const client = new WorkspaceGatewayClient({
      url: buildGatewayUrl(servicePort),
      token: normalizedGatewayToken,
      onConnecting: () => {
        setStatus("connecting");
      },
      onConnected: () => {
        setStatus("connected");
        void bootstrapGatewayStateRef.current();
      },
      onEvent: (event) => {
        handleGatewayEventRef.current(event);
      },
      onDisconnected: (message) => {
        setStatus("error");
        setError(message ?? "首页聊天连接已断开");
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      client.stop();
    };
  }, [clearActiveRunRefs, normalizedGatewayToken, running, servicePort]);

  useEffect(() => {
    if (!connected || !currentSessionKey) {
      return;
    }

    setPendingUserMessage(null);
    setStreamText(null);
    setActiveRunId(null);
    clearActiveRunRefs();
    setLiveSteps([]);
    void loadHistory(currentSessionKey, { agentId: selectedAgentId });
  }, [clearActiveRunRefs, connected, currentSessionKey, loadHistory, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      if (selectedSessionKey) {
        setSelectedSessionKey("");
      }
      return;
    }

    const nextSessionKey = resolveAgentSessionKey(sessionsResult, selectedAgentId, selectedSessionKey);
    if (nextSessionKey && nextSessionKey !== selectedSessionKey) {
      setSelectedSessionKey(nextSessionKey);
    }
  }, [selectedAgentId, selectedSessionKey, sessionsResult]);

  useEffect(() => {
    if (!sessionsResult) {
      return;
    }

    const validSessionKeys = new Set(sessionsResult.sessions.map((session) => session.key));
    void pruneSessionHistoryCache(sessionsResult, currentSessionKeyRef.current).catch(() => undefined);
    setHistoryTitleCache((current) => {
      let changed = false;
      const next: Record<string, string> = {};

      for (const [sessionKey, title] of Object.entries(current)) {
        if (validSessionKeys.has(sessionKey)) {
          next[sessionKey] = title;
          continue;
        }

        changed = true;
      }

      return changed ? next : current;
    });

    historyTitleFetchesRef.current.forEach((sessionKey) => {
      if (!validSessionKeys.has(sessionKey)) {
        historyTitleFetchesRef.current.delete(sessionKey);
      }
    });
  }, [pruneSessionHistoryCache, sessionsResult]);

  const loadHistoryTitles = useCallback(() => {
    if (!selectedAgentId) {
      return;
    }

    void (async () => {
      const cachedRows = await invoke<WorkspaceChatSessionCacheSummary[]>("list_workspace_chat_session_cache", {
        agentId: selectedAgentId,
      }).catch(() => []);
      const cachedTitleKeys = new Set<string>();

      setHistoryTitleCache((current) => {
        let changed = false;
        const next = { ...current };

        cachedRows.forEach((row) => {
          const cachedTitle = row.title?.trim();
          if (!cachedTitle) {
            return;
          }

          cachedTitleKeys.add(row.sessionKey);
          if (next[row.sessionKey] === cachedTitle) {
            return;
          }

          next[row.sessionKey] = cachedTitle;
          changed = true;
        });

        return changed ? next : current;
      });

      if (!connected) {
        return;
      }

      const sessions = sortSessionsByUpdatedAt(filterAgentSessions(sessionsResult, selectedAgentId));

      sessions.forEach((session) => {
        if (cachedTitleKeys.has(session.key) || historyTitleFetchesRef.current.has(session.key)) {
          return;
        }

        historyTitleFetchesRef.current.add(session.key);

        void loadSessionHistoryMessages(session.key, 40)
          .then((messages) => {
            const nextTitle = extractFirstMeaningfulSessionTitle(messages);
            if (nextTitle) {
              setHistoryTitleCache((current) => (
                current[session.key] === nextTitle
                  ? current
                  : { ...current, [session.key]: nextTitle }
              ));
            }

            updateSessionHistoryCache(session.key, messages);
            return saveSessionHistoryCache(
              session.key,
              selectedAgentId,
              messages,
              session.updatedAt ?? null,
              nextTitle ?? cachedRows.find((row) => row.sessionKey === session.key)?.title ?? null,
            ).catch(() => undefined);
          })
          .catch(() => undefined)
          .finally(() => {
            historyTitleFetchesRef.current.delete(session.key);
          });
      });
    })().catch(() => undefined);
  }, [
    connected,
    loadSessionHistoryMessages,
    saveSessionHistoryCache,
    selectedAgentId,
    sessionsResult,
    updateSessionHistoryCache,
  ]);

  const selectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, agentId));
  }, [sessionsResult]);

  const selectSession = useCallback((sessionKey: string) => {
    const agentId = extractAgentIdFromSessionKey(sessionKey);
    if (!agentId) {
      return;
    }

    setSelectedAgentId(agentId);
    setSelectedSessionKey(sessionKey);
  }, []);

  const sendMessage = useCallback(
    async (
      value: string,
      options?: {
        activeCommand?: WorkspaceActiveSlashCommand;
      },
    ) => {
      const client = clientRef.current;
      const message = value.trim();
      const transportMessage = options?.activeCommand
        ? buildWorkspaceSlashCommandTransportMessage({
            command: options.activeCommand,
            userMessage: message,
          })
        : message;

      if (!client?.connected || !currentSessionKey || !message) {
        return false;
      }

      const runId = crypto.randomUUID();
      currentRunIdRef.current = runId;
      activeRunAliasesRef.current = new Set([runId]);
      liveStepDedupeRef.current.clear();
      hasObservedNonThinkingStepRef.current = false;
      hasAssistantTextDeltaRef.current = false;

      setPendingUserMessage({
        id: `pending-${runId}`,
        role: "user",
        author: "你",
        text: message,
        time: formatClockTime(Date.now()),
      });
      setStreamText("");
      setActiveRunId(runId);
      setLiveSteps([
        {
          id: `${runId}:thinking`,
          kind: "thinking",
          status: "running",
          title: "思考中",
          time: formatClockTime(Date.now()),
        },
      ]);
      setSending(true);
      setError(null);

      try {
        await client.request("chat.send", {
          sessionKey: currentSessionKey,
          message: transportMessage,
          deliver: false,
          idempotencyKey: runId,
        });
        return true;
      } catch (sendError) {
        setPendingUserMessage(null);
        setStreamText(null);
        setActiveRunId(null);
        clearActiveRunRefs();
        setLiveSteps([]);
        setError(sendError instanceof Error ? sendError.message : String(sendError));
        return false;
      } finally {
        setSending(false);
      }
    },
    [clearActiveRunRefs, currentSessionKey],
  );

  const abortMessage = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected || !currentSessionKey) {
      return false;
    }

    try {
      await client.request("chat.abort", currentRunIdRef.current
        ? { sessionKey: currentSessionKey, runId: currentRunIdRef.current }
        : { sessionKey: currentSessionKey });
      removeTransientThinkingBridge(currentRunIdRef.current);
      finishLiveSteps("aborted");
      return true;
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : String(abortError));
      return false;
    }
  }, [currentSessionKey, finishLiveSteps, removeTransientThinkingBridge]);

  const resetSession = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected || !currentSessionKey) {
      return false;
    }

    setResettingSession(true);

    try {
      if (currentRunIdRef.current) {
        await client.request("chat.abort", {
          sessionKey: currentSessionKey,
          runId: currentRunIdRef.current,
        }).catch(() => undefined);
      }

      await client.request("sessions.reset", { key: currentSessionKey });
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
      updateSessionHistoryCache(currentSessionKey, []);
      await saveSessionHistoryCache(
        currentSessionKey,
        extractAgentIdFromSessionKey(currentSessionKey) || selectedAgentId,
        [],
        null,
        null,
      ).catch(() => undefined);
      await Promise.all([loadSessions(), loadHistory(currentSessionKey, { agentId: selectedAgentId })]);
      return true;
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
      return false;
    } finally {
      setResettingSession(false);
    }
  }, [clearActiveRunRefs, currentSessionKey, loadHistory, loadSessions, saveSessionHistoryCache, selectedAgentId, updateSessionHistoryCache]);

  const request = useCallback(
    async <T = unknown>(method: string, params?: unknown) => {
      const client = clientRef.current;
      if (!client?.connected) {
        throw new Error("gateway not connected");
      }
      return client.request<T>(method, params);
    },
    [],
  );

  const historyItems = useMemo(() => {
    if (!selectedAgentId) {
      return [];
    }

    return filterAgentSessions(sessionsResult, selectedAgentId)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .map((session) => buildSessionHistoryItem(session, {
        cachedTitle: historyTitleCache[session.key],
        currentSessionKey,
      }));
  }, [currentSessionKey, historyTitleCache, selectedAgentId, sessionsResult]);

  const normalizedHistoryMessages = useMemo(
    () =>
      (sessionHistoryCache[currentSessionKey] ?? [])
        .map((message) => normalizeGatewayMessage(message, resolveAssistantAuthor))
        .filter((message): message is WorkspaceMessage => Boolean(message)),
    [currentSessionKey, resolveAssistantAuthor, sessionHistoryCache],
  );

  const streamMessage = useMemo(() => {
    if (!activeRunId) {
      return null;
    }

    return {
      id: `stream-${activeRunId}`,
      role: "assistant" as const,
      author: resolveAssistantAuthor(currentSessionKey),
      text: streamText?.trim() || "",
      time: "",
      status: "streaming" as const,
    };
  }, [activeRunId, currentSessionKey, resolveAssistantAuthor, streamText]);

  const messages = useMemo(() => {
    const merged = [...normalizedHistoryMessages];
    if (pendingUserMessage) {
      merged.push(pendingUserMessage);
    }
    if (streamMessage) {
      merged.push(streamMessage);
    }
    return merged;
  }, [normalizedHistoryMessages, pendingUserMessage, streamMessage]);

  const currentMainSession = useMemo(
    () => (selectedAgentId ? findMainAgentSession(sessionsResult, selectedAgentId) : null),
    [selectedAgentId, sessionsResult],
  );

  return {
    status,
    connected,
    error,
    agents,
    agentsResult,
    sessionsResult,
    selectedAgentId,
    selectedAgent,
    selectedSessionKey: currentSessionKey,
    currentSessionKey,
    currentMainSession,
    historyItems,
    messages,
    liveSteps,
    historyLoading,
    sending,
    resettingSession,
    isGenerating: Boolean(activeRunId),
    selectAgent,
    selectSession,
    request,
    sendMessage,
    abortMessage,
    resetSession,
    loadHistoryTitles,
    reload: bootstrapGatewayState,
  };
}
