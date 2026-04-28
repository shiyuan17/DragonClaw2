import logo from "../../assets/dragonclaw-logo.png";
import type { WorkspaceMenuKey } from "../../types";
import type { WorkspaceMenuItem, WorkspaceSidebarAdminPanel } from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneSidebarProps {
  menuItems: WorkspaceMenuItem[];
  activeMenu: WorkspaceMenuKey;
  isCollapsed: boolean;
  adminOpen: boolean;
  adminPanel: WorkspaceSidebarAdminPanel;
  onSelectMenu: (key: WorkspaceMenuKey) => void;
  onToggleCollapsed: () => void;
  onToggleAdmin: () => void;
  onSelectAdminPanel: (panel: WorkspaceSidebarAdminPanel) => void;
}

export function WorkspaceCloneSidebar({
  menuItems,
  activeMenu,
  isCollapsed,
  adminOpen,
  adminPanel,
  onSelectMenu,
  onToggleCollapsed,
  onToggleAdmin,
  onSelectAdminPanel,
}: WorkspaceCloneSidebarProps) {
  return (
    <aside className={`workspace-clone__sidebar ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className={`workspace-clone__sidebar-topbar ${isCollapsed ? "is-collapsed" : ""}`}>
        <button
          className="workspace-clone__toggle-btn"
          type="button"
          onClick={onToggleCollapsed}
          title={isCollapsed ? "展开侧栏" : "收起侧栏"}
        >
          <WorkspaceCloneIcon name="panel" size={14} strokeWidth={1.9} />
        </button>
      </div>

      <div className="workspace-clone__sidebar-menu">
        {menuItems.map((item) => {
          const isMuted = item.key === "tasks";
          return (
            <button
              key={item.key}
              className={[
                "workspace-clone__menu-item",
                activeMenu === item.key ? "is-active" : "",
                isCollapsed ? "is-collapsed" : "",
                isMuted ? "is-muted" : "",
              ].join(" ").trim()}
              type="button"
              title={item.label}
              onClick={() => onSelectMenu(item.key)}
            >
              <WorkspaceCloneIcon
                name={item.icon as Parameters<typeof WorkspaceCloneIcon>[0]["name"]}
                size={17}
                strokeWidth={1.9}
              />
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="workspace-clone__sidebar-fill">
        <button className={`workspace-clone__brand-watermark ${isCollapsed ? "is-collapsed" : ""}`} type="button">
          <span className="workspace-clone__brand-logo">
            {!isCollapsed && <span className="workspace-clone__brand-badge">Beta</span>}
            <img src={logo} alt="DragonClaw" className="workspace-clone__brand-mark" />
          </span>
          {!isCollapsed && (
            <span className="workspace-clone__brand-meta">
              <strong>DragonClaw</strong>
            </span>
          )}
        </button>
      </div>

      <button className={`workspace-clone__profile-switch workspace-clone__feedback-btn ${isCollapsed ? "is-collapsed" : ""}`} type="button">
        <span className="workspace-clone__avatar-wrap">
          <WorkspaceCloneIcon name="message-circle" size={12} strokeWidth={2} />
        </span>
        {!isCollapsed && <span>反馈</span>}
      </button>

      <div className="workspace-clone__admin-wrap">
        {adminOpen && (
          <div className={`workspace-clone__admin-popover ${adminPanel ? "has-secondary" : ""}`}>
            <div className="workspace-clone__admin-grid">
              <button
                className={`workspace-clone__admin-item ${adminPanel === "theme" ? "is-active" : ""}`}
                type="button"
                onMouseEnter={() => onSelectAdminPanel("theme")}
                onClick={() => onSelectAdminPanel("theme")}
              >
                <span className="workspace-clone__admin-item-icon">
                  <WorkspaceCloneIcon name="palette" size={14} strokeWidth={1.9} />
                </span>
                <span>主题</span>
                <WorkspaceCloneIcon name="chevron-right" size={12} strokeWidth={2} />
              </button>
              <button
                className={`workspace-clone__admin-item ${adminPanel === "language" ? "is-active" : ""}`}
                type="button"
                onMouseEnter={() => onSelectAdminPanel("language")}
                onClick={() => onSelectAdminPanel("language")}
              >
                <span className="workspace-clone__admin-item-icon">
                  <WorkspaceCloneIcon name="languages" size={14} strokeWidth={1.9} />
                </span>
                <span>语言</span>
                <WorkspaceCloneIcon name="chevron-right" size={12} strokeWidth={2} />
              </button>
              <button className="workspace-clone__admin-item" type="button">
                <span className="workspace-clone__admin-item-icon">
                  <WorkspaceCloneIcon name="settings" size={14} strokeWidth={1.9} />
                </span>
                <span>设置</span>
              </button>
            </div>

            {adminPanel === "theme" && (
              <div className="workspace-clone__admin-secondary">
                <div className="workspace-clone__theme-toggle">
                  <div>
                    <strong>浅色工作台</strong>
                    <small>当前仅保留前端主题选项样式，不连接真实主题切换。</small>
                  </div>
                  <span className="workspace-clone__theme-pill">Air</span>
                </div>
                <div className="workspace-clone__secondary-options">
                  {["Air", "Pure", "Mist", "Calm"].map((tone) => (
                    <button key={tone} className={`workspace-clone__secondary-option ${tone === "Air" ? "is-active" : ""}`} type="button">
                      <span className="workspace-clone__secondary-swatch" />
                      <span>{tone}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {adminPanel === "language" && (
              <div className="workspace-clone__admin-secondary workspace-clone__admin-secondary--language">
                {["中文", "English", "日本語"].map((label, index) => (
                  <button key={label} className={`workspace-clone__secondary-option ${index === 0 ? "is-active" : ""}`} type="button">
                    <span>{label}</span>
                    <small>{index === 0 ? "zh-CN" : index === 1 ? "en" : "ja"}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button className={`workspace-clone__profile-switch ${isCollapsed ? "is-collapsed" : ""}`} type="button" onClick={onToggleAdmin}>
          <span className="workspace-clone__avatar-wrap">
            <WorkspaceCloneIcon name="settings" size={12} strokeWidth={2} />
          </span>
          {!isCollapsed && (
            <>
              <span>管理员</span>
              <WorkspaceCloneIcon name="chevron-right" size={12} strokeWidth={2} className={adminOpen ? "workspace-clone__chevron-rotated" : ""} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
