import { memo } from "react";

import { WorkspaceCloneIcon, type WorkspaceCloneIconName } from "./workspaceCloneIcons";
import type { WorkspaceLiveStep, WorkspaceLiveStepKind, WorkspaceLiveStepStatus } from "./workspaceCloneTypes";

interface WorkspaceCloneLiveTimelineProps {
  steps: WorkspaceLiveStep[];
}

const STEP_ICON_BY_KIND: Record<WorkspaceLiveStepKind, WorkspaceCloneIconName> = {
  thinking: "sparkles",
  skill: "wand",
  tool: "settings",
  command: "terminal",
  search: "search",
  patch: "edit",
  plan: "notebook",
  approval: "info",
  other: "cpu",
};

const STEP_LABEL_BY_KIND: Record<WorkspaceLiveStepKind, string> = {
  thinking: "思考中",
  skill: "调用技能",
  tool: "调用工具",
  command: "执行命令",
  search: "搜索",
  patch: "编辑文件",
  plan: "更新计划",
  approval: "等待确认",
  other: "执行步骤",
};

const STATUS_LABEL_BY_STATUS: Record<WorkspaceLiveStepStatus, string> = {
  pending: "等待中",
  running: "进行中",
  success: "已完成",
  error: "失败",
  aborted: "已中止",
};

export const WorkspaceCloneLiveTimeline = memo(function WorkspaceCloneLiveTimeline({
  steps,
}: WorkspaceCloneLiveTimelineProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section className="workspace-clone__live-timeline" aria-label="Agent live process">
      {steps.map((step) => {
        const kindLabel = STEP_LABEL_BY_KIND[step.kind];
        const title = step.kind === "thinking" ? kindLabel : step.title;
        const showKindLabel = step.kind !== "thinking" && kindLabel !== title;
        const showDetail = step.kind !== "thinking" && step.detail && step.detail !== title;
        const showStatusText = step.status !== "running";

        return (
          <article
            key={step.id}
            className={[
              "workspace-clone__live-step",
              `is-${step.kind}`,
              `is-${step.status}`,
            ].join(" ")}
          >
            <span className="workspace-clone__live-step-icon" aria-hidden="true">
              <WorkspaceCloneIcon name={STEP_ICON_BY_KIND[step.kind]} size={12} strokeWidth={2} />
            </span>
            <span className="workspace-clone__live-step-copy">
              <span className="workspace-clone__live-step-title">
                {showKindLabel ? <span className="workspace-clone__live-step-kind">{kindLabel}</span> : null}
                <strong>{title}</strong>
              </span>
              {showDetail ? <small>{step.detail}</small> : null}
            </span>
            <span className="workspace-clone__live-step-meta">
              {showStatusText ? (
                <span className="workspace-clone__live-step-status">{STATUS_LABEL_BY_STATUS[step.status]}</span>
              ) : (
                <span className="workspace-clone__live-step-pulse" aria-label={STATUS_LABEL_BY_STATUS[step.status]} />
              )}
              {step.time && showStatusText ? <span>{step.time}</span> : null}
            </span>
          </article>
        );
      })}
    </section>
  );
});
