import type { WorkspaceMessage } from "./workspaceCloneTypes";

const RAW_COMMAND_LINE_RE =
  /^\s*(?:[-*]\s*)?(?:`{1,3})?(?:curl|pwsh|powershell|bash|sh|cmd(?:\.exe)?|python|node|npm|pnpm|npx|git|uv)\b/i;
const RAW_ERROR_METADATA_LINE_RE =
  /^\s*(?:\+\s*)?(?:CategoryInfo|FullyQualifiedErrorId|At line:\d+ char:\d+|MissingMandatoryParameter|ParameterBindingException)\b/i;
const RAW_EXECUTION_HEADER_LINE_RE =
  /^\s*(?:Invoke-WebRequest|Microsoft\.PowerShell\.Commands\.InvokeWebRequestCommand)\b.*:/i;
const RAW_EXIT_CODE_LINE_RE = /^\s*\(Command exited with code \d+\)\s*$/i;
const RAW_JSON_EXEC_SIGNAL_RE =
  /"tool"\s*:\s*"exec"|"status"\s*:\s*"error"|exec host=sandbox|Microsoft\.PowerShell\.Commands\.InvokeWebRequestCommand/i;
const EXTERNAL_CONTENT_RE =
  /EXTERNAL_UNTRUSTED_CONTENT|SECURITY NOTICE: The following content is from an EXTERNAL, UNTRUSTED source/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractFencedCodeBlock(text: string) {
  const match = text.trim().match(/^```(?:json|txt|text)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() || "";
}

function getJsonCandidate(text: string) {
  const trimmed = text.trim();
  if (/^[\[{]/.test(trimmed)) {
    return trimmed;
  }

  const fenced = extractFencedCodeBlock(trimmed);
  if (/^[\[{]/.test(fenced)) {
    return fenced;
  }

  return "";
}

function looksLikeHiddenProcessPayloadJson(text: string) {
  const jsonCandidate = getJsonCandidate(text);
  const parsed = jsonCandidate ? tryParseJsonRecord(jsonCandidate) : null;
  if (!parsed) {
    return false;
  }

  const keys = new Set(Object.keys(parsed));
  const hasExternalContent = keys.has("externalContent");
  const hasFetchShape =
    keys.has("url") &&
    keys.has("status") &&
    (keys.has("contentType") || keys.has("extractMode") || keys.has("extractor"));
  const hasSearchShape =
    keys.has("provider") &&
    keys.has("results") &&
    (keys.has("toolMs") || keys.has("count"));
  const hasExecShape =
    (keys.has("tool") || keys.has("command") || keys.has("stderr") || keys.has("stdout") || keys.has("exitCode")) &&
    (keys.has("status") || keys.has("error") || keys.has("cwd"));
  const parsedText = typeof parsed.text === "string" ? parsed.text : "";
  const parsedTitle = typeof parsed.title === "string" ? parsed.title : "";
  const parsedTool = typeof parsed.tool === "string" ? parsed.tool : "";

  if (
    hasExternalContent ||
    hasFetchShape ||
    hasSearchShape ||
    (hasExecShape && /exec|shell|terminal|command/i.test(parsedTool || jsonCandidate)) ||
    EXTERNAL_CONTENT_RE.test(parsedText) ||
    /EXTERNAL_UNTRUSTED_CONTENT/i.test(parsedTitle)
  ) {
    return true;
  }

  const processSignals = [
    "results",
    "externalContent",
    "toolMs",
    "provider",
    "siteName",
    "snippet",
    "toolCallId",
    "itemId",
    "approvalId",
    "cwd",
    "stdout",
    "stderr",
    "exitCode",
    "tool",
    "command",
    "error",
    "status",
  ];
  const userFacingSignals = ["answer", "reply", "final", "summary", "markdown", "content"];
  const processSignalCount = processSignals.filter((key) => keys.has(key)).length;
  const hasUserFacingSignal = userFacingSignals.some((key) => keys.has(key));

  return processSignalCount >= 3 && !hasUserFacingSignal;
}

function isTranscriptLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "```" || /^```(?:json|txt|text)?$/i.test(trimmed)) {
    return true;
  }

  if (RAW_COMMAND_LINE_RE.test(trimmed)) {
    return true;
  }

  if (RAW_ERROR_METADATA_LINE_RE.test(trimmed)) {
    return true;
  }

  if (RAW_EXECUTION_HEADER_LINE_RE.test(trimmed)) {
    return true;
  }

  if (RAW_EXIT_CODE_LINE_RE.test(trimmed)) {
    return true;
  }

  if (/^\s*[{}[\],]+\s*$/.test(trimmed) || RAW_JSON_EXEC_SIGNAL_RE.test(trimmed)) {
    return true;
  }

  if (/^\s*"[^"]+"\s*:\s*/.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeRawExecutionTranscript(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length < 2) {
    return false;
  }

  const transcriptLineCount = nonEmptyLines.filter(isTranscriptLine).length;
  const userFacingLineCount = nonEmptyLines.filter(
    (line) => !isTranscriptLine(line) && /[\u4E00-\u9FFFA-Za-z]/.test(line),
  ).length;
  const hasExecutionSignal =
    nonEmptyLines.some((line) => RAW_ERROR_METADATA_LINE_RE.test(line)) ||
    nonEmptyLines.some((line) => RAW_EXECUTION_HEADER_LINE_RE.test(line)) ||
    nonEmptyLines.some((line) => RAW_EXIT_CODE_LINE_RE.test(line)) ||
    nonEmptyLines.some((line) => RAW_COMMAND_LINE_RE.test(line)) ||
    RAW_JSON_EXEC_SIGNAL_RE.test(trimmed);

  if (!hasExecutionSignal || userFacingLineCount > 0) {
    return false;
  }

  return transcriptLineCount >= 3 && transcriptLineCount / nonEmptyLines.length >= 0.6;
}

export function isWorkspaceRawProcessEcho(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return (
    EXTERNAL_CONTENT_RE.test(trimmed) ||
    looksLikeHiddenProcessPayloadJson(trimmed) ||
    looksLikeRawExecutionTranscript(trimmed)
  );
}

export function shouldHideWorkspaceMessage(message: WorkspaceMessage) {
  if (message.role === "tool") {
    return true;
  }

  return message.role === "assistant" && isWorkspaceRawProcessEcho(message.text);
}
