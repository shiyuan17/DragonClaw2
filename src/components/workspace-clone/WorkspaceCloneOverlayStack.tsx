import { Modal, ModalFooter } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WorkspaceCloneCommandsModal } from "./WorkspaceCloneCommandsModal";
import { WorkspaceCloneMemoryModal } from "./WorkspaceCloneMemoryModal";
import { WorkspaceCloneSkillsModal } from "./WorkspaceCloneSkillsModal";
import { WorkspaceCloneToolPermissionsModal } from "./WorkspaceCloneToolPermissionsModal";
import type {
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
  WorkspaceEntity,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
  WorkspaceToolCategory,
  WorkspaceToolOption,
} from "./workspaceCloneTypes";

interface WorkspaceCloneOverlayStackProps {
  selectedEntity: WorkspaceEntity | null;
  showAgentInfo: boolean;
  showMemoryModal: boolean;
  showSkillsModal: boolean;
  showToolsModal: boolean;
  showRuntimeLogDetail: boolean;
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
  memoryItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  scheduleItems: WorkspaceResourceItem[];
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

export function WorkspaceCloneOverlayStack({
  selectedEntity,
  showAgentInfo,
  showMemoryModal,
  showSkillsModal,
  showToolsModal,
  showRuntimeLogDetail,
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
  memoryItems,
  channelItems,
  scheduleItems,
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
  const relatedTitleMap: Record<Exclude<WorkspaceRelatedResource, null | "memory" | "skills" | "tools" | "commands">, string> = {
    model: "模型资源面板",
    channel: "频道资源面板",
    schedule: "定时任务面板",
  };

  const relatedItemsMap = {
    channel: channelItems,
    schedule: scheduleItems,
  };

  return (
    <>
      <Modal show={showAgentInfo} onClose={onCloseAgentInfo} title="Agent 信息" maxWidth={560}>
        <div className="workspace-clone__dialog-body">
          <div className="workspace-clone__dialog-copy">
            <strong>{selectedEntity?.name || MAIN_AGENT_DISPLAY_NAME}</strong>
            <p>{selectedEntity?.subtitle || "当前只保留 Agent 信息弹层的视觉结构与字段布局。"}</p>
          </div>
          <div className="workspace-clone__info-grid">
            <div><span>状态</span><strong>{selectedEntity?.status || "offline"}</strong></div>
            <div><span>当前工作</span><strong>{selectedEntity?.currentWork || "等待后续迁移"}</strong></div>
            <div><span>最近输出</span><strong>{selectedEntity?.recentOutput || "暂无"}</strong></div>
            <div><span>实体类型</span><strong>{selectedEntity?.entityType || "agents"}</strong></div>
          </div>
        </div>
        <ModalFooter>
          <button className="btn-secondary" type="button" onClick={onCloseAgentInfo}>关闭</button>
        </ModalFooter>
      </Modal>

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
          <div className="workspace-clone__dialog-copy">
            <strong>Runtime Log Detail</strong>
            <p>保留摘要、详细内容、状态标签和复制按钮区域，后续再接真实 runtime log 数据。</p>
          </div>
          <div className="workspace-clone__log-detail">
            <div className="workspace-clone__log-detail-tabs">
              <button type="button" className="is-active">摘要</button>
              <button type="button">请求</button>
              <button type="button">响应</button>
              <button type="button">轨迹</button>
            </div>
            <pre>{`[09:14] chat home rendered\n[09:15] right drawer toggled\n[09:16] overlay stack inspected`}</pre>
          </div>
        </div>
        <ModalFooter>
          <button className="btn-secondary" type="button" onClick={onCloseRuntimeLogDetail}>关闭</button>
          <button className="btn-primary" type="button">复制日志</button>
        </ModalFooter>
      </Modal>

      <Modal show={showSettingsTextPreview} onClose={onCloseSettingsTextPreview} title="设置文本预览" maxWidth={680}>
        <div className="workspace-clone__dialog-body">
          <div className="workspace-clone__dialog-copy">
            <strong>完整内容预览</strong>
            <p>这里对应聊天工作区里的说明性预览弹层，用来承接纯界面阶段的详细文本。</p>
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
            ? relatedTitleMap[relatedResource]
            : ""
        }
        maxWidth={860}
      >
        <div className="workspace-clone__dialog-body">
          <div className="workspace-clone__dialog-copy">
            <strong>Related Resource</strong>
            <p>这里统一承接 model、channel、schedule 的界面占位面板。</p>
          </div>

          {relatedResource === "model" && (
            <div className="workspace-clone__resource-grid">
              {["OpenAI Compatible", "Claude Compatible", "Local Mock Platform"].map((item, index) => (
                <div key={item} className="workspace-clone__resource-card">
                  <strong>{item}</strong>
                  <small>{index === 0 ? "当前激活" : "保留平台卡片、说明和切换按钮结构"}</small>
                  <button type="button">{index === 0 ? "已激活" : "快速切换"}</button>
                </div>
              ))}
            </div>
          )}

          {(relatedResource === "channel" || relatedResource === "schedule") && (
            <div className="workspace-clone__resource-list">
              {(relatedItemsMap[relatedResource] || []).map((item) => (
                <div key={item.id} className="workspace-clone__resource-row">
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  {item.tag && <span className="workspace-clone__resource-tag">{item.tag}</span>}
                </div>
              ))}
            </div>
          )}

          {relatedResource === "memory" && (
            <div className="workspace-clone__resource-list">
              {memoryItems.map((item) => (
                <div key={item.id} className="workspace-clone__resource-row">
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  {item.tag && <span className="workspace-clone__resource-tag">{item.tag}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <ModalFooter>
          <button className="btn-secondary" type="button" onClick={onCloseRelatedResource}>关闭</button>
        </ModalFooter>
      </Modal>
    </>
  );
}
