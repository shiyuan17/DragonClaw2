import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  WorkspaceComposerAttachment,
  WorkspaceGatewayChatAttachmentPayload,
  WorkspaceMessageAttachment,
  WorkspaceChatAttachmentKind,
} from "./workspaceCloneTypes";

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "rtf"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown"]);
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "yml",
]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "xz", "zip"]);

function getFileExtension(fileName: string) {
  const trimmed = fileName.trim();
  const lastDotIndex = trimmed.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex >= trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(lastDotIndex + 1).toLowerCase();
}

function basenameFromPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || value;
}

function mimeTypeFromName(fileName: string) {
  const ext = getFileExtension(fileName);
  if (!ext) {
    return "application/octet-stream";
  }
  switch (ext) {
    case "md":
    case "markdown":
      return "text/markdown";
    case "ts":
    case "tsx":
      return "text/typescript";
    case "js":
    case "jsx":
    case "mjs":
      return "text/javascript";
    case "json":
      return "application/json";
    case "py":
      return "text/x-python";
    default:
      return "application/octet-stream";
  }
}

export function resolveWorkspaceAttachmentKind(
  mimeType: string,
  fileName: string,
): WorkspaceChatAttachmentKind {
  const normalizedMime = mimeType.trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (normalizedMime.startsWith("image/")) {
    return "image";
  }
  if (normalizedMime.startsWith("audio/")) {
    return "audio";
  }
  if (normalizedMime.startsWith("video/")) {
    return "video";
  }
  if (normalizedMime.startsWith("text/")) {
    if (CODE_EXTENSIONS.has(extension)) {
      return "code";
    }
    return TEXT_EXTENSIONS.has(extension) ? "text" : "text";
  }
  if (
    normalizedMime.includes("json")
    || normalizedMime.includes("javascript")
    || normalizedMime.includes("typescript")
    || normalizedMime.includes("python")
    || normalizedMime.includes("xml")
    || normalizedMime.includes("yaml")
  ) {
    return "code";
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return "archive";
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return "file";
}

export function isWorkspaceImageAttachment(attachment: {
  kind: WorkspaceChatAttachmentKind;
  transportType?: "image" | "file";
}) {
  return attachment.kind === "image" || attachment.transportType === "image";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("读取文件失败"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function createAttachmentFingerprint(input: {
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
  sourcePath?: string | null;
}) {
  return [
    input.fileName.trim().toLowerCase(),
    input.mimeType.trim().toLowerCase(),
    String(input.sizeBytes ?? ""),
    (input.sourcePath ?? "").trim().toLowerCase(),
  ].join("|");
}

export async function readWorkspaceComposerFiles(files: File[]) {
  const loaded = await Promise.all(
    files.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      const mimeType = file.type?.trim() || mimeTypeFromName(file.name);
      const kind = resolveWorkspaceAttachmentKind(mimeType, file.name);
      return {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `attachment-${Date.now()}-${Math.random()}`,
        fileName: file.name,
        mimeType,
        sizeBytes: Number.isFinite(file.size) ? file.size : 0,
        kind,
        transportType: kind === "image" ? ("image" as const) : ("file" as const),
        dataUrl,
        previewUrl: kind === "image" ? dataUrl : null,
      } satisfies WorkspaceComposerAttachment;
    }),
  );

  const seen = new Set<string>();
  return loaded.filter((attachment) => {
    const fingerprint = createAttachmentFingerprint(attachment);
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

export function mergeWorkspaceComposerAttachments(
  current: WorkspaceComposerAttachment[],
  incoming: WorkspaceComposerAttachment[],
) {
  const seen = new Set(current.map((attachment) => createAttachmentFingerprint(attachment)));
  const merged = [...current];
  for (const attachment of incoming) {
    const fingerprint = createAttachmentFingerprint(attachment);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    merged.push(attachment);
  }
  return merged;
}

export function getWorkspaceAttachmentDisplayLabel(kind: WorkspaceChatAttachmentKind) {
  switch (kind) {
    case "image":
      return "图片";
    case "document":
      return "文档";
    case "code":
      return "代码";
    case "text":
      return "文本";
    case "audio":
      return "音频";
    case "video":
      return "视频";
    case "archive":
      return "压缩包";
    default:
      return "文件";
  }
}

export function formatWorkspaceAttachmentSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function buildWorkspaceGatewayChatAttachments(
  attachments: WorkspaceComposerAttachment[],
): WorkspaceGatewayChatAttachmentPayload[] {
  return attachments
    .map((attachment) => {
      const match = /^data:[^;]+;base64,(.+)$/.exec(attachment.dataUrl.trim());
      if (!match) {
        return null;
      }

      return {
        type: attachment.transportType,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        content: match[1],
      } satisfies WorkspaceGatewayChatAttachmentPayload;
    })
    .filter((attachment): attachment is WorkspaceGatewayChatAttachmentPayload => Boolean(attachment));
}

function resolveImagePreviewUrl(sourcePath: string) {
  try {
    return convertFileSrc(sourcePath);
  } catch {
    return null;
  }
}

function pushUniqueAttachment(
  attachments: WorkspaceMessageAttachment[],
  seen: Set<string>,
  attachment: WorkspaceMessageAttachment,
) {
  const fingerprint = createAttachmentFingerprint({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sourcePath: attachment.sourcePath,
  });
  if (seen.has(fingerprint)) {
    return;
  }
  seen.add(fingerprint);
  attachments.push(attachment);
}

function createMessageAttachment(input: {
  fileName: string;
  mimeType: string;
  previewUrl?: string | null;
  sizeBytes?: number | null;
  sourcePath?: string | null;
}) {
  const kind = resolveWorkspaceAttachmentKind(input.mimeType, input.fileName);
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `message-attachment-${Date.now()}-${Math.random()}`,
    fileName: input.fileName,
    mimeType: input.mimeType,
    kind,
    transportType: kind === "image" ? ("image" as const) : ("file" as const),
    sizeBytes: input.sizeBytes ?? null,
    previewUrl: input.previewUrl ?? null,
    sourcePath: input.sourcePath ?? null,
  } satisfies WorkspaceMessageAttachment;
}

type RawMessageWithAttachments = {
  MediaPath?: unknown;
  MediaPaths?: unknown;
  MediaType?: unknown;
  MediaTypes?: unknown;
  content?: unknown;
};

export function extractWorkspaceMessageAttachments(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return [] as WorkspaceMessageAttachment[];
  }

  const message = raw as RawMessageWithAttachments;
  const attachments: WorkspaceMessageAttachment[] = [];
  const seen = new Set<string>();
  const contentBlocks = Array.isArray(message.content) ? message.content : [];

  for (const block of contentBlocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const entry = block as {
      type?: unknown;
      url?: unknown;
      mimeType?: unknown;
      attachment?: {
        url?: unknown;
        label?: unknown;
        mimeType?: unknown;
      };
      source?: {
        url?: unknown;
      };
    };

    if (entry.type === "image") {
      const previewUrl =
        typeof entry.url === "string"
          ? entry.url
          : typeof entry.source?.url === "string"
            ? entry.source.url
            : null;
      if (!previewUrl) {
        continue;
      }
      const fileName = basenameFromPath(previewUrl);
      const mimeType = typeof entry.mimeType === "string" ? entry.mimeType : mimeTypeFromName(fileName);
      pushUniqueAttachment(
        attachments,
        seen,
        createMessageAttachment({ fileName, mimeType, previewUrl }),
      );
      continue;
    }

    if (entry.type === "attachment") {
      const previewUrl = typeof entry.attachment?.url === "string" ? entry.attachment.url : null;
      if (!previewUrl) {
        continue;
      }
      const fileName =
        typeof entry.attachment?.label === "string" && entry.attachment.label.trim()
          ? entry.attachment.label.trim()
          : basenameFromPath(previewUrl);
      const mimeType =
        typeof entry.attachment?.mimeType === "string"
          ? entry.attachment.mimeType
          : mimeTypeFromName(fileName);
      pushUniqueAttachment(
        attachments,
        seen,
        createMessageAttachment({ fileName, mimeType, previewUrl }),
      );
    }
  }

  const mediaPaths = Array.isArray(message.MediaPaths)
    ? message.MediaPaths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : typeof message.MediaPath === "string" && message.MediaPath.trim()
      ? [message.MediaPath]
      : [];
  const hasMediaTypesArray = Array.isArray(message.MediaTypes);
  const rawMediaTypes: unknown[] = Array.isArray(message.MediaTypes) ? message.MediaTypes : [];
  const mediaTypes = hasMediaTypesArray
    ? rawMediaTypes.map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
    : typeof message.MediaType === "string" && message.MediaType.trim()
      ? [message.MediaType]
      : [];

  mediaPaths.forEach((sourcePath, index) => {
    const fileName = basenameFromPath(sourcePath);
    const sharedMediaType = hasMediaTypesArray ? "" : (mediaTypes[0] || "");
    const mimeType = mediaTypes[index] || sharedMediaType || mimeTypeFromName(fileName);
    const kind = resolveWorkspaceAttachmentKind(mimeType, fileName);
    pushUniqueAttachment(
      attachments,
      seen,
      createMessageAttachment({
        fileName,
        mimeType,
        previewUrl: kind === "image" ? resolveImagePreviewUrl(sourcePath) : null,
        sourcePath,
      }),
    );
  });

  return attachments;
}
