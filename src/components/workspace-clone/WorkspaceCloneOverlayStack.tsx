import { useEffect, useState } from "react";
import { Modal, ModalFooter } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import {
  formatWorkspaceCronDuration,
  formatWorkspaceCronPayloadPreview,
  formatWorkspaceCronScheduleSummary,
  formatWorkspaceCronSessionTarget,
  formatWorkspaceCronTimestamp,
  getWorkspaceCronDisplayStatus,
  getWorkspaceCronStatusLabel,
  getWorkspaceCronStatusTone,
} from "./workspaceCloneCron";
import { WorkspaceCloneAvatarModal } from "./WorkspaceCloneAvatarModal";
import { WorkspaceCloneAgentInfoModal } from "./WorkspaceCloneAgentInfoModal";
import { WorkspaceCloneCommandsModal } from "./WorkspaceCloneCommandsModal";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WorkspaceCloneMemoryModal } from "./WorkspaceCloneMemoryModal";
import { WorkspaceCloneSkillsModal } from "./WorkspaceCloneSkillsModal";
import { WorkspaceCloneToolPermissionsModal } from "./WorkspaceCloneToolPermissionsModal";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";
import type {
  WorkspaceCloneAvatarCategoryId,
  WorkspaceCloneAvatarOption,
} from "./workspaceCloneAvatarPresets";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
  WorkspaceEntity,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceRuntimeLogItem,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
  WorkspaceToolCategory,
  WorkspaceToolOption,
} from "./workspaceCloneTypes";

interface WorkspaceCloneOverlayStackProps {
  selectedEntity: WorkspaceEntity | null;
  showAvatarModal: boolean;
  showAgentInfo: boolean;
  showMemoryModal: boolean;
  showSkillsModal: boolean;
  showToolsModal: boolean;
  showRuntimeLogDetail?: boolean;
  runtimeLog: WorkspaceRuntimeLogItem | null;
  showSettingsTextPreview: boolean;
  relatedResource: WorkspaceRelatedResource;
  memoryFiles: WorkspaceMemoryFile[];
  selectedMemoryFileId: string;
  memoryDraftContent: string;
  memoryLoading: boolean;
  memorySaving: boolean;
  memoryNotice: string;
  memoryError: string;
  skillSearch: string;
  skillCategory: WorkspaceSkillCategory;
  skillOptions: WorkspaceSkillOption[];
  skillLoading: boolean;
  skillSaving: boolean;
  skillNotice: string;
  skillError: string;
  toolCategory: WorkspaceToolCategory;
  toolProfileLabel: string;
  toolOptions: WorkspaceToolOption[];
  toolLoading: boolean;
  toolSaving: boolean;
  toolNotice: string;
  toolError: string;
  commandItems: WorkspaceSlashCommandDefinition[];
  activeCommandId: string;
  commandSearch: string;
  commandDraft: WorkspaceSlashCommandDraftInput;
  editingCommandId: string | null;
  commandEditorOpen: boolean;
  commandLoading: boolean;
  commandSaving: boolean;
  commandNotice: string;
  commandError: string;
  avatarCategoryTabs: Array<{ id: WorkspaceCloneAvatarCategoryId; label: string }>;
  avatarCategory: WorkspaceCloneAvatarCategoryId;
  avatarPresetOptions: WorkspaceCloneAvatarOption[];
  selectedAvatarPresetId: string | null;
  avatarNotice: string;
  avatarError: string;
  memoryItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  optimisticRunningTaskIds: string[];
  taskLoading: boolean;
  taskError: string;
  taskRunsError: string;
  taskRunsLoading: boolean;
  onCloseAvatarModal: () => void;
  onSetAvatarCategory: (value: WorkspaceCloneAvatarCategoryId) => void;
  onApplyAvatarPreset: (option: WorkspaceCloneAvatarOption) => void;
  onAvatarUploadChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onResetAvatarOverride: () => void;
  onCloseAgentInfo: () => void;
  onCloseMemoryModal: () => void;
  onRefreshMemoryModal: () => void;
  onSelectMemoryFile: (fileId: string) => void;
  onUpdateMemoryDraftContent: (value: string) => void;
  onSaveMemoryFile: () => void;
  onCloseSkillsModal: () => void;
  onRefreshSkillsModal: () => void;
  onUpdateSkillSearch: (value: string) => void;
  onChangeSkillCategory: (value: WorkspaceSkillCategory) => void;
  onToggleSkill: (skillId: string) => void;
  onSelectAllSkills: () => void;
  onClearSkills: () => void;
  onSaveSkills: () => void;
  onCloseToolsModal: () => void;
  onRefreshToolsModal: () => void;
  onChangeToolCategory: (value: WorkspaceToolCategory) => void;
  onToggleTool: (toolId: string) => void;
  onSelectAllTools: () => void;
  onClearTools: () => void;
  onSaveTools: () => void;
  onCloseCommandsModal: () => void;
  onRefreshCommandsModal: () => void;
  onUpdateCommandSearch: (value: string) => void;
  onActivateCommand: (commandId: string) => void;
  onStartCreateCommand: () => void;
  onStartEditCommand: (commandId: string) => void;
  onCancelCommandEdit: () => void;
  onDeleteCommand: (commandId: string) => void;
  onUpdateCommandDraft: (draft: WorkspaceSlashCommandDraftInput) => void;
  onSaveCommandDraft: () => void;
  onCloseRuntimeLogDetail: () => void;
  onCloseSettingsTextPreview: () => void;
  onCloseRelatedResource: () => void;
}

