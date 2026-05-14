import type {
  WorkspaceChatFileCategory,
  WorkspaceChatFileItem,
  WorkspaceChatFileSourceRole,
  WorkspaceMessage,
} from "./workspaceCloneTypes";
import type { WorkspaceMessageFileTarget, WorkspaceRenderableMessage } from "./workspaceChatRenderTypes";

type WorkspaceChatFileSpecificCategory = Exclude<WorkspaceChatFileCategory, "all">;

type ExtractedFileTarget = WorkspaceMessageFileTarget;

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "md", "rtf"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "csv"]);
const PPT_EXTENSIONS = new Set(["ppt", "pptx", "key"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\r\n]+)\)/g;
const CODE_SPAN_RE = /`([^`\r\n]+)`/g;
const QUOTED_PATH_RE = /(["'])([^"'`\r\n]+)\1/g;
const BARE_URL_RE = /(?:^|[\s<(])((?:https?:\/\/|file:\/\/)[^\s>)\]]+)/g;
const WINDOWS_PATH_RE = /(?:^|[\s<(])([A-Za-z]:[\\/][^\s<>"')\]]+)/g;
const UNIX_PATH_RE = /(?:^|[\s<(])((?:\/)[^\s<>"')\]]+)/g;

export const WORKSPACE_CHAT_FILE_FILTERS: Array<{ key: WorkspaceChatFileCategory; label: string }> = [
  { key: "all", label: "全部" },
  { key: "website", label: "网站" },
  { key: "document", label: "文档" },
  { key: "excel", label: "Excel" },
  { key: "ppt", label: "PPT" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
];

function trimWrappedPunctuation(value: string) {
  return value.trim().replace(/^[<[(]+/, "").replace(/[>),.;:!?]+$/, "");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isFileUrl(value: string) {
  return /^file:\/\//i.test(value);
}

function isLikelyLocalPath(value: string) {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\//.test(value);
}

function normalizePathSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

export function normalizeWorkspaceChatFileTarget(value: string) {
  const trimmed = trimWrappedPunctuation(value);
  if (!trimmed) {
    return "";
  }

  if (isHttpUrl(trimmed) || isFileUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.hash = "";
      }
      return url.toString();
    } catch {
      return trimmed;
    }
  }

  if (isLikelyLocalPath(trimmed)) {
    return normalizePathSlashes(trimmed);
  }

  return trimmed;
}

function getTargetExtension(value: string) {
  let candidate = value.trim();

  if (isHttpUrl(candidate) || isFileUrl(candidate)) {
    try {
      candidate = new URL(candidate).pathname;
    } catch {
      return "";
    }
  }

  const lastSegment = normalizePathSlashes(candidate).split("/").filter(Boolean).pop() || "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return "";
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function resolveCategory(target: string): WorkspaceChatFileSpecificCategory | null {
  const extension = getTargetExtension(target);

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  if (EXCEL_EXTENSIONS.has(extension)) {
    return "excel";
  }
  if (PPT_EXTENSIONS.has(extension)) {
    return "ppt";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (isHttpUrl(target)) {
    return "website";
  }

  return null;
}

function getBasename(value: string) {
  let candidate = value.trim();

  if (isHttpUrl(candidate) || isFileUrl(candidate)) {
    try {
      const url = new URL(candidate);
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.pathname) {
        return url.hostname || candidate;
      }
      candidate = decodeURIComponent(url.pathname || "");
    } catch {
      return candidate;
    }
  }

  const segments = normalizePathSlashes(candidate).split("/").filter(Boolean);
  return segments[segments.length - 1] || candidate;
}

function resolveTitle(target: string, label?: string) {
  const normalizedLabel = label?.trim() || "";
  if (normalizedLabel && normalizedLabel !== target) {
    return normalizedLabel;
  }

  const basename = getBasename(target);
  if (basename) {
    return basename;
  }

  if (isHttpUrl(target)) {
    try {
      return new URL(target).hostname || target;
    } catch {
      return target;
    }
  }

  return target;
}

export function buildWorkspaceChatMessagePreview(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function stripMarkdownLinks(text: string) {
  return text.replace(MARKDOWN_LINK_RE, " ");
}

function pushIfUnique(list: ExtractedFileTarget[], seen: Set<string>, candidate: ExtractedFileTarget) {
  const target = trimWrappedPunctuation(candidate.target);
  if (!target) {
    return;
  }

  const normalized = normalizeWorkspaceChatFileTarget(target);
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  list.push({
    label: candidate.label?.trim() || undefined,
    target,
  });
}

export function extractWorkspaceChatFileTargets(text: string) {
  const targets: ExtractedFileTarget[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const [, label, rawTarget] = match;
    pushIfUnique(targets, seen, { label, target: rawTarget });
  }

  const textWithoutMarkdownLinks = stripMarkdownLinks(text);

  for (const match of textWithoutMarkdownLinks.matchAll(CODE_SPAN_RE)) {
    const [, rawTarget] = match;
    if (isHttpUrl(rawTarget) || isFileUrl(rawTarget) || isLikelyLocalPath(rawTarget)) {
      pushIfUnique(targets, seen, { target: rawTarget });
    }
  }

  for (const match of textWithoutMarkdownLinks.matchAll(QUOTED_PATH_RE)) {
    const [, , rawTarget] = match;
    if (isFileUrl(rawTarget) || isLikelyLocalPath(rawTarget)) {
      pushIfUnique(targets, seen, { target: rawTarget });
    }
  }

  for (const match of textWithoutMarkdownLinks.matchAll(BARE_URL_RE)) {
    const [, rawTarget] = match;
    pushIfUnique(targets, seen, { target: rawTarget });
  }

  for (const match of textWithoutMarkdownLinks.matchAll(WINDOWS_PATH_RE)) {
    const [, rawTarget] = match;
    pushIfUnique(targets, seen, { target: rawTarget });
  }

  for (const match of textWithoutMarkdownLinks.matchAll(UNIX_PATH_RE)) {
    const [, rawTarget] = match;
    pushIfUnique(targets, seen, { target: rawTarget });
  }

  return targets;
}

function resolveSourceRole(role: WorkspaceMessage["role"]): WorkspaceChatFileSourceRole | null {
  if (role === "user" || role === "assistant") {
    return role;
  }
  return null;
}

export function getWorkspaceChatFileCategoryLabel(category: WorkspaceChatFileCategory) {
  return WORKSPACE_CHAT_FILE_FILTERS.find((item) => item.key === category)?.label || "文件";
}

export function getWorkspaceChatFileSourceRoleLabel(role: WorkspaceChatFileSourceRole) {
  return role === "user" ? "用户" : "助手";
}

export function resolveWorkspaceLocalOpenPath(target: string) {
  if (!isFileUrl(target)) {
    return target;
  }

  try {
    const url = new URL(target);
    const decodedPath = decodeURIComponent(url.pathname || "");
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }
    return decodedPath;
  } catch {
    return target.replace(/^file:\/\//i, "");
  }
}

export function isWorkspaceUrlTarget(target: string) {
  return isHttpUrl(target);
}

export function buildWorkspaceChatFileItems(messages: WorkspaceMessage[]): WorkspaceChatFileItem[] {
  const itemsByTarget = new Map<string, { item: WorkspaceChatFileItem; order: number }>();

  messages.forEach((message, messageIndex) => {
    const sourceRole = resolveSourceRole(message.role);
    if (!sourceRole) {
      return;
    }

    const preview = buildWorkspaceChatMessagePreview(message.text);
    const targets = extractWorkspaceChatFileTargets(message.text);

    targets.forEach(({ label, target }) => {
      const normalizedTarget = normalizeWorkspaceChatFileTarget(target);
      if (!normalizedTarget) {
        return;
      }

      const category = resolveCategory(normalizedTarget);
      if (!category) {
        return;
      }

      itemsByTarget.set(normalizedTarget, {
        order: messageIndex,
        item: {
          id: `${message.id}:${normalizedTarget}`,
          title: resolveTitle(normalizedTarget, label),
          target: normalizedTarget,
          category,
          sourceRole,
          messageId: message.id,
          messageTime: message.time,
          messagePreview: preview,
        },
      });
    });
  });

  return [...itemsByTarget.values()]
    .sort((left, right) => right.order - left.order)
    .map((entry) => entry.item);
}

export function buildWorkspaceChatFileItemsFromRenderableMessages(messages: WorkspaceRenderableMessage[]): WorkspaceChatFileItem[] {
  const itemsByTarget = new Map<string, { item: WorkspaceChatFileItem; order: number }>();

  messages.forEach((message, messageIndex) => {
    const sourceRole = resolveSourceRole(message.role);
    if (!sourceRole || message.render.hidden) {
      return;
    }

    const preview = buildWorkspaceChatMessagePreview(message.render.content);

    message.render.fileTargets.forEach(({ label, target }) => {
      const normalizedTarget = normalizeWorkspaceChatFileTarget(target);
      if (!normalizedTarget) {
        return;
      }

      const category = resolveCategory(normalizedTarget);
      if (!category) {
        return;
      }

      itemsByTarget.set(normalizedTarget, {
        order: messageIndex,
        item: {
          id: `${message.id}:${normalizedTarget}`,
          title: resolveTitle(normalizedTarget, label),
          target: normalizedTarget,
          category,
          sourceRole,
          messageId: message.id,
          messageTime: message.time,
          messagePreview: preview,
        },
      });
    });
  });

  return [...itemsByTarget.values()]
    .sort((left, right) => right.order - left.order)
    .map((entry) => entry.item);
}
