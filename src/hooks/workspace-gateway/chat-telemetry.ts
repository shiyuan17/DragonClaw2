import { captureTelemetryEvent } from "../../utils/telemetry";

export type WorkspaceChatTelemetrySessionType = "main" | "agent" | "task_run";

function resolveTelemetrySessionType(
  sessionKey: string,
  fallback: WorkspaceChatTelemetrySessionType = "agent",
) {
  if (fallback === "task_run") {
    return fallback;
  }

  return sessionKey.endsWith(":main") ? "main" : "agent";
}

export function captureWorkspaceChatMessageSent(
  sessionKey: string,
  agentId: string,
  fallback?: WorkspaceChatTelemetrySessionType,
) {
  captureTelemetryEvent("launcher_chat_message_sent", {
    surface: "workspace_clone",
    session_type: resolveTelemetrySessionType(sessionKey, fallback),
    agent_id: agentId,
  });
}
