import { useCallback, useState } from "react";
import type { WorkspaceLiveStep, WorkspaceLiveStepStatus } from "../../components/workspace-clone/workspaceCloneTypes";
import { mergeWorkspaceStreamText } from "./stream-text-buffer";
import { formatClockTime } from "./time-formatters";

const LIVE_TRANSCRIPT_LIMIT = 80;
const COMMAND_GROUP_LABEL_BY_STATUS: Record<WorkspaceLiveStepStatus, string> = {
  pending: "等待运行",
  running: "正在运行",
  success: "已运行",
  error: "命令失败",
  aborted: "已中止",
};
const READ_GROUP_LABEL_BY_STATUS: Record<WorkspaceLiveStepStatus, string> = {
  pending: "等待读取",
  running: "正在读取",
  success: "已读取",
  error: "读取失败",
  aborted: "已中止读取",
};

export type WorkspaceLiveTranscriptItem =
  | {
      id: string;
      kind: "step";
      step: WorkspaceLiveStep;
    }
  | {
      id: string;
      kind: "assistant";
      text: string;
      time: string;
    };

function removeTransientThinkingItems(current: WorkspaceLiveTranscriptItem[]) {
  return current.filter((item) => (
    item.kind !== "step" ||
    item.step.kind !== "thinking" ||
    (item.step.status !== "running" && item.step.status !== "pending")
  ));
}

function isTransientThinkingStep(step: WorkspaceLiveStep) {
  return step.kind === "thinking" && (step.status === "running" || step.status === "pending");
}

function isAggregateStep(step: WorkspaceLiveStep) {
  return step.action === "command" || step.action === "read";
}

function getCommandGroupTitle(status: WorkspaceLiveStepStatus, count: number) {
  return `${COMMAND_GROUP_LABEL_BY_STATUS[status]} ${count} 条命令`;
}

function getReadGroupTitle(status: WorkspaceLiveStepStatus, count: number) {
  return `${READ_GROUP_LABEL_BY_STATUS[status]} ${count} 个文件`;
}

function getAggregateGroupTitle(action: WorkspaceLiveStep["action"], status: WorkspaceLiveStepStatus, count: number) {
  return action === "read" ? getReadGroupTitle(status, count) : getCommandGroupTitle(status, count);
}

function buildAggregateGroupStep(steps: WorkspaceLiveStep[]): WorkspaceLiveStep {
  const first = steps[0];
  const last = steps[steps.length - 1] ?? first;
  const action = first?.action === "read" ? "read" : "command";
  if (!first || steps.length <= 1) {
    return first ?? {
      id: "command-group:empty",
      kind: "command",
      action: "command",
      status: "success",
      title: getCommandGroupTitle("success", 0),
      time: "",
      aggregateCount: 0,
    };
  }

  return {
    ...last,
    id: `${action}-group:${first.status}:${steps.map((step) => step.id).join("|")}`,
    kind: action === "read" ? "tool" : "command",
    action,
    status: first.status,
    title: getAggregateGroupTitle(action, first.status, steps.length),
    detail: undefined,
    time: last.time,
    aggregateCount: steps.length,
  };
}

export function aggregateAdjacentCommandSteps(steps: WorkspaceLiveStep[]) {
  const next: WorkspaceLiveStep[] = [];
  let commandGroup: WorkspaceLiveStep[] = [];

  const flushCommandGroup = () => {
    if (commandGroup.length === 0) {
      return;
    }
    if (commandGroup.length === 1) {
      next.push(commandGroup[0]);
    } else {
      next.push(buildAggregateGroupStep(commandGroup));
    }
    commandGroup = [];
  };

  for (const step of steps) {
    const lastCommand = commandGroup[commandGroup.length - 1];
    if (
      isAggregateStep(step) &&
      (!lastCommand || (lastCommand.status === step.status && lastCommand.action === step.action))
    ) {
      commandGroup.push(step);
      continue;
    }

    flushCommandGroup();
    if (isAggregateStep(step)) {
      commandGroup.push(step);
    } else {
      next.push(step);
    }
  }

  flushCommandGroup();
  return next;
}

export function aggregateLiveTranscriptCommandItems(items: WorkspaceLiveTranscriptItem[]) {
  const next: WorkspaceLiveTranscriptItem[] = [];
  let commandGroup: WorkspaceLiveStep[] = [];

  const flushCommandGroup = () => {
    if (commandGroup.length === 0) {
      return;
    }
    if (commandGroup.length === 1) {
      const step = commandGroup[0];
      next.push({ id: `step:${step.id}`, kind: "step", step });
    } else {
      const step = buildAggregateGroupStep(commandGroup);
      next.push({ id: `step:${step.id}`, kind: "step", step });
    }
    commandGroup = [];
  };

  for (const item of items) {
    if (item.kind === "step" && isAggregateStep(item.step)) {
      const lastCommand = commandGroup[commandGroup.length - 1];
      if (!lastCommand || (lastCommand.status === item.step.status && lastCommand.action === item.step.action)) {
        commandGroup.push(item.step);
        continue;
      }
    }

    flushCommandGroup();
    next.push(item);
  }

  flushCommandGroup();
  return next;
}

