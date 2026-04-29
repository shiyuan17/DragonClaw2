import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Modal, ModalFooter } from "../ui/Modal";
import type { ChannelBindingModalState, WorkspaceChannelAgentOption } from "./workspaceCloneTypes";

interface WorkspaceCloneChannelBindingModalProps {
  state: ChannelBindingModalState;
  availableAgents: WorkspaceChannelAgentOption[];
  selectedAgentId: string;
  modalLoading: boolean;
  modalSaving: boolean;
  modalNotice: string;
  modalError: string;
  weixinQrStarting: boolean;
  weixinQrPolling: boolean;
  weixinQrUrl: string;
  weixinQrDetail: string;
  feishuQrRequesting: boolean;
  feishuQrChecking: boolean;
  feishuQrTargetUrl: string;
  feishuQrUserCode: string;
  feishuQrExpiresAtMs: number | null;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuAppSecretConfigured: boolean;
  feishuDmPolicy: string;
  feishuAllowFromSessionIds: string[];
  onClose: () => void;
  onSelectView: (view: ChannelBindingModalState["view"]) => void;
  onSelectAgent: (agentId: string) => void;
  onStartWeixinQrBinding: () => void;
  onOpenExternalLink: (url: string) => void;
  onRequestFeishuQr: () => void;
  onCheckFeishuQr: () => void;
  onChangeFeishuAppId: (value: string) => void;
  onChangeFeishuAppSecret: (value: string) => void;
  onChangeFeishuDmPolicy: (value: string) => void;
  onChangeFeishuAllowFrom: (value: string[]) => void;
  onSaveBinding: () => void;
}

