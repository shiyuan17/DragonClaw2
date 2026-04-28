import { invoke } from "@tauri-apps/api/core";
import type { MemoryFileSnapshotItem, MemoryFileSnapshotResponse } from "../../types";
import type { WorkspaceMemoryFile, WorkspaceResourceItem } from "./workspaceCloneTypes";

export const WORKSPACE_MEMORY_FILE_SLOTS = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "MEMORY.md",
  "IDENTITY.md",
  "BOOTSTRAP.md",
  "HEARTBEAT.md",
  "TOOLS.md",
] as const;

const FOCUS_ORDER = ["AGENTS", "SOUL", "USER", "MEMORY", "IDENTITY"] as const;
const FOCUS_PRIORITY = new Map<string, number>(FOCUS_ORDER.map((key, index) => [key, index] as const));

function normalizeFileName(value: string) {
  return value.trim().toUpperCase();
}

function focusKeyForFileName(fileName: string) {
  const normalized = normalizeFileName(fileName).replace(/\.MD$/, "");
  if (normalized === "AGENTS" || normalized === "AGENT") return "AGENTS";
  if (normalized === "SOUL") return "SOUL";
  if (normalized === "USER") return "USER";
  if (normalized === "MEMORY") return "MEMORY";
  if (normalized === "IDENTITY") return "IDENTITY";
  return "";
}

function resolveMemoryExplanation(fileName: string) {
  switch (normalizeFileName(fileName)) {
    case "AGENTS.MD":
      return "员工工作规则";
    case "SOUL.MD":
      return "性格与价值观";
    case "USER.MD":
      return "用户身份定义";
    case "MEMORY.MD":
      return "长期记忆";
    case "IDENTITY.MD":
      return "身份定义";
    case "BOOTSTRAP.MD":
      return "启动说明";
    case "HEARTBEAT.MD":
      return "状态心跳记录";
    case "TOOLS.MD":
      return "工具使用规范";
    default:
      return "";
  }
}

function summarizeMemoryContent(content: string, exists: boolean) {
  const trimmed = content.trim();
  if (trimmed) {
    return trimmed.replace(/\s+/g, " ").slice(0, 72);
  }
  return exists ? "文件为空，可直接写入记忆内容。" : "文件缺失，保存时会自动创建。";
}

export function isWorkspaceMemoryFocusFile(file: Pick<WorkspaceMemoryFile, "title"> | string) {
  const title = typeof file === "string" ? file : file.title;
  return FOCUS_PRIORITY.has(focusKeyForFileName(title));
}

export function getWorkspaceMemoryDisplayName(file: Pick<WorkspaceMemoryFile, "title">) {
  const explanation = resolveMemoryExplanation(file.title);
  return explanation ? `${file.title} · ${explanation}` : file.title;
}

export function compareWorkspaceMemoryFiles(left: WorkspaceMemoryFile, right: WorkspaceMemoryFile) {
  const leftPriority = FOCUS_PRIORITY.get(focusKeyForFileName(left.title)) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = FOCUS_PRIORITY.get(focusKeyForFileName(right.title)) ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return left.displayName.localeCompare(right.displayName, "zh-CN", { sensitivity: "base" });
}

export function normalizeWorkspaceMemoryFile(item: MemoryFileSnapshotItem): WorkspaceMemoryFile {
  const title = item.title?.trim() || "MEMORY.md";
  const displayName = getWorkspaceMemoryDisplayName({ title });
  return {
    id: (item.id?.trim() || title).toLowerCase(),
    title,
    summary: item.summary?.trim() || summarizeMemoryContent(item.content || "", Boolean(item.exists)),
    sourcePath: item.source_path?.trim() || title,
    relativePath: item.relative_path?.trim() || title,
    updatedAtMs: typeof item.updated_at_ms === "number" ? item.updated_at_ms : Date.now(),
    content: item.content || "",
    exists: Boolean(item.exists),
    displayName,
    isFocus: isWorkspaceMemoryFocusFile(title),
  };
}

export function createWorkspaceFallbackMemoryFiles() {
  const now = Date.now();
  return WORKSPACE_MEMORY_FILE_SLOTS.map((fileName, index) => {
    const file = normalizeWorkspaceMemoryFile({
      id: fileName.toLowerCase(),
      title: fileName,
      summary: "",
      source_path: fileName,
      relative_path: fileName,
      updated_at_ms: now - index * 60_000,
      content: "",
      exists: false,
    });
    return {
      ...file,
      summary: "文件缺失，保存时会自动创建。",
    };
  }).sort(compareWorkspaceMemoryFiles);
}

export function buildWorkspaceMemoryResourceItems(files: WorkspaceMemoryFile[]): WorkspaceResourceItem[] {
  return [...files]
    .sort(compareWorkspaceMemoryFiles)
    .map((file) => ({
      id: file.id,
      title: file.displayName,
      subtitle: file.summary,
      tag: file.isFocus ? "重点" : file.exists ? undefined : "待创建",
    }));
}

export function filterWorkspaceMemoryFiles(files: WorkspaceMemoryFile[], search: string) {
  const query = search.trim().toLowerCase();
  const sorted = [...files].sort(compareWorkspaceMemoryFiles);
  if (!query) {
    return sorted;
  }

  return sorted.filter((file) =>
    [file.displayName, file.title, file.relativePath, file.summary, file.content]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

export async function loadWorkspaceMemorySnapshot(agentId?: string | null) {
  return invoke<MemoryFileSnapshotResponse>("load_memory_file_snapshot", {
    agentId: agentId ?? null,
  });
}

export async function saveWorkspaceMemoryFile(options: {
  sourcePath: string;
  content: string;
  agentId?: string | null;
}) {
  return invoke<string>("save_source_file", {
    kind: "memory",
    sourcePath: options.sourcePath,
    content: options.content,
    agentId: options.agentId ?? null,
  });
}
