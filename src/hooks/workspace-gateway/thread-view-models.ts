import type { WorkspaceMessage } from "../../components/workspace-clone/workspaceCloneTypes";
import { normalizeGatewayMessage } from "./message-normalizers";
import { formatClockTime } from "./time-formatters";
import type { WorkspaceSessionHistoryPageState } from "./session-history-pages";

export const THREAD_VIEW_MODEL_LIMIT = 3;
export const THREAD_RENDER_PAGE_LIMIT = 20;
export const THREAD_RENDER_WINDOW_LIMIT = 60;

export interface WorkspaceRenderMessagePreview {
  index: number;
  id?: string | null;
  role: WorkspaceMessage["role"] | string;
  textPreview: string;
  timestamp?: number | null;
  textHash?: string | null;
  renderKind: "plain" | "markdown" | "json" | string;
  fullTextLength: number;
  truncated: boolean;
}

export interface WorkspaceChatSessionRenderPage {
  sessionKey: string;
  agentId: string;
  messages: WorkspaceRenderMessagePreview[];
  total: number;
  startIndex: number | null;
  endIndex: number | null;
  hasMoreBefore: boolean;
  updatedAt?: number | null;
  cachedAt: number;
  title?: string | null;
}

export interface WorkspaceThreadViewModel {
  sessionKey: string;
  previewMessages: WorkspaceRenderMessagePreview[];
  normalizedVisibleMessages: WorkspaceMessage[];
  summary: string;
  title?: string | null;
  pageState: WorkspaceSessionHistoryPageState | null;
  hydratedAt: number;
  richHydrated: boolean;
}

export interface WorkspaceSessionSwitchPerfEntry {
  sessionKey: string;
  clickAt: number;
  shellCommitAt?: number;
  renderPageLoadedAt?: number;
  firstPreviewPaintAt?: number;
  richHydratedAt?: number;
}

export function buildPageStateFromRenderPage(page: WorkspaceChatSessionRenderPage): WorkspaceSessionHistoryPageState {
  return {
    messages: page.messages.map((message) => ({
      id: message.id?.trim() || `${page.sessionKey}:preview:${message.index}`,
      role: message.role,
      text: message.textPreview,
      timestamp: message.timestamp ?? null,
      sessionKey: page.sessionKey,
    })),
    oldestIndex: page.startIndex,
    newestIndex: page.endIndex,
    hasMoreBefore: page.hasMoreBefore,
    loadingOlder: false,
    loadedFromCache: true,
    total: page.total,
  };
}

function normalizePreviewRole(role: string): WorkspaceMessage["role"] {
  return role === "user" || role === "system" || role === "tool" ? role : "assistant";
}

function previewToWorkspaceMessage(
  sessionKey: string,
  preview: WorkspaceRenderMessagePreview,
  resolveAssistantAuthor: (sessionKey?: string | null) => string,
): WorkspaceMessage | null {
  const role = normalizePreviewRole(preview.role);
  if (role === "tool" || !preview.textPreview.trim()) {
    return null;
  }
  return {
    id: preview.id?.trim() || `${sessionKey}:preview:${preview.index}`,
    role,
    author: role === "assistant" ? resolveAssistantAuthor(sessionKey) : role === "user" ? "你" : "系统",
    text: preview.textPreview,
    time: formatClockTime(typeof preview.timestamp === "number" ? preview.timestamp : null),
  };
}

export function buildThreadViewModelFromRenderPage(
  page: WorkspaceChatSessionRenderPage,
  resolveAssistantAuthor: (sessionKey?: string | null) => string,
): WorkspaceThreadViewModel {
  const normalizedVisibleMessages = page.messages
    .map((message) => previewToWorkspaceMessage(page.sessionKey, message, resolveAssistantAuthor))
    .filter((message): message is WorkspaceMessage => Boolean(message));
  return {
    sessionKey: page.sessionKey,
    previewMessages: page.messages,
    normalizedVisibleMessages,
    summary: normalizedVisibleMessages.length ? normalizedVisibleMessages[normalizedVisibleMessages.length - 1]?.text ?? "" : "",
    title: page.title,
    pageState: buildPageStateFromRenderPage(page),
    hydratedAt: Date.now(),
    richHydrated: false,
  };
}

export function buildThreadViewModelFromRawMessages(
  sessionKey: string,
  messages: unknown[],
  resolveAssistantAuthor: (sessionKey?: string | null) => string,
  currentPageState?: WorkspaceSessionHistoryPageState | null,
): WorkspaceThreadViewModel {
  const windowedMessages = messages.length > THREAD_RENDER_WINDOW_LIMIT
    ? messages.slice(-THREAD_RENDER_WINDOW_LIMIT)
    : messages;
  const normalizedVisibleMessages = windowedMessages
    .map((message) => normalizeGatewayMessage(message, resolveAssistantAuthor))
    .filter((message): message is WorkspaceMessage => Boolean(message));
  return {
    sessionKey,
    previewMessages: [],
    normalizedVisibleMessages,
    summary: normalizedVisibleMessages.length ? normalizedVisibleMessages[normalizedVisibleMessages.length - 1]?.text ?? "" : "",
    pageState: currentPageState ?? null,
    hydratedAt: Date.now(),
    richHydrated: true,
  };
}

export function upsertThreadViewModel(
  current: Record<string, WorkspaceThreadViewModel>,
  viewModel: WorkspaceThreadViewModel,
) {
  const next = { ...current, [viewModel.sessionKey]: viewModel };
  const keys = Object.keys(next).sort((left, right) => next[right].hydratedAt - next[left].hydratedAt);
  for (const key of keys.slice(THREAD_VIEW_MODEL_LIMIT)) {
    delete next[key];
  }
  return next;
}

export function filterThreadViewModelsByKeys(
  current: Record<string, WorkspaceThreadViewModel>,
  allowedSessionKeys: Set<string>,
) {
  let changed = false;
  const next: Record<string, WorkspaceThreadViewModel> = {};
  for (const [sessionKey, viewModel] of Object.entries(current)) {
    if (allowedSessionKeys.has(sessionKey)) next[sessionKey] = viewModel;
    else changed = true;
  }
  return changed ? next : current;
}
