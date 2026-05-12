import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { mergeWorkspaceComposerAttachments, readWorkspaceComposerFiles } from "./workspaceCloneChatAttachments";
import { WorkspaceCloneComposerAttachmentList, WorkspaceCloneComposerDropzone } from "./WorkspaceCloneComposerAttachments";
import { WorkspaceCloneComposerSuggestionPopover, type WorkspaceComposerSuggestionItem, type WorkspaceComposerSuggestionSection } from "./WorkspaceCloneComposerSuggestionPopover";
import { filterWorkspaceSlashCommands, parseWorkspaceSlashSelection } from "./workspaceCloneSlashCommands";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { resolveWorkspaceMailProviderIcon } from "./workspaceCloneMailProviderIcons";
import { WorkspaceCloneSessionWorkdirPicker } from "./WorkspaceCloneSessionWorkdirPicker";
import { useWorkspaceComposerFileDrop } from "./useWorkspaceComposerFileDrop";
import type { SavedModel } from "../../types";
import type { WorkspaceActiveSkillList, WorkspaceActiveSlashCommand, WorkspaceComposerAttachment, WorkspaceGatewayStatus, WorkspaceSessionSectionKey, WorkspaceSlashCommandDefinition, WorkspaceSkillOption } from "./workspaceCloneTypes";
interface WorkspaceCloneComposerProps {
  sessionKey: string;
  running: boolean;
  chatEnabled: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  selectedEntityName: string | null;
  currentModelName: string;
  currentModelId: string;
  selectedKnowledgeBaseName: string;
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
  onOpenKnowledgePanel: () => void;
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
  emailBindingBoundProvider: string;
  emailBindingBoundAccount: string;
  emailBindingBoundProviderLabel: string;
  selectedWorkspaceDir: string;
  slashCommands: WorkspaceSlashCommandDefinition[];
  skillOptions: WorkspaceSkillOption[];
  activeSlashCommand: WorkspaceActiveSlashCommand;
  activeSkills: WorkspaceActiveSkillList;
  onActivateSlashCommand: (commandId: string) => void;
  onClearActiveSlashCommand: () => void;
  onAppendSkill: (skillId: string) => void;
  onRemoveActiveSkill: (skillId: string) => void;
  onClearActiveSkills: () => void;
  onSelectWorkspaceDir: () => Promise<void> | void;
  onClearWorkspaceDir: () => void;
  onSend: (value: string, attachments: WorkspaceComposerAttachment[]) => Promise<boolean>;
  onAbort: () => Promise<boolean>;
  onResetSession: () => Promise<boolean>;
}
function formatModelLabel(modelName: string) {
  if (!modelName) {
    return "模型";
  }

  return modelName.length > 16 ? `${modelName.slice(0, 16)}...` : modelName;
}

function resolveComposerStatusText(params: { chatEnabled: boolean; running: boolean; connectionStatus: WorkspaceGatewayStatus; isGenerating: boolean }) {
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
  const [providerKey, ...modelParts] = model.id.split("/");
  const modelLabel = modelParts.length > 0 ? modelParts.join("/") : model.id;
  const providerLabelFromName = model.name?.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
  return { id: model.id, modelLabel, providerLabel: providerLabelFromName || providerKey, displayLabel: model.name?.trim() || modelLabel };
}

function renderEmailBindingIcon(provider: string, isBound: boolean) {
  if (!isBound) {
    return <WorkspaceCloneIcon name="mail" size={14} strokeWidth={1.9} />;
  }

  return <img className="workspace-clone__composer-provider-icon" src={resolveWorkspaceMailProviderIcon(provider)} alt="" aria-hidden="true" />;
}

