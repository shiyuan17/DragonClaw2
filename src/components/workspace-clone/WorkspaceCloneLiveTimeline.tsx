import { memo } from "react";

import { WorkspaceCloneIcon, type WorkspaceCloneIconName } from "./workspaceCloneIcons";
import type { WorkspaceLiveStep, WorkspaceLiveStepAction, WorkspaceLiveStepKind, WorkspaceLiveStepStatus } from "./workspaceCloneTypes";
import { aggregateAdjacentCommandSteps } from "../../hooks/workspace-gateway/live-transcript";

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

const STEP_ICON_BY_ACTION: Record<WorkspaceLiveStepAction, WorkspaceCloneIconName> = {
  read: "book-open",
  create: "plus",
  edit: "edit",
  delete: "trash",
  search: "search",
  command: "terminal",
  skill: "wand",
  plan: "notebook",
  approval: "info",
  "generic-tool": "settings",
};

const STEP_LABEL_BY_KIND: Record<WorkspaceLiveStepKind, string> = {
  thinking: "思考中",
  skill: "调用技能",
  tool: "调用工具",
  command: "运行命令",
  search: "搜索",
  patch: "编辑文件",
  plan: "更新计划",
  approval: "等待确认",
  other: "执行步骤",
};

const ACTION_LABEL_BY_STATUS: Record<WorkspaceLiveStepAction, Record<WorkspaceLiveStepStatus, string>> = {
  read: {
    pending: "等待读取",
    running: "正在读取",
    success: "已读取",
    error: "读取失败",
    aborted: "已中止读取",
  },
  create: {
    pending: "等待创建",
    running: "正在创建",
    success: "已创建",
    error: "创建失败",
    aborted: "已中止创建",
  },
  edit: {
    pending: "等待编辑",
    running: "正在编辑",
    success: "已编辑",
    error: "编辑失败",
    aborted: "已中止编辑",
  },
  delete: {
    pending: "等待删除",
    running: "正在删除",
    success: "已删除",
    error: "删除失败",
    aborted: "已中止删除",
  },
  search: {
    pending: "等待搜索",
    running: "正在搜索",
    success: "已搜索",
    error: "搜索失败",
    aborted: "已中止搜索",
  },
  command: {
    pending: "等待运行命令",
    running: "正在运行命令",
    success: "已运行命令",
    error: "命令失败",
    aborted: "已中止命令",
  },
  skill: {
    pending: "等待技能",
    running: "正在调用技能",
    success: "已调用技能",
    error: "技能失败",
    aborted: "已中止技能",
  },
  plan: {
    pending: "等待更新计划",
    running: "正在更新计划",
    success: "已更新计划",
    error: "计划失败",
    aborted: "已中止计划",
  },
  approval: {
    pending: "等待确认",
    running: "等待确认",
    success: "已确认",
    error: "确认失败",
    aborted: "已取消确认",
  },
  "generic-tool": {
    pending: "等待调用工具",
    running: "正在调用工具",
    success: "已调用工具",
    error: "工具失败",
    aborted: "已中止工具",
  },
};

const STATUS_LABEL_BY_STATUS: Record<WorkspaceLiveStepStatus, string> = {
  pending: "等待中",
  running: "进行中",
  success: "已完成",
  error: "失败",
  aborted: "已中止",
};

function resolveStepLabel(step: WorkspaceLiveStep) {
  if (step.aggregateCount && (step.action === "command" || step.action === "read")) {
    return step.title;
  }
  if (step.action) {
    return ACTION_LABEL_BY_STATUS[step.action][step.status];
  }
  if (step.kind === "thinking") {
    return STEP_LABEL_BY_KIND.thinking;
  }
  return STEP_LABEL_BY_KIND[step.kind];
}

function resolveStepIcon(step: WorkspaceLiveStep) {
  return step.action ? STEP_ICON_BY_ACTION[step.action] : STEP_ICON_BY_KIND[step.kind];
}

export const WorkspaceCloneLiveTimeline = memo(function WorkspaceCloneLiveTimeline({
  steps,
}: WorkspaceCloneLiveTimelineProps) {
  if (steps.length === 0) {
    return null;
  }

  const displaySteps = aggregateAdjacentCommandSteps(steps);

  return (
    <section className="workspace-clone__live-timeline" aria-label="Agent live process">
      {displaySteps.map((step) => {
        const stepLabel = resolveStepLabel(step);
        const title = step.kind === "thinking" ? stepLabel : step.title;
        const showKindLabel = step.kind !== "thinking" && stepLabel !== title;
        const showDetail = step.kind !== "thinking" && step.detail && step.detail !== title;
        const showStatusText = step.status !== "running";

        return (
          <article
            key={step.id}
            className={[
              "workspace-clone__live-step",
              `is-${step.kind}`,
              step.action ? `is-${step.action}` : "",
              `is-${step.status}`,
            ].join(" ").trim()}
          >
            <span className="workspace-clone__live-step-icon" aria-hidden="true">
              <WorkspaceCloneIcon name={resolveStepIcon(step)} size={12} strokeWidth={2} />
            </span>
            <span className="workspace-clone__live-step-copy">
              <span className="workspace-clone__live-step-title">
                {showKindLabel ? <span className="workspace-clone__live-step-kind">{stepLabel}</span> : null}
                <strong>{title}</strong>
                {showDetail ? <span className="workspace-clone__live-step-detail">{step.detail}</span> : null}
              </span>
            </span>
            <span className="workspace-clone__live-step-meta">
              {showStatusText ? (
                <span className="workspace-clone__live-step-status">{STATUS_LABEL_BY_STATUS[step.status]}</span>
              ) : (
                <span className="workspace-clone__live-step-pulse" aria-label={stepLabel} />
              )}
              {step.time && showStatusText ? <span>{step.time}</span> : null}
            </span>
          </article>
        );
      })}
    </section>
  );
});
