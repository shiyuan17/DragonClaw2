import { captureTelemetryEvent } from "../utils/telemetry";

export type WorkspaceConfiguredSource = "auto" | "manual" | "switch";

export function captureSetupServiceStartRequested() {
  captureTelemetryEvent("launcher_service_start_requested");
}

export function captureSetupCompleted() {
  captureTelemetryEvent("launcher_setup_completed");
}

export function captureWorkspaceConfigured(source: WorkspaceConfiguredSource) {
  captureTelemetryEvent("launcher_workspace_configured", { source });
}
