import { Modal } from "../ui/Modal";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneEmailBindingModalProps {
  show: boolean;
  loading: boolean;
  saving: boolean;
  notice: string;
  error: string;
  provider: string;
  providerOptions: { value: string; label: string }[];
  account: string;
  accountPlaceholder: string;
  authorizationCode: string;
  isCustomProvider: boolean;
  customImapHost: string;
  customImapPort: string;
  customSmtpHost: string;
  customSmtpPort: string;
  customImapTls: boolean;
  customSmtpSecure: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onProviderChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onAuthorizationCodeChange: (value: string) => void;
  onCustomImapHostChange: (value: string) => void;
  onCustomImapPortChange: (value: string) => void;
  onCustomSmtpHostChange: (value: string) => void;
  onCustomSmtpPortChange: (value: string) => void;
  onCustomImapTlsChange: (value: boolean) => void;
  onCustomSmtpSecureChange: (value: boolean) => void;
}

export function WorkspaceCloneEmailBindingModal({
  show,
  loading,
  saving,
  notice,
  error,
  provider,
  providerOptions,
  account,
  accountPlaceholder,
  authorizationCode,
  isCustomProvider,
  customImapHost,
  customImapPort,
  customSmtpHost,
  customSmtpPort,
  customImapTls,
  customSmtpSecure,
  onClose,
  onSubmit,
  onProviderChange,
  onAccountChange,
  onAuthorizationCodeChange,
  onCustomImapHostChange,
  onCustomImapPortChange,
  onCustomSmtpHostChange,
  onCustomSmtpPortChange,
  onCustomImapTlsChange,
  onCustomSmtpSecureChange,
}: WorkspaceCloneEmailBindingModalProps) {
  return (
    <Modal
      show={show}
      onClose={saving ? undefined : onClose}
      maxWidth={720}
      overlayClassName="workspace-email-modal__overlay"
      contentClassName="workspace-email-modal__surface"
    >
      <div className="workspace-email-modal">
        <div className="workspace-email-modal__header">
          <div className="workspace-email-modal__title-block">
            <div className="workspace-email-modal__eyebrow">Workspace Composer</div>
            <h3>邮箱绑定</h3>
            <p>绑定个人邮箱后，工作区可在触发邮件技能时复用同一份 IMAP / SMTP 配置。</p>
          </div>
          <button
            type="button"
            className="workspace-email-modal__close"
            aria-label="关闭邮箱绑定弹窗"
            onClick={onClose}
            disabled={saving}
          >
            <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
          </button>
        </div>

        <div className="workspace-email-modal__body">
          {notice ? <div className="workspace-email-modal__message is-success">{notice}</div> : null}
          {error ? <div className="workspace-email-modal__message is-error">{error}</div> : null}
          {loading ? <p className="workspace-email-modal__loading">正在读取邮箱绑定配置...</p> : null}

          <form
            className="workspace-email-modal__form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label className="workspace-email-modal__field">
              <span>邮箱类型 <em>*</em></span>
              <select
                value={provider}
                onChange={(event) => onProviderChange(event.target.value)}
                disabled={loading || saving}
              >
                <option value="">请选择邮箱类型</option>
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="workspace-email-modal__field">
              <span>邮箱账号 <em>*</em></span>
              <input
                value={account}
                type="text"
                placeholder={accountPlaceholder}
                onChange={(event) => onAccountChange(event.target.value)}
                disabled={loading || saving}
              />
            </label>

            <label className="workspace-email-modal__field">
              <span>授权码 / 应用专用密码 <em>*</em></span>
              <input
                value={authorizationCode}
                type="password"
                autoComplete="off"
                placeholder="请输入授权码或应用专用密码"
                onChange={(event) => onAuthorizationCodeChange(event.target.value)}
                disabled={loading || saving}
              />
            </label>

            {isCustomProvider ? (
              <section className="workspace-email-modal__custom">
                <div className="workspace-email-modal__custom-head">
                  <strong>自定义 IMAP / SMTP 参数</strong>
                  <p>仅在“其他邮箱”下展示，用于兼容非预设邮箱服务商。</p>
                </div>

                <div className="workspace-email-modal__custom-grid">
                  <label className="workspace-email-modal__field">
                    <span>IMAP Host <em>*</em></span>
                    <input
                      value={customImapHost}
                      type="text"
                      placeholder="imap.example.com"
                      onChange={(event) => onCustomImapHostChange(event.target.value)}
                      disabled={loading || saving}
                    />
                  </label>

                  <label className="workspace-email-modal__field">
                    <span>IMAP Port <em>*</em></span>
                    <input
                      value={customImapPort}
                      type="text"
                      inputMode="numeric"
                      placeholder="993"
                      onChange={(event) => onCustomImapPortChange(event.target.value)}
                      disabled={loading || saving}
                    />
                  </label>

                  <label className="workspace-email-modal__field">
                    <span>SMTP Host <em>*</em></span>
                    <input
                      value={customSmtpHost}
                      type="text"
                      placeholder="smtp.example.com"
                      onChange={(event) => onCustomSmtpHostChange(event.target.value)}
                      disabled={loading || saving}
                    />
                  </label>

                  <label className="workspace-email-modal__field">
                    <span>SMTP Port <em>*</em></span>
                    <input
                      value={customSmtpPort}
                      type="text"
                      inputMode="numeric"
                      placeholder="465"
                      onChange={(event) => onCustomSmtpPortChange(event.target.value)}
                      disabled={loading || saving}
                    />
                  </label>
                </div>

                <div className="workspace-email-modal__toggle-row">
                  <label className="workspace-email-modal__toggle">
                    <input
                      checked={customImapTls}
                      type="checkbox"
                      onChange={(event) => onCustomImapTlsChange(event.target.checked)}
                      disabled={loading || saving}
                    />
                    <span>IMAP TLS</span>
                  </label>

                  <label className="workspace-email-modal__toggle">
                    <input
                      checked={customSmtpSecure}
                      type="checkbox"
                      onChange={(event) => onCustomSmtpSecureChange(event.target.checked)}
                      disabled={loading || saving}
                    />
                    <span>SMTP SSL</span>
                  </label>
                </div>
              </section>
            ) : null}

            <div className="workspace-email-modal__footer">
              <button
                type="button"
                className="workspace-email-modal__ghost"
                onClick={onClose}
                disabled={saving}
              >
                取消
              </button>
              <button
                type="submit"
                className="workspace-email-modal__primary"
                disabled={loading || saving}
              >
                {saving ? "保存中..." : "确认绑定邮箱"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
