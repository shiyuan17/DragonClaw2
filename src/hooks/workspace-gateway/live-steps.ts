import type { WorkspaceLiveStep, WorkspaceLiveStepKind, WorkspaceLiveStepStatus } from "../../components/workspace-clone/workspaceCloneTypes";
import { formatClockTime } from "./time-formatters";

export type WorkspaceGatewayAgentEventPayload = {
  runId?: unknown;
  sessionKey?: unknown;
  stream?: unknown;
  ts?: unknown;
  data?: unknown;
};

const LIVE_STEP_LIMIT = 12;
const POST_TOOL_THINKING_STEP_SUFFIX = "post-tool-thinking";
export const LIVE_STEP_DEDUPE_WINDOW_MS = 1500;

export type WorkspaceLiveStepEventSource = "agent" | "session.tool";

export interface WorkspaceLiveStepDedupeEntry {
  source: WorkspaceLiveStepEventSource;
  timestampMs: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
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

export function normalizeLiveStepSignaturePart(value: string | undefined) {
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

export function updateLiveStepList(
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

export function buildPostToolThinkingStep(runId: string, timestamp?: number | null): WorkspaceLiveStep {
  return {
    id: getPostToolThinkingStepId(runId),
    kind: "thinking",
    status: "running",
    title: "思考中",
    time: formatClockTime(timestamp ?? Date.now()),
  };
}

export function buildLiveStepDedupeKey(params: {
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
