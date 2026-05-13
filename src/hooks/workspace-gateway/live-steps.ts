import type { WorkspaceLiveStep, WorkspaceLiveStepAction, WorkspaceLiveStepKind, WorkspaceLiveStepStatus } from "../../components/workspace-clone/workspaceCloneTypes";
import { formatClockTime } from "./time-formatters";

export type WorkspaceGatewayAgentEventPayload = {
  runId?: unknown;
  sessionKey?: unknown;
  stream?: unknown;
  ts?: unknown;
  data?: unknown;
};

const LIVE_STEP_LIMIT = 6;
const POST_TOOL_THINKING_STEP_SUFFIX = "post-tool-thinking";
export const LIVE_STEP_DEDUPE_WINDOW_MS = 1500;
export const LIVE_STEP_DEDUPE_ENTRY_TTL_MS = 10000;

export type WorkspaceLiveStepEventSource = "agent" | "session.tool";

export interface WorkspaceLiveStepDedupeEntry {
  source: WorkspaceLiveStepEventSource;
  timestampMs: number;
  canonicalStepId: string;
  operationKey: string;
  signatureKey: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function toFiniteTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getPostToolThinkingStepId(runId: string) {
  return `${runId}:${POST_TOOL_THINKING_STEP_SUFFIX}`;
}

export function isTerminalLiveStepStatus(status: WorkspaceLiveStepStatus) {
  return status === "success" || status === "error" || status === "aborted";
}

export function extractLiveStepStableId(data: Record<string, unknown>) {
  return firstNonEmptyString(data.itemId, data.toolCallId, data.tool_call_id, data.id);
}

export function buildLiveStepStableKey(data: Record<string, unknown>) {
  const stableId = extractLiveStepStableId(data);
  return stableId ? `stable:${normalizeLiveStepSignaturePart(stableId)}` : "";
}

export function normalizeLiveStepSignaturePart(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function truncateInlineText(value: string, maxLength = 120) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeToolSignal(value: string) {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function hasToolSignal(signal: string, candidates: string[]) {
  const normalized = normalizeToolSignal(signal);
  return candidates.some((candidate) => (
    normalized === candidate ||
    normalized.includes(`_${candidate}`) ||
    normalized.includes(`${candidate}_`)
  ));
}

function extractArgs(data: Record<string, unknown>) {
  return isRecord(data.args) ? data.args : {};
}

function extractPathLikeValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const nested: string = extractPathLikeValue(...value);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function basenameFromPath(value: string) {
  const normalized = value.trim().replace(/^file:\/\//i, "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

function extractFileTarget(data: Record<string, unknown>) {
  const args = extractArgs(data);
  const target = extractPathLikeValue(
    data.path,
    data.filePath,
    data.file_path,
    data.target,
    data.file,
    data.fileName,
    data.filename,
    data.files,
    args.path,
    args.filePath,
    args.file_path,
    args.target,
    args.file,
    args.fileName,
    args.filename,
    args.files,
  );
  return target ? truncateInlineText(basenameFromPath(target), 96) : "";
}

function extractSearchQuery(data: Record<string, unknown>) {
  const args = extractArgs(data);
  return truncateInlineText(firstNonEmptyString(
    data.query,
    data.searchQuery,
    data.q,
    data.term,
    data.keywords,
    args.query,
    args.searchQuery,
    args.q,
    args.term,
    args.keywords,
  ), 96);
}

function extractCommandSnippet(data: Record<string, unknown>) {
  const args = extractArgs(data);
  const command = firstNonEmptyString(
    data.command,
    args.command,
    data.cmd,
    data.script,
    data.line,
  );
  if (!command) {
    return "";
  }
  return truncateInlineText(command.split("\n", 1)[0] ?? command, 128);
}

function resolveLiveStepKind(kind: string, title: string): WorkspaceLiveStepKind {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "skill") return "skill";
  if (normalized === "command" || normalized === "command_output") return "command";
  if (normalized === "search") return "search";
  if (normalized === "analysis") return "thinking";
  if (normalized === "patch") return "patch";
  if (normalized === "plan") return "plan";
  if (normalized === "approval") return "approval";
  if (normalized === "tool") return /skill|技能/i.test(title) ? "skill" : "tool";
  return "other";
}

function resolveLiveStepAction(params: {
  kind: WorkspaceLiveStepKind;
  stream: string;
  data: Record<string, unknown>;
  title: string;
}): WorkspaceLiveStepAction | undefined {
  const { kind, stream, data, title } = params;
  if (kind === "thinking") return undefined;
  if (kind === "skill") return "skill";
  if (kind === "command") return "command";
  if (kind === "search") return "search";
  if (kind === "patch") return "edit";
  if (kind === "plan") return "plan";
  if (kind === "approval") return "approval";

  const args = extractArgs(data);
  const signal = [
    stream,
    data.kind,
    data.name,
    data.toolName,
    data.title,
    data.command,
    args.command,
    args.operation,
    args.action,
    title,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean)
    .join(" ");

  if (hasToolSignal(signal, ["apply_patch", "patch", "edit", "replace", "modify", "update_file"])) return "edit";
  if (hasToolSignal(signal, ["create_file", "write", "write_file", "new_file", "touch", "mkdir", "create"])) return "create";
  if (hasToolSignal(signal, ["read_file", "read", "view", "open_file", "cat", "load_file"])) return "read";
  if (hasToolSignal(signal, ["delete_file", "remove_file", "delete", "remove", "unlink", "trash", "rm"])) return "delete";
  if (hasToolSignal(signal, ["search", "grep", "ripgrep", "rg", "find", "lookup"])) return "search";
  if (hasToolSignal(signal, ["exec", "shell", "terminal", "command", "powershell", "bash", "cmd", "run_command"])) return "command";
  return "generic-tool";
}

function coerceKindForAction(kind: WorkspaceLiveStepKind, action?: WorkspaceLiveStepAction) {
  if (action === "command") return "command";
  if (action === "search") return "search";
  if (action === "edit") return "patch";
  if (action === "skill") return "skill";
  if (action === "plan") return "plan";
  if (action === "approval") return "approval";
  return kind;
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

function extractLiveStepDetail(data: Record<string, unknown>) {
  const detail = firstNonEmptyString(
    data.summary,
    data.detail,
    data.message,
    data.progressText,
    data.meta,
    data.title,
  );
  return detail ? truncateInlineText(detail, 120) : "";
}

function isCommandLikeTool(data: Record<string, unknown>) {
  const name = firstNonEmptyString(data.name, data.toolName).toLowerCase();
  return Boolean(extractCommandSnippet(data)) || ["exec", "shell", "terminal", "command"].includes(name);
}

function buildLiveStepTitle(params: {
  kind: WorkspaceLiveStepKind;
  action?: WorkspaceLiveStepAction;
  data: Record<string, unknown>;
}) {
  const { kind, action, data } = params;
  if (kind === "thinking") {
    return firstNonEmptyString(data.title, data.message, data.summary, "思考中");
  }
  if (action === "command") {
    return extractCommandSnippet(data) || firstNonEmptyString(data.name, data.title, "命令");
  }
  if (action === "search") {
    return extractSearchQuery(data) || firstNonEmptyString(data.query, data.name, data.title, "搜索");
  }
  if (action === "read" || action === "create" || action === "edit" || action === "delete") {
    return extractFileTarget(data) || firstNonEmptyString(data.title, data.name, data.toolName, "文件");
  }
  if (kind === "skill") {
    return firstNonEmptyString(data.name, data.skillName, data.title, "技能");
  }
  if (kind === "tool") {
    return firstNonEmptyString(data.name, data.toolName, data.title, "工具");
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
    return detail ? truncateInlineText(detail, 120) : "";
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

    const args = extractArgs(data);
    const stream = toStringValue(payload.stream, "step");
    const timestamp = toFiniteTimestamp(payload.ts) ?? Date.now();
    const titleSeed = firstNonEmptyString(
      data.name,
      data.toolName,
      data.title,
      data.command,
      data.query,
      args.command,
      args.query,
    );
    const phaseSeed = firstNonEmptyString(data.phase, data.status, data.state);
    const detailSeed = firstNonEmptyString(data.summary, data.detail, data.message, data.progressText);
    const signature = [
      normalizeLiveStepSignaturePart(stream),
      String(timestamp),
      normalizeLiveStepSignaturePart(phaseSeed),
      normalizeLiveStepSignaturePart(titleSeed),
      normalizeLiveStepSignaturePart(detailSeed),
    ]
      .filter(Boolean)
      .join(":");
    return `${fallback}:${signature || stream}`;
  }

  const stream = toStringValue(payload.stream, "step");
  const timestamp = toFiniteTimestamp(payload.ts) ?? Date.now();
  return `${fallback}:${stream}:${timestamp}`;
}

export function buildLiveStepFromAgentEvent(
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
    const initialKind = isCommandLikeTool(data) ? "command" : resolveLiveStepKind("tool", title);
    const action = resolveLiveStepAction({ kind: initialKind, stream, data, title });
    const kind = coerceKindForAction(initialKind, action);
    const status = resolveLiveStepStatus({
      phase,
      status: toStringValue(data.status),
      isError: data.isError === true,
    });
    return {
      id: getLiveStepId(payload, fallbackRunId),
      kind,
      action,
      status,
      title: buildLiveStepTitle({ kind, action, data }),
      detail: buildLiveStepDetail({ kind, data }) || undefined,
      time,
    };
  }

  if (stream === "item" || stream === "command_output" || stream === "plan" || stream === "approval" || stream === "patch") {
    const title = firstNonEmptyString(data.title, data.name, data.toolName, stream);
    const initialKind = resolveLiveStepKind(
      firstNonEmptyString(data.kind, stream === "command_output" ? "command" : stream),
      title,
    );
    const action = resolveLiveStepAction({ kind: initialKind, stream, data, title });
    const kind = coerceKindForAction(initialKind, action);
    const status = resolveLiveStepStatus({
      phase: toStringValue(data.phase),
      status: firstNonEmptyString(data.status, data.state, stream === "command_output" ? "running" : ""),
      isError: data.error !== undefined || data.isError === true,
    });
    return {
      id: getLiveStepId(payload, fallbackRunId),
      kind,
      action,
      status,
      title: buildLiveStepTitle({ kind, action, data }),
      detail: buildLiveStepDetail({ kind, data }) || undefined,
      time,
    };
  }

  return null;
}

export function updateLiveStepList(
  current: WorkspaceLiveStep[],
  nextStep: WorkspaceLiveStep,
): WorkspaceLiveStep[] {
  const shouldRemoveTransientThinking =
    nextStep.kind !== "thinking" ||
    nextStep.status === "running" ||
    nextStep.status === "pending";
  const base =
    !shouldRemoveTransientThinking
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

export function buildPostToolThinkingStep(runId: string, timestamp?: number | null): WorkspaceLiveStep {
  return {
    id: getPostToolThinkingStepId(runId),
    kind: "thinking",
    status: "running",
    title: "思考中",
    time: formatClockTime(timestamp ?? Date.now()),
  };
}

export function buildLiveStepOperationKey(params: {
  step: WorkspaceLiveStep;
  payload: WorkspaceGatewayAgentEventPayload;
  runId: string;
}) {
  const { step, payload, runId } = params;
  const sessionScope = toStringValue(payload.sessionKey) || runId;
  return [
    "operation",
    step.kind,
    step.action ?? "",
    normalizeLiveStepSignaturePart(step.title),
    normalizeLiveStepSignaturePart(step.detail),
    normalizeLiveStepSignaturePart(sessionScope),
  ].join(":");
}

export function buildLiveStepSignatureKey(params: {
  step: WorkspaceLiveStep;
  payload: WorkspaceGatewayAgentEventPayload;
  runId: string;
}) {
  const { step } = params;
  return [
    buildLiveStepOperationKey(params),
    step.status,
  ].join(":");
}

export function buildLiveStepDedupeKey(params: {
  step: WorkspaceLiveStep;
  payload: WorkspaceGatewayAgentEventPayload;
  runId: string;
}) {
  return buildLiveStepSignatureKey(params);
}
