const SHELL_COMMAND_LINE_RE =
  /^\s*(?:[-*+]\s*)?(?:`{1,3})?(?:rg|curl|pwsh|powershell|bash|sh|cmd(?:\.exe)?|python|node|npm|pnpm|npx|git|uv)\b/i;
const SHELL_ERROR_METADATA_LINE_RE =
  /^\s*(?:\+\s*)?(?:CategoryInfo|FullyQualifiedErrorId|At line:\d+ char:\d+|所在位置\s+行:\d+\s+字符:\d+|MissingMandatoryParameter|ParameterBindingException)\b/i;
const POWERSHELL_COMMAND_NOT_FOUND_RE =
  /^\s*[^:\r\n]{1,80}\s*:\s*(?:无法将|The term\b)[\s\S]*?(?:cmdlet|无法识别|not recognized)/i;
const INTERNAL_PROMPT_FILE_HEADING_RE =
  /^\s*#?\s*(?:SOUL|AGENTS|IDENTITY|USER|MEMORY)\.md\s*(?:[-:—]|$)/i;

export function looksLikeWorkspaceShellErrorTranscript(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.length === 0) {
    return false;
  }

  const firstLine = nonEmptyLines[0] ?? "";
  return (
    POWERSHELL_COMMAND_NOT_FOUND_RE.test(firstLine) ||
    (
      nonEmptyLines.some((line) => POWERSHELL_COMMAND_NOT_FOUND_RE.test(line)) &&
      nonEmptyLines.some((line) => SHELL_ERROR_METADATA_LINE_RE.test(line) || SHELL_COMMAND_LINE_RE.test(line))
    )
  );
}

export function looksLikeWorkspaceInternalPromptFileDump(text: string) {
  const trimmed = text.trim();
  if (!INTERNAL_PROMPT_FILE_HEADING_RE.test(trimmed) || trimmed.length < 160) {
    return false;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const markdownSignalCount = lines.filter((line) => (
    /^#{1,4}\s+\S/.test(line) ||
    /^[-*]\s+\S/.test(line) ||
    /^\d+\.\s+\S/.test(line) ||
    /^\|.+\|$/.test(line)
  )).length;
  const knownPromptSignals = [
    "Core Truths",
    "Boundaries",
    "Session 启动流程",
    "记忆",
    "identity",
    "systemPrompt",
    "You're not a chatbot",
  ];

  return markdownSignalCount >= 2 || knownPromptSignals.some((signal) => trimmed.includes(signal));
}
