import type { WorkspaceWorkbenchItem } from "./workspaceCloneTypes";

interface WorkspaceCloneWorkbenchDrawerPanelProps {
  workbenchItems: WorkspaceWorkbenchItem[];
}

export function WorkspaceCloneWorkbenchDrawerPanel({
  workbenchItems,
}: WorkspaceCloneWorkbenchDrawerPanelProps) {
  return (
    <div className="workspace-clone__drawer-body">
      {workbenchItems.map((item) => (
        <section key={item.id} className="workspace-clone__drawer-card">
          <strong>{item.title}</strong>
          <small>{item.detail}</small>
          <span>{item.time}</span>
        </section>
      ))}
    </div>
  );
}
