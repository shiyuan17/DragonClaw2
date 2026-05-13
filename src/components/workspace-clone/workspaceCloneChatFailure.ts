export type WorkspaceChatFailureSource = "send" | "chat_error" | "agent_error" | "disconnect" | "history";
export type WorkspaceChatFailureSessionKind = "main" | "preview" | "history" | "task-run" | "unknown";

export interface WorkspaceChatFailureNotice {
  title: string;
  message: string;
  source: WorkspaceChatFailureSource;
  sessionKey?: string | null;
  runId?: string | null;
  sessionKind: WorkspaceChatFailureSessionKind;
  canRetry?: boolean;
}