const RELATED_TITLE_MAP: Record<Exclude<WorkspaceRelatedResource, null | "memory" | "skills" | "tools" | "commands">, string> = {
  model: "模型资源面板",
  channel: "频道资源面板",
  schedule: "任务详情",
};

function renderResourceList(items: WorkspaceResourceItem[]) {
  return (
    <div className="workspace-clone__resource-list">
      {items.map((item) => (
        <div key={item.id} className="workspace-clone__resource-row">
          <div>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </div>
          {item.tag ? <span className="workspace-clone__resource-tag">{item.tag}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function WorkspaceCloneOverlayStack({
  selectedEntity,
  showAvatarModal,
  showAgentInfo,
  showMemoryModal,
  showSkillsModal,
  showToolsModal,
  showRuntimeLogDetail = false,
  runtimeLog,
  showSettingsTextPreview,
  relatedResource,
  memoryFiles,
  selectedMemoryFileId,
  memoryDraftContent,
  memoryLoading,
  memorySaving,
  memoryNotice,
  memoryError,
  skillSearch,
  skillCategory,
  skillOptions,
  skillLoading,
  skillSaving,
  skillNotice,
  skillError,
  toolCategory,
  toolProfileLabel,
  toolOptions,
  toolLoading,
  toolSaving,
  toolNotice,
  toolError,
  commandItems,
  activeCommandId,
  commandSearch,
  commandDraft,
  editingCommandId,
  commandEditorOpen,
  commandLoading,
  commandSaving,
  commandNotice,
  commandError,
  avatarCategoryTabs,
  avatarCategory,
  avatarPresetOptions,
  selectedAvatarPresetId,
  avatarNotice,
  avatarError,
  memoryItems,
  channelItems,
  tasks,
  selectedTaskId,
  selectedTaskRuns,
  optimisticRunningTaskIds,
  taskLoading,
  taskError,
  taskRunsError,
  taskRunsLoading,
  onCloseAvatarModal,
  onSetAvatarCategory,
  onApplyAvatarPreset,
  onAvatarUploadChange,
  onResetAvatarOverride,
  onCloseAgentInfo,
  onCloseMemoryModal,
  onRefreshMemoryModal,
  onSelectMemoryFile,
  onUpdateMemoryDraftContent,
  onSaveMemoryFile,
  onCloseSkillsModal,
  onRefreshSkillsModal,
  onUpdateSkillSearch,
  onChangeSkillCategory,
  onToggleSkill,
  onSelectAllSkills,
  onClearSkills,
  onSaveSkills,
  onCloseToolsModal,
  onRefreshToolsModal,
  onChangeToolCategory,
  onToggleTool,
  onSelectAllTools,
  onClearTools,
  onSaveTools,
  onCloseCommandsModal,
  onRefreshCommandsModal,
  onUpdateCommandSearch,
  onActivateCommand,
  onStartCreateCommand,
  onStartEditCommand,
  onCancelCommandEdit,
  onDeleteCommand,
  onUpdateCommandDraft,
  onSaveCommandDraft,
  onCloseRuntimeLogDetail,
  onCloseSettingsTextPreview,
  onCloseRelatedResource,
}: WorkspaceCloneOverlayStackProps) {
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const selectedTaskStatus = selectedTask
    ? getWorkspaceCronDisplayStatus(selectedTask, { optimisticRunning: optimisticRunningTaskIds.includes(selectedTask.id) })
    : "disabled";
  const [runtimeLogCopied, setRuntimeLogCopied] = useState(false);
  const runtimeLogRawSection = runtimeLog?.detailSections.find((section) => section.tone === "raw") ?? null;

  useEffect(() => {
    setRuntimeLogCopied(false);
  }, [runtimeLog?.id]);

  useEffect(() => {
    if (!runtimeLogCopied) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRuntimeLogCopied(false);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [runtimeLogCopied]);

  const handleCopyRuntimeLog = () => {
    if (!runtimeLogRawSection?.content.trim()) {
      return;
    }

    void navigator.clipboard.writeText(runtimeLogRawSection.content).then(() => {
      setRuntimeLogCopied(true);
    }).catch(() => undefined);
  };

  return (
    <>
      <WorkspaceCloneAvatarModal
        show={showAvatarModal}
        selectedEntity={selectedEntity}
        categoryTabs={avatarCategoryTabs}
        activeCategory={avatarCategory}
        presetOptions={avatarPresetOptions}
        selectedPresetId={selectedAvatarPresetId}
        notice={avatarNotice}
        error={avatarError}
        onClose={onCloseAvatarModal}
        onSetCategory={onSetAvatarCategory}
        onApplyPreset={onApplyAvatarPreset}
        onUploadChange={onAvatarUploadChange}
        onResetDefault={onResetAvatarOverride}
      />

      <WorkspaceCloneAgentInfoModal
        show={showAgentInfo}
        selectedEntity={selectedEntity}
        onClose={onCloseAgentInfo}
      />

      <WorkspaceCloneMemoryModal
        show={showMemoryModal}
        agentName={selectedEntity?.name || MAIN_AGENT_DISPLAY_NAME}
        files={memoryFiles}
        selectedFileId={selectedMemoryFileId}
        draftContent={memoryDraftContent}
        loading={memoryLoading}
        saving={memorySaving}
        notice={memoryNotice}
        error={memoryError}
        onClose={onCloseMemoryModal}
        onRefresh={onRefreshMemoryModal}
        onSelectFile={onSelectMemoryFile}
        onDraftChange={onUpdateMemoryDraftContent}
        onSave={onSaveMemoryFile}
      />

      <WorkspaceCloneSkillsModal
        show={showSkillsModal}
        agentName={selectedEntity?.name || MAIN_AGENT_DISPLAY_NAME}
        items={skillOptions}
        search={skillSearch}
        activeCategory={skillCategory}
        loading={skillLoading}
        saving={skillSaving}
        notice={skillNotice}
        error={skillError}
        onClose={onCloseSkillsModal}
        onRefresh={onRefreshSkillsModal}
        onSearchChange={onUpdateSkillSearch}
        onChangeCategory={onChangeSkillCategory}
        onToggleSkill={onToggleSkill}
        onSelectAll={onSelectAllSkills}
        onClear={onClearSkills}
        onSave={onSaveSkills}
      />

      <WorkspaceCloneToolPermissionsModal
        show={showToolsModal}
        agentName={selectedEntity?.name || MAIN_AGENT_DISPLAY_NAME}
        items={toolOptions}
        activeCategory={toolCategory}
        profileLabel={toolProfileLabel}
        loading={toolLoading}
        saving={toolSaving}
        notice={toolNotice}
        error={toolError}
        onClose={onCloseToolsModal}
        onRefresh={onRefreshToolsModal}
        onChangeCategory={onChangeToolCategory}
        onToggleTool={onToggleTool}
        onSelectAll={onSelectAllTools}
        onClear={onClearTools}
        onSave={onSaveTools}
      />

      <WorkspaceCloneCommandsModal
        show={relatedResource === "commands"}
        agentName={selectedEntity?.name || MAIN_AGENT_DISPLAY_NAME}
        items={commandItems}
        activeCommandId={activeCommandId}
        search={commandSearch}
        draft={commandDraft}
        editingCommandId={editingCommandId}
        editorOpen={commandEditorOpen}
        loading={commandLoading}
        saving={commandSaving}
        notice={commandNotice}
        error={commandError}
        onClose={onCloseCommandsModal}
        onRefresh={onRefreshCommandsModal}
        onSearchChange={onUpdateCommandSearch}
        onActivate={onActivateCommand}
        onStartCreate={onStartCreateCommand}
        onStartEdit={onStartEditCommand}
        onCancelEdit={onCancelCommandEdit}
        onDelete={onDeleteCommand}
        onDraftChange={onUpdateCommandDraft}
        onSaveDraft={onSaveCommandDraft}
      />
      <Modal show={showRuntimeLogDetail} onClose={onCloseRuntimeLogDetail} title="运行日志详情" maxWidth={760}>
        <div className="workspace-clone__dialog-body">
          {runtimeLog ? (
            <div className="workspace-clone__log-detail">
              <div className="workspace-clone__dialog-copy workspace-clone__runtime-log-detail-copy">
                <strong>{runtimeLog.title}</strong>
                <p>{runtimeLog.summary}</p>
              </div>
              <div className="workspace-clone__runtime-log-detail-sections">
                {runtimeLogRawSection ? (
                  <section className="workspace-clone__runtime-log-detail-section is-raw">
                    <span className="workspace-clone__runtime-log-detail-label">{runtimeLogRawSection.label}</span>
                    <div className="workspace-clone__runtime-log-raw-wrap">
                      <button
                        type="button"
                        className={`workspace-clone__runtime-log-copy ${runtimeLogCopied ? "is-copied" : ""}`}
                        onClick={handleCopyRuntimeLog}
                        aria-label={runtimeLogCopied ? "已复制原始日志" : "复制原始日志"}
                        title={runtimeLogCopied ? "已复制" : "复制原始日志"}
                      >
                        <WorkspaceCloneIcon
                          name={runtimeLogCopied ? "check" : "copy"}
                          size={14}
                          strokeWidth={2}
                        />
                      </button>
                      <pre>{runtimeLogRawSection.content}</pre>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="workspace-clone__dialog-copy">
              <strong>暂无日志详情</strong>
              <p>请先从运行日志列表中选择一条日志。</p>
            </div>
          )}
        </div>
        <ModalFooter>
          <button className="btn-secondary" type="button" onClick={onCloseRuntimeLogDetail}>关闭</button>
        </ModalFooter>
      </Modal>

      <Modal show={showSettingsTextPreview} onClose={onCloseSettingsTextPreview} title="设置文本预览" maxWidth={680}>
        <div className="workspace-clone__dialog-body">
          <div className="workspace-clone__dialog-copy">
            <strong>完整内容预览</strong>
            <p>这里对应聊天工作区里的说明性预览弹层，用来承接纯界面阶段的详细文案。</p>
          </div>
          <pre className="workspace-clone__preview-block">
{`workspace-clone / chat
- minimal header
- single welcome message
- lightweight suggestion cards
- one-layer composer`}
          </pre>
        </div>
      </Modal>

      <Modal
        show={Boolean(relatedResource && relatedResource !== "memory" && relatedResource !== "skills" && relatedResource !== "tools" && relatedResource !== "commands")}
        onClose={onCloseRelatedResource}
        title={
          relatedResource && relatedResource !== "memory" && relatedResource !== "skills" && relatedResource !== "tools" && relatedResource !== "commands"
            ? RELATED_TITLE_MAP[relatedResource]
            : ""
        }
        maxWidth={860}
      >
        <div className="workspace-clone__dialog-body">
          <div className="workspace-clone__dialog-copy">
            <strong>Related Resource</strong>
            <p>这里统一承接 model、channel、task 的补充信息与只读详情。</p>
          </div>

          {relatedResource === "model" ? (
            <div className="workspace-clone__resource-grid">
              {["OpenAI Compatible", "Claude Compatible", "Local Mock Platform"].map((item, index) => (
                <div key={item} className="workspace-clone__resource-card">
                  <strong>{item}</strong>
                  <small>{index === 0 ? "当前激活" : "保留平台卡片、说明和切换按钮结构"}</small>
                  <button type="button">{index === 0 ? "已激活" : "快速切换"}</button>
                </div>
              ))}
            </div>
          ) : null}

          {relatedResource === "channel" ? renderResourceList(channelItems) : null}

          {relatedResource === "schedule" ? (
            <div className="workspace-clone__task-detail-panel">
              {taskLoading ? <div className="workspace-resource-modal__empty">正在加载真实任务详情...</div> : null}
              {!taskLoading && !selectedTask ? <div className="workspace-resource-modal__empty">当前 Agent 暂无真实任务。</div> : null}
              {taskError.trim() ? <div className="workspace-clone__task-feedback-card is-error">{taskError}</div> : null}

              {selectedTask ? (
                <>
                  <div className="workspace-clone__task-detail-card">
                    <div className="workspace-clone__task-detail-head">
                      <div>
                        <strong>{resolveWorkspaceTaskDisplayTitle(selectedTask)}</strong>
                        <small>{selectedTask.description?.trim() || formatWorkspaceCronPayloadPreview(selectedTask)}</small>
                      </div>
                      <span className={`workspace-clone__status-inline is-${getWorkspaceCronStatusTone(selectedTaskStatus)}`}>
                        {getWorkspaceCronStatusLabel(selectedTaskStatus)}
                      </span>
                    </div>

                    <div className="workspace-clone__task-detail-grid">
                      <div>
                        <span>调度</span>
                        <small>{formatWorkspaceCronScheduleSummary(selectedTask.schedule)}</small>
                      </div>
                      <div>
                        <span>会话目标</span>
                        <small>{formatWorkspaceCronSessionTarget(selectedTask.sessionTarget)}</small>
                      </div>
                      <div>
                        <span>唤醒模式</span>
                        <small>{selectedTask.wakeMode}</small>
                      </div>
                      <div>
                        <span>下次运行</span>
                        <small>{formatWorkspaceCronTimestamp(selectedTask.state.nextRunAtMs)}</small>
                      </div>
                      <div>
                        <span>最近运行</span>
                        <small>{formatWorkspaceCronTimestamp(selectedTask.state.lastRunAtMs)}</small>
                      </div>
                      <div>
                        <span>最近耗时</span>
                        <small>{selectedTask.state.lastDurationMs ? formatWorkspaceCronDuration(selectedTask.state.lastDurationMs) : "暂无"}</small>
                      </div>
                    </div>

                    <div className="workspace-clone__task-detail-payload">
                      <span>任务内容</span>
                      <pre>{formatWorkspaceCronPayloadPreview(selectedTask)}</pre>
                    </div>
                  </div>

                  {taskRunsError.trim() ? <div className="workspace-clone__task-feedback-card is-error">{taskRunsError}</div> : null}

                  <div className="workspace-clone__task-runs workspace-clone__task-runs--detail">
                    <div className="workspace-clone__task-runs-head">
                      <strong>最近运行记录</strong>
                      {taskRunsLoading ? <small>同步中...</small> : null}
                    </div>
                    {selectedTaskRuns.length === 0 ? (
                      <div className="workspace-clone__task-run-empty">暂无运行记录</div>
                    ) : (
                      selectedTaskRuns.map((run) => (
                        <div key={`${run.jobId}-${run.ts}`} className="workspace-clone__task-run-row">
                          <div className="workspace-clone__task-run-copy">
                            <div className="workspace-clone__task-run-head">
                              <strong>{formatWorkspaceCronTimestamp(run.runAtMs ?? run.ts)}</strong>
                              <span className={`workspace-clone__status-inline is-${run.status === "error" ? "busy" : run.status === "skipped" ? "busy" : "online"}`}>
                                {run.status === "error" ? "异常" : run.status === "skipped" ? "已跳过" : "正常"}
                              </span>
                            </div>
                            <small>{run.summary?.trim() || run.error?.trim() || "本次运行未返回更多摘要"}</small>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {relatedResource === "memory" ? renderResourceList(memoryItems) : null}
        </div>

        <ModalFooter>
          <button className="btn-secondary" type="button" onClick={onCloseRelatedResource}>关闭</button>
        </ModalFooter>
      </Modal>
    </>
  );
}
