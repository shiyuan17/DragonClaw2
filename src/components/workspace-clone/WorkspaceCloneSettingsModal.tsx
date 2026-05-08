import { Modal } from "../ui/Modal";

interface WorkspaceCloneSettingsModalProps {
  show: boolean;
  telemetryEnabled: boolean;
  telemetryConfigured: boolean;
  posthogHost: string;
  onClose: () => void;
  onToggleTelemetry: (enabled: boolean) => void;
}

export function WorkspaceCloneSettingsModal({
  show,
  telemetryEnabled,
  telemetryConfigured,
  posthogHost,
  onClose,
  onToggleTelemetry,
}: WorkspaceCloneSettingsModalProps) {
  return (
    <Modal show={show} onClose={onClose} title="工作台设置" maxWidth={620}>
      <div className="workspace-clone__dialog-body">
        <div className="workspace-clone__dialog-copy">
          <strong>数据监控</strong>
          <p>
            DragonClaw 仅采集基础产品事件，用于了解启动、配置、聊天和任务入口的使用情况。
            不采集聊天正文、API Key、Gateway Token、Base URL、工作区路径或原始日志内容。
          </p>
        </div>

        <div className="workspace-clone__settings-section">
          <label className="workspace-clone__settings-toggle">
            <input
              type="checkbox"
              checked={telemetryEnabled}
              onChange={(event) => onToggleTelemetry(event.target.checked)}
            />
            <span className="workspace-clone__settings-toggle-copy">
              <strong>启用产品分析</strong>
              <small>
                {telemetryEnabled
                  ? "当前会发送基础产品事件到 PostHog。"
                  : "当前已关闭产品分析，后续操作不会再上报。"}
              </small>
            </span>
          </label>

          <div className="workspace-clone__settings-meta">
            <div>
              <strong>PostHog Host</strong>
              <span>{posthogHost}</span>
            </div>
            <div>
              <strong>项目配置</strong>
              <span>{telemetryConfigured ? "已注入 VITE_POSTHOG_KEY" : "未注入 VITE_POSTHOG_KEY，当前为安全 no-op"}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
