import type { WorkspaceCronJob } from "./workspaceCloneTypes";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";

export interface WorkspaceManualTaskExecutionContent {
  displayTitle: string;
  displayMessage: string;
  transportMessage: string;
}

const WORKSPACE_HIDDEN_MANUAL_TASK_GUARDRAIL_TAG = "dragonclaw-manual-task-guardrail";
const MANUAL_TASK_TIME_PATTERNS = [
  /(?:^|[\s([{【])(?:每日|每天)\s*[：:]?\s*\d{1,2}:\d{2}(?=$|[\s)\]}】,，。:：;；-])/gu,
  /(?:^|[\s([{【])每周[一二三四五六日天]?\s*[：:]?\s*\d{1,2}:\d{2}(?=$|[\s)\]}】,，。:：;；-])/gu,
  /(?:^|[\s([{【])每月\s*\d{1,2}\s*日?\s*[：:]?\s*\d{1,2}:\d{2}(?=$|[\s)\]}】,，。:：;；-])/gu,
  /(?:^|[\s([{【])Cron\s*[：:]?\s*[^)\]}】\n]+/giu,
  /(?:请|请于|请在|在)\s*(?:今天|明天|后天)?\s*(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日)?\s*\d{1,2}:\d{2}\s*(?:执行|运行|获取|抓取)?/gu,
];

function getWorkspaceManualTaskRawBody(task: WorkspaceCronJob) {
  return (task.payload.kind === "agentTurn" ? task.payload.message : task.payload.text).trim();
}

function trimWorkspaceManualTaskPunctuation(value: string) {
  return value
    .replace(/^[\s,，。:：;；\-\u2013\u2014|/【】[\]()（）]+/gu, "")
    .replace(/[\s,，。:：;；\-\u2013\u2014|/【】[\]()（）]+$/gu, "")
    .trim();
}

function stripWorkspaceManualTaskTimeHints(value: string) {
  let next = value;
  for (const pattern of MANUAL_TASK_TIME_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  return trimWorkspaceManualTaskPunctuation(next.replace(/\s{2,}/g, " "));
}

function normalizeWorkspaceManualTaskComparableText(value: string) {
  return trimWorkspaceManualTaskPunctuation(stripWorkspaceManualTaskTimeHints(value))
    .replace(/\s+/g, "")
    .replace(/[【】[\]()（）"'`]/gu, "")
    .toLowerCase();
}

function dropWorkspaceManualTaskDuplicateLeadingLine(body: string, titles: string[]) {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim());

  while (lines.length > 0) {
    const firstLine = lines[0];
    if (!firstLine) {
      lines.shift();
      continue;
    }

    const comparableFirstLine = normalizeWorkspaceManualTaskComparableText(firstLine);
    const matchesTitle = comparableFirstLine && titles.some((title) => comparableFirstLine === normalizeWorkspaceManualTaskComparableText(title));
    if (!matchesTitle) {
      break;
    }
    lines.shift();
  }

  return lines.join("\n").trim();
}

function cleanWorkspaceManualTaskBody(body: string) {
  const cleanedLines = body
    .split(/\r?\n/)
    .map((line) => stripWorkspaceManualTaskTimeHints(line))
    .filter(Boolean);

  return cleanedLines.join("\n").trim();
}

function buildWorkspaceManualTaskGuardrail() {
  return [
    `<${WORKSPACE_HIDDEN_MANUAL_TASK_GUARDRAIL_TAG}>`,
    "这是一个“已有任务”的手动执行请求，不是创建、编辑、复制、删除任务的请求。",
    "",
    "请直接执行下面的任务正文，并遵守这些规则：",
    "1. 不要把这次手动执行理解为“需要新建一个定时任务、提醒、cron 任务或任务记录”。",
    "2. 不要创建、复制、更新、删除任何任务配置、调度记录、提醒事项或自动化规则。",
    "3. 不要恢复、重复强调或改写原任务的预定执行时间；这次请求表示“现在立刻执行”。",
    "4. 仅完成任务正文要求的实际工作，并给出执行结果。",
    "5. 只有当用户在当前会话里再次明确要求你“创建/修改/删除任务或提醒”时，才可以进入任务管理语义。",
    "",
    "下面紧跟在这个隐藏规则块之后的正文，才是本次需要立即执行的任务内容。",
    `</${WORKSPACE_HIDDEN_MANUAL_TASK_GUARDRAIL_TAG}>`,
  ].join("\n");
}

export function stripWorkspaceHiddenPromptBlocks(value: string) {
  return value
    .replace(new RegExp(`<${WORKSPACE_HIDDEN_MANUAL_TASK_GUARDRAIL_TAG}>[\\s\\S]*?<\\/${WORKSPACE_HIDDEN_MANUAL_TASK_GUARDRAIL_TAG}>`, "gu"), "")
    .trim();
}

export function buildWorkspaceManualTaskExecutionContent(task: WorkspaceCronJob): WorkspaceManualTaskExecutionContent {
  const rawTitle = resolveWorkspaceTaskDisplayTitle(task).trim();
  const rawBody = getWorkspaceManualTaskRawBody(task);
  const cleanedTitle = stripWorkspaceManualTaskTimeHints(rawTitle);
  const bodyWithoutDuplicateTitle = dropWorkspaceManualTaskDuplicateLeadingLine(rawBody, [rawTitle, cleanedTitle].filter(Boolean));
  const cleanedBody = cleanWorkspaceManualTaskBody(bodyWithoutDuplicateTitle);
  const displayMessage = cleanedBody || cleanWorkspaceManualTaskBody(rawBody) || rawBody;
  const fallbackTitle = displayMessage
    .split(/\r?\n/)
    .map((line) => trimWorkspaceManualTaskPunctuation(line))
    .find(Boolean) || rawTitle || task.id;
  const displayTitle = cleanedTitle || stripWorkspaceManualTaskTimeHints(fallbackTitle) || fallbackTitle;

  return {
    displayTitle,
    displayMessage,
    transportMessage: `${buildWorkspaceManualTaskGuardrail()}\n\n${displayMessage}`.trim(),
  };
}