function filterWorkspaceSkillSuggestions(items: WorkspaceSkillOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const haystack = [item.title, item.description, item.tag].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
function resolveSkillMetaLabel(skill: WorkspaceSkillOption, selectedSkillIds: Set<string>) {
  if (selectedSkillIds.has(skill.id)) {
    return "已选择";
  }

  switch (skill.tag) {
    case "Built-in":
      return "内置";
    case "Installed":
      return "已安装";
    case "Configured":
      return "已配置";
    case "Disabled":
      return "已禁用";
    case "Blocked":
      return "受限";
    default:
      return skill.selected ? "已启用" : skill.tag.trim();
  }
}
function focusComposerTextarea(ref: RefObject<HTMLTextAreaElement | null>) { window.requestAnimationFrame(() => ref.current?.focus()); }
export function WorkspaceCloneComposer({
  sessionKey,
  running,
  chatEnabled,
  connectionStatus,
  currentModelName,
  currentModelId,
  selectedKnowledgeBaseName,
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
  onOpenKnowledgePanel,
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
  emailBindingBoundProvider,
  emailBindingBoundAccount,
  emailBindingBoundProviderLabel,
  selectedWorkspaceDir,
  slashCommands,
  skillOptions,
  activeSlashCommand,
  activeSkills,
  onActivateSlashCommand,
  onClearActiveSlashCommand,
  onAppendSkill,
  onRemoveActiveSkill,
  onClearActiveSkills,
  onSelectWorkspaceDir,
  onClearWorkspaceDir,
  onSend,
  onAbort,
  onResetSession,
}: WorkspaceCloneComposerProps) {
  const canSend = chatEnabled && running && connectionStatus === "connected" && !sending && !isGenerating;
  const attachmentsDisabled = !chatEnabled || sending || isGenerating;
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [composerAttachments, setComposerAttachments] = useState<WorkspaceComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const statusText = resolveComposerStatusText({ chatEnabled, running, connectionStatus, isGenerating });
  const showStatusPill = !chatEnabled || !running || connectionStatus !== "connected" || isGenerating;
  const knowledgeBaseStatusText = selectedKnowledgeBaseName ? `当前知识库：${selectedKnowledgeBaseName}` : "";
  const modelMenuOptions = useMemo(() => modelMenuItems.map((item) => resolveModelMenuOption(item)), [modelMenuItems]);
  const isModelMenuBusy = Boolean(modelMenuSwitchingId);
  const selectedSkillIds = useMemo(() => new Set(activeSkills.map((item) => item.id)), [activeSkills]);
  const slashSelection = useMemo(() => parseWorkspaceSlashSelection(draftValue), [draftValue]);
  const filteredSlashCommands = useMemo(() => filterWorkspaceSlashCommands(slashCommands, slashSelection?.query || ""), [slashCommands, slashSelection?.query]);
  const filteredSkillSuggestions = useMemo(() => filterWorkspaceSkillSuggestions(skillOptions, slashSelection?.query || ""), [skillOptions, slashSelection?.query]);
  const suggestionSections = useMemo<WorkspaceComposerSuggestionSection[]>(() => {
    const nextSections: WorkspaceComposerSuggestionSection[] = [];
    if (filteredSlashCommands.length > 0) {
      nextSections.push({
        key: "commands",
        label: "命令",
        items: filteredSlashCommands.map((command) => ({
          key: `command:${command.id}`,
          kind: "command",
          title: command.command,
          subtitle: command.description || command.name,
          meta: activeSlashCommand?.id === command.id ? "已选择" : "命令",
          command,
        })),
      });
    }
    if (filteredSkillSuggestions.length > 0) {
      nextSections.push({
        key: "skills",
        label: "技能",
        items: filteredSkillSuggestions.map((skill) => ({
          key: `skill:${skill.id}`,
          kind: "skill",
          title: skill.title,
          subtitle: skill.description,
          meta: resolveSkillMetaLabel(skill, selectedSkillIds),
          skill,
        })),
      });
    }

    return nextSections;
  }, [activeSlashCommand?.id, filteredSkillSuggestions, filteredSlashCommands, selectedSkillIds]);
  const flatSuggestions = useMemo(() => suggestionSections.flatMap((section) => section.items), [suggestionSections]);
  const hasAttachments = composerAttachments.length > 0;
  const canSubmit = canSend && (draftValue.trim().length > 0 || hasAttachments);
  const showSlashSuggestions = Boolean(slashSelection);

  useEffect(() => {
    setHighlightedSuggestionIndex(0);
  }, [draftValue]);

  useEffect(() => {
    setComposerAttachments([]);
    setAttachmentError("");
  }, [sessionKey]);

  useEffect(() => {
    if (highlightedSuggestionIndex < flatSuggestions.length) {
      return;
    }
    setHighlightedSuggestionIndex(0);
  }, [flatSuggestions.length, highlightedSuggestionIndex]);

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

  const clearSlashQuery = () => {
    onDraftValueChange(slashSelection?.remainder || "");
    setHighlightedSuggestionIndex(0);
  };

  const handleSelectSlashCommand = (commandId: string) => {
    onActivateSlashCommand(commandId);
    clearSlashQuery();
    focusComposerTextarea(textareaRef);
  };

  const handleSelectSkill = (skillId: string) => {
    onAppendSkill(skillId);
    clearSlashQuery();
    focusComposerTextarea(textareaRef);
  };

  const handleSelectSuggestion = (item: WorkspaceComposerSuggestionItem) => {
    if (item.kind === "command") {
      handleSelectSlashCommand(item.command.id);
      return;
    }

    handleSelectSkill(item.skill.id);
  };

  const handleDismissSlashSuggestions = () => {
    clearSlashQuery();
    focusComposerTextarea(textareaRef);
  };

  const appendFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setAttachmentError("");
    try {
      const nextAttachments = await readWorkspaceComposerFiles(files);
      setComposerAttachments((current) => mergeWorkspaceComposerAttachments(current, nextAttachments));
      focusComposerTextarea(textareaRef);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "读取附件失败");
    }
  };

  const handleAttachmentInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await appendFiles(files);
  };

  const handleOpenAttachmentPicker = () => {
    if (attachmentsDisabled) return;
    attachmentInputRef.current?.click();
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    focusComposerTextarea(textareaRef);
  };
  const { rootRef, isDragActive, rootDragProps } = useWorkspaceComposerFileDrop({
    disabled: attachmentsDisabled,
    onDropFiles: appendFiles,
  });

  const handleSubmit = async () => {
    const nextValue = draftValue.trim();
    if (showSlashSuggestions) {
      const selectedSuggestion = flatSuggestions[highlightedSuggestionIndex] || flatSuggestions[0];
      if (selectedSuggestion) {
        handleSelectSuggestion(selectedSuggestion);
        return;
      }
    }
    if (!canSubmit) {
      return;
    }
    onCloseScenePresets();
    const success = await onSend(nextValue, composerAttachments);
    if (success) {
      onDraftValueChange("");
      onClearActiveSlashCommand();
      onClearActiveSkills();
      setComposerAttachments([]);
      setAttachmentError("");
    }
  };

  const handleSelectModel = async (modelId: string) => {
    await onSelectModelMenuItem(modelId);
    onCloseModelMenu();
  };

  return (
    <div className="workspace-clone__composer">
      <div
        ref={rootRef}
        className={`workspace-clone__input-shell ${isDragActive ? "is-drag-active" : ""}`}
        {...rootDragProps}
      >
        <input
          ref={attachmentInputRef}
          className="workspace-clone__composer-attachment-input"
          type="file"
          multiple
          onChange={(event) => {
            void handleAttachmentInputChange(event);
          }}
        />

        {isDragActive ? (
          <WorkspaceCloneComposerDropzone
            attachmentCount={composerAttachments.length}
          />
        ) : null}

        {showSlashSuggestions ? (
          <WorkspaceCloneComposerSuggestionPopover highlightedSuggestionIndex={highlightedSuggestionIndex} flatSuggestions={flatSuggestions} suggestionSections={suggestionSections} onSelectSuggestion={handleSelectSuggestion} />
        ) : null}

        {hasAttachments ? (
          <WorkspaceCloneComposerAttachmentList
            attachments={composerAttachments}
            onRemoveAttachment={handleRemoveAttachment}
          />
        ) : null}

        {attachmentError ? (
          <div className="workspace-clone__composer-attachment-error" role="status">
            {attachmentError}
          </div>
        ) : null}

        {activeSlashCommand || activeSkills.length > 0 ? (
          <div className="workspace-clone__composer-selection-tags">
            {activeSlashCommand ? (
              <div className="workspace-clone__composer-selection-tag">
                <button
                  type="button"
                  className="workspace-clone__composer-selection-tag-icon-button is-command"
                  onClick={() => {
                    onClearActiveSlashCommand();
                    focusComposerTextarea(textareaRef);
                  }}
                  aria-label="清除当前命令"
                >
                  <span className="workspace-clone__composer-selection-tag-icon workspace-clone__composer-selection-tag-icon-face is-default">
                    <WorkspaceCloneIcon name="terminal" size={10} strokeWidth={1.9} />
                  </span>
                  <span className="workspace-clone__composer-selection-tag-icon workspace-clone__composer-selection-tag-icon-face is-clear">
                    <WorkspaceCloneIcon name="x" size={11} strokeWidth={2.1} />
                  </span>
                </button>
                <span className="workspace-clone__composer-selection-tag-text">{activeSlashCommand.command}</span>
              </div>
            ) : null}

            {activeSkills.map((skill) => (
              <div key={skill.id} className="workspace-clone__composer-selection-tag">
                <button
                  type="button"
                  className="workspace-clone__composer-selection-tag-icon-button is-skill"
                  onClick={() => {
                    onRemoveActiveSkill(skill.id);
                    focusComposerTextarea(textareaRef);
                  }}
                  aria-label={`清除技能 ${skill.title}`}
                >
                  <span className="workspace-clone__composer-selection-tag-icon workspace-clone__composer-selection-tag-icon-face is-default">
                    <WorkspaceCloneIcon name="sparkles" size={10} strokeWidth={1.9} />
                  </span>
                  <span className="workspace-clone__composer-selection-tag-icon workspace-clone__composer-selection-tag-icon-face is-clear">
                    <WorkspaceCloneIcon name="x" size={11} strokeWidth={2.1} />
                  </span>
                </button>
                <span className="workspace-clone__composer-selection-tag-text">{skill.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={draftValue}
          onChange={(event) => onDraftValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (showSlashSuggestions) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (flatSuggestions.length > 0) {
                  setHighlightedSuggestionIndex((current) => (current + 1) % flatSuggestions.length);
                }
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (flatSuggestions.length > 0) {
                  setHighlightedSuggestionIndex((current) =>
                    current <= 0 ? flatSuggestions.length - 1 : current - 1,
                  );
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                handleDismissSlashSuggestions();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const selectedSuggestion = flatSuggestions[highlightedSuggestionIndex] || flatSuggestions[0];
                if (selectedSuggestion) {
                  handleSelectSuggestion(selectedSuggestion);
                }
                return;
              }
            }

            if ((event.key === "Backspace" || event.key === "Delete") && !draftValue.trim()) {
              if (activeSkills.length > 0) {
                onRemoveActiveSkill(activeSkills[activeSkills.length - 1].id);
                return;
              }
              if (activeSlashCommand) {
                onClearActiveSlashCommand();
                return;
              }
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="输入你的任务、问题或想法"
          disabled={!chatEnabled || !running || connectionStatus !== "connected" || isGenerating}
        />

        <div className="workspace-clone__composer-bottom">
          <div className="workspace-clone__composer-pills">
            <button
              type="button"
              className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--icon-only ${hasAttachments ? "is-active" : ""}`}
              onClick={handleOpenAttachmentPicker}
              disabled={attachmentsDisabled}
              aria-label={hasAttachments ? `已选 ${composerAttachments.length} 个附件` : "添加附件"}
              title={hasAttachments ? `已选 ${composerAttachments.length} 个附件` : "添加附件"}
            >
              <WorkspaceCloneIcon name="paperclip" size={14} strokeWidth={1.9} />
            </button>
            {showScenePresetToggle ? (
              <button
                type="button"
                className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--icon-only ${scenePresetsOpen ? "is-active" : ""}`}
                onClick={onToggleScenePresets}
                disabled={!chatEnabled}
                aria-pressed={scenePresetsOpen}
                aria-label="场景"
                title="场景"
              >
                <WorkspaceCloneIcon name="sparkles" size={14} strokeWidth={1.9} />
                场景
              </button>
            ) : null}
            <WorkspaceCloneSessionWorkdirPicker variant="composer" selectedPath={selectedWorkspaceDir} disabled={!chatEnabled} onSelectDirectory={onSelectWorkspaceDir} onClearDirectory={onClearWorkspaceDir} />
            <button
              type="button"
              className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--icon-only ${selectedKnowledgeBaseName ? "is-active" : ""}`}
              onClick={onOpenKnowledgePanel}
              disabled={!chatEnabled}
              aria-label={knowledgeBaseStatusText || "知识库"}
              title={knowledgeBaseStatusText || "知识库"}
            >
              <WorkspaceCloneIcon name="book-open" size={14} strokeWidth={1.9} />
              知识库
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--icon-only workspace-clone__composer-pill--email-binding"
              onClick={onOpenEmailBindingModal}
              disabled={!chatEnabled}
              title={emailBindingBound ? (emailBindingBoundAccount || emailBindingBoundProviderLabel || "邮箱") : "邮箱"}
              aria-label={emailBindingBound ? (emailBindingBoundAccount || emailBindingBoundProviderLabel || "邮箱") : "邮箱"}
            >
              {renderEmailBindingIcon(emailBindingBoundProvider, emailBindingBound)}
              <span className="workspace-clone__composer-pill-label">
                {emailBindingBound ? (emailBindingBoundAccount || emailBindingBoundProviderLabel || "已绑定") : "邮箱"}
              </span>
              {emailBindingBound ? `邮箱 ${emailBindingBoundProviderLabel || "已绑定"}` : "邮箱"}
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--icon-only"
              onClick={onOpenCommandsModal}
              disabled={!chatEnabled}
              aria-label="命令"
              title="命令"
            >
              <WorkspaceCloneIcon name="terminal" size={14} strokeWidth={1.9} />
              命令
            </button>
            <div className="workspace-clone__composer-model-menu" ref={modelMenuRef}>
              <button
                type="button"
                className={`workspace-clone__composer-pill workspace-clone__composer-pill--muted workspace-clone__composer-pill--model-label ${modelMenuOpen ? "is-active" : ""}`}
                onClick={onToggleModelMenu}
                disabled={!chatEnabled}
                aria-expanded={modelMenuOpen}
                aria-haspopup="menu"
                data-model-label={formatModelLabel(currentModelName)}
                title={currentModelName || "模型"}
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
                        <span>稍后即可显示已保存模型。</span>
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

          {knowledgeBaseStatusText ? (
            <button
              type="button"
              className="workspace-clone__composer-knowledge-status"
              onClick={onOpenKnowledgePanel}
              disabled={!chatEnabled}
              title="打开知识库"
            >
              {knowledgeBaseStatusText}
            </button>
          ) : null}

          {showStatusPill ? (
            <span className={`workspace-clone__composer-status ${running && connectionStatus === "connected" ? "is-online" : "is-idle"}`}>
              {statusText}
            </span>
          ) : null}

          <div className="workspace-clone__composer-actions">
            <button
              type="button"
              className="workspace-clone__composer-icon-round"
              onClick={() => void onResetSession()}
              disabled={!chatEnabled || !running || connectionStatus !== "connected" || resettingSession}
              title={resettingSession ? "重置中" : "新对话"}
              aria-label={resettingSession ? "重置中" : "新对话"}
            >
              <WorkspaceCloneIcon
                name={resettingSession ? "refresh" : "message-square-plus"}
                size={15}
                strokeWidth={2}
              />
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
                disabled={!canSubmit}
              >
                <WorkspaceCloneIcon name="send-horizontal" size={15} strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
