import { Modal, ModalFooter } from "../ui/Modal";
import {
  formatWorkspaceCronDuration,
  formatWorkspaceCronPayloadPreview,
  formatWorkspaceCronScheduleSummary,
  formatWorkspaceCronSessionTarget,
  formatWorkspaceCronTimestamp,
  getWorkspaceCronDisplayStatus,
  getWorkspaceCronStatusLabel,
  getWorkspaceCronStatusTone,
} from "./workspaceCloneCron";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
} from "./workspaceCloneTypes";

interface WorkspaceCloneRelatedResourceModalProps {
  relatedResource: WorkspaceRelatedResource;
  channelItems: WorkspaceResourceItem[];
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  optimisticRunningTaskIds: string[];
  taskLoading: boolean;
  taskError: string;
  taskRunsError: string;
  taskRunsLoading: boolean;
  onClose: () => void;
}

const RELATED_TITLE_MAP: Record<Exclude<WorkspaceRelatedResource, null | "memory" | "skills" | "tools" | "commands">, string> = {
  model: "模型资源面板",
  channel: "频道资源面板",
  schedule: "任务详情",
};

function renderResourceList(items: WorkspaceResourceItem[]) {
  return (
    <div className="workspace-clone__resource-list">
      {items.map((item) => (
        <div key={item.id} className="workspace-clone__resource-row">
          <div>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </div>
          {item.tag ? <span className="workspace-clone__resource-tag">{item.tag}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function WorkspaceCloneRelatedResourceModal({
  relatedResource,
  channelItems,
  tasks,
  selectedTaskId,
  selectedTaskRuns,
  optimisticRunningTaskIds,
  taskLoading,
  taskError,
  taskRunsError,
  taskRunsLoading,
  onClose,
}: WorkspaceCloneRelatedResourceModalProps) {
  const show = Boolean(
    relatedResource
    && relatedResource !== "memory"
    && relatedResource !== "skills"
    && relatedResource !== "tools"
    && relatedResource !== "commands",
  );
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const selectedTaskStatus = selectedTask
    ? getWorkspaceCronDisplayStatus(selectedTask, { optimisticRunning: optimisticRunningTaskIds.includes(selectedTask.id) })
    : "disabled";

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={
        relatedResource
        && relatedResource !== "memory"
        && relatedResource !== "skills"
        && relatedResource !== "tools"
        && relatedResource !== "commands"
          ? RELATED_TITLE_MAP[relatedResource]
          : ""
      }
      maxWidth={860}
    >
      <div className="workspace-clone__dialog-body">
        <div className="workspace-clone__dialog-copy">
          <strong>Related Resource</strong>
          <p>这里统一承接 model、channel、task 的补充信息与只读详情。</p>
        </div>

        {relatedResource === "model" ? (
          <div className="workspace-clone__resource-grid">
            {["OpenAI Compatible", "Claude Compatible", "Local Mock Platform"].map((item, index) => (
              <div key={item} className="workspace-clone__resource-card">
                <strong>{item}</strong>
                <small>{index === 0 ? "当前激活" : "保留平台卡片、说明和切换按钮结构"}</small>
                <button type="button">{index === 0 ? "已激活" : "快速切换"}</button>
              </div>
            ))}
          </div>
        ) : null}

        {relatedResource === "channel" ? renderResourceList(channelItems) : null}

        {relatedResource === "schedule" ? (
          <div className="workspace-clone__task-detail-panel">
            {taskLoading ? <div className="workspace-resource-modal__empty">正在加载真实任务详情...</div> : null}
            {!taskLoading && !selectedTask ? <div className="workspace-resource-modal__empty">当前 Agent 暂无真实任务。</div> : null}
            {taskError.trim() ? <div className="workspace-clone__task-feedback-card is-error">{taskError}</div> : null}

            {selectedTask ? (
              <>
                <div className="workspace-clone__task-detail-card">
                  <div className="workspace-clone__task-detail-head">
                    <div>
                      <strong>{resolveWorkspaceTaskDisplayTitle(selectedTask)}</strong>
                      <small>{selectedTask.description?.trim() || formatWorkspaceCronPayloadPreview(selectedTask)}</small>
                    </div>
                    <span className={`workspace-clone__status-inline is-${getWorkspaceCronStatusTone(selectedTaskStatus)}`}>
                      {getWorkspaceCronStatusLabel(selectedTaskStatus)}
                    </span>
                  </div>

                  <div className="workspace-clone__task-detail-grid">
                    <div>
                      <span>调度</span>
                      <small>{formatWorkspaceCronScheduleSummary(selectedTask.schedule)}</small>
                    </div>
                    <div>
                      <span>会话目标</span>
                      <small>{formatWorkspaceCronSessionTarget(selectedTask.sessionTarget)}</small>
                    </div>
                    <div>
                      <span>唤醒模式</span>
                      <small>{selectedTask.wakeMode}</small>
                    </div>
                    <div>
                      <span>下次运行</span>
                      <small>{formatWorkspaceCronTimestamp(selectedTask.state.nextRunAtMs)}</small>
                    </div>
                    <div>
                      <span>最近运行</span>
                      <small>{formatWorkspaceCronTimestamp(selectedTask.state.lastRunAtMs)}</small>
                    </div>
                    <div>
                      <span>最近耗时</span>
                      <small>{selectedTask.state.lastDurationMs ? formatWorkspaceCronDuration(selectedTask.state.lastDurationMs) : "暂无"}</small>
                    </div>
                  </div>

                  <div className="workspace-clone__task-detail-payload">
                    <span>任务内容</span>
                    <pre>{formatWorkspaceCronPayloadPreview(selectedTask)}</pre>
                  </div>
                </div>

                {taskRunsError.trim() ? <div className="workspace-clone__task-feedback-card is-error">{taskRunsError}</div> : null}

                <div className="workspace-clone__task-runs workspace-clone__task-runs--detail">
                  <div className="workspace-clone__task-runs-head">
                    <strong>最近运行记录</strong>
                    {taskRunsLoading ? <small>同步中...</small> : null}
                  </div>
                  {selectedTaskRuns.length === 0 ? (
                    <div className="workspace-clone__task-run-empty">暂无运行记录</div>
                  ) : (
                    selectedTaskRuns.map((run) => (
                      <div key={`${run.jobId}-${run.ts}`} className="workspace-clone__task-run-row">
                        <div className="workspace-clone__task-run-copy">
                          <div className="workspace-clone__task-run-head">
                            <strong>{formatWorkspaceCronTimestamp(run.runAtMs ?? run.ts)}</strong>
                            <span className={`workspace-clone__status-inline is-${run.status === "error" ? "busy" : run.status === "skipped" ? "busy" : "online"}`}>
                              {run.status === "error" ? "异常" : run.status === "skipped" ? "已跳过" : "正常"}
                            </span>
                          </div>
                          <small>{run.summary?.trim() || run.error?.trim() || "本次运行未返回更多摘要"}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <ModalFooter>
        <button className="btn-secondary" type="button" onClick={onClose}>关闭</button>
      </ModalFooter>
    </Modal>
  );
}
