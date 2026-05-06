import { useEffect, useMemo, useRef, useState } from "react";
import { filterWorkspaceSlashCommands, parseWorkspaceSlashSelection } from "./workspaceCloneSlashCommands";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { SavedModel } from "../../types";
import type {
  WorkspaceActiveSlashCommand,
  WorkspaceGatewayStatus,
  WorkspaceSessionSectionKey,
  WorkspaceSlashCommandDefinition,
} from "./workspaceCloneTypes";

interface WorkspaceCloneComposerProps {
  running: boolean;
  chatEnabled: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  selectedEntityName: string | null;
  currentModelName: string;
  currentModelId: string;
  draftValue: string;
  onDraftValueChange: (value: string) => void;
  scenePresetsOpen: boolean;
  showScenePresetToggle: boolean;
  onToggleScenePresets: () => void;
  onCloseScenePresets: () => void;
  sending: boolean;
  isGenerating: boolean;
  resettingSession: boolean;
  onOpenSessionSection: (target: WorkspaceSessionSectionKey) => void;
  onOpenMemoryModal: () => void;
  onOpenCommandsModal: () => void;
  onOpenEmailBindingModal: () => void;
  modelMenuOpen: boolean;
  modelMenuItems: SavedModel[];
  modelMenuLoading: boolean;
  modelMenuError: string;
  modelMenuSwitchingId: string | null;
  onToggleModelMenu: () => void;
  onCloseModelMenu: () => void;
  onRetryModelMenuLoad: () => Promise<void>;
  onSelectModelMenuItem: (modelId: string) => Promise<void>;
  onOpenModelConfig: () => void;
  emailBindingBound: boolean;
  emailBindingBoundProviderLabel: string;
  slashCommands: WorkspaceSlashCommandDefinition[];
  activeSlashCommand: WorkspaceActiveSlashCommand;
  onActivateSlashCommand: (commandId: string) => void;
  onClearActiveSlashCommand: () => void;
  onSend: (value: string) => Promise<boolean>;
  onAbort: () => Promise<boolean>;
  onResetSession: () => Promise<boolean>;
}

function formatModelLabel(modelName: string) {
  if (!modelName) {
    return "模型";
  }

  return modelName.length > 16 ? `${modelName.slice(0, 16)}...` : modelName;
}

function resolveComposerStatusText(params: {
  chatEnabled: boolean;
  running: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  isGenerating: boolean;
}) {
  const { chatEnabled, running, connectionStatus, isGenerating } = params;

  if (!chatEnabled) {
    return "当前仅支持已绑定 Agent 的聊天";
  }
  if (!running) {
    return "服务尚未启动";
  }
  if (connectionStatus === "connected") {
    return isGenerating ? "正在生成回复" : "会话已连接";
  }
  if (connectionStatus === "connecting") {
    return "连接中";
  }

  return "连接异常";
}

function resolveModelMenuOption(model: SavedModel) {
  const [providerLabel, ...modelParts] = model.id.split("/");
  const modelLabel = modelParts.length > 0 ? modelParts.join("/") : model.id;

  return {
    id: model.id,
    modelLabel,
    providerLabel,
    displayLabel: model.name?.trim() || modelLabel,
  };
}

