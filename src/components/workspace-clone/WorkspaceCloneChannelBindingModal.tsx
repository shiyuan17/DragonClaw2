import { Modal, ModalFooter } from "../ui/Modal";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { ChannelBindingModalState } from "./workspaceCloneTypes";

interface WorkspaceCloneChannelBindingModalProps {
  state: ChannelBindingModalState;
  onClose: () => void;
  onSelectView: (view: ChannelBindingModalState["view"]) => void;
}

export function WorkspaceCloneChannelBindingModal({
  state,
  onClose,
  onSelectView,
}: WorkspaceCloneChannelBindingModalProps) {
  return (
    <Modal show={state.open} onClose={onClose} title={`${state.channelName} 绑定设置`} maxWidth={720}>
      <div className="workspace-clone__dialog-body">
        <div className="workspace-clone__dialog-copy">
          <strong>仅迁移界面，不连接真实渠道</strong>
          <p>这里完整保留微信、飞书和手动配置三段式结构，后续再接二维码、账号配置和 Agent 映射逻辑。</p>
        </div>

        <div className="workspace-clone__dialog-tabs">
          {[
            { key: "wechat", label: "微信二维码" },
            { key: "feishu", label: "飞书接入" },
            { key: "manual", label: "手动配置" },
          ].map((item) => (
            <button
              key={item.key}
              className={`workspace-clone__dialog-tab ${state.view === item.key ? "is-active" : ""}`}
              type="button"
              onClick={() => onSelectView(item.key as ChannelBindingModalState["view"])}
            >
              {item.label}
            </button>
          ))}
        </div>

        {state.view === "wechat" && (
          <div className="workspace-clone__binding-layout">
            <div className="workspace-clone__qr-card">
              <div className="workspace-clone__qr-box">QR</div>
              <p>扫码后这里展示登录状态、绑定状态和频道映射结果。</p>
            </div>
            <div className="workspace-clone__binding-form">
              <div className="workspace-clone__binding-field">
                <label>目标接待 Agent</label>
                <button type="button" className="workspace-clone__binding-select">
                  <span>main</span>
                  <WorkspaceCloneIcon name="chevron" size={14} strokeWidth={1.9} />
                </button>
              </div>
              <div className="workspace-clone__binding-note">
                <strong>状态说明</strong>
                <small>这里仅保留二维码区域、状态标签和映射入口，不调用真实后端命令。</small>
              </div>
            </div>
          </div>
        )}

        {state.view === "feishu" && (
          <div className="workspace-clone__binding-layout">
            <div className="workspace-clone__binding-form">
              <div className="workspace-clone__binding-field">
                <label>租户范围</label>
                <input value="华东大区 / 默认租户" readOnly />
              </div>
              <div className="workspace-clone__binding-field">
                <label>可接待会话来源</label>
                <div className="workspace-clone__binding-tags">
                  <span>群聊</span>
                  <span>私聊</span>
                  <span>机器人菜单</span>
                </div>
              </div>
              <div className="workspace-clone__binding-note">
                <strong>飞书接入占位</strong>
                <small>保留二维码接入、人工配置、来源限制和 Agent 映射结构。</small>
              </div>
            </div>
            <div className="workspace-clone__qr-card workspace-clone__qr-card--soft">
              <div className="workspace-clone__qr-box">飞书</div>
              <p>后续在这里接入扫码与连接检测状态。</p>
            </div>
          </div>
        )}

        {state.view === "manual" && (
          <div className="workspace-clone__binding-grid">
            <div className="workspace-clone__binding-field">
              <label>App ID</label>
              <input value="app_xxxxxxxx" readOnly />
            </div>
            <div className="workspace-clone__binding-field">
              <label>App Secret</label>
              <input value="********************************" readOnly />
            </div>
            <div className="workspace-clone__binding-field">
              <label>回调地址</label>
              <input value="https://callback.localhost/channel/demo" readOnly />
            </div>
            <div className="workspace-clone__binding-field">
              <label>接待 Agent</label>
              <input value="main / 运营协作 Agent" readOnly />
            </div>
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn-secondary" type="button" onClick={onClose}>关闭</button>
        <button className="btn-primary" type="button">保存占位</button>
      </ModalFooter>
    </Modal>
  );
}
