import type { WorkspaceMessage } from "./workspaceCloneTypes";

export type WorkspaceMessagePreviewKind = "plain" | "markdown" | "json";

export interface WorkspaceMessageFileTarget {
  label?: string;
  target: string;
}

export interface WorkspaceMessageDisplayParts {
  commandTag: string | null;
  skillTags: string[];
  content: string;
}

export interface WorkspaceMessageRenderState {
  key: string;
  textHash: string;
  hidden: boolean;
  previewKind: WorkspaceMessagePreviewKind;
  content: string;
  commandTag: string | null;
  skillTags: string[];
  fileTargets: WorkspaceMessageFileTarget[];
}

export type WorkspaceRenderableMessage = WorkspaceMessage & {
  render: WorkspaceMessageRenderState;
};