export function WorkspaceCloneComposer({
  running,
  chatEnabled,
  connectionStatus,
  currentModelName,
  currentModelId,
  draftValue,
  onDraftValueChange,
  scenePresetsOpen,
  showScenePresetToggle,
  onToggleScenePresets,
  onCloseScenePresets,
  sending,
  isGenerating,
  resettingSession,
  onOpenCommandsModal,
  onOpenEmailBindingModal,
  modelMenuOpen,
  modelMenuItems,
  modelMenuLoading,
  modelMenuError,
  modelMenuSwitchingId,
  onToggleModelMenu,
  onCloseModelMenu,
  onRetryModelMenuLoad,
  onSelectModelMenuItem,
  onOpenModelConfig,
  emailBindingBound,
  emailBindingBoundProviderLabel,
  slashCommands,
  activeSlashCommand,
  onActivateSlashCommand,
  onClearActiveSlashCommand,
  onSend,
  onAbort,
  onResetSession,
}: WorkspaceCloneComposerProps) {
  const canSend = chatEnabled && running && connectionStatus === "connected" && !sending && !isGenerating;
  const [highlightedCommandIndex, setHighlightedCommandIndex] = useState(0);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const statusText = resolveComposerStatusText({
    chatEnabled,
    running,
    connectionStatus,
    isGenerating,
  });
  const modelMenuOptions = useMemo(
    () => modelMenuItems.map((item) => resolveModelMenuOption(item)),
    [modelMenuItems],
  );
  const isModelMenuBusy = Boolean(modelMenuSwitchingId);
  const slashSelection = useMemo(() => parseWorkspaceSlashSelection(draftValue), [draftValue]);
  const filteredSlashCommands = useMemo(
    () => filterWorkspaceSlashCommands(slashCommands, slashSelection?.query || ""),
    [slashCommands, slashSelection?.query],
  );
  const showSlashSuggestions = Boolean(slashSelection && filteredSlashCommands.length > 0);

  useEffect(() => {
    setHighlightedCommandIndex(0);
  }, [draftValue]);

  useEffect(() => {
    if (!modelMenuOpen) {
      return undefined;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        onCloseModelMenu();
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseModelMenu();
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [modelMenuOpen, onCloseModelMenu]);

  useEffect(() => {
    if (!chatEnabled) {
      onCloseModelMenu();
    }
  }, [chatEnabled, onCloseModelMenu]);

  const handleSelectSlashCommand = (commandId: string) => {
    const nextDraft = slashSelection?.remainder || "";
    onActivateSlashCommand(commandId);
    onDraftValueChange(nextDraft);
    setHighlightedCommandIndex(0);
  };

  const handleSubmit = async () => {
    const nextValue = draftValue.trim();
    if (showSlashSuggestions) {
      const selectedCommand = filteredSlashCommands[highlightedCommandIndex] || filteredSlashCommands[0];
      if (selectedCommand) {
        handleSelectSlashCommand(selectedCommand.id);
        return;
      }
    }

    if (!canSend || !nextValue) {
      return;
    }

    onCloseScenePresets();
    const success = await onSend(nextValue);
    if (success) {
      onDraftValueChange("");
      onClearActiveSlashCommand();
    }
  };

  const handleSelectModel = async (modelId: string) => {
    await onSelectModelMenuItem(modelId);
    onCloseModelMenu();
  };

  return (
    <div className="workspace-clone__composer">
      <div className="workspace-clone__input-shell">
        {activeSlashCommand ? (
          <div className="workspace-clone__composer-command-chip">
            <div className="workspace-clone__composer-command-copy">
              <span className="workspace-clone__resource-tag">命令</span>
              <strong>{activeSlashCommand.command}</strong>
              <small>{activeSlashCommand.description || activeSlashCommand.name}</small>
            </div>
            <button
              type="button"
              className="workspace-clone__composer-command-clear"
              onClick={onClearActiveSlashCommand}
              aria-label="清除当前命令"
            >
              <WorkspaceCloneIcon name="x" size={14} strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <textarea
          value={draftValue}
          onChange={(event) => onDraftValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (showSlashSuggestions) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedCommandIndex((current) => (current + 1) % filteredSlashCommands.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedCommandIndex((current) =>
                  current <= 0 ? filteredSlashCommands.length - 1 : current - 1,
                );
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const selectedCommand = filteredSlashCommands[highlightedCommandIndex] || filteredSlashCommands[0];
                if (selectedCommand) {
                  handleSelectSlashCommand(selectedCommand.id);
                  return;
                }
              }
            }

            if ((event.key === "Backspace" || event.key === "Delete") && !draftValue.trim() && activeSlashCommand) {
              onClearActiveSlashCommand();
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="输入你的任务、问题或想法"
          disabled={!chatEnabled || !running || connectionStatus !== "connected" || isGenerating}
        />

        {showSlashSuggestions ? (
          <div className="workspace-clone__suggestion-layer">
            {filteredSlashCommands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={index === highlightedCommandIndex ? "is-active" : ""}
                onClick={() => handleSelectSlashCommand(command.id)}
              >
                <strong>{command.command}</strong>
                <span>{command.description || command.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="workspace-clone__composer-bottom">
          <div className="workspace-clone__composer-pills">
            {showScenePresetToggle ? (
              <button
                type="button"
                className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted ${scenePresetsOpen ? "is-active" : ""}`}
                onClick={onToggleScenePresets}
                disabled={!chatEnabled}
                aria-pressed={scenePresetsOpen}
              >
                <WorkspaceCloneIcon name="sparkles" size={14} strokeWidth={1.9} />
                场景
              </button>
            ) : null}
            <button
              type="button"
              className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted ${emailBindingBound ? "is-active" : ""}`}
              onClick={onOpenEmailBindingModal}
              disabled={!chatEnabled}
            >
              <WorkspaceCloneIcon name="mail" size={14} strokeWidth={1.9} />
              {emailBindingBound ? `邮箱 ${emailBindingBoundProviderLabel || "已绑定"}` : "邮箱"}
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted"
              onClick={onOpenCommandsModal}
              disabled={!chatEnabled}
            >
              <WorkspaceCloneIcon name="terminal" size={14} strokeWidth={1.9} />
              命令
            </button>
            <div className="workspace-clone__composer-model-menu" ref={modelMenuRef}>
              <button
                type="button"
                className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted ${modelMenuOpen ? "is-active" : ""}`}
                onClick={onToggleModelMenu}
                disabled={!chatEnabled}
                aria-expanded={modelMenuOpen}
                aria-haspopup="menu"
              >
                <WorkspaceCloneIcon name="bot" size={14} strokeWidth={1.9} />
                模型 {formatModelLabel(currentModelName)}
                <WorkspaceCloneIcon
                  name="chevron"
                  size={12}
                  strokeWidth={2}
                  className={`workspace-clone__composer-model-menu-caret ${modelMenuOpen ? "is-open" : ""}`}
                />
              </button>

              {modelMenuOpen ? (
                <div className="workspace-clone__composer-model-popover" role="menu" aria-label="模型列表">
                  <div className="workspace-clone__composer-model-list">
                    {modelMenuLoading ? (
                      <div className="workspace-clone__composer-model-state">
                        <strong>正在加载模型列表…</strong>
                        <span>稍候即可显示已保存模型。</span>
                      </div>
                    ) : modelMenuError ? (
                      <div className="workspace-clone__composer-model-state is-error">
                        <strong>加载模型列表失败</strong>
                        <span>{modelMenuError}</span>
                        <button
                          type="button"
                          className="workspace-clone__composer-model-retry"
                          onClick={() => void onRetryModelMenuLoad()}
                        >
                          <WorkspaceCloneIcon name="refresh" size={12} strokeWidth={2} />
                          重试
                        </button>
                      </div>
                    ) : modelMenuOptions.length > 0 ? (
                      modelMenuOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={[
                            "workspace-clone__composer-model-option",
                            currentModelId === option.id ? "is-selected" : "",
                            modelMenuSwitchingId === option.id ? "is-switching" : "",
                          ].join(" ").trim()}
                          onClick={() => void handleSelectModel(option.id)}
                          disabled={isModelMenuBusy}
                          title={option.displayLabel}
                        >
                          <span className="workspace-clone__composer-model-option-copy">
                            <strong>{option.modelLabel}</strong>
                            <small>{option.providerLabel || option.displayLabel}</small>
                          </span>
                          <span className="workspace-clone__composer-model-option-indicator" aria-hidden="true" />
                        </button>
                      ))
                    ) : (
                      <div className="workspace-clone__composer-model-state">
                        <strong>暂无已保存模型</strong>
                        <span>先去配置自定义模型，保存后就会出现在这里。</span>
                      </div>
                    )}
                  </div>

                  <div className="workspace-clone__composer-model-footer">
                    <button
                      type="button"
                      className="workspace-clone__composer-model-custom"
                      onClick={onOpenModelConfig}
                      disabled={isModelMenuBusy}
                    >
                      <WorkspaceCloneIcon name="plus" size={14} strokeWidth={2} />
                      配置自定义模型
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <span className={`workspace-clone__composer-status ${running && connectionStatus === "connected" ? "is-online" : "is-idle"}`}>
            {statusText}
          </span>

          <div className="workspace-clone__composer-actions">
            <button
              type="button"
              className="workspace-clone__composer-action-text"
              onClick={() => void onResetSession()}
              disabled={!chatEnabled || !running || connectionStatus !== "connected" || resettingSession}
            >
              {resettingSession ? "重置中..." : "新对话"}
            </button>
            <button type="button" className="workspace-clone__composer-icon-round" title="语音" disabled>
              <WorkspaceCloneIcon name="voice" size={15} strokeWidth={1.9} />
            </button>
            {isGenerating ? (
              <button
                type="button"
                className="workspace-clone__composer-icon-round workspace-clone__composer-stop"
                title="停止生成"
                onClick={() => void onAbort()}
              >
                <WorkspaceCloneIcon name="x" size={15} strokeWidth={2.1} />
              </button>
            ) : (
              <button
                type="button"
                className="workspace-clone__composer-icon-round workspace-clone__composer-send"
                title="发送"
                onClick={() => void handleSubmit()}
                disabled={!canSend || !draftValue.trim()}
              >
                <WorkspaceCloneIcon name="chevron-right" size={16} strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
