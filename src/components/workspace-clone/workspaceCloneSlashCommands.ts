import type {
  WorkspaceActiveSlashCommand,
  WorkspaceActiveSkill,
  WorkspaceActiveSkillList,
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandRecord,
} from "./workspaceCloneTypes";
import type { KnowledgeBaseRecord } from "../../types";

const WORKSPACE_SLASH_COMMAND_FALLBACK = "command";
export const WORKSPACE_SLASH_COMMAND_MARKER = "[DC_WORKSPACE_SLASH_COMMAND_V1]";
export const WORKSPACE_SKILL_MARKER = "[DC_WORKSPACE_SKILL_V1]";
export const WORKSPACE_DIRECTORY_MARKER = "[DC_WORKSPACE_DIRECTORY_V1]";
export const WORKSPACE_KNOWLEDGE_MARKER = "[DC_WORKSPACE_KNOWLEDGE_BASE_V1]";
const WORKSPACE_TRANSPORT_MARKERS = [
  WORKSPACE_DIRECTORY_MARKER,
  WORKSPACE_KNOWLEDGE_MARKER,
  WORKSPACE_SKILL_MARKER,
  WORKSPACE_SLASH_COMMAND_MARKER,
] as const;

function buildKnowledgeCommandInstruction(action: string, commandFile: string, extraRules: string[]) {
  return [
    "You are running a DragonClaw knowledge-base workflow.",
    `Target action: ${action}`,
    "Prefer the knowledge base selected in the current chat. If no knowledge-base context is available, ask the user to select or create one from the composer before proceeding. Do not guess paths.",
    "The managed knowledge-base runtime root is OpenClaw engine_dir()/knowledge-base/<slug>. Project workflow rules live under src/data/knowledge/Command/.",
    `Before executing, read and follow ${commandFile}; also use the structural constraints under src/data/knowledge/schema/.`,
    "Keep text-first handling. Markdown, txt, and html can be organized or edited; PDFs, images, archives, and other binary files should only receive metadata notes or extraction recommendations unless the user provides extracted text.",
    ...extraRules,
  ].join("\n");
}

function buildProjectSpecCommandInstruction() {
  return [
    "You are running DragonClaw /spec for the project selected by the current chat working directory.",
    "This command is project-aware and must not assume the DragonClaw repository rules unless the selected project is DragonClaw itself.",
    "If no [DC_WORKSPACE_DIRECTORY_V1] cwd block is present, ask the user to select a project directory first and stop.",
    "Use the cwd as the project root. First inspect the project non-destructively: README files, package/Cargo/pyproject/manifests, existing docs, tests, AGENTS.md/CLAUDE.md/GEMINI.md, .specify/, and any local contribution or architecture rules.",
    "If .specify/ exists, follow its templates, constitution, feature metadata, and project conventions. If it does not exist, use a minimal Spec Kit-compatible structure without installing or invoking Spec Kit CLI.",
    "Create or propose a feature short name from the user's request using 2-4 descriptive words. Use the next numeric specs/<NNN-short-name>/ directory unless the selected project has a different .specify numbering policy.",
    "Default artifacts: specs/<feature>/spec.md and specs/<feature>/checklists/requirements.md. Update or respect .specify/feature.json when the selected project already uses it.",
    "The spec.md must describe WHAT and WHY, not HOW. Include user scenarios, acceptance scenarios, functional requirements, key entities, boundaries, assumptions, and measurable success criteria.",
    "If important information is missing, include no more than 3 highest-impact clarification questions, prioritized by scope, security/privacy, UX, then technical detail.",
    "The requirements checklist must verify that the spec avoids implementation details, is testable, has measurable success criteria, and has clear scope boundaries.",
    "Do not write implementation code, run formatters, generate migrations, or modify product code as part of /spec.",
  ].join("\n");
}

