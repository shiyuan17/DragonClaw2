import type { WorkspaceLiveStep } from "./workspaceCloneTypes";
import {
  aggregateLiveTranscriptCommandItems,
  type WorkspaceLiveTranscriptItem,
} from "../../hooks/workspace-gateway/live-transcript";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WorkspaceCloneMessagePreview } from "./WorkspaceCloneMessagePreview";

const RUN_TRANSCRIPT_LABEL_BY_ACTION: Record<string, string> = {
  read: "已读取",
  create: "已创建",
  edit: "已编辑",
  delete: "已删除",
  search: "已搜索",
  command: "已运行命令",
  skill: "已调用技能",
  plan: "已更新计划",
  approval: "已确认",
  "generic-tool": "已调用工具",
};

const RUN_TRANSCRIPT_LABEL_BY_KIND: Record<string, string> = {
  thinking: "思考中",
  skill: "已调用技能",
  tool: "已调用工具",
  command: "已运行命令",
  search: "已搜索",
  patch: "已编辑",
  plan: "已更新计划",
  approval: "已确认",
  other: "已执行",
};

function getRunTranscriptStepLabel(step: WorkspaceLiveStep) {
  if (step.aggregateCount && (step.action === "command" || step.action === "read")) {
    return step.title;
  }
  if (step.kind === "thinking" && (step.status === "running" || step.status === "pending")) {
    return step.title || RUN_TRANSCRIPT_LABEL_BY_KIND.thinking;
  }
  if (step.status === "running" || step.status === "pending") {
    if (step.action === "command") return "正在运行命令";
    if (step.action === "search") return "正在搜索";
    if (step.action === "read") return "正在读取";
    if (step.kind === "thinking") return "思考中";
  }
  if (step.status === "error") return "执行失败";
  if (step.status === "aborted") return "已中止";
  return (step.action && RUN_TRANSCRIPT_LABEL_BY_ACTION[step.action]) || RUN_TRANSCRIPT_LABEL_BY_KIND[step.kind] || "已执行";
}

function getRunTranscriptStepIcon(step: WorkspaceLiveStep) {
  if (step.action === "search" || step.kind === "search") return "search";
  if (step.action === "edit" || step.kind === "patch") return "edit";
  if (step.action === "read") return "book-open";
  if (step.kind === "thinking") return "sparkles";
  return "terminal";
}

interface WorkspaceCloneRunTranscriptProps {
  assistantAuthor: string;
  items: WorkspaceLiveTranscriptItem[];
}

export function WorkspaceCloneRunTranscript({ assistantAuthor, items }: WorkspaceCloneRunTranscriptProps) {
  if (items.length === 0) {
    return null;
  }

  const displayItems = aggregateLiveTranscriptCommandItems(items);

  return (
    <div className="workspace-clone__run-transcript" aria-label="Agent run transcript">
      {displayItems.map((item) => {
        if (item.kind === "assistant") {
          return (
            <div key={item.id} className="workspace-clone__run-transcript-assistant">
              <WorkspaceCloneMessagePreview
                message={{
                  id: item.id,
                  role: "assistant",
                  author: assistantAuthor,
                  text: item.text,
                  time: item.time,
                }}
              />
            </div>
          );
        }

        const step = item.step;
        const stepLabel = getRunTranscriptStepLabel(step);
        const showTitle = step.title && step.title !== stepLabel;
        const showDetail = step.detail && step.detail !== step.title;

        return (
          <div key={item.id} className={["workspace-clone__run-transcript-step", `is-${step.status}`].join(" ")}>
            <span className="workspace-clone__run-transcript-step-icon" aria-hidden="true">
              <WorkspaceCloneIcon name={getRunTranscriptStepIcon(step)} size={12} strokeWidth={2} />
            </span>
            <span className="workspace-clone__run-transcript-step-copy">
              <span className="workspace-clone__run-transcript-step-label">{stepLabel}</span>
              {showTitle ? <strong>{step.title}</strong> : null}
              {showDetail ? <small>{step.detail}</small> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
