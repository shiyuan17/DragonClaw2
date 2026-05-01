import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Modal } from "../ui/Modal";
import { WORKSPACE_CHANNEL_CATALOG } from "./workspaceCloneChannels";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
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
  weixinQrImageUrl: string;
  weixinQrDetail: string;
  weixinQrLogs: string[];
  hasActiveWeixinQrSession: boolean;
  isCurrentWeixinChannelAlreadyBound: boolean;
  weixinQrStatusTone: string;
  weixinQrStatusText: string;
  feishuQrRequesting: boolean;
  feishuQrChecking: boolean;
  feishuQrVisible: boolean;
  feishuQrTargetUrl: string;
  feishuQrUserCode: string;
  feishuQrExpiresAtMs: number | null;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuAppSecretConfigured: boolean;
  feishuAppSecretVisible: boolean;
  feishuDmPolicy: string;
  feishuManualExpanded: boolean;
  feishuAllowFromDraft: string;
  feishuAllowFromSessionIds: string[];
  onClose: () => void;
  onSelectAgent: (agentId: string) => void;
  onStartWeixinQrBinding: () => void;
  onOpenExternalLink: (url: string) => void;
  onRequestFeishuQr: () => void;
  onCheckFeishuQr: () => void;
  onChangeFeishuAppId: (value: string) => void;
  onChangeFeishuAppSecret: (value: string) => void;
  onChangeFeishuDmPolicy: (value: string) => void;
  onChangeFeishuAllowFromDraft: (value: string) => void;
  onAddFeishuAllowFromSessionId: () => void;
  onRemoveFeishuAllowFromSessionId: (sessionId: string) => void;
  onToggleFeishuManualExpanded: () => void;
  onToggleFeishuAppSecretVisible: () => void;
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
  weixinQrImageUrl,
  weixinQrDetail,
  weixinQrLogs,
  hasActiveWeixinQrSession,
  isCurrentWeixinChannelAlreadyBound,
  weixinQrStatusTone,
  weixinQrStatusText,
  feishuQrRequesting,
  feishuQrChecking,
  feishuQrVisible,
  feishuQrTargetUrl,
  feishuQrUserCode,
  feishuQrExpiresAtMs,
  feishuAppId,
  feishuAppSecret,
  feishuAppSecretConfigured,
  feishuAppSecretVisible,
  feishuDmPolicy,
  feishuManualExpanded,
  feishuAllowFromDraft,
  feishuAllowFromSessionIds,
  onClose,
  onSelectAgent,
  onStartWeixinQrBinding,
  onOpenExternalLink,
  onRequestFeishuQr,
  onCheckFeishuQr,
  onChangeFeishuAppId,
  onChangeFeishuAppSecret,
  onChangeFeishuDmPolicy,
  onChangeFeishuAllowFromDraft,
  onAddFeishuAllowFromSessionId,
  onRemoveFeishuAllowFromSessionId,
  onToggleFeishuManualExpanded,
  onToggleFeishuAppSecretVisible,
  onSaveBinding,
}: WorkspaceCloneChannelBindingModalProps) {
  const [feishuQrImageUrl, setFeishuQrImageUrl] = useState("");
  const [countdownTick, setCountdownTick] = useState(Date.now());
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [agentMenuRect, setAgentMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const agentMenuRef = useRef<HTMLDivElement | null>(null);
  const agentTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!state.open) {
      setAgentMenuOpen(false);
      setAgentMenuRect(null);
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = agentTriggerRef.current?.contains(target);
      const insideMenu = agentMenuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) {
        setAgentMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAgentMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [state.open]);

  useEffect(() => {
    setAgentMenuOpen(false);
  }, [selectedAgentId, state.channelId, state.open]);

  useLayoutEffect(() => {
    if (!agentMenuOpen) {
      setAgentMenuRect(null);
      return undefined;
    }

    const updateMenuRect = () => {
      const trigger = agentTriggerRef.current;
      if (!trigger) {
        setAgentMenuRect(null);
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setAgentMenuRect({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [agentMenuOpen]);

  const channelMeta = useMemo(
    () => WORKSPACE_CHANNEL_CATALOG.find((item) => item.id === state.channelId),
    [state.channelId],
  );

  const isWeixinModalTarget = state.implemented && state.channelId === "weixin";
  const isFeishuModalTarget = state.implemented && state.channelId === "feishu";

  const selectedAgent = useMemo(
    () => availableAgents.find((agent) => agent.id === selectedAgentId) ?? null,
    [availableAgents, selectedAgentId],
  );

  const countdownLabel = useMemo(() => formatCountdown(feishuQrExpiresAtMs), [countdownTick, feishuQrExpiresAtMs]);

  const canSaveBinding = useMemo(() => {
    if (!state.implemented || !selectedAgentId.trim()) {
      return false;
    }
    if (state.channelId === "weixin") {
      return true;
    }
    if (state.channelId === "feishu") {
      return Boolean(feishuAppId.trim() || feishuAppSecretConfigured);
    }
    return false;
  }, [feishuAppId, feishuAppSecretConfigured, selectedAgentId, state.channelId, state.implemented]);

  const agentTriggerLabel = selectedAgent
    ? selectedAgent.name
    : availableAgents[0]
      ? availableAgents[0].name
      : "暂无可用数字员工";

  const feedbackTone = modalError.trim() ? "error" : modalNotice.trim() ? "success" : "pending";
  const showFeedback = !isWeixinModalTarget && (modalLoading || modalNotice.trim() || modalError.trim());
  const showWeixinPendingDiagnostics = isWeixinModalTarget
    && !weixinQrUrl.trim()
    && hasActiveWeixinQrSession
    && (weixinQrDetail.trim().length > 0 || weixinQrLogs.length > 0);
  const showAgentMenu = agentMenuOpen && agentMenuRect;
  const agentMenu = showAgentMenu
    ? createPortal(
        <div
          ref={agentMenuRef}
          className="channel-agent-picker__menu channel-agent-picker__menu--portal"
          style={{
            top: `${agentMenuRect.top}px`,
            left: `${agentMenuRect.left}px`,
            width: `${Math.max(agentMenuRect.width, 240)}px`,
          }}
          role="listbox"
          aria-label="数字员工选择"
        >
          <p className="channel-agent-picker__caption">请选择绑定数字员工</p>
          {availableAgents.length === 0 ? (
            <p className="channel-agent-picker__empty">暂无可用数字员工</p>
          ) : (
            availableAgents.map((agent) => {
              const selected = selectedAgentId.trim().toLowerCase() === agent.id.trim().toLowerCase();
              return (
                <button
                  key={`channel-binding-agent-${agent.id}`}
                  type="button"
                  className={`channel-agent-picker__option ${selected ? "is-active" : ""}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onSelectAgent(agent.id);
                    setAgentMenuOpen(false);
                  }}
                >
                  <span
                    className={`channel-agent-picker__option-mark ${selected ? "is-active" : ""}`}
                    aria-hidden="true"
                  />
                  <span>{agent.name}</span>
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <Modal
      show={state.open}
      onClose={onClose}
      maxWidth={isWeixinModalTarget ? 560 : 680}
      overlayClassName="workspace-channel-modal__overlay"
      contentClassName={[
        "workspace-channel-modal__surface",
        isWeixinModalTarget ? "is-weixin" : "",
      ].join(" ").trim()}
    >
      <section className="workspace-channel-modal">
        <header
          className={[
            "workspace-channel-modal__header",
            isWeixinModalTarget ? "is-weixin" : "",
          ].join(" ").trim()}
        >
          {isWeixinModalTarget ? (
            <div className="workspace-channel-modal__platform-head">
              <span className="workspace-channel-modal__platform-icon-shell is-weixin-plain">
                {channelMeta?.icon ? <img src={channelMeta.icon} alt="微信" /> : null}
              </span>
              <strong>微信消息频道绑定</strong>
            </div>
          ) : isFeishuModalTarget ? (
            <div className="workspace-channel-modal__platform-head">
              <span className="workspace-channel-modal__platform-icon-shell is-feishu">
                {channelMeta?.icon ? <img src={channelMeta.icon} alt="飞书" /> : null}
              </span>
              <strong>飞书消息频道绑定</strong>
            </div>
          ) : (
            <div className="workspace-channel-modal__title-block">
              <strong>配置频道绑定</strong>
              <p>{`${state.channelName} / ${state.accountLabel}`}</p>
            </div>
          )}

          <button
            className="workspace-channel-modal__close"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            <WorkspaceCloneIcon name="x" size={16} strokeWidth={2.1} />
          </button>
        </header>

        <div
          className={[
            "workspace-channel-modal__body",
            isWeixinModalTarget ? "is-weixin" : "",
          ].join(" ").trim()}
        >
          {modalLoading ? (
            <div className="workspace-channel-modal__placeholder">
              <strong>正在读取频道配置...</strong>
              <p>稍等片刻，配置载入后就能继续绑定操作。</p>
            </div>
          ) : isFeishuModalTarget ? (
            <section className="feishu-connect-modal-lite">
              <button
                className="feishu-connect-modal__scan-button"
                type="button"
                disabled={feishuQrChecking || feishuQrRequesting || modalSaving}
                onClick={onRequestFeishuQr}
              >
                {feishuQrRequesting ? "获取中..." : feishuQrVisible ? "重新获取创建二维码" : "获取创建二维码"}
              </button>

              {feishuQrVisible && (
                <section className="feishu-connect-qr">
                  <div className="feishu-connect-qr__panel">
                    <header className="feishu-connect-qr__head">
                      <div>
                        <strong>第 1 步：用手机飞书扫码创建机器人</strong>
                        <p>扫码完成后点击“检查结果”，系统会自动回填 App ID / App Secret。</p>
                      </div>
                      <button type="button" disabled={feishuQrChecking || modalSaving} onClick={onCheckFeishuQr}>
                        {feishuQrChecking ? "检查中..." : "检查结果"}
                      </button>
                    </header>

                    <div className="feishu-connect-qr__code-shell">
                      {feishuQrImageUrl ? (
                        <img src={feishuQrImageUrl} alt="飞书创建二维码" loading="lazy" decoding="async" />
                      ) : (
                        <p className="feishu-connect-qr__fallback">二维码生成中...</p>
                      )}
                    </div>

                    {feishuQrUserCode ? (
                      <p className="feishu-connect-qr__code-label">用户码 {feishuQrUserCode}</p>
                    ) : null}
                    {countdownLabel ? (
                      <p className={`feishu-connect-qr__expiry ${countdownLabel === "已过期" ? "is-expired" : ""}`}>
                        {countdownLabel === "已过期" ? "当前创建码已过期，请重新获取。" : `二维码剩余 ${countdownLabel}`}
                      </p>
                    ) : null}
                  </div>
                </section>
              )}
            </section>
          ) : isWeixinModalTarget ? (
            <section className="channel-qr-bind">
              <h3 className="channel-qr-bind__title">用微信扫码登录</h3>
              <p className="channel-qr-bind__subtitle">打开微信扫一扫，扫描下方二维码完成授权。</p>

              {weixinQrUrl.trim() ? (
                <div className="channel-qr-bind__panel">
                  <div className="channel-qr-bind__image-shell">
                    {weixinQrImageUrl ? (
                      <img src={weixinQrImageUrl} alt="微信二维码" loading="lazy" decoding="async" />
                    ) : (
                      <p className="channel-qr-bind__connecting">二维码渲染中，请稍候...</p>
                    )}
                  </div>
                  <div className="channel-qr-bind__actions">
                    <button
                      className="channel-qr-bind__link"
                      type="button"
                      onClick={() => onOpenExternalLink(weixinQrUrl)}
                    >
                      在浏览器中打开二维码链接
                    </button>
                  </div>
                </div>
              ) : (
                <div className="channel-qr-bind__panel channel-qr-bind__panel--placeholder">
                  <div className="channel-qr-bind__image-shell channel-qr-bind__image-shell--placeholder">
                    <span>
                      {isCurrentWeixinChannelAlreadyBound && !weixinQrStarting
                        ? "已绑定"
                        : "加载中"}
                    </span>
                  </div>
                </div>
              )}

              {showWeixinPendingDiagnostics ? (
                <section className="channel-qr-bind__diagnostics" aria-live="polite">
                  {weixinQrDetail.trim() ? (
                    <p className="channel-qr-bind__diagnostics-detail">{weixinQrDetail.trim()}</p>
                  ) : null}
                  {weixinQrLogs.length > 0 ? (
                    <ul className="channel-qr-bind__diagnostics-list">
                      {weixinQrLogs.map((entry, index) => (
                        <li key={`weixin-qr-log-${index}`}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              <p className={`channel-qr-bind__status is-${weixinQrStatusTone}`}>
                {weixinQrStatusText || weixinQrDetail || "获取二维码后，使用微信扫一扫完成授权。"}
              </p>
              <button
                className="channel-qr-bind__refresh"
                type="button"
                disabled={weixinQrStarting || modalSaving}
                onClick={onStartWeixinQrBinding}
              >
                {weixinQrStarting
                  ? "获取中..."
                  : isCurrentWeixinChannelAlreadyBound || weixinQrPolling || weixinQrUrl.trim()
                    ? "刷新二维码"
                    : "重新获取二维码"}
              </button>
              {!isCurrentWeixinChannelAlreadyBound ? (
                <p className="channel-qr-bind__footnote">连接成功后，给你的微信发一条消息即可完成配对授权。</p>
              ) : null}
            </section>
          ) : (
            <div className="workspace-channel-modal__placeholder">
              <strong>暂未开放自动接入</strong>
              <p>当前平台本期只迁移目录卡片与弹窗入口，后续再补真实 token / webhook / bot onboarding。</p>
            </div>
          )}

          {showFeedback ? (
            <div className={`workspace-channel-modal__feedback is-${feedbackTone}`}>
              {modalLoading ? "正在读取频道配置..." : modalError.trim() || modalNotice.trim()}
            </div>
          ) : null}

          <section className="channel-pane-binding-form">
            <div className="channel-agent-inline">
              <span className="channel-agent-inline__label">数字员工</span>
              <div className="channel-agent-picker">
                <button
                  ref={agentTriggerRef}
                  className="channel-agent-picker__trigger"
                  type="button"
                  disabled={modalSaving || availableAgents.length === 0}
                  aria-expanded={agentMenuOpen}
                  aria-haspopup="listbox"
                  onClick={() => setAgentMenuOpen((current) => !current)}
                >
                  <span className="channel-agent-picker__trigger-text">{agentTriggerLabel}</span>
                  <WorkspaceCloneIcon
                    name="chevron-right"
                    className={`channel-agent-picker__trigger-chevron ${agentMenuOpen ? "is-open" : ""}`}
                    size={13}
                    strokeWidth={1.9}
                  />
                </button>

                {agentMenu}
              </div>
            </div>
            {isWeixinModalTarget ? (
              <p className="channel-agent-inline__hint">扫码授权完成后，将自动关联当前所选数字员工。</p>
            ) : null}

            {isFeishuModalTarget ? (
              <div className="channel-feishu-access">
                <span className="channel-feishu-access__label">私聊权限</span>
                <div className="channel-feishu-access__modes">
                  <label className="channel-feishu-access__mode">
                    <input
                      checked={feishuDmPolicy === "open"}
                      type="radio"
                      value="open"
                      onChange={() => onChangeFeishuDmPolicy("open")}
                    />
                    <span>允许所有用户聊天</span>
                  </label>
                  <label className="channel-feishu-access__mode">
                    <input
                      checked={feishuDmPolicy === "allowlist"}
                      type="radio"
                      value="allowlist"
                      onChange={() => onChangeFeishuDmPolicy("allowlist")}
                    />
                    <span>白名单聊天</span>
                  </label>
                </div>

                {feishuDmPolicy === "allowlist" ? (
                  <div className="channel-feishu-access__allowlist">
                    <p className="channel-feishu-access__hint">
                      可添加多个会话 ID（如 `ou_xxx`），仅白名单用户可私聊。
                    </p>
                    <div className="channel-feishu-access__input-row">
                      <input
                        value={feishuAllowFromDraft}
                        type="text"
                        placeholder="输入会话 ID 后回车或点击添加"
                        disabled={modalSaving}
                        onChange={(event) => onChangeFeishuAllowFromDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddFeishuAllowFromSessionId();
                          }
                        }}
                      />
                      <button type="button" disabled={modalSaving} onClick={onAddFeishuAllowFromSessionId}>
                        添加
                      </button>
                    </div>

                    {feishuAllowFromSessionIds.length > 0 ? (
                      <div className="channel-feishu-access__chips">
                        {feishuAllowFromSessionIds.map((sessionId) => (
                          <span key={`allowfrom-${sessionId}`} className="channel-feishu-access__chip">
                            <code>{sessionId}</code>
                            <button
                              type="button"
                              disabled={modalSaving}
                              onClick={() => onRemoveFeishuAllowFromSessionId(sessionId)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {isFeishuModalTarget ? (
            <section className="feishu-connect-manual feishu-connect-manual--bottom">
              <button className="feishu-connect-manual__toggle" type="button" onClick={onToggleFeishuManualExpanded}>
                <span aria-hidden="true">{feishuManualExpanded ? "▼" : "▶"}</span>
                <span>已有 App ID？手动输入</span>
              </button>

              {feishuManualExpanded ? (
                <div className="feishu-connect-manual__form">
                  <label className="feishu-connect-manual__field">
                    <span>App ID</span>
                    <input
                      value={feishuAppId}
                      type="text"
                      placeholder="cli_a2410d..."
                      autoComplete="off"
                      onChange={(event) => onChangeFeishuAppId(event.target.value)}
                    />
                  </label>

                  <label className="feishu-connect-manual__field">
                    <span>App Secret</span>
                    <div className="feishu-connect-manual__secret-row">
                      <input
                        value={feishuAppSecret}
                        type={feishuAppSecretVisible ? "text" : "password"}
                        placeholder={feishuAppSecretConfigured ? "已保存，可留空保持不变" : "请输入 App Secret"}
                        autoComplete="off"
                        onChange={(event) => onChangeFeishuAppSecret(event.target.value)}
                      />
                      <button type="button" onClick={onToggleFeishuAppSecretVisible}>
                        {feishuAppSecretVisible ? "隐藏" : "显示"}
                      </button>
                    </div>
                  </label>

                  {feishuAppSecretConfigured ? (
                    <p className="feishu-connect-manual__hint">
                      已保存 Secret（安全隐藏）。如需更新，请输入新 Secret 后再次保存。
                    </p>
                  ) : null}

                  <div className="feishu-connect-manual__actions">
                    <button type="button" disabled={!canSaveBinding || modalSaving} onClick={onSaveBinding}>
                      {modalSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {state.implemented && !isWeixinModalTarget ? (
            <div className="workspace-channel-modal__footer">
              <button className="workspace-channel-modal__primary" type="button" disabled={!canSaveBinding || modalSaving} onClick={onSaveBinding}>
                {modalSaving ? "保存中..." : "保存绑定"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </Modal>
  );
}
