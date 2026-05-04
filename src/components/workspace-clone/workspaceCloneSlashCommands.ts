import type {
  WorkspaceActiveSlashCommand,
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandRecord,
} from "./workspaceCloneTypes";

const WORKSPACE_SLASH_COMMAND_FALLBACK = "command";
export const WORKSPACE_SLASH_COMMAND_MARKER = "[DC_WORKSPACE_SLASH_COMMAND_V1]";

export const WORKSPACE_BUILTIN_SLASH_COMMANDS: WorkspaceSlashCommandDefinition[] = [];

export function normalizeWorkspaceSlashCommandValue(value: string) {
  const normalized = value
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `/${normalized || WORKSPACE_SLASH_COMMAND_FALLBACK}`;
}

export function createWorkspaceSlashCommandId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `slash-${globalThis.crypto.randomUUID()}`;
  }
  return `slash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUniqueWorkspaceSlashCommandValue(options: {
  name: string;
  existingCommands: WorkspaceSlashCommandDefinition[];
  excludeId?: string | null;
}) {
  const base = normalizeWorkspaceSlashCommandValue(options.name);
  const used = new Set(
    options.existingCommands
      .filter((item) => item.id !== options.excludeId)
      .map((item) => normalizeWorkspaceSlashCommandValue(item.command)),
  );
  if (!used.has(base)) {
    return base;
  }

  let suffix = 2;
  let next = `${base}-${suffix}`;
  while (used.has(next)) {
    suffix += 1;
    next = `${base}-${suffix}`;
  }
  return next;
}

export function mapWorkspaceSlashCommandRecord(
  record: WorkspaceSlashCommandRecord,
): WorkspaceSlashCommandDefinition {
  return {
    id: record.id,
    command: normalizeWorkspaceSlashCommandValue(record.command || record.name),
    name: record.name.trim(),
    description: record.description.trim(),
    instruction: record.instruction.trim(),
    source: "custom",
    readonly: false,
  };
}

export function toWorkspaceActiveSlashCommand(
  command: WorkspaceSlashCommandDefinition | null | undefined,
): WorkspaceActiveSlashCommand {
  if (!command) {
    return null;
  }

  return {
    id: command.id,
    command: command.command,
    name: command.name,
    description: command.description,
    instruction: command.instruction,
    source: command.source,
  };
}

export function buildWorkspaceSlashCommandTransportMessage(options: {
  command: NonNullable<WorkspaceActiveSlashCommand>;
  userMessage: string;
}) {
  const { command, userMessage } = options;
  return [
    WORKSPACE_SLASH_COMMAND_MARKER,
    `command: ${command.command}`,
    `name: ${command.name}`,
    `source: ${command.source}`,
    "instruction:",
    command.instruction.trim(),
    "user message:",
    userMessage.trim(),
  ].join("\n");
}

export function parseWorkspaceSlashSelection(value: string) {
  const normalized = value.replace(/^\s+/, "");
  if (!normalized.startsWith("/")) {
    return null;
  }

  const firstWhitespaceIndex = normalized.search(/\s/);
  const token = firstWhitespaceIndex === -1 ? normalized : normalized.slice(0, firstWhitespaceIndex);
  const remainder = firstWhitespaceIndex === -1 ? "" : normalized.slice(firstWhitespaceIndex).trimStart();

  return {
    token,
    query: token.slice(1).toLowerCase(),
    remainder,
  };
}

export function filterWorkspaceSlashCommands(
  commands: WorkspaceSlashCommandDefinition[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) => {
    const haystack = [
      command.command,
      command.name,
      command.description,
    ].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
