export type WorkspaceIntegrationFlowStage =
  | "idle"
  | "loading"
  | "awaiting-external"
  | "ready"
  | "saving"
  | "success"
  | "error";

export interface WorkspaceIntegrationFlowState {
  stage: WorkspaceIntegrationFlowStage;
  detail: string;
  completed: boolean;
}

interface DeriveWorkspaceIntegrationFlowStateInput {
  loading?: boolean;
  saving?: boolean;
  awaitingExternal?: boolean;
  readyToSave?: boolean;
  successDetail?: string;
  errorDetail?: string;
  idleDetail?: string;
}

export function deriveWorkspaceIntegrationFlowState(
  input: DeriveWorkspaceIntegrationFlowStateInput,
): WorkspaceIntegrationFlowState {
  const errorDetail = input.errorDetail?.trim() || "";
  if (errorDetail) {
    return { stage: "error", detail: errorDetail, completed: false };
  }

  if (input.saving) {
    return { stage: "saving", detail: "", completed: false };
  }

  if (input.loading) {
    return { stage: "loading", detail: "", completed: false };
  }

  const successDetail = input.successDetail?.trim() || "";
  if (successDetail) {
    return { stage: "success", detail: successDetail, completed: true };
  }

  if (input.awaitingExternal) {
    return { stage: "awaiting-external", detail: "", completed: false };
  }

  if (input.readyToSave) {
    return { stage: "ready", detail: "", completed: false };
  }

  return {
    stage: "idle",
    detail: input.idleDetail?.trim() || "",
    completed: false,
  };
}
