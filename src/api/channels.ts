import { invoke } from "@tauri-apps/api/core";
import type {
  FeishuOnboardingPollResponse,
  FeishuOnboardingQrResponse,
  OpenClawChannelAccountsSnapshotResponse,
  OpenClawChannelBindingPayload,
  OpenClawChannelConfigPayload,
  OpenClawFeishuChannelFormValues,
  OpenClawChannelQrBindingSessionSnapshot,
} from "../types";

const CHANNEL_CONFIG_LOAD_TIMEOUT_MS = 5000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(candidate: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  const raw = candidate[camelKey] ?? (snakeKey ? candidate[snakeKey] : undefined);
  return typeof raw === "string" ? raw : "";
}

function readOptionalString(candidate: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  const value = readString(candidate, camelKey, snakeKey).trim();
  return value ? value : null;
}

function readWeixinQrBindingQrUrl(candidate: Record<string, unknown>): string | null {
  const primary = readOptionalString(candidate, "qrUrl", "qr_url");
  if (primary) {
    return primary;
  }
  for (const key of ["QRUrl", "QrUrl", "qrURL"] as const) {
    const raw = candidate[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

function readStringArray(candidate: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  const raw = candidate[camelKey] ?? (snakeKey ? candidate[snakeKey] : undefined);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string");
}

function readNumber(candidate: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  const raw = candidate[camelKey] ?? (snakeKey ? candidate[snakeKey] : undefined);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function readBooleanString(value: string) {
  return value.trim().toLowerCase() === "true";
}

function readDelimitedStringList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeOpenClawChannelQrBindingSessionSnapshot(raw: unknown): OpenClawChannelQrBindingSessionSnapshot {
  const candidate = asRecord(raw);
  if (!candidate) {
    throw new Error("二维码绑定响应格式无效。");
  }

  return {
    sessionId: readString(candidate, "sessionId", "session_id"),
    channelType: readString(candidate, "channelType", "channel_type"),
    status: readString(candidate, "status"),
    qrUrl: readWeixinQrBindingQrUrl(candidate),
    qrAscii: readOptionalString(candidate, "qrAscii", "qr_ascii"),
    detail: readOptionalString(candidate, "detail"),
    logs: readStringArray(candidate, "logs"),
    startedAtMs: readNumber(candidate, "startedAtMs", "started_at_ms"),
    updatedAtMs: readNumber(candidate, "updatedAtMs", "updated_at_ms"),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((result) => {
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export async function loadOpenClawChannelAccountsSnapshot() {
  try {
    return await withTimeout(
      invoke<OpenClawChannelAccountsSnapshotResponse>("load_openclaw_channel_accounts_snapshot"),
      CHANNEL_CONFIG_LOAD_TIMEOUT_MS,
      "频道配置读取超时，请稍后重试。",
    );
  } catch (error) {
    throw new Error(toMessage(error, "频道配置读取失败。"));
  }
}

export async function loadOpenClawChannelFormValues(options: { channelType: string; accountId?: string | null }) {
  try {
    return await withTimeout(
      invoke<Record<string, string>>("load_openclaw_channel_form_values", {
        channelType: options.channelType.trim(),
        accountId: options.accountId?.trim() || null,
      }),
      CHANNEL_CONFIG_LOAD_TIMEOUT_MS,
      "频道表单读取超时，请稍后重试。",
    );
  } catch (error) {
    throw new Error(toMessage(error, "频道表单读取失败。"));
  }
}

export async function loadOpenClawFeishuChannelFormValues(accountId: string): Promise<OpenClawFeishuChannelFormValues> {
  const values = await loadOpenClawChannelFormValues({
    channelType: "feishu",
    accountId,
  });
  return {
    appId: values.appId?.trim() || "",
    appSecretConfigured: readBooleanString(values.appSecretConfigured ?? ""),
    dmPolicy: (values.dmPolicy ?? "open").trim() || "open",
    allowFrom: readDelimitedStringList(values.allowFrom ?? "").filter((item) => item !== "*"),
  };
}

export async function saveOpenClawChannelConfig(payload: OpenClawChannelConfigPayload) {
  try {
    await invoke("save_openclaw_channel_config", {
      payload: {
        channelType: payload.channelType.trim(),
        accountId: payload.accountId?.trim() || null,
        config: Object.fromEntries(
          Object.entries(payload.config).map(([key, value]) => [key.trim(), value.trim()]),
        ),
      },
    });
  } catch (error) {
    throw new Error(toMessage(error, "频道配置保存失败。"));
  }
}

export async function saveOpenClawChannelBinding(payload: OpenClawChannelBindingPayload) {
  try {
    await invoke("save_openclaw_channel_binding", {
      payload: {
        channelType: payload.channelType.trim(),
        accountId: payload.accountId.trim(),
        agentId: payload.agentId?.trim() || null,
        preferredDmScope: payload.preferredDmScope?.trim() || null,
      },
    });
  } catch (error) {
    throw new Error(toMessage(error, "频道绑定保存失败。"));
  }
}

export async function removeOpenClawChannelConfig(payload: {
  channelType: string;
  accountId?: string | null;
}) {
  try {
    await invoke("remove_openclaw_channel_config", {
      payload: {
        channelType: payload.channelType.trim(),
        accountId: payload.accountId?.trim() || null,
      },
    });
  } catch (error) {
    throw new Error(toMessage(error, "频道删除失败。"));
  }
}

export async function startOpenClawChannelQrBinding(channelType: string) {
  try {
    const snapshot = await invoke<unknown>("start_openclaw_channel_qr_binding", {
      channelType: channelType.trim(),
    });
    return normalizeOpenClawChannelQrBindingSessionSnapshot(snapshot);
  } catch (error) {
    throw new Error(toMessage(error, "二维码绑定启动失败。"));
  }
}

export async function pollOpenClawChannelQrBinding(sessionId: string) {
  try {
    const snapshot = await invoke<unknown>("poll_openclaw_channel_qr_binding", {
      sessionId: sessionId.trim(),
    });
    return normalizeOpenClawChannelQrBindingSessionSnapshot(snapshot);
  } catch (error) {
    throw new Error(toMessage(error, "二维码绑定状态读取失败。"));
  }
}

export async function clearOpenClawChannelQrBindingSession(sessionId: string) {
  try {
    await invoke("clear_openclaw_channel_qr_binding_session", {
      sessionId: sessionId.trim(),
    });
  } catch (error) {
    throw new Error(toMessage(error, "二维码会话清理失败。"));
  }
}

export async function requestFeishuOpenClawQr() {
  try {
    return await invoke<FeishuOnboardingQrResponse>("request_feishu_openclaw_qr");
  } catch (error) {
    throw new Error(toMessage(error, "飞书创建二维码获取失败。"));
  }
}

export async function pollFeishuOpenClawQrResult(deviceCode: string) {
  try {
    return await invoke<FeishuOnboardingPollResponse>("poll_feishu_openclaw_qr_result", {
      deviceCode: deviceCode.trim(),
    });
  } catch (error) {
    throw new Error(toMessage(error, "飞书创建结果读取失败。"));
  }
}
