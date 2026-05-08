import type { WorkspaceMenuKey } from "../../types";
import dragonclawLogo from "../../assets/dragonclaw-logo.png";
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

function resolveSidebarMenuLabel(key: WorkspaceMenuKey, fallbackLabel: string) {
  switch (key) {
    case "chat":
      return "聊天";
    case "schedule":
      return "任务";
    case "knowledge":
      return "知识库管理";
    case "employees":
      return "数字员工";
    case "skills":
      return "技能市场";
    case "tasks":
      return "产品落地";
    default:
      return fallbackLabel;
  }
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
  const adminLabel = "管理员（工作台）";

  return (
    <aside className={`workspace-clone__sidebar ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className="workspace-clone__sidebar-rail">
        <div className={`workspace-clone__sidebar-topbar ${isCollapsed ? "is-collapsed" : ""}`}>
          <div className="workspace-clone__edge-trigger workspace-clone__edge-trigger--sidebar">
            <button
              className="workspace-clone__directory-edge-btn workspace-clone__directory-edge-btn--sidebar"
            type="button"
            onClick={onToggleCollapsed}
            title={isCollapsed ? "展开侧栏" : "收起侧栏"}
          >
              <WorkspaceCloneIcon
                name="chevron-right"
                size={14}
                strokeWidth={2}
                className={`workspace-clone__directory-edge-icon ${isCollapsed ? "is-collapsed" : ""}`}
              />
            </button>
          </div>
        </div>

        <div className="workspace-clone__sidebar-menu">
          {menuItems.map((item) => {
            const displayLabel = resolveSidebarMenuLabel(item.key, item.label);
            return (
              <button
                key={item.key}
                className={[
                  "workspace-clone__menu-item",
                  activeMenu === item.key ? "is-active" : "",
                  isCollapsed ? "is-collapsed" : "",

                ].join(" ").trim()}
                type="button"
                title={displayLabel}
                onClick={() => onSelectMenu(item.key)}
              >
                <WorkspaceCloneIcon
                  name={item.icon as Parameters<typeof WorkspaceCloneIcon>[0]["name"]}
                  size={17}
                  strokeWidth={1.9}
                />
                {!isCollapsed && <span>{displayLabel}</span>}
              </button>
            );
          })}
        </div>

        <div className="workspace-clone__sidebar-fill" />

        <div className={`workspace-clone__sidebar-actions ${isCollapsed ? "is-collapsed" : ""}`}>
          <div className={`workspace-clone__sidebar-footer-row ${isCollapsed ? "is-collapsed" : ""}`}>
            {!isCollapsed && (
              <div className="workspace-clone__profile-summary" aria-label={adminLabel}>
                <span className="workspace-clone__avatar-wrap workspace-clone__avatar-wrap--identity">
                  <img src={dragonclawLogo} alt="" className="workspace-clone__sidebar-avatar-image" />
                </span>
                <span className="workspace-clone__profile-copy">
                  <span className="workspace-clone__profile-title">{adminLabel}</span>
                </span>
              </div>
            )}

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

              <button
                className={[
                  "workspace-clone__sidebar-action-icon",
                  "workspace-clone__sidebar-action-icon--settings",
                  isCollapsed ? "is-collapsed" : "",
                ].join(" ").trim()}
                type="button"
                onClick={onToggleAdmin}
                title={adminLabel}
              >
                <WorkspaceCloneIcon name="settings" size={14} strokeWidth={1.85} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
