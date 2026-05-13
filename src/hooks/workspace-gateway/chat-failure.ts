import type { WorkspaceLiveStep } from "../../components/workspace-clone/workspaceCloneTypes";
import type {
  WorkspaceChatFailureNotice,
  WorkspaceChatFailureSessionKind,
  WorkspaceChatFailureSource,
} from "../../components/workspace-clone/workspaceCloneChatFailure";
import { formatClockTime } from "./time-formatters";

const TOKEN_OR_QUOTA_ERROR_RE = /TokenStatusExhausted|quota|额度已用尽|额度不足|rate limit|API rate limit|insufficient_quota/i;
const AUTH_ERROR_RE = /\b401\b|unauthorized|invalid(?:_| )?api(?:_| )?key|auth/i;
const NETWORK_TIMEOUT_ERROR_RE = /timeout|timed out|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i;

export function resolveWorkspaceChatFailureSessionKind(params: {
  sessionKey?: string | null;
  previewSessionKey?: string | null;
  isTaskRunSession: boolean;
}): WorkspaceChatFailureSessionKind {
  const normalizedSessionKey = params.sessionKey?.trim() || "";
  if (!normalizedSessionKey) {
    return "unknown";
  }
  if (params.isTaskRunSession) {
    return "task-run";
  }
  if (params.previewSessionKey === normalizedSessionKey) {
    return "preview";
  }
  return normalizedSessionKey.endsWith(":main") ? "main" : "history";
}

export function buildWorkspaceChatFailureNotice(params: {
  title: string;
  message: string;
  source: WorkspaceChatFailureSource;
  sessionKey?: string | null;
  runId?: string | null;
  sessionKind: WorkspaceChatFailureSessionKind;
  canRetry: boolean;
}): WorkspaceChatFailureNotice {
  return {
    title: params.title,
    message: params.message.trim(),
    source: params.source,
    sessionKey: params.sessionKey?.trim() || null,
    runId: params.runId?.trim() || null,
    sessionKind: params.sessionKind,
    canRetry: params.canRetry,
  };
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function humanizeWorkspaceChatFailureMessage(message: string) {
  const normalized = message.trim();
  if (!normalized) {
    return "会话生成失败，请稍后重试。";
  }

  if (TOKEN_OR_QUOTA_ERROR_RE.test(normalized) || (AUTH_ERROR_RE.test(normalized) && /TokenStatus|令牌|token/i.test(normalized))) {
    return "模型额度或令牌已不可用，请在模型设置中更新 Token，或切换到可用 Provider 后重试。";
  }

  if (AUTH_ERROR_RE.test(normalized)) {
    return "模型鉴权失败，请检查当前 Provider 的 API Key、Base URL 和模型配置后重试。";
  }

  if (NETWORK_TIMEOUT_ERROR_RE.test(normalized)) {
    return "模型请求超时或网络连接异常，请检查网络/代理后重试。";
  }

  return normalized;
}

export function resolveWorkspaceAgentFailureMessage(data: Record<string, unknown>) {
  const rawMessage = firstNonEmptyString(
    data.error,
    data.errorMessage,
    data.message,
    data.rawErrorPreview,
    data.fallbackStepFromFailureDetail,
  );
  const humanized = humanizeWorkspaceChatFailureMessage(rawMessage);
  const provider = firstNonEmptyString(data.provider, data.requestedProvider, data.candidateProvider);
  const model = firstNonEmptyString(data.model, data.requestedModel, data.candidateModel);
  const suffix = [provider, model].filter(Boolean).join("/");

  return suffix ? `${humanized}（${suffix}）` : humanized;
}

export function replaceWorkspaceThinkingStepWithFailure(params: {
  current: WorkspaceLiveStep[];
  runId?: string | null;
  title: string;
  detail?: string;
  time: string;
}): WorkspaceLiveStep[] {
  if (params.current.some((step) => step.kind !== "thinking")) {
    return params.current.map((step) => (
      step.status === "running" || step.status === "pending"
        ? { ...step, status: "error" as const }
        : step
    ));
  }
  return [{
    id: params.runId ? `${params.runId}:failure` : `failure:${Date.now()}`,
    kind: "other" as const,
    status: "error" as const,
    title: params.title,
    detail: params.detail || undefined,
    time: params.time,
  }];
}

export function buildWorkspaceFailureLiveStep(params: {
  runId?: string | null;
  title: string;
  detail?: string;
}): WorkspaceLiveStep {
  return {
    id: params.runId ? `${params.runId}:thinking` : `failure:${Date.now()}`,
    kind: "thinking",
    status: "error",
    title: params.title,
    detail: params.detail,
    time: formatClockTime(Date.now()),
  };
}
