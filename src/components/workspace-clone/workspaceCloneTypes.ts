import type { WorkspaceEntityType, WorkspaceMenuKey } from "../../types";

export type WorkspaceUtilityPanel = "history" | "logs" | "settings" | "schedule" | "workbench" | null;
export type WorkspaceRelatedResource = "model" | "memory" | "skills" | "commands" | "tools" | "channel" | "schedule" | null;
export type WorkspaceSidebarAdminPanel = "theme" | "language" | null;
export type WorkspaceComposerModal = "knowledge" | "knowledge-delete" | "slash-command" | "email-binding" | null;
export type WorkspaceSuggestionMode = "slash" | "mention" | null;
export type ChannelBindingView = "wechat" | "feishu" | "manual";

export interface WorkspaceMenuItem {
  key: WorkspaceMenuKey;
  label: string;
  icon: string;
}

export interface WorkspaceTypeTab {
  key: WorkspaceEntityType;
  label: string;
  icon: string;
}

export interface WorkspaceEntity {
  id: string;
  entityType: WorkspaceEntityType;
  name: string;
  subtitle: string;
  status: "online" | "busy" | "offline";
  avatarLabel: string;
  accent: string;
  memberLabels?: string[];
  currentWork?: string;
  recentOutput?: string;
  channelLabel?: string;
}

export interface WorkspaceMessage {
  id: string;
  role: "assistant" | "user" | "system" | "tool";
  author: string;
  text: string;
  meta?: string;
  time: string;
  thinking?: string[];
  status?: "pending" | "streaming" | "error";
}

export interface WorkspaceHistoryItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
}

export interface WorkspaceScheduleItem {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  tone: "online" | "busy" | "offline";
}

export interface WorkspaceWorkbenchItem {
  id: string;
  title: string;
  detail: string;
  time: string;
}

export interface WorkspaceResourceItem {
  id: string;
  title: string;
  subtitle: string;
  tag?: string;
}

export interface WorkspaceToolItem {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

export type DirectoryContextMenuState = {
  kind: "agent" | "team" | "channel";
  entityId: string;
  title: string;
  x: number;
  y: number;
  configured?: boolean;
  accountLabel?: string;
} | null;

export interface ChannelBindingModalState {
  open: boolean;
  channelId: string;
  channelName: string;
  view: ChannelBindingView;
}

export type WorkspaceGatewayStatus = "idle" | "connecting" | "connected" | "error";

export interface WorkspaceGatewayAgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface WorkspaceGatewayAgentRow {
  id: string;
  name?: string;
  identity?: WorkspaceGatewayAgentIdentity;
}

export interface WorkspaceGatewayAgentsListResult {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: WorkspaceGatewayAgentRow[];
}

export interface WorkspaceGatewaySessionRow {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
}

export interface WorkspaceGatewaySessionsListResult {
  ts: number;
  path: string;
  count: number;
  defaults: {
    model: string | null;
    contextTokens: number | null;
  };
  sessions: WorkspaceGatewaySessionRow[];
}
