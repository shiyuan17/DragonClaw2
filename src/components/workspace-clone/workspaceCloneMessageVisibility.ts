import type { WorkspaceMessage } from "./workspaceCloneTypes";
import {
  looksLikeWorkspaceInternalPromptFileDump,
  looksLikeWorkspaceShellErrorTranscript,
} from "./workspaceCloneMessageNoisePatterns";
import { isWorkspaceComposerTransportMessage, stripWorkspaceComposerTransportBlocks } from "./workspaceCloneSlashCommands";

const RAW_COMMAND_LINE_RE =
  /^\s*(?:[-*+]\s*)?(?:`{1,3})?(?:rg|curl|pwsh|powershell|bash|sh|cmd(?:\.exe)?|python|node|npm|pnpm|npx|git|uv)\b/i;
const RAW_ERROR_METADATA_LINE_RE =
  /^\s*(?:\+\s*)?(?:CategoryInfo|FullyQualifiedErrorId|At line:\d+ char:\d+|所在位置\s+行:\d+\s+字符:\d+|MissingMandatoryParameter|ParameterBindingException)\b/i;
const RAW_EXECUTION_HEADER_LINE_RE =
  /^\s*(?:Invoke-WebRequest|Microsoft\.PowerShell\.Commands\.InvokeWebRequestCommand)\b.*:/i;
const RAW_EXIT_CODE_LINE_RE = /^\s*\(Command exited with code \d+\)\s*$/i;
const RAW_JSON_EXEC_SIGNAL_RE =
  /"tool"\s*:\s*"exec"|"status"\s*:\s*"error"|exec host=sandbox|Microsoft\.PowerShell\.Commands\.InvokeWebRequestCommand/i;
const EXTERNAL_CONTENT_RE =
  /EXTERNAL_UNTRUSTED_CONTENT|SECURITY NOTICE: The following content is from an EXTERNAL, UNTRUSTED source/i;
const COMMAND_STILL_RUNNING_RE =
  /^\s*Command still running \(session [^)]+\)\.\s*Use process \(list\/poll\/log\/write\/kill\/clear\/remove\) for follow-up\.?\s*$/i;
const NO_OUTPUT_RE = /^\s*\((?:no output|no output recorded)\)\s*$/i;
const NO_OUTPUT_PROCESS_EXIT_RE =
  /^\s*(?:\((?:no output|no output recorded)\)\s*)?Process exited with (?:signal [A-Z0-9_.-]+|code -?\d+)\.?\s*$/i;
const VIEW_IN_BROWSER_LINE_RE = /^\s*View in browser\b/i;
const RAW_HTML_LINE_RE = /^\s*<(?:!doctype|html|head|body|div|span|p|h[1-6]|table|tr|td|style|script)\b/i;
const RAW_PROCESS_TAIL_SIGNAL_RE =
  /"attachments"\s*:|"externalContent"\s*:|"toolCallId"\s*:|"stdout"\s*:|"stderr"\s*:|"exitCode"\s*:|"snippet"\s*:|"results"\s*:|"subject"\s*:|"from"\s*:|"html"\s*:|<div\b|<html\b/i;

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

function looksLikeHiddenProcessPayloadRecord(parsed: Record<string, unknown>) {
  const keys = new Set(Object.keys(parsed));
  const type = typeof parsed.type === "string" ? parsed.type.trim().toLowerCase() : "";
  const parsedText = typeof parsed.text === "string" ? parsed.text : "";
  const parsedTitle = typeof parsed.title === "string" ? parsed.title : "";
  const parsedTool = typeof parsed.tool === "string" ? parsed.tool : "";
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

  if (
    hasExternalContent ||
    hasFetchShape ||
    hasSearchShape ||
    (hasExecShape && /exec|shell|terminal|command/i.test(parsedTool || JSON.stringify(parsed))) ||
    EXTERNAL_CONTENT_RE.test(parsedText) ||
    /EXTERNAL_UNTRUSTED_CONTENT/i.test(parsedTitle)
  ) {
    return true;
  }

  if (["tool", "tool_result", "tool-call", "tool_call", "command_output"].includes(type)) {
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

function looksLikeHiddenProcessPayloadJson(text: string) {
  const jsonCandidate = getJsonCandidate(text);
  const parsed = jsonCandidate ? tryParseJsonRecord(jsonCandidate) : null;
  if (!parsed) {
    return false;
  }

  return looksLikeHiddenProcessPayloadRecord(parsed);
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

function looksLikeStandaloneProcessStatus(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return COMMAND_STILL_RUNNING_RE.test(normalized) || NO_OUTPUT_RE.test(normalized) || NO_OUTPUT_PROCESS_EXIT_RE.test(normalized);
}

function looksLikeDirectoryOrFileListing(text: string) {
  const normalized = text.trim();
  if (!normalized || normalized.length > 3000) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) {
    return false;
  }

  const windowsPathCount = tokens.filter((token) => /^[A-Za-z]:\\/.test(token)).length;
  const fileLikeCount = tokens.filter((token) => (
    /^\.?[A-Za-z0-9_.-]+\.(?:md|tsx?|jsx?|json|png|jpe?g|gif|toml|ya?ml|rs|css|html|log|lock|ico|icns)$/i.test(token) ||
    /^[A-Za-z0-9_.-]+\/?$/.test(token) && /^(?:src|docs|node_modules|dist|public|scripts|target|\.git|\.github|\.vscode|src-tauri)$/i.test(token.replace(/\/$/, ""))
  )).length;
  const sentenceSignal = /[。！？；，]|(?:\b(?:the|and|with|for|this|that|because|please|should)\b)/i.test(normalized);

  return windowsPathCount >= 3 || (fileLikeCount >= 8 && fileLikeCount / tokens.length >= 0.65 && !sentenceSignal);
}

function isMeaningfulUserFacingPrefix(text: string) {
  const normalized = text.trim();
  return Boolean(normalized) && /[\u4E00-\u9FFFA-Za-z0-9]/.test(normalized) && !isWorkspaceRawProcessEcho(normalized);
}

function looksLikeMixedProcessTail(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (isWorkspaceRawProcessEcho(trimmed)) {
    return true;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = nonEmptyLines[0] ?? "";

  if (COMMAND_STILL_RUNNING_RE.test(trimmed) || COMMAND_STILL_RUNNING_RE.test(firstLine)) {
    return true;
  }

  if (
    VIEW_IN_BROWSER_LINE_RE.test(firstLine) &&
    (RAW_PROCESS_TAIL_SIGNAL_RE.test(trimmed) || /\n\s*[\[{]/.test(trimmed) || nonEmptyLines.some((line) => RAW_HTML_LINE_RE.test(line)))
  ) {
    return true;
  }

  if (NO_OUTPUT_RE.test(firstLine) || NO_OUTPUT_PROCESS_EXIT_RE.test(firstLine) || looksLikeDirectoryOrFileListing(trimmed)) {
    return true;
  }

  if (nonEmptyLines.some((line) => RAW_HTML_LINE_RE.test(line)) && RAW_PROCESS_TAIL_SIGNAL_RE.test(trimmed)) {
    return true;
  }

  return false;
}

function trimMixedProcessTail(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const lineStartOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStartOffsets.push(offset);
    offset += line.length + 1;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const suffix = lines.slice(index).join("\n").trim();
    const prefix = lines.slice(0, index).join("\n").trimEnd();
    if (!isMeaningfulUserFacingPrefix(prefix)) {
      continue;
    }

    if (looksLikeMixedProcessTail(suffix)) {
      return prefix.trim();
    }
  }

  const candidates = [
    trimmed.search(/\n\s*Command still running \(session [^)]+\)\./i),
    trimmed.search(/\n\s*\((?:no output|no output recorded)\)/i),
    trimmed.search(/\n\s*Process exited with (?:signal|code)/i),
    trimmed.search(/\n\s*(?:[A-Za-z]:\\[^\n]+(?:\s+[A-Za-z]:\\[^\n]+){2,})/i),
    trimmed.search(/\n\s*View in browser\b/i),
    trimmed.search(/\n\s*EXTERNAL_UNTRUSTED_CONTENT/i),
  ].filter((value) => value >= 0);
  const rawTailStart = candidates.length > 0 ? Math.min(...candidates) : -1;
  if (rawTailStart >= 0) {
    const prefix = trimmed.slice(0, rawTailStart).trimEnd();
    const suffix = trimmed.slice(rawTailStart).trim();
    if (isMeaningfulUserFacingPrefix(prefix) && looksLikeMixedProcessTail(suffix)) {
      return prefix.trim();
    }
  }

  const htmlTailMatch = trimmed.match(/\n\s*<(?:!doctype|html|head|body|div|span|p|h[1-6]|table|tr|td|style|script)\b/i);
  if (htmlTailMatch?.index !== undefined) {
    const prefix = trimmed.slice(0, htmlTailMatch.index).trimEnd();
    const suffix = trimmed.slice(htmlTailMatch.index).trim();
    if (isMeaningfulUserFacingPrefix(prefix) && looksLikeMixedProcessTail(suffix)) {
      return prefix.trim();
    }
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line || !/^[\[{]/.test(line)) {
      continue;
    }

    const suffixStart = lineStartOffsets[index] ?? -1;
    if (suffixStart < 0) {
      continue;
    }

    const prefix = trimmed.slice(0, suffixStart).trimEnd();
    const suffix = trimmed.slice(suffixStart).trim();
    if (!isMeaningfulUserFacingPrefix(prefix)) {
      continue;
    }

    if (looksLikeHiddenProcessPayloadJson(suffix)) {
      return prefix.trim();
    }
  }

  return trimmed;
}

function extractTextFromContentBlock(block: unknown): string {
  if (typeof block === "string") {
    return block;
  }

  if (!isRecord(block)) {
    return "";
  }

  if (looksLikeHiddenProcessPayloadRecord(block)) {
    return "";
  }

  const candidates = [block.text, block.content, block.input, block.output];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return "";
}

export function isWorkspaceRawProcessEcho(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return (
    looksLikeStandaloneProcessStatus(trimmed) ||
    EXTERNAL_CONTENT_RE.test(trimmed) ||
    isWorkspaceComposerTransportMessage(trimmed) ||
    looksLikeDirectoryOrFileListing(trimmed) ||
    looksLikeWorkspaceShellErrorTranscript(trimmed) ||
    looksLikeWorkspaceInternalPromptFileDump(trimmed) ||
    looksLikeHiddenProcessPayloadJson(trimmed) ||
    looksLikeRawExecutionTranscript(trimmed)
  );
}

export function sanitizeWorkspaceAssistantText(text: string): { text: string; shouldHide: boolean } {
  const original = text.trim();
  if (isWorkspaceComposerTransportMessage(original)) {
    return { text: "", shouldHide: true };
  }

  const trimmed = stripWorkspaceComposerTransportBlocks(original).trim();
  if (!trimmed) {
    return { text: "", shouldHide: true };
  }

  if (isWorkspaceRawProcessEcho(trimmed)) {
    return { text: "", shouldHide: true };
  }

  const cleaned = trimMixedProcessTail(trimmed);
  if (!cleaned || isWorkspaceRawProcessEcho(cleaned)) {
    return { text: "", shouldHide: true };
  }

  return { text: cleaned, shouldHide: false };
}

export function sanitizeWorkspaceAssistantContent(content: unknown): { text: string; shouldHide: boolean } {
  if (typeof content === "string") {
    return sanitizeWorkspaceAssistantText(content);
  }

  if (Array.isArray(content)) {
    const fragments = content
      .map((block) => sanitizeWorkspaceAssistantText(extractTextFromContentBlock(block)))
      .filter((fragment) => !fragment.shouldHide && fragment.text)
      .map((fragment) => fragment.text.trim());
    const merged = fragments.join("\n\n").trim();
    return merged ? { text: merged, shouldHide: false } : { text: "", shouldHide: true };
  }

  if (isRecord(content)) {
    if (typeof content.text === "string" && content.text.trim()) {
      return sanitizeWorkspaceAssistantText(content.text);
    }

    if (Array.isArray(content.content)) {
      return sanitizeWorkspaceAssistantContent(content.content);
    }

    if ("message" in content) {
      return sanitizeWorkspaceAssistantContent(content.message);
    }

    if (typeof content.text === "string") {
      return sanitizeWorkspaceAssistantText(content.text);
    }
  }

  return { text: "", shouldHide: true };
}

export function shouldHideWorkspaceMessage(message: WorkspaceMessage) {
  if (message.role === "tool") {
    return true;
  }

  if (message.role !== "assistant") {
    return false;
  }

  return sanitizeWorkspaceAssistantText(message.text).shouldHide;
}
