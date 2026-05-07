import type { ReactNode } from "react";

import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneUtilityDrawerShellProps {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceCloneUtilityDrawerShell({
  title,
  onClose,
  actions,
  children,
}: WorkspaceCloneUtilityDrawerShellProps) {
  return (
    <aside className="workspace-clone__drawer">
      <header className="workspace-clone__drawer-head">
        <div className="workspace-clone__drawer-head-top">
          <div>
            <strong>{title}</strong>
          </div>
          <div className="workspace-clone__drawer-head-actions">
            {actions}
            <button type="button" aria-label="关闭侧栏" onClick={onClose}>
              <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </header>
      {children}
    </aside>
  );
}
