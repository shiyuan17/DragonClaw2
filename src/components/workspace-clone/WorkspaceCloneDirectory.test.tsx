import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { WorkspaceCloneDirectory } from "./WorkspaceCloneDirectory";
import type { WorkspaceEntity, WorkspaceHistoryItem } from "./workspaceCloneTypes";

function buildRecentSessions(agentId: string): WorkspaceHistoryItem[] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `agent:${agentId}:session-${index}`,
    sessionKey: `agent:${agentId}:session-${index}`,
    title: `Session ${agentId} ${index}`,
    subtitle: "",
    time: "18:00",
    updatedAt: 1_000 - index,
    kind: "gateway",
    isMain: index === 0,
  }));
}

function buildAgentEntities(count: number): WorkspaceEntity[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `agent-${index}`;
    return {
      id,
      entityType: "agents",
      name: `Agent ${index}`,
      searchText: id,
      subtitle: `last summary ${index}`,
      recentSessions: buildRecentSessions(id),
      status: "online",
      avatarLabel: String(index + 1),
      accent: id,
      currentWork: "Ready",
      recentOutput: "model",
    };
  });
}

function cloneEntities(entities: WorkspaceEntity[]) {
  return entities.map((entity) => ({
    ...entity,
    recentSessions: entity.recentSessions?.map((session) => ({ ...session })),
  }));
}

function buildDirectoryProps(
  overrides: Partial<ComponentProps<typeof WorkspaceCloneDirectory>> = {},
): ComponentProps<typeof WorkspaceCloneDirectory> {
  return {
    typeTabs: [{ key: "agents", label: "Agents", icon: "message-circle" }],
    activeType: "agents",
    entities: buildAgentEntities(100),
    selectedEntityId: "agent-0",
    currentSessionKey: "agent:agent-1:session-0",
    isCollapsed: false,
    searchQuery: "",
    contextMenu: null,
    channelBindingModal: {
      open: false,
      channelId: "",
      channelName: "",
      accountId: "",
      accountLabel: "",
      view: "placeholder",
      implemented: false,
    },
    channelBindingAgents: [],
    channelBindingAgentId: "",
    channelBindingModalLoading: false,
    channelBindingModalSaving: false,
    channelBindingNotice: "",
    channelBindingError: "",
    weixinQrStarting: false,
    weixinQrPolling: false,
    weixinQrUrl: "",
    weixinQrImageUrl: "",
    weixinQrDetail: "",
    weixinQrLogs: [],
    hasActiveWeixinQrSession: false,
    isCurrentWeixinChannelAlreadyBound: false,
    weixinQrStatusTone: "",
    weixinQrStatusText: "",
    feishuQrRequesting: false,
    feishuQrChecking: false,
    feishuQrVisible: false,
    feishuQrTargetUrl: "",
    feishuQrUserCode: "",
    feishuQrExpiresAtMs: null,
    feishuAppId: "",
    feishuAppSecret: "",
    feishuAppSecretConfigured: false,
    feishuAppSecretVisible: false,
    feishuDmPolicy: "",
    feishuManualExpanded: false,
    feishuAllowFromDraft: "",
    feishuAllowFromSessionIds: [],
    onToggleCollapsed: vi.fn(),
    onSelectType: vi.fn(),
    onSelectEntity: vi.fn(),
    onSelectSession: vi.fn(),
    onSearchChange: vi.fn(),
    onOpenContextMenu: vi.fn(),
    onCloseContextMenu: vi.fn(),
    onOpenChannelBindingModal: vi.fn(),
    onCloseChannelBindingModal: vi.fn(),
    onSelectChannelBindingAgent: vi.fn(),
    onStartWeixinQrBinding: vi.fn(),
    onOpenExternalBindingLink: vi.fn(),
    onRequestFeishuQr: vi.fn(),
    onCheckFeishuQr: vi.fn(),
    onChangeFeishuAppId: vi.fn(),
    onChangeFeishuAppSecret: vi.fn(),
    onChangeFeishuDmPolicy: vi.fn(),
    onChangeFeishuAllowFromDraft: vi.fn(),
    onAddFeishuAllowFromSessionId: vi.fn(),
    onRemoveFeishuAllowFromSessionId: vi.fn(),
    onToggleFeishuManualExpanded: vi.fn(),
    onToggleFeishuAppSecretVisible: vi.fn(),
    onSaveChannelBinding: vi.fn(),
    onRemoveChannelBinding: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceCloneDirectory", () => {
  it("keeps session active changes scoped to the old and new agent branches", () => {
    const branchRenderCounts = new Map<string, number>();
    const countBranchRender = (entityId: string) => {
      branchRenderCounts.set(entityId, (branchRenderCounts.get(entityId) ?? 0) + 1);
    };
    const initialEntities = buildAgentEntities(100);

    const { rerender } = render(
      <WorkspaceCloneDirectory
        {...buildDirectoryProps({
          entities: initialEntities,
          agentBranchRenderCounter: countBranchRender,
        })}
      />,
    );

    expect(branchRenderCounts.size).toBe(100);
    branchRenderCounts.clear();

    rerender(
      <WorkspaceCloneDirectory
        {...buildDirectoryProps({
          entities: cloneEntities(initialEntities),
          currentSessionKey: "agent:agent-2:session-1",
          onSelectEntity: vi.fn(),
          onSelectSession: vi.fn(),
          agentBranchRenderCounter: countBranchRender,
        })}
      />,
    );

    expect([...branchRenderCounts.keys()].sort()).toEqual(["agent-1", "agent-2"]);
  });
});
