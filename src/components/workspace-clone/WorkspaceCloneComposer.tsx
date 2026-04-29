import { useMemo, useState } from "react";
import type {
  WorkspaceComposerModal,
  WorkspaceGatewayStatus,
  WorkspaceSessionSectionKey,
  WorkspaceSuggestionMode,
} from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneComposerProps {
  running: boolean;
  chatEnabled: boolean;
  connectionStatus: WorkspaceGatewayStatus;
  selectedEntityName: string | null;
  currentModelName: string;
  sending: boolean;
  isGenerating: boolean;
  resettingSession: boolean;
  onOpenSessionSection: (target: WorkspaceSessionSectionKey) => void;
  onOpenMemoryModal: () => void;
  onOpenModelConfig: () => void;
  onSend: (value: string) => Promise<boolean>;
  onAbort: () => Promise<boolean>;
  onResetSession: () => Promise<boolean>;
}

interface WorkspaceCloneComposerState {
  modal: WorkspaceComposerModal;
  suggestion: WorkspaceSuggestionMode;
}

function formatModelLabel(modelName: string) {
  if (!modelName) return "模型";
  return modelName.length > 16 ? `${modelName.slice(0, 16)}...` : modelName;
}

export function WorkspaceCloneComposer({
  running,
  chatEnabled,
  connectionStatus,
  selectedEntityName,
  currentModelName,
  sending,
  isGenerating,
  resettingSession,
  onOpenSessionSection,
  onOpenMemoryModal,
  onOpenModelConfig,
  onSend,
  onAbort,
  onResetSession,
}: WorkspaceCloneComposerProps) {
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<WorkspaceCloneComposerState>({ modal: null, suggestion: null });
  const canMention = useMemo(() => Boolean(selectedEntityName), [selectedEntityName]);
  const canSend = chatEnabled && running && connectionStatus === "connected" && !sending && !isGenerating;
  const placeholderToolsDisabled = true;
  const statusText = !chatEnabled
    ? "当前仅接入数字员工"
    : !running
      ? "服务尚未启动"
      : connectionStatus === "connected"
        ? isGenerating
          ? "回复生成中"
          : "会话已连接"
        : connectionStatus === "connecting"
          ? "连接中"
          : "连接异常";

  const handleSubmit = async () => {
    if (!canSend) {
      return;
    }

    const success = await onSend(inputValue);
    if (success) {
      setInputValue("");
      setState((current) => ({ ...current, suggestion: null }));
    }
  };

  return (
    <div className="workspace-clone__composer">
      <div className="workspace-clone__input-shell">
        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="输入你的任务、问题或想法"
          disabled={!chatEnabled || !running || connectionStatus !== "connected" || isGenerating}
        />

        <div className="workspace-clone__composer-bottom">
          <div className="workspace-clone__composer-tools">
            <button
              type="button"
              title="Coming soon"
              onClick={() => setState({ modal: state.modal === "knowledge" ? null : "knowledge", suggestion: null })}
              disabled={!chatEnabled || placeholderToolsDisabled}
            >
              <WorkspaceCloneIcon name="book-open" size={15} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              title="Coming soon"
              onClick={() => setState({ modal: null, suggestion: state.suggestion === "slash" ? null : "slash" })}
              disabled={!chatEnabled || placeholderToolsDisabled}
            >
              <WorkspaceCloneIcon name="wand" size={15} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              title="Coming soon"
              onClick={() => setState({ modal: state.modal === "email-binding" ? null : "email-binding", suggestion: null })}
              disabled={!chatEnabled || placeholderToolsDisabled}
            >
              <WorkspaceCloneIcon name="globe" size={15} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              title="Coming soon"
              onClick={() => setState({ modal: null, suggestion: canMention ? "mention" : null })}
              disabled={!chatEnabled || placeholderToolsDisabled}
            >
              <WorkspaceCloneIcon name="users" size={15} strokeWidth={1.9} />
            </button>
          </div>

          <div className="workspace-clone__composer-pills">
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted"
              onClick={onOpenMemoryModal}
              disabled={!chatEnabled}
            >
              记忆
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted"
              onClick={() => onOpenSessionSection("skills")}
              disabled={!chatEnabled}
            >
              技能库
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill workspace-clone__composer-pill--muted"
              onClick={() => onOpenSessionSection("commands")}
              disabled={!chatEnabled}
            >
              命令
            </button>
            <button
              type="button"
              className="workspace-clone__composer-pill"
              onClick={onOpenModelConfig}
              disabled={!chatEnabled}
            >
              模型 {formatModelLabel(currentModelName)}
            </button>
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
                disabled={!canSend || !inputValue.trim()}
              >
                <WorkspaceCloneIcon name="chevron-right" size={16} strokeWidth={2.1} />
              </button>
            )}
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
                <button type="button">@{selectedEntityName || "main"}</button>
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
