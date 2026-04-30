import { useEffect, useRef, useState } from "react";
import type { WorkspaceEntity, WorkspaceUtilityPanel } from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneHeaderProps {
  selectedEntity: WorkspaceEntity | null;
  activeUtilityPanel: WorkspaceUtilityPanel;
  onToggleUtilityPanel: (panel: Exclude<WorkspaceUtilityPanel, null>) => void;
  onOpenAgentInfo: () => void;
  onOpenSessionPanel: () => void;
  onOpenWorkbench: () => void;
  onOpenMemberManagement: () => void;
}

export function WorkspaceCloneHeader({
  selectedEntity,
  activeUtilityPanel,
  onToggleUtilityPanel,
  onOpenAgentInfo,
  onOpenSessionPanel,
  onOpenWorkbench,
  onOpenMemberManagement,
}: WorkspaceCloneHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const isTeam = selectedEntity?.entityType === "teams";

  useEffect(() => {
    if (!moreOpen) return undefined;

    const handleClick = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  return (
    <header className="workspace-clone__header">
      <div className="workspace-clone__header-entity">
        <button className="workspace-clone__avatar workspace-clone__avatar--button" type="button">
          {selectedEntity?.memberLabels?.length ? (
            <span className="workspace-clone__avatar-stack-inline">
              {selectedEntity.memberLabels.slice(0, 3).map((label) => (
                <span key={`${selectedEntity.id}-${label}`} className="workspace-clone__avatar-stack-chip">{label}</span>
              ))}
            </span>
          ) : (
            selectedEntity?.avatarLabel || "A"
          )}
        </button>

        <div className="workspace-clone__header-copy">
          <h2>{selectedEntity?.name || "请选择会话"}</h2>
        </div>
      </div>

      <div className="workspace-clone__drag-fill" />

      <div className="workspace-clone__header-actions">
        {isTeam ? (
          <>
            <button
              className={`workspace-clone__icon-btn ${activeUtilityPanel === "workbench" ? "is-active" : ""}`}
              type="button"
              title="工作台"
              onClick={onOpenWorkbench}
            >
              <WorkspaceCloneIcon name="layout-dashboard" size={15} strokeWidth={1.9} />
            </button>
            <button
              className="workspace-clone__icon-btn"
              type="button"
              title="成员管理"
              onClick={onOpenMemberManagement}
            >
              <WorkspaceCloneIcon name="users" size={15} strokeWidth={1.9} />
            </button>
          </>
        ) : (
          <>
            <button className="workspace-clone__icon-btn" type="button" title="Agent 信息" onClick={onOpenAgentInfo}>
              <WorkspaceCloneIcon name="info" size={15} strokeWidth={1.9} />
            </button>
            <button
              className={`workspace-clone__icon-btn workspace-clone__icon-btn--primary ${activeUtilityPanel === "session" ? "is-active" : ""}`}
              type="button"
              title="会话菜单"
              onClick={onOpenSessionPanel}
            >
              <WorkspaceCloneIcon name="sparkles" size={15} strokeWidth={1.9} />
            </button>
          </>
        )}

        <div className="workspace-clone__more-wrap" ref={moreRef}>
          <button
            className={`workspace-clone__icon-btn ${moreOpen ? "is-active" : ""}`}
            type="button"
            title="更多"
            onClick={() => setMoreOpen((value) => !value)}
          >
            <WorkspaceCloneIcon name="more" size={15} strokeWidth={1.9} />
          </button>

          {moreOpen && (
            <div className="workspace-clone__more-menu">
              {[
                { key: "history", label: "历史会话", icon: "clock" },
                { key: "logs", label: "运行日志", icon: "notebook" },
                { key: "schedule", label: "定时任务", icon: "calendar-clock" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={activeUtilityPanel === item.key ? "is-active" : ""}
                  onClick={() => {
                    setMoreOpen(false);
                    onToggleUtilityPanel(item.key as Exclude<WorkspaceUtilityPanel, null>);
                  }}
                >
                  <WorkspaceCloneIcon
                    name={item.icon as Parameters<typeof WorkspaceCloneIcon>[0]["name"]}
                    size={14}
                    strokeWidth={1.9}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
