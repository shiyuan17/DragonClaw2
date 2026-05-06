import type { WorkspaceCronJob } from "./workspaceCloneTypes";
import { formatWorkspaceCronPayloadPreview } from "./workspaceCloneCron";

function looksLikeWorkspaceTaskSlug(value: string) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value.trim());
}

export function resolveWorkspaceTaskDisplayTitle(task: WorkspaceCronJob) {
  const description = task.description?.trim() ?? "";
  if (description && !looksLikeWorkspaceTaskSlug(description)) {
    return description;
  }

  const normalizedName = task.name.trim();
  if (normalizedName && !looksLikeWorkspaceTaskSlug(normalizedName)) {
    return normalizedName;
  }

  const payloadPreview = formatWorkspaceCronPayloadPreview(task).trim();
  const payloadTitle = payloadPreview
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return payloadTitle || normalizedName || task.id;
}
