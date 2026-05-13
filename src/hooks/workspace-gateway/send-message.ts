import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { KnowledgeBaseRecord } from "../../types";
import { buildWorkspaceGatewayChatAttachments } from "../../components/workspace-clone/workspaceCloneChatAttachments";
import { buildWorkspaceComposerTransportMessage, buildWorkspaceVisibleComposerMessage } from "../../components/workspace-clone/workspaceCloneSlashCommands";
import type {
  WorkspaceActiveSkillList,
  WorkspaceActiveSlashCommand,
  WorkspaceComposerAttachment,
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { writeOptimisticSessionHistoryTitle } from "./history-title-state";
import { extractAgentIdFromSessionKey } from "./message-normalizers";
import { captureWorkspaceChatMessageSent, type WorkspaceChatTelemetrySessionType } from "./chat-telemetry";
import { formatClockTime } from "./time-formatters";
import type { WorkspaceGatewayClient } from "./client";

export interface SendWorkspaceGatewayMessageOptions {
  activeCommand?: WorkspaceActiveSlashCommand;
  activeSkills?: WorkspaceActiveSkillList;
  attachments?: WorkspaceComposerAttachment[];
  knowledgeBase?: KnowledgeBaseRecord | null;
  workspaceDirectory?: string | null;
  targetSessionKey?: string | null;
  targetAgentId?: string | null;
  preserveSessionSwitch?: boolean;
  displayText?: string;
  transportText?: string;
  telemetrySessionType?: WorkspaceChatTelemetrySessionType;
}

interface SendWorkspaceGatewayMessageParams {
  client: WorkspaceGatewayClient | null;
  value: string;
  options?: SendWorkspaceGatewayMessageOptions;
  currentGatewaySessionKey: string;
  currentSessionKey: string;
  selectedAgentId: string;
  ensureTaskRunConversationBound: (sessionKey: string, fallbackAgentId?: string | null) => Promise<string | null>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  preserveActiveRunSessionSwitch: (sessionKey: string) => void;
  initializeActiveRun: (params: { runId: string; sessionKey?: string; pendingUserMessage?: {
    id: string;
    role: "user";
    author: string;
    text: string;
    commandTag?: string;
    skillTags?: string[];
    attachments?: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      kind: WorkspaceComposerAttachment["kind"];
      transportType: WorkspaceComposerAttachment["transportType"];
      sizeBytes: number;
      previewUrl: string | null;
    }>;
    time: string;
  } | null }) => void;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  historyTitleCacheRef: MutableRefObject<Record<string, string>>;
  sessionHistoryCacheRef: MutableRefObject<Record<string, unknown[]>>;
  setHistoryTitleCache: Dispatch<SetStateAction<Record<string, string>>>;
  saveSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
    messages: unknown[],
    updatedAt?: number | null,
    title?: string | null,
  ) => Promise<void>;
  onSendError: (error: unknown) => void;
  setSending: Dispatch<SetStateAction<boolean>>;
}

export async function sendWorkspaceGatewayMessage({
  client,
  value,
  options,
  currentGatewaySessionKey,
  currentSessionKey,
  selectedAgentId,
  ensureTaskRunConversationBound,
  setSelectedAgentId,
  preserveActiveRunSessionSwitch,
  initializeActiveRun,
  sessionsResult,
  historyTitleCacheRef,
  sessionHistoryCacheRef,
  setHistoryTitleCache,
  saveSessionHistoryCache,
  onSendError,
  setSending,
}: SendWorkspaceGatewayMessageParams) {
  const outboundText = (options?.transportText ?? value).trim();
  const message = (options?.displayText ?? buildWorkspaceVisibleComposerMessage({
    command: options?.activeCommand,
    userMessage: value,
  })).trim();
  const outgoingAttachments = options?.attachments ?? [];
  const hasAttachments = outgoingAttachments.length > 0;
  const transportMessage = options?.activeCommand || options?.activeSkills?.length || options?.knowledgeBase || options?.workspaceDirectory?.trim()
    ? buildWorkspaceComposerTransportMessage({
      command: options?.activeCommand,
      skills: options?.activeSkills,
      knowledgeBase: options?.knowledgeBase,
      workspaceDirectory: options?.workspaceDirectory,
      userMessage: outboundText,
    })
    : outboundText;
  const gatewaySessionKey = options?.targetSessionKey?.trim()
    || currentGatewaySessionKey
    || await ensureTaskRunConversationBound(currentSessionKey, selectedAgentId);
  const targetAgentId = options?.targetAgentId?.trim() || extractAgentIdFromSessionKey(gatewaySessionKey || "") || selectedAgentId;

  if (!client?.connected || !gatewaySessionKey || (!message && !hasAttachments) || (!outboundText && !hasAttachments) || !targetAgentId) {
    return false;
  }

  const runId = crypto.randomUUID();
  if (options?.preserveSessionSwitch) {
    preserveActiveRunSessionSwitch(gatewaySessionKey);
  }
  setSelectedAgentId(targetAgentId);
  writeOptimisticSessionHistoryTitle({
    sessionKey: gatewaySessionKey,
    agentId: targetAgentId,
    displayText: message,
    sessionsResult,
    historyTitleCacheRef,
    sessionHistoryCacheRef,
    setHistoryTitleCache,
    saveSessionHistoryCache,
  });
  initializeActiveRun({
    runId,
    sessionKey: gatewaySessionKey,
    pendingUserMessage: {
      id: `pending-${runId}`,
      role: "user",
      author: "你",
      text: message,
      commandTag: options?.activeCommand?.command.trim() || undefined,
      skillTags: options?.activeSkills?.map((skill) => skill.title.trim()).filter(Boolean),
      attachments: outgoingAttachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
        transportType: attachment.transportType,
        sizeBytes: attachment.sizeBytes,
        previewUrl: attachment.previewUrl ?? null,
      })),
      time: formatClockTime(Date.now()),
    },
  });
  captureWorkspaceChatMessageSent(gatewaySessionKey, targetAgentId, options?.telemetrySessionType);
  setSending(true);

  try {
    await client.request("chat.send", {
      sessionKey: gatewaySessionKey,
      message: transportMessage,
      deliver: false,
      idempotencyKey: runId,
      attachments: buildWorkspaceGatewayChatAttachments(outgoingAttachments),
    });
    return true;
  } catch (error) {
    onSendError(error);
    return false;
  } finally {
    setSending(false);
  }
}