function formatCountdown(expiresAtMs: number | null) {
  if (!expiresAtMs) {
    return "";
  }
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) {
    return "已过期";
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function WorkspaceCloneChannelBindingModal({
  state,
  availableAgents,
  selectedAgentId,
  modalLoading,
  modalSaving,
  modalNotice,
  modalError,
  weixinQrStarting,
  weixinQrPolling,
  weixinQrUrl,
  weixinQrDetail,
  feishuQrRequesting,
  feishuQrChecking,
  feishuQrTargetUrl,
  feishuQrUserCode,
  feishuQrExpiresAtMs,
  feishuAppId,
  feishuAppSecret,
  feishuAppSecretConfigured,
  feishuDmPolicy,
  feishuAllowFromSessionIds,
  onClose,
  onSelectView,
  onSelectAgent,
  onStartWeixinQrBinding,
  onOpenExternalLink,
  onRequestFeishuQr,
  onCheckFeishuQr,
  onChangeFeishuAppId,
  onChangeFeishuAppSecret,
  onChangeFeishuDmPolicy,
  onChangeFeishuAllowFrom,
  onSaveBinding,
}: WorkspaceCloneChannelBindingModalProps) {
  const [feishuQrImageUrl, setFeishuQrImageUrl] = useState("");
  const [countdownTick, setCountdownTick] = useState(Date.now());

  useEffect(() => {
    if (!feishuQrTargetUrl.trim()) {
      setFeishuQrImageUrl("");
      return;
    }
    void QRCode.toDataURL(feishuQrTargetUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    })
      .then(setFeishuQrImageUrl)
      .catch(() => setFeishuQrImageUrl(""));
  }, [feishuQrTargetUrl]);

  useEffect(() => {
    if (!state.open || !feishuQrExpiresAtMs) {
      return undefined;
    }
    const timer = window.setInterval(() => setCountdownTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [feishuQrExpiresAtMs, state.open]);

  const canSaveBinding = useMemo(() => {
    if (!state.implemented) {
      return false;
    }
    if (!selectedAgentId.trim()) {
      return false;
    }
    if (state.channelId === "weixin") {
      return Boolean(state.accountId.trim());
    }
    if (state.channelId === "feishu") {
      return Boolean(feishuAppId.trim() || feishuAppSecretConfigured);
    }
    return false;
  }, [feishuAppId, feishuAppSecretConfigured, selectedAgentId, state.accountId, state.channelId, state.implemented]);

  const allowFromText = feishuAllowFromSessionIds.join("\n");
  const countdownLabel = useMemo(() => formatCountdown(feishuQrExpiresAtMs), [countdownTick, feishuQrExpiresAtMs]);

  return (
    <Modal show={state.open} onClose={onClose} title={`${state.channelName} 绑定设置`} maxWidth={760}>
      <div className="workspace-clone__dialog-body">
        <div className="workspace-clone__dialog-copy">
          <strong>
            {state.implemented
              ? `${state.channelName} 接入工作区聊天`
              : `${state.channelName} 自动接入暂未开放`}
          </strong>
          <p>
            {state.implemented
              ? "绑定成功后，首页主聊天区会直接复用所选 Agent 的主会话，不再创建独立频道运行时。"
              : "本期仅迁移频道目录与绑定入口，当前平台暂不接真实 onboarding。"}
          </p>
        </div>

        {state.implemented && state.channelId === "feishu" && (
          <div className="workspace-clone__dialog-tabs">
            {[
              { key: "feishu", label: "飞书二维码" },
              { key: "manual", label: "手动凭证" },
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
        )}

        {state.implemented && state.channelId === "weixin" && (
          <div className="workspace-clone__binding-layout">
            <div className="workspace-clone__qr-card">
              {weixinQrUrl ? (
                <img src={weixinQrUrl} alt="微信二维码" className="workspace-clone__qr-image" />
              ) : (
                <div className="workspace-clone__qr-box">微信</div>
              )}
              <p>{weixinQrDetail || "二维码拉起后，这里会显示扫码状态与绑定结果。"}</p>
              <div className="workspace-clone__inline-actions">
                <button type="button" onClick={onStartWeixinQrBinding} disabled={weixinQrStarting || modalSaving}>
                  {weixinQrUrl ? "刷新二维码" : "拉起二维码"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenExternalLink(weixinQrUrl)}
                  disabled={!weixinQrUrl.trim()}
                >
                  浏览器打开
                </button>
              </div>
            </div>

            <div className="workspace-clone__binding-form">
              <div className="workspace-clone__binding-field">
                <label>接待 Agent</label>
                <select
                  className="workspace-clone__binding-select-native"
                  value={selectedAgentId}
                  onChange={(event) => onSelectAgent(event.target.value)}
                  disabled={modalSaving}
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}{agent.isDefault ? " (main)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="workspace-clone__binding-note">
                <strong>当前状态</strong>
                <small>
                  {weixinQrStarting
                    ? "正在向微信请求二维码。"
                    : weixinQrPolling
                      ? "已拉起二维码，正在轮询扫码结果。"
                      : "二维码绑定成功后，再保存 Agent 绑定即可进入首页主会话。"}
                </small>
              </div>
            </div>
          </div>
        )}

        {state.implemented && state.channelId === "feishu" && state.view === "feishu" && (
          <div className="workspace-clone__binding-layout">
            <div className="workspace-clone__qr-card workspace-clone__qr-card--soft">
              {feishuQrImageUrl ? (
                <img src={feishuQrImageUrl} alt="飞书二维码" className="workspace-clone__qr-image" />
              ) : (
                <div className="workspace-clone__qr-box">飞书</div>
              )}
              <p>
                {feishuQrUserCode
                  ? `用户码 ${feishuQrUserCode}${countdownLabel ? `，剩余 ${countdownLabel}` : ""}`
                  : "创建二维码后，系统会自动轮询回填 App ID / App Secret。"}
              </p>
              <div className="workspace-clone__inline-actions">
                <button type="button" onClick={onRequestFeishuQr} disabled={feishuQrRequesting || modalSaving}>
                  {feishuQrTargetUrl ? "刷新二维码" : "获取二维码"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenExternalLink(feishuQrTargetUrl)}
                  disabled={!feishuQrTargetUrl.trim()}
                >
                  浏览器打开
                </button>
                <button type="button" onClick={onCheckFeishuQr} disabled={!feishuQrTargetUrl.trim() || feishuQrChecking}>
                  检查状态
                </button>
              </div>
            </div>

            <div className="workspace-clone__binding-form">
              <div className="workspace-clone__binding-field">
                <label>接待 Agent</label>
                <select
                  className="workspace-clone__binding-select-native"
                  value={selectedAgentId}
                  onChange={(event) => onSelectAgent(event.target.value)}
                  disabled={modalSaving}
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}{agent.isDefault ? " (main)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="workspace-clone__binding-note">
                <strong>自动回填</strong>
                <small>
                  扫码成功后，系统会把凭证保存到 `channels.feishu` 节点，然后再由这里完成 Agent 绑定。
                </small>
              </div>
            </div>
          </div>
        )}

        {state.implemented && state.channelId === "feishu" && state.view === "manual" && (
          <div className="workspace-clone__binding-grid">
            <div className="workspace-clone__binding-field">
              <label>App ID</label>
              <input
                value={feishuAppId}
                onChange={(event) => onChangeFeishuAppId(event.target.value)}
                placeholder="app_xxxxxxxx"
              />
            </div>
            <div className="workspace-clone__binding-field">
              <label>App Secret</label>
              <input
                value={feishuAppSecret}
                onChange={(event) => onChangeFeishuAppSecret(event.target.value)}
                placeholder={feishuAppSecretConfigured ? "已保存，可留空保持不变" : "请输入 App Secret"}
                type="password"
              />
            </div>
            <div className="workspace-clone__binding-field">
              <label>接待 Agent</label>
              <select
                className="workspace-clone__binding-select-native"
                value={selectedAgentId}
                onChange={(event) => onSelectAgent(event.target.value)}
                disabled={modalSaving}
              >
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}{agent.isDefault ? " (main)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="workspace-clone__binding-field">
              <label>私聊权限策略</label>
              <select
                className="workspace-clone__binding-select-native"
                value={feishuDmPolicy}
                onChange={(event) => onChangeFeishuDmPolicy(event.target.value)}
              >
                <option value="open">开放接入</option>
                <option value="allowlist">仅允许白名单会话</option>
              </select>
            </div>
            <div className="workspace-clone__binding-field workspace-clone__binding-field--full">
              <label>允许接入的会话 ID</label>
              <textarea
                className="workspace-clone__binding-textarea"
                rows={5}
                value={allowFromText}
                onChange={(event) =>
                  onChangeFeishuAllowFrom(
                    event.target.value
                      .split(/\r?\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="一行一个 sessionId，仅在白名单模式下生效"
              />
            </div>
          </div>
        )}

        {!state.implemented && (
          <div className="workspace-clone__binding-note">
            <strong>暂未开放自动接入</strong>
            <small>
              当前版本先保留目录卡片、搜索、选中态和绑定入口，后续再补真实 token / webhook / bot onboarding 协议。
            </small>
          </div>
        )}

        {(modalLoading || modalNotice || modalError) && (
          <div
            className={`workspace-clone__binding-feedback ${
              modalError ? "is-error" : modalNotice ? "is-success" : "is-pending"
            }`}
          >
            {modalLoading
              ? "正在加载频道配置..."
              : modalError
                ? modalError
                : modalNotice}
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn-secondary" type="button" onClick={onClose}>
          关闭
        </button>
        {state.implemented && (
          <button
            className="btn-primary"
            type="button"
            disabled={!canSaveBinding || modalSaving}
            onClick={onSaveBinding}
          >
            {modalSaving ? "保存中..." : "保存绑定"}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