function buildAdaptivePlanCommandInstruction() {
  return [
    "You are running DragonClaw /plan. First decide whether this project has a reliable Spec Kit-style spec, then choose the correct planning strategy.",
    "Use the [DC_WORKSPACE_DIRECTORY_V1] cwd block as the project root when present. If no cwd is present, you may produce a lightweight conversation plan, but must not attempt Spec Kit artifact planning until the user selects a project.",
    "Spec detection order: 1) if the user explicitly names a spec or feature, use that if it resolves to a valid specs/<feature>/spec.md; 2) if .specify/feature.json points to a valid spec.md, use it; 3) if exactly one reliable specs/*/spec.md exists, use it; 4) if multiple specs exist, ask the user to choose; 5) if no reliable spec exists, use Codex-style read-only planning.",
    "Treat a spec as reliable only when it is a feature spec file under specs/<feature>/spec.md or is referenced by .specify metadata. Do not treat an arbitrary specs/ directory as Spec Kit evidence by itself.",
    "Spec Kit plan mode: read the selected spec and project rules, then generate or propose plan.md, research.md, data-model.md, contracts/, and quickstart.md under that feature directory. The plan explains HOW and must reflect the real project stack, tests, constraints, and constitution checks.",
    "Codex-style plan mode: perform only read-only exploration and output a conversation-level implementation plan with execution direction, affected areas, risks, tests, and open questions. Do not create specs/ or other artifacts in this mode.",
    "The planning-strategy selection is internal command logic. In the user-visible reply, do not narrate the detection process, do not say whether you chose Spec Kit mode or Codex-style mode, and do not list missing spec evidence unless the user explicitly asks for that diagnosis.",
    "Do not include preambles such as 'Spec detection result', 'currently I will use Codex-style read-only planning', or explanations about why plan.md/research.md will or will not be generated. Start with the actual plan, a concise blocker, or a short clarification question.",
    "When multiple reliable specs exist or no project directory is selected, ask only the minimum next-step question needed to proceed. Phrase it as direct user guidance rather than command self-explanation.",
    "In all modes, do not edit product code, run formatters/codegen/migrations, or modify non-planning artifacts. Spec Kit plan mode may create or update planning artifacts only under the selected specs/<feature>/ directory.",
  ].join("\n");
}

export const WORKSPACE_BUILTIN_SLASH_COMMANDS: WorkspaceSlashCommandDefinition[] = [
  {
    id: "builtin-spec",
    command: "/spec",
    name: "Spec",
    description: "基于当前选中的工作目录，生成或补全面向项目的 Spec Kit 风格功能规格。",
    instruction: buildProjectSpecCommandInstruction(),
    source: "builtin",
    readonly: true,
  },
  {
    id: "builtin-plan",
    command: "/plan",
    name: "Plan",
    description: "自适应规划：存在可靠 spec 时使用 Spec Kit 规划产物，否则输出只读执行计划。",
    instruction: buildAdaptivePlanCommandInstruction(),
    source: "builtin",
    readonly: true,
  },
  {
    id: "builtin-kb-extract",
    command: "/kb-extract",
    name: "Knowledge Extract",
    description: "将资料中的关键信息提取到当前选中的知识库，整理为可维护的 Markdown 文档。",
    instruction: buildKnowledgeCommandInstruction("extract", "src/data/knowledge/Command/Extract.md", [
      "Only perform faithful extraction and structuring. Do not rewrite subjectively, infer beyond the source, or expand conclusions.",
      "Preserve sources, sections, key definitions, reusable excerpts, and questions that still need confirmation.",
    ]),
    source: "builtin",
    readonly: true,
  },
  {
    id: "builtin-kb-digest",
    command: "/kb-digest",
    name: "Knowledge Digest",
    description: "将已提取的资料增量整理为摘要、概念、主题和索引。",
    instruction: buildKnowledgeCommandInstruction("digest", "src/data/knowledge/Command/Digest.md", [
      "Update existing knowledge-base files incrementally and avoid regenerating duplicate content.",
      "Clearly separate new entries, merges, conflicts, and items that require human confirmation.",
    ]),
    source: "builtin",
    readonly: true,
  },
  {
    id: "builtin-kb-output",
    command: "/kb-output",
    name: "Knowledge Output",
    description: "基于知识库中的索引与文档生成文章、方案、清单或问答。",
    instruction: buildKnowledgeCommandInstruction("output", "src/data/knowledge/Command/Output.md", [
      "Prefer already digested indexes, summaries, concepts, and topic documents from the knowledge base.",
      "Before output, state which knowledge-base materials were used. If the material is insufficient, list the gaps first.",
    ]),
    source: "builtin",
    readonly: true,
  },
  {
    id: "builtin-kb-inspect",
    command: "/kb-inspect",
    name: "Knowledge Inspect",
    description: "检查知识库结构、命名一致性、重复内容、缺失索引与自动化风险。",
    instruction: buildKnowledgeCommandInstruction("inspect", "src/data/knowledge/Command/Inspect.md", [
      "Only output an inspection report and repair recommendations unless the user explicitly asks for file edits.",
      "Inspect directory structure, naming consistency, duplicates, orphaned documents, index gaps, and automation risks.",
    ]),
    source: "builtin",
    readonly: true,
  },
];

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
  value: string;
  existingCommands: WorkspaceSlashCommandDefinition[];
  excludeId?: string | null;
}) {
  const base = normalizeWorkspaceSlashCommandValue(options.value);
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
    buildWorkspaceSlashCommandTransportBlock(command),
    "user message:",
    userMessage.trim(),
  ].join("\n");
}

export function toWorkspaceActiveSkill(
  skill: WorkspaceActiveSkill | null | undefined,
): WorkspaceActiveSkill {
  if (!skill) {
    return null;
  }

  return {
    id: skill.id,
    title: skill.title,
    description: skill.description,
    tag: skill.tag,
    category: skill.category,
  };
}

