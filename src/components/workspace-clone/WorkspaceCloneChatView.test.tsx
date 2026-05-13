import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceCloneChatMessageRow, WorkspaceCloneChatView, type WorkspaceCloneChatViewProps } from "./WorkspaceCloneChatView";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
}));

function buildMessage(overrides: Partial<WorkspaceMessage>): WorkspaceMessage {
  return {
    id: "message-1",
    role: "user",
    author: "You",
    text: "Plan the chat execution flow",
    time: "17:50",
    ...overrides,
  };
}

function buildChatViewProps(overrides: Partial<WorkspaceCloneChatViewProps> = {}): WorkspaceCloneChatViewProps {
  return {
    selectedEntity: null,
    chatEnabled: true,
    chatDisabledReason: undefined,
    messages: [buildMessage({ text: "最近一条历史消息" })],
    liveSteps: [],
    liveTranscriptItems: [],
    connectionError: null,
    pendingTaskRunBridge: null,
    historyLoading: false,
    isGenerating: false,
    utilityPanel: null,
    activeSessionSection: "model",
    historyItems: [],
    logs: [],
    selectedRuntimeLogId: null,
    tasks: [],
    selectedTaskId: null,
    selectedTaskRuns: [],
    taskLoading: false,
    taskRunsLoading: false,
    taskRunsLoadingId: null,
    taskActionJobId: null,
    optimisticRunningTaskIds: [],
    startupPreview: null,
    chatFailure: null,
    gatewayConnected: true,
    workbenchItems: [],
    fileItems: [],
    memoryItems: [],
    skillItems: [],
    commandItems: [],
    channelItems: [],
    toolItems: [],
    currentModelName: "main-model",
    currentProviderName: "openai",
    running: true,
    selectedWorkspaceDir: "",
    serviceStartup: {
      phase: "ready",
      message: "",
      steps: [],
      logs: [],
      error: null,
      showPanel: false,
    },
    showHomeSuggestions: false,
    onCloseUtilityPanel: () => undefined,
    onSelectSessionSection: () => undefined,
    onSelectHistorySession: () => undefined,
    onOpenRelatedResource: () => undefined,
    onOpenSettingsTextPreview: () => undefined,
    onStart: () => undefined,
    onOpenModelConfig: () => undefined,
    onOpenLogs: () => undefined,
    onSelectWorkspaceDir: () => undefined,
    onClearWorkspaceDir: () => undefined,
    onOpenChatFile: () => undefined,
    onOpenRuntimeLogDetail: () => undefined,
    onRefreshTasks: () => undefined,
    onSelectTask: () => undefined,
    onToggleTaskEnabled: () => undefined,
    onEditTask: () => undefined,
    onRunTask: () => undefined,
    onDeleteTask: () => undefined,
    onContinueStartupPreview: () => undefined,
    onRetryChatFailure: () => undefined,
    onLoadOlderHistoryPage: () => false,
    ...overrides,
  };
}

describe("WorkspaceCloneChatMessageRow", () => {
  it("renders user message time outside the bubble content", () => {
    render(
      <WorkspaceCloneChatMessageRow
        message={buildMessage({ commandTag: "/plan" })}
        selectedEntity={null}
        liveSteps={[]}
        liveTranscriptItems={[]}
        onBlankAreaClick={() => undefined}
      />,
    );

    const time = screen.getByText("17:50");
    const content = document.querySelector(".workspace-clone__message-content");

    expect(content).toBeTruthy();
    expect(content?.contains(time)).toBe(false);
    expect(time.closest(".workspace-clone__message-body")).toBeTruthy();
  });
});