export function buildThinkingTranscriptItem(runId: string): WorkspaceLiveTranscriptItem {
  const step: WorkspaceLiveStep = {
    id: `${runId}:thinking`,
    kind: "thinking",
    status: "running",
    title: "思考中",
    time: formatClockTime(Date.now()),
  };
  return { id: `step:${step.id}`, kind: "step", step };
}

export function updateLiveTranscriptWithStep(
  current: WorkspaceLiveTranscriptItem[],
  step: WorkspaceLiveStep,
): WorkspaceLiveTranscriptItem[] {
  const base = isTransientThinkingStep(step) || step.kind !== "thinking"
    ? removeTransientThinkingItems(current)
    : current;
  const index = base.findIndex((item) => item.kind === "step" && item.step.id === step.id);
  const next = [...base];
  if (index === -1) {
    next.push({ id: `step:${step.id}`, kind: "step", step });
  } else {
    const previous = next[index];
    next[index] = previous.kind === "step"
      ? { ...previous, step: { ...previous.step, ...step } }
      : { id: `step:${step.id}`, kind: "step", step };
  }
  return next.slice(-LIVE_TRANSCRIPT_LIMIT);
}

export function updateLiveTranscriptWithAssistantDelta(
  current: WorkspaceLiveTranscriptItem[],
  params: { runId: string; text: string; timestampMs: number },
): WorkspaceLiveTranscriptItem[] {
  const text = params.text.trim();
  if (!text) {
    return current;
  }

  const base = removeTransientThinkingItems(current);
  const last = base[base.length - 1];
  if (last?.kind === "assistant") {
    return [
      ...base.slice(0, -1),
      {
        ...last,
        text: mergeWorkspaceStreamText(last.text, text),
        time: formatClockTime(params.timestampMs),
      },
    ];
  }

  const item: WorkspaceLiveTranscriptItem = {
    id: `assistant:${params.runId}:${params.timestampMs}:${current.length}`,
    kind: "assistant",
    text,
    time: formatClockTime(params.timestampMs),
  };

  return [
    ...base,
    item,
  ].slice(-LIVE_TRANSCRIPT_LIMIT);
}

export function finishLiveTranscriptSteps(
  current: WorkspaceLiveTranscriptItem[],
  status: WorkspaceLiveStepStatus,
): WorkspaceLiveTranscriptItem[] {
  return current.map((item) => (
    item.kind === "step" && (item.step.status === "running" || item.step.status === "pending")
      ? { ...item, step: { ...item.step, status } }
      : item
  ));
}

export function replaceLiveTranscriptThinkingWithFailure(
  current: WorkspaceLiveTranscriptItem[],
  failureStep: WorkspaceLiveStep,
): WorkspaceLiveTranscriptItem[] {
  const index = current.findIndex((item) => item.kind === "step" && item.step.kind === "thinking");
  const failureItem: WorkspaceLiveTranscriptItem = { id: `step:${failureStep.id}`, kind: "step", step: failureStep };
  if (index === -1) {
    return [...current, failureItem].slice(-LIVE_TRANSCRIPT_LIMIT);
  }
  const next = [...current];
  next[index] = failureItem;
  return next;
}

export function useWorkspaceLiveTranscript() {
  const [liveTranscriptItems, setLiveTranscriptItems] = useState<WorkspaceLiveTranscriptItem[]>([]);

  const clearLiveTranscript = useCallback(() => {
    setLiveTranscriptItems([]);
  }, []);

  const initializeLiveTranscript = useCallback((runId: string) => {
    setLiveTranscriptItems([buildThinkingTranscriptItem(runId)]);
  }, []);

  const appendLiveTranscriptStep = useCallback((step: WorkspaceLiveStep) => {
    setLiveTranscriptItems((current) => updateLiveTranscriptWithStep(current, step));
  }, []);

  const appendLiveTranscriptAssistantDelta = useCallback((params: {
    runId: string;
    text: string;
    timestampMs: number;
  }) => {
    setLiveTranscriptItems((current) => updateLiveTranscriptWithAssistantDelta(current, params));
  }, []);

  const finishLiveTranscript = useCallback((status: WorkspaceLiveStepStatus) => {
    setLiveTranscriptItems((current) => finishLiveTranscriptSteps(current, status));
  }, []);

  const replaceThinkingTranscriptWithFailure = useCallback((failureStep: WorkspaceLiveStep) => {
    setLiveTranscriptItems((current) => replaceLiveTranscriptThinkingWithFailure(current, failureStep));
  }, []);

  return {
    liveTranscriptItems,
    clearLiveTranscript,
    initializeLiveTranscript,
    appendLiveTranscriptStep,
    appendLiveTranscriptAssistantDelta,
    finishLiveTranscript,
    replaceThinkingTranscriptWithFailure,
  };
}