function buildWorkspaceSkillTransportBlock(skill: NonNullable<WorkspaceActiveSkill>) {
  return [
    WORKSPACE_SKILL_MARKER,
    `skill: ${skill.title}`,
    `category: ${skill.category}`,
    "scope: current-message-only",
    "description:",
    skill.description.trim() || "No description provided.",
    "usage:",
    "Use this selected skill as the preferred approach for this single message only.",
  ].join("\n");
}

function buildWorkspaceSlashCommandTransportBlock(command: NonNullable<WorkspaceActiveSlashCommand>) {
  return [
    WORKSPACE_SLASH_COMMAND_MARKER,
    `command: ${command.command}`,
    `name: ${command.name}`,
    `source: ${command.source}`,
    "instruction:",
    command.instruction.trim(),
  ].join("\n");
}

function buildWorkspaceDirectoryTransportBlock(workspaceDirectory: string) {
  const normalizedDirectory = workspaceDirectory.trim();
  return [
    WORKSPACE_DIRECTORY_MARKER,
    `cwd: ${normalizedDirectory}`,
    "scope: current-session",
    "instructions:",
    "Treat this directory as the default working directory for local file access, shell commands, and path resolution in this conversation unless the user explicitly overrides it.",
  ].join("\n");
}

function buildWorkspaceKnowledgeTransportBlock(knowledgeBase: KnowledgeBaseRecord) {
  const roots = knowledgeBase.roots.length > 0
    ? knowledgeBase.roots.map((root) => `- ${root.name}: ${root.path}`).join("\n")
    : "- no roots registered";

  return [
    WORKSPACE_KNOWLEDGE_MARKER,
    `id: ${knowledgeBase.id}`,
    `name: ${knowledgeBase.name}`,
    `description: ${knowledgeBase.description?.trim() || "No description provided."}`,
    "roots:",
    roots,
    "scope: current-session",
    "instructions:",
    "Use this knowledge base as the default source and destination for /kb-* workflows in this message. Do not write outside the listed roots.",
  ].join("\n");
}

export function buildWorkspaceComposerTransportMessage(options: {
  command?: WorkspaceActiveSlashCommand | null;
  skills?: WorkspaceActiveSkillList | null;
  knowledgeBase?: KnowledgeBaseRecord | null;
  workspaceDirectory?: string | null;
  userMessage: string;
}) {
  const { command, skills, knowledgeBase, workspaceDirectory, userMessage } = options;
  const normalizedMessage = userMessage.trim();
  const transportBlocks = [
    ...(workspaceDirectory?.trim() ? [buildWorkspaceDirectoryTransportBlock(workspaceDirectory)] : []),
    ...(knowledgeBase ? [buildWorkspaceKnowledgeTransportBlock(knowledgeBase)] : []),
    ...(skills?.map((skill) => buildWorkspaceSkillTransportBlock(skill)) ?? []),
    ...(command ? [buildWorkspaceSlashCommandTransportBlock(command)] : []),
  ];

  if (transportBlocks.length === 0) {
    return normalizedMessage;
  }

  return [
    ...transportBlocks,
    "user message:",
    normalizedMessage,
  ].join("\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWorkspaceTransportUserMessage(value: string) {
  const match = value.match(/(?:^|\n)user message:\s*\n([\s\S]*)$/i);
  return match?.[1]?.trim() ?? "";
}

function getWorkspaceTransportCommand(value: string) {
  const match = value.match(/(?:^|\n)command:\s*(\/[^\s\r\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

export function isWorkspaceComposerTransportMessage(value: string) {
  return WORKSPACE_TRANSPORT_MARKERS.some((marker) => value.includes(marker));
}

export function stripWorkspaceComposerTransportBlocks(value: string) {
  const normalized = value.trim();
  if (!normalized || !isWorkspaceComposerTransportMessage(normalized)) {
    return normalized;
  }

  const userMessage = getWorkspaceTransportUserMessage(normalized);
  const command = getWorkspaceTransportCommand(normalized);
  if (command) {
    return [command, userMessage].filter(Boolean).join(" ").trim();
  }
  if (userMessage) {
    return userMessage;
  }

  const markerPattern = WORKSPACE_TRANSPORT_MARKERS.map(escapeRegExp).join("|");
  return normalized
    .replace(new RegExp(`(?:^|\\n)(?:${markerPattern})[\\s\\S]*?(?=\\n(?:${markerPattern})|\\nuser message:|$)`, "gi"), "")
    .replace(/(?:^|\n)user message:\s*/gi, "\n")
    .trim();
}

export function buildWorkspaceVisibleComposerMessage(options: {
  command?: WorkspaceActiveSlashCommand | null;
  userMessage: string;
}) {
  const normalizedMessage = options.userMessage.trim();
  const command = options.command?.command.trim();
  return command ? [command, normalizedMessage].filter(Boolean).join(" ") : normalizedMessage;
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
