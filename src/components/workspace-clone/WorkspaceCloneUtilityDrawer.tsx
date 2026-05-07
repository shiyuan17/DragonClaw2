import type { ReactNode } from "react";

import { WorkspaceCloneFilesDrawerPanel } from "./WorkspaceCloneFilesDrawerPanel";
import { WorkspaceCloneHistoryDrawerPanel } from "./WorkspaceCloneHistoryDrawerPanel";
import { WorkspaceCloneLogsDrawerPanel } from "./WorkspaceCloneLogsDrawerPanel";
import { WorkspaceCloneScheduleDrawerPanel } from "./WorkspaceCloneScheduleDrawerPanel";
import { WorkspaceCloneSessionDrawerPanel } from "./WorkspaceCloneSessionDrawerPanel";
import { WorkspaceCloneUtilityDrawerShell } from "./WorkspaceCloneUtilityDrawerShell";
import { WorkspaceCloneWorkbenchDrawerPanel } from "./WorkspaceCloneWorkbenchDrawerPanel";
import { WORKSPACE_DRAWER_TITLES } from "./workspaceCloneDrawerShared";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceChatFileItem,
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceEntity,
  WorkspaceHistoryFilter,
  WorkspaceHistoryItem,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceRuntimeLogItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";

interface WorkspaceCloneUtilityDrawerProps {
  panel: WorkspaceUtilityPanel;
  selectedEntity: WorkspaceEntity | null;
  activeSessionSection: WorkspaceSessionSectionKey;
  historyItems: WorkspaceHistoryItem[];
  logs: WorkspaceRuntimeLogItem[];
  selectedRuntimeLogId: string | null;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  taskLoading: boolean;
  taskRunsLoading: boolean;
  taskRunsLoadingId: string | null;
  taskActionJobId: string | null;
  optimisticRunningTaskIds: string[];
  gatewayConnected: boolean;
  workbenchItems: WorkspaceWorkbenchItem[];
  fileItems: WorkspaceChatFileItem[];
  memoryItems: WorkspaceResourceItem[];
  skillItems: WorkspaceResourceItem[];
  commandItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  toolItems: WorkspaceToolItem[];
  currentModelName: string;
  currentProviderName: string;
  historyFilter: WorkspaceHistoryFilter;
  onClose: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistoryFilter: (filter: WorkspaceHistoryFilter) => void;
  onSelectHistorySession: (sessionKey: string) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenModelConfig: () => void;
  onOpenChatFile: (item: WorkspaceChatFileItem) => void;
  onOpenRuntimeLogDetail: (logId: string) => void;
  onRefreshTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskEnabled: (task: WorkspaceCronJob) => void;
  onEditTask: (task: WorkspaceCronJob) => void;
  onRunTask: (task: WorkspaceCronJob) => void;
  onDeleteTask: (task: WorkspaceCronJob) => void;
}

export function WorkspaceCloneUtilityDrawer({
  panel,
  selectedEntity,
  activeSessionSection,
  historyItems,
  logs,
  selectedRuntimeLogId,
  tasks,
  selectedTaskId,
  selectedTaskRuns: _selectedTaskRuns,
  taskLoading,
  taskRunsLoading: _taskRunsLoading,
  taskRunsLoadingId: _taskRunsLoadingId,
  taskActionJobId,
  optimisticRunningTaskIds,
  gatewayConnected,
  workbenchItems,
  fileItems,
  memoryItems,
  skillItems,
  commandItems,
  channelItems,
  toolItems,
  currentModelName,
  currentProviderName,
  historyFilter,
  onClose,
  onSelectSessionSection,
  onSelectHistoryFilter,
  onSelectHistorySession,
  onOpenRelatedResource,
  onOpenModelConfig,
  onOpenChatFile,
  onOpenRuntimeLogDetail,
  onRefreshTasks,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
}: WorkspaceCloneUtilityDrawerProps) {
  if (!panel) {
    return null;
  }

  let content: ReactNode = null;

  switch (panel) {
    case "history":
      content = (
        <WorkspaceCloneHistoryDrawerPanel
          historyItems={historyItems}
          historyFilter={historyFilter}
          onSelectHistoryFilter={onSelectHistoryFilter}
          onSelectHistorySession={onSelectHistorySession}
        />
      );
      break;
    case "logs":
      content = (
        <WorkspaceCloneLogsDrawerPanel
          logs={logs}
          selectedRuntimeLogId={selectedRuntimeLogId}
          onOpenRuntimeLogDetail={onOpenRuntimeLogDetail}
        />
      );
      break;
    case "files":
      content = (
        <WorkspaceCloneFilesDrawerPanel
          fileItems={fileItems}
          onOpenChatFile={onOpenChatFile}
        />
      );
      break;
    case "session":
      content = (
        <WorkspaceCloneSessionDrawerPanel
          activeSessionSection={activeSessionSection}
          memoryItems={memoryItems}
          skillItems={skillItems}
          commandItems={commandItems}
          channelItems={channelItems}
          toolItems={toolItems}
          tasksCount={tasks.length}
          enabledTaskCount={tasks.filter((task) => task.enabled).length}
          currentModelName={currentModelName}
          currentProviderName={currentProviderName}
          onSelectSessionSection={onSelectSessionSection}
          onOpenRelatedResource={onOpenRelatedResource}
          onOpenModelConfig={onOpenModelConfig}
        />
      );
      break;
    case "schedule":
      content = (
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
      );
      break;
    case "workbench":
      content = <WorkspaceCloneWorkbenchDrawerPanel workbenchItems={workbenchItems} />;
      break;
    default:
      content = null;
  }

  return (
    <WorkspaceCloneUtilityDrawerShell
      title={WORKSPACE_DRAWER_TITLES[panel]}
      onClose={onClose}
      actions={panel === "schedule" ? (
        <button type="button" aria-label="刷新任务列表" onClick={onRefreshTasks}>
          <WorkspaceCloneIcon name="refresh" size={15} strokeWidth={1.9} />
        </button>
      ) : undefined}
    >
      {content}
    </WorkspaceCloneUtilityDrawerShell>
  );
}
