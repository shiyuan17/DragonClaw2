import { invoke } from "@tauri-apps/api/core";
import type {
  EmailSkillBindingSaveResponse,
  EmailSkillBindingSnapshot,
  SaveEmailSkillBindingPayload,
} from "../types";

function trimOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

export async function loadImapSmtpEmailBinding() {
  try {
    return await invoke<EmailSkillBindingSnapshot>("load_imap_smtp_email_binding");
  } catch (error) {
    throw new Error(toMessage(error, "邮箱绑定配置读取失败。"));
  }
}

export async function saveImapSmtpEmailBinding(payload: SaveEmailSkillBindingPayload) {
  try {
    return await invoke<EmailSkillBindingSaveResponse>("save_imap_smtp_email_binding", {
      payload: {
        provider: trimOrEmpty(payload.provider).toLowerCase(),
        emailAccount: trimOrEmpty(payload.emailAccount),
        authorizationCode: trimOrEmpty(payload.authorizationCode),
        customConfig: payload.customConfig
          ? {
              imapHost: trimOrEmpty(payload.customConfig.imapHost),
              imapPort: trimOrEmpty(payload.customConfig.imapPort),
              smtpHost: trimOrEmpty(payload.customConfig.smtpHost),
              smtpPort: trimOrEmpty(payload.customConfig.smtpPort),
              imapTls: payload.customConfig.imapTls === true,
              smtpSecure: payload.customConfig.smtpSecure === true,
            }
          : null,
      },
    });
  } catch (error) {
    throw new Error(toMessage(error, "邮箱绑定配置保存失败。"));
  }
}
