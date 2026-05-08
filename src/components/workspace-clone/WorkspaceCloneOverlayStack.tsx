import type { ChangeEvent } from "react";

import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WorkspaceCloneAgentInfoModal } from "./WorkspaceCloneAgentInfoModal";
import { WorkspaceCloneAvatarModal } from "./WorkspaceCloneAvatarModal";
import { WorkspaceCloneCommandsModal } from "./WorkspaceCloneCommandsModal";
import { WorkspaceCloneMemoryModal } from "./WorkspaceCloneMemoryModal";
import { WorkspaceCloneRelatedResourceModal } from "./WorkspaceCloneRelatedResourceModal";
import { WorkspaceCloneRuntimeLogDetailModal } from "./WorkspaceCloneRuntimeLogDetailModal";
import { WorkspaceCloneSkillsModal } from "./WorkspaceCloneSkillsModal";
import { WorkspaceCloneToolPermissionsModal } from "./WorkspaceCloneToolPermissionsModal";
import type {
  WorkspaceCloneAvatarCategoryId,
  WorkspaceCloneAvatarOption,
} from "./workspaceCloneAvatarPresets";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceEntity,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceRuntimeLogItem,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
  WorkspaceToolCategory,
  WorkspaceToolOption,
  WorkspaceResourceItem,
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
  onAvatarUploadChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
  onCloseRelatedResource: () => void;
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
  onCloseRelatedResource,
}: WorkspaceCloneOverlayStackProps) {
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

      <WorkspaceCloneRuntimeLogDetailModal
        show={showRuntimeLogDetail}
        runtimeLog={runtimeLog}
        onClose={onCloseRuntimeLogDetail}
      />

      <WorkspaceCloneRelatedResourceModal
        relatedResource={relatedResource}
        channelItems={channelItems}
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        selectedTaskRuns={selectedTaskRuns}
        optimisticRunningTaskIds={optimisticRunningTaskIds}
        taskLoading={taskLoading}
        taskError={taskError}
        taskRunsError={taskRunsError}
        taskRunsLoading={taskRunsLoading}
        onClose={onCloseRelatedResource}
      />
    </>
  );
}
