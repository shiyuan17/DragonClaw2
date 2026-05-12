import type { WorkspaceChannelId, WorkspaceEntityType, WorkspaceMenuKey } from "../../types";
export type {
  WorkspaceCronDeliveryStatus,
  WorkspaceCronJob,
  WorkspaceCronJobPatch,
  WorkspaceCronJobState,
  WorkspaceCronListResult,
  WorkspaceCronPayload,
  WorkspaceCronRunPageResult,
  WorkspaceCronRunRecord,
  WorkspaceCronRunResult,
  WorkspaceCronRunSkipReason,
  WorkspaceCronRunStatus,
  WorkspaceCronSchedule,
  WorkspaceCronSessionTarget,
  WorkspaceCronStatusSummary,
  WorkspaceCronWakeMode,
} from "./workspaceCloneCronTypes";

export type WorkspaceUtilityPanel = "session" | "history" | "logs" | "schedule" | "workbench" | "files" | null;
export type WorkspaceSessionSectionKey = "model" | "memory" | "skills" | "commands" | "tools" | "channel" | "schedule";
export type WorkspaceRelatedResource = WorkspaceSessionSectionKey | null;
export type WorkspaceHistoryFilter = "all" | "today" | "yesterday";
export type WorkspaceChatFileCategory = "all" | "website" | "document" | "excel" | "ppt" | "image" | "video" | "audio";
export type WorkspaceChatFileSourceRole = "user" | "assistant";
export type WorkspaceChatAttachmentKind = "image" | "document" | "code" | "text" | "audio" | "video" | "archive" | "file";
export type WorkspaceRuntimeLogCategory = "tool" | "skill" | "system" | "other";
export type WorkspaceRuntimeLogCategoryFilter = "all" | WorkspaceRuntimeLogCategory;
export type WorkspaceRuntimeLogRawType =
  | "tool"
  | "skill"
  | "command"
  | "search"
  | "plan"
  | "approval"
  | "patch"
  | "thinking"
  | "system"
  | "other";
export type WorkspaceSidebarAdminPanel = "theme" | "language" | null;
export type WorkspaceComposerModal = "knowledge" | "knowledge-delete" | "slash-command" | "email-binding" | null;
export type WorkspaceSuggestionMode = "slash" | "mention" | null;
export type ChannelBindingView = "wechat" | "feishu" | "manual" | "placeholder";
export type WorkspaceModelProviderApi = "openai-completions" | "openai-responses" | "anthropic-messages";
export type WorkspaceSkillCategory = "builtIn" | "installed";
export type WorkspaceSlashCommandSource = "builtin" | "custom";
export type WorkspaceToolCategory =
  | "all"
  | "fs"
  | "runtime"
  | "web"
  | "memory"
  | "sessions"
  | "messaging"
  | "ui"
  | "automation"
  | "nodes"
  | "other";

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
  searchText?: string;
  subtitle: string;
  recentSessions?: WorkspaceHistoryItem[];
  status: "online" | "busy" | "offline";
  avatarLabel: string;
  avatarUrl?: string;
  accent: string;
  memberLabels?: string[];
  currentWork?: string;
  recentOutput?: string;
  channelLabel?: string;
  iconSrc?: string;
  channelId?: WorkspaceChannelId;
  channelAccountId?: string | null;
  runtimeAgentId?: string | null;
  isBoundChannel?: boolean;
  isCatalogEntry?: boolean;
  implemented?: boolean;
  actionLabel?: string;
  emptyHint?: string;
}

export interface WorkspaceChannelCatalogEntry {
  id: WorkspaceChannelId;
  name: string;
  description: string;
  icon: string;
  implemented: boolean;
}

export interface WorkspaceChannelAgentOption {
  id: string;
  name: string;
  model?: string | null;
  isDefault: boolean;
}

export interface WorkspaceMessage {
  id: string;
  role: "assistant" | "user" | "system" | "tool";
  author: string;
  text: string;
  attachments?: WorkspaceMessageAttachment[];
  meta?: string;
  time: string;
  thinking?: string[];
  status?: "pending" | "streaming" | "error";
}

export interface WorkspaceComposerAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: WorkspaceChatAttachmentKind;
  transportType: "image" | "file";
  dataUrl: string;
  previewUrl?: string | null;
}

export interface WorkspaceMessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  kind: WorkspaceChatAttachmentKind;
  transportType: "image" | "file";
  sizeBytes?: number | null;
  previewUrl?: string | null;
  sourcePath?: string | null;
}

export interface WorkspaceGatewayChatAttachmentPayload {
  type: "image" | "file";
  mimeType: string;
  fileName: string;
  content: string;
}

export type WorkspaceLiveStepKind =
  | "thinking"
  | "skill"
  | "tool"
  | "command"
  | "search"
  | "patch"
  | "plan"
  | "approval"
  | "other";

export type WorkspaceLiveStepStatus = "pending" | "running" | "success" | "error" | "aborted";

export interface WorkspaceLiveStep {
  id: string;
  kind: WorkspaceLiveStepKind;
  status: WorkspaceLiveStepStatus;
  title: string;
  detail?: string;
  time: string;
}