describe("WorkspaceCloneChatView", () => {
  it("renders streaming transcript items in source order without duplicating stream text", () => {
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          messages: [
            buildMessage({ id: "user-1", role: "user", text: "Check the project" }),
            buildMessage({
              id: "stream-run",
              role: "assistant",
              author: "A",
              text: "I checked the first part.",
              time: "",
              status: "streaming",
            }),
          ],
          liveTranscriptItems: [
            {
              id: "step:1",
              kind: "step",
              step: {
                id: "tool-1",
                kind: "command",
                action: "command",
                status: "success",
                title: "npm run test",
                time: "18:00",
              },
            },
            {
              id: "assistant:1",
              kind: "assistant",
              text: "I checked the first part.",
              time: "18:01",
            },
            {
              id: "step:2",
              kind: "step",
              step: {
                id: "tool-2",
                kind: "search",
                action: "search",
                status: "success",
                title: "workspace live step",
                detail: "from src",
                time: "18:02",
              },
            },
          ],
        })}
      />,
    );

    const transcriptItems = [...document.querySelectorAll(".workspace-clone__run-transcript > *")];

    expect(transcriptItems).toHaveLength(3);
    expect(transcriptItems[0]?.textContent).toContain("npm run test");
    expect(transcriptItems[1]?.textContent).toContain("I checked the first part.");
    expect(transcriptItems[2]?.textContent).toContain("workspace live step");
    expect(screen.getAllByText("I checked the first part.")).toHaveLength(1);
  });

  it("renders a startup preview banner and continues the history session explicitly", () => {
    const onContinueStartupPreview = vi.fn();
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          startupPreview: {
            title: "补充 phase 计划",
            previewSessionKey: "agent:main:secondary",
          },
          onContinueStartupPreview,
        })}
      />,
    );

    expect(screen.getByText("正在预览最近历史会话")).toBeTruthy();
    expect(screen.getByText(/直接发送会从主会话开始/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "继续此历史会话" }));
    expect(onContinueStartupPreview).toHaveBeenCalledTimes(1);
  });

  it("renders a chat failure card with retry action", () => {
    const onRetryChatFailure = vi.fn();
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          chatFailure: {
            title: "模型返回错误",
            message: "provider timeout",
            source: "chat_error",
            sessionKey: "agent:main:main",
            runId: "run-1",
            sessionKind: "main",
            canRetry: true,
          },
          onRetryChatFailure,
        })}
      />,
    );

    expect(screen.getByText("模型返回错误")).toBeTruthy();
    expect(screen.getByText("provider timeout")).toBeTruthy();
    expect(screen.getByText(/session agent:main:main/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重试发送" }));
    expect(onRetryChatFailure).toHaveBeenCalledTimes(1);
  });

  it("dismisses only the current chat failure notice", () => {
    const initialFailure = {
      title: "模型运行失败",
      message: "provider timeout",
      source: "agent_error" as const,
      sessionKey: "agent:main:main",
      runId: "run-1",
      sessionKind: "main" as const,
      canRetry: true,
    };
    const nextFailure = {
      ...initialFailure,
      runId: "run-2",
      message: "network timeout",
    };
    const { rerender } = render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          chatFailure: initialFailure,
        })}
      />,
    );

    expect(screen.getByText("模型运行失败")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(screen.queryByText("provider timeout")).toBeNull();

    rerender(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          chatFailure: nextFailure,
        })}
      />,
    );

    expect(screen.getByText("network timeout")).toBeTruthy();
  });

  it("does not show a blank message stage when only hidden process echoes are present", () => {
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          messages: [
            buildMessage({
              id: "hidden-process",
              role: "assistant",
              author: "A",
              text: [
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\chat_cache.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\control_ui.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\openclaw_cli.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\channels\\qr_session.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime\\bootstrap.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime\\tests.rs",
                "D:\\Github\\DragonClaw2\\src-tauri\\src\\download.rs",
              ].join("\n"),
            }),
          ],
          liveSteps: [],
          liveTranscriptItems: [],
        })}
      />,
    );

    expect(document.querySelector(".workspace-clone__message-stage")).toBeNull();
    expect(document.querySelector(".workspace-clone__welcome-state")).toBeTruthy();
  });

  it("requests older cached messages when the message list scrolls to the top", () => {
    const onLoadOlderHistoryPage = vi.fn(async () => true);
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          messages: Array.from({ length: 3 }, (_, index) => buildMessage({
            id: `message-${index}`,
            text: `message ${index}`,
          })),
          historyPageState: {
            messages: [],
            oldestIndex: 30,
            newestIndex: 59,
            hasMoreBefore: true,
            loadingOlder: false,
            loadedFromCache: true,
            total: 90,
          },
          onLoadOlderHistoryPage,
        })}
      />,
    );

    const scroll = document.querySelector(".workspace-clone__message-scroll") as HTMLDivElement;
    Object.defineProperty(scroll, "scrollTop", { configurable: true, value: 0, writable: true });
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 300 });
    fireEvent.scroll(scroll);

    expect(onLoadOlderHistoryPage).toHaveBeenCalledTimes(1);
  });

  it("keeps the rendered message window capped for long histories", () => {
    render(
      <WorkspaceCloneChatView
        {...buildChatViewProps({
          messages: Array.from({ length: 120 }, (_, index) => buildMessage({
            id: `message-${index}`,
            text: `window message ${index}`,
          })),
        })}
      />,
    );

    expect(document.querySelectorAll(".workspace-clone__message--chat")).toHaveLength(60);
    expect(screen.queryByText("window message 0")).toBeNull();
    expect(screen.getByText("window message 119")).toBeTruthy();
  });
});
