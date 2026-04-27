import { useMemo, useState } from "react";
import type { WorkspaceComposerModal, WorkspaceRelatedResource, WorkspaceSuggestionMode } from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneComposerProps {
  running: boolean;
  selectedEntityName: string | null;
  onOpenRelatedResource: (target: WorkspaceRelatedResource) => void;
}

interface WorkspaceCloneComposerState {
  modal: WorkspaceComposerModal;
  suggestion: WorkspaceSuggestionMode;
}

export function WorkspaceCloneComposer({
  running,
  selectedEntityName,
  onOpenRelatedResource,
}: WorkspaceCloneComposerProps) {
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<WorkspaceCloneComposerState>({ modal: null, suggestion: null });
  const canMention = useMemo(() => Boolean(selectedEntityName), [selectedEntityName]);

  return (
    <div className="workspace-clone__composer">
      <div className="workspace-clone__input-shell">
        <div className="workspace-clone__input-placeholder">发送给{selectedEntityName || "主Agent"}</div>

        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="输入你的任务、问题或想法"
        />

        <div className="workspace-clone__composer-bottom">
          <div className="workspace-clone__composer-tools">
            <button type="button" title="附件">
              <WorkspaceCloneIcon name="paperclip" size={15} strokeWidth={1.9} />
            </button>
            <button type="button" title="Slash Command" onClick={() => setState({ modal: null, suggestion: state.suggestion === "slash" ? null : "slash" })}>
              <WorkspaceCloneIcon name="wand" size={15} strokeWidth={1.9} />
            </button>
            <button type="button" title="邮件绑定" onClick={() => setState({ modal: state.modal === "email-binding" ? null : "email-binding", suggestion: null })}>
              <WorkspaceCloneIcon name="globe" size={15} strokeWidth={1.9} />
            </button>
            <button type="button" title="Mention" onClick={() => setState({ modal: null, suggestion: canMention ? "mention" : null })}>
              <WorkspaceCloneIcon name="users" size={15} strokeWidth={1.9} />
            </button>
          </div>

          <div className="workspace-clone__composer-pills">
            <button type="button" className="workspace-clone__composer-pill" onClick={() => setState({ modal: state.modal === "knowledge" ? null : "knowledge", suggestion: null })}>
              知识库
            </button>
            <button type="button" className="workspace-clone__composer-pill" onClick={() => onOpenRelatedResource("skills")}>
              技能
            </button>
            <button type="button" className="workspace-clone__composer-pill" onClick={() => onOpenRelatedResource("model")}>
              模型 astroncoding...
            </button>
          </div>

          <span className={`workspace-clone__composer-status ${running ? "is-online" : "is-idle"}`}>
            {running ? "服务运行中" : "服务未启动"}
          </span>

          <div className="workspace-clone__composer-actions">
            <button type="button" className="workspace-clone__composer-action-text">新对话</button>
            <button type="button" className="workspace-clone__composer-icon-round" title="语音">
              <WorkspaceCloneIcon name="voice" size={15} strokeWidth={1.9} />
            </button>
            <button type="button" className="workspace-clone__composer-icon-round workspace-clone__composer-send" title="发送">
              <WorkspaceCloneIcon name="chevron-right" size={16} strokeWidth={2.1} />
            </button>
          </div>
        </div>

        {state.suggestion && (
          <div className="workspace-clone__suggestion-layer">
            {state.suggestion === "slash" && (
              <>
                <button type="button">/summary - 总结当前工作区</button>
                <button type="button">/handoff - 生成交接说明</button>
                <button type="button" onClick={() => setState({ modal: "slash-command", suggestion: null })}>新建 Slash Command</button>
              </>
            )}
            {state.suggestion === "mention" && (
              <>
                <button type="button">@{selectedEntityName || "主Agent"}</button>
                <button type="button">@运营协作 Agent</button>
                <button type="button">@增长工作室</button>
              </>
            )}
          </div>
        )}
      </div>

      {state.modal && (
        <div className="workspace-clone__composer-modal-inline">
          {state.modal === "knowledge" && (
            <div className="workspace-clone__composer-inline-card">
              <strong>知识库选择器</strong>
              <small>保留知识库选择、创建和删除确认的界面层级，不接真实保存逻辑。</small>
              <div className="workspace-clone__inline-actions">
                <button type="button" onClick={() => setState({ modal: "knowledge-delete", suggestion: null })}>删除确认</button>
                <button type="button" onClick={() => setState({ modal: null, suggestion: null })}>关闭</button>
              </div>
            </div>
          )}

          {state.modal === "knowledge-delete" && (
            <div className="workspace-clone__composer-inline-card">
              <strong>删除确认</strong>
              <small>这里保留删除知识库时的说明、警告和操作区。</small>
              <div className="workspace-clone__inline-actions">
                <button type="button">确认删除</button>
                <button type="button" onClick={() => setState({ modal: null, suggestion: null })}>取消</button>
              </div>
            </div>
          )}

          {state.modal === "slash-command" && (
            <div className="workspace-clone__composer-inline-card">
              <strong>Slash Command 编辑器</strong>
              <small>保留名称、描述、命令内容和提交按钮的界面结构。</small>
              <div className="workspace-clone__inline-actions">
                <button type="button">保存命令</button>
                <button type="button" onClick={() => setState({ modal: null, suggestion: null })}>关闭</button>
              </div>
            </div>
          )}

          {state.modal === "email-binding" && (
            <div className="workspace-clone__composer-inline-card">
              <strong>邮件绑定</strong>
              <small>保留 provider、邮箱账号、授权码与 IMAP/SMTP 手动配置表单外观。</small>
              <div className="workspace-clone__inline-actions">
                <button type="button">保存占位</button>
                <button type="button" onClick={() => setState({ modal: null, suggestion: null })}>关闭</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