export interface WorkspaceHistoryItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  updatedAt?: number | null;
  sessionKey?: string;
  active?: boolean;
  isMain?: boolean;
  kind?: "gateway" | "task-run";
  boundSessionKey?: string | null;
}

export interface WorkspaceChatFileItem {
  id: string;
  title: string;
  target: string;
  category: WorkspaceChatFileCategory;
  sourceRole: WorkspaceChatFileSourceRole;
  messageId: string;
  messageTime: string;
  messagePreview: string;
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

export interface WorkspaceRuntimeLogDetailSection {
  id: string;
  label: string;
  content: string;
  tone: "summary" | "meta" | "raw";
}

export interface WorkspaceRuntimeLogItem {
  id: string;
  time: string;
  level: string;
  message: string;
  humanized?: string;
  category: WorkspaceRuntimeLogCategory;
  rawType: WorkspaceRuntimeLogRawType;
  title: string;
  summary: string;
  detailSections: WorkspaceRuntimeLogDetailSection[];
}

export interface WorkspaceSlashCommandRecord {
  id: string;
  command: string;
  name: string;
  description: string;
  instruction: string;
}

export interface WorkspaceSlashCommandDefinition extends WorkspaceSlashCommandRecord {
  source: WorkspaceSlashCommandSource;
  readonly: boolean;
}

export type WorkspaceActiveSlashCommand = Omit<WorkspaceSlashCommandDefinition, "readonly"> | null;

export type WorkspaceActiveSkill = Pick<WorkspaceSkillOption, "id" | "title" | "description" | "tag" | "category"> | null;
export type WorkspaceActiveSkillList = Array<NonNullable<WorkspaceActiveSkill>>;

export interface WorkspaceSlashCommandDraftInput {
  command: string;
  name: string;
  description: string;
  instruction: string;
}

export interface WorkspaceSkillOption {
  id: string;
  title: string;
  description: string;
  tag: string;
  category: WorkspaceSkillCategory;
  selected: boolean;
}

export interface WorkspaceMemoryFile {
  id: string;
  title: string;
  summary: string;
  sourcePath: string;
  relativePath: string;
  updatedAtMs: number;
  content: string;
  exists: boolean;
  displayName: string;
  isFocus: boolean;
}

export interface WorkspaceToolItem {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  tag?: string;
}

export interface WorkspaceToolOption {
  id: string;
  title: string;
  description: string;
  tag: string;
  category: Exclude<WorkspaceToolCategory, "all">;
  categoryLabel: string;
  groupKey: Exclude<WorkspaceToolCategory, "all">;
  groupLabel: string;
  selected: boolean;
}

export interface WorkspaceToolCategoryCount {
  key: Exclude<WorkspaceToolCategory, "all">;
  label: string;
  count: number;
}

export interface WorkspaceToolGroup {
  key: Exclude<WorkspaceToolCategory, "all">;
  label: string;
  tools: WorkspaceToolOption[];
}

export interface WorkspaceModelVendorPreset {
  id: string;
  label: string;
  displayName: string;
  baseUrl: string;
  apiType: WorkspaceModelProviderApi;
  modelOptions: string[];
  defaultModel: string;
}

export interface WorkspaceModelConfigDraft {
  providerKey: string;
  vendorPresetId: string;
  providerDisplayName: string;
  providerBaseUrl: string;
  providerApi: WorkspaceModelProviderApi;
  modelId: string;
  modelOptions: string[];
  apiKey: string;
  apiKeyConfigured: boolean;
}

export interface WorkspaceSavedProviderCard {
  providerKey: string;
  displayName: string;
  baseUrl: string;
  apiType: WorkspaceModelProviderApi;
  modelId: string;
  modelOptions: string[];
  hasApiKey: boolean;
  isActive: boolean;
  syncState?: "pending";
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
  accountId: string;
  accountLabel: string;
  view: ChannelBindingView;
  implemented: boolean;
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

export interface WorkspaceAgentCacheRow {
  agentId: string;
  name?: string | null;
  identityJson?: string | null;
  isDefault: boolean;
  scope: string;
  cachedAt: number;
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

export interface WorkspaceChatSessionCacheRow {
  sessionKey: string;
  agentId: string;
  updatedAt: number | null;
  cachedAt: number;
  title?: string | null;
  messagesJson: string;
}

export interface WorkspaceChatSessionCacheSummary {
  sessionKey: string;
  agentId: string;
  updatedAt: number | null;
  cachedAt: number;
  title?: string | null;
}

export interface WorkspaceGatewaySkillStatusEntry {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
}

export interface WorkspaceGatewaySkillStatusResult {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: WorkspaceGatewaySkillStatusEntry[];
}

export interface WorkspaceInstalledSkillInfo {
  name: string;
  description: string;
  path: string;
}

export interface WorkspaceAgentSkillConfig {
  agentId: string;
  selectedSkillNames: string[];
}

export interface WorkspaceAgentSkillSaveResult {
  agentId: string;
  selectedSkillNames: string[];
  appliesOnNextMessage: boolean;
}

export interface WorkspaceAgentToolConfig {
  agentId: string;
  profile?: string | null;
  allow?: string[] | null;
  alsoAllow?: string[] | null;
  deny?: string[] | null;
}
