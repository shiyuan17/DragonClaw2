import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WorkspaceCloneScheduleDrawerPanel } from "./WorkspaceCloneScheduleDrawerPanel";
import type { WorkspaceCronJob, WorkspaceEntity } from "./workspaceCloneTypes";

interface WorkspaceCloneSchedulePageProps {
  selectedEntity: WorkspaceEntity | null;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  taskLoading: boolean;
  taskActionJobId: string | null;
  optimisticRunningTaskIds: string[];
  gatewayConnected: boolean;
  onSelectTask: (taskId: string) => void;
  onToggleTaskEnabled: (task: WorkspaceCronJob) => void;
  onEditTask: (task: WorkspaceCronJob) => void;
  onRunTask: (task: WorkspaceCronJob) => void;
  onDeleteTask: (task: WorkspaceCronJob) => void;
}

export function WorkspaceCloneSchedulePage({
  selectedEntity,
  tasks,
  selectedTaskId,
  taskLoading,
  taskActionJobId,
  optimisticRunningTaskIds,
  gatewayConnected,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
}: WorkspaceCloneSchedulePageProps) {
  return (
    <section className="workspace-clone__task-page" aria-label="定时任务">
      <div className="workspace-clone__task-page-head">
        <div className="workspace-clone__task-page-copy">
          <h1>定时任务</h1>
          <p>请保持电脑开机并运行客户端，否则在关机、休眠或退出客户端时，定时任务将无法自动执行。</p>
        </div>

        <button
          type="button"
          className="workspace-clone__task-page-create"
          disabled
          title="暂未开放"
          aria-label="新建定时任务，暂未开放"
        >
          <WorkspaceCloneIcon name="plus" size={15} strokeWidth={2} />
          <span>新建定时任务</span>
        </button>
      </div>

      <div className="workspace-clone__task-page-panel">
        <WorkspaceCloneScheduleDrawerPanel
          selectedEntity={selectedEntity}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          taskLoading={taskLoading}
          taskActionJobId={taskActionJobId}
          optimisticRunningTaskIds={optimisticRunningTaskIds}
          gatewayConnected={gatewayConnected}
          onSelectTask={onSelectTask}
          onToggleTaskEnabled={onToggleTaskEnabled}
          onEditTask={onEditTask}
          onRunTask={onRunTask}
          onDeleteTask={onDeleteTask}
        />
      </div>
    </section>
  );
}
