import type { AgentInfo } from "../../types";
import { resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import type { ChannelBindingView, WorkspaceChannelAgentOption } from "../../components/workspace-clone/workspaceCloneTypes";

export const WEIXIN_LINK_POLICY = {
  allowedSchemes: new Set(["https:", "http:"]),
  allowedHosts: new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  allowedHostSuffixes: ["weixin.qq.com", "qq.com", "servicewechat.com", "wechat.com"],
  allowHttpLocalhost: true,
};

export const FEISHU_LINK_POLICY = {
  allowedSchemes: new Set(["https:"]),
  allowedHosts: new Set<string>(),
  allowedHostSuffixes: ["feishu.cn", "larksuite.com"],
  allowHttpLocalhost: false,
};

export const WEIXIN_QR_POLL_INTERVAL_MS = 2400;
export const FEISHU_QR_AUTO_POLL_MIN_MS = 1500;
export const FEISHU_QR_AUTO_POLL_MAX_MS = 30000;

export function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export function validateExternalUrl(
  rawUrl: string,
  policy: typeof WEIXIN_LINK_POLICY,
): { ok: true; url: URL } | { ok: false; reason: string } {
  const value = rawUrl.trim();
  if (!value) {
    return { ok: false, reason: "链接为空。" };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "链接格式无效。" };
  }

  if (!policy.allowedSchemes.has(url.protocol)) {
    return { ok: false, reason: `不支持的协议: ${url.protocol}` };
  }

  const normalizedHost = url.hostname.trim().toLowerCase();
  if (
    url.protocol === "http:" &&
    !policy.allowHttpLocalhost &&
    !policy.allowedHosts.has(normalizedHost)
  ) {
    return { ok: false, reason: "仅允许本地地址使用 http 协议。" };
  }

  if (
    policy.allowedHosts.size > 0 &&
    !policy.allowedHosts.has(normalizedHost) &&
    !policy.allowedHostSuffixes.some(
      (suffix) => normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`),
    )
  ) {
    return { ok: false, reason: `域名不在白名单中: ${normalizedHost}` };
  }

  if (
    policy.allowedHosts.size === 0 &&
    policy.allowedHostSuffixes.length > 0 &&
    !policy.allowedHostSuffixes.some(
      (suffix) => normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`),
    )
  ) {
    return { ok: false, reason: `域名不在白名单中: ${normalizedHost}` };
  }

  return { ok: true, url };
}

export function resolveChannelView(channelId: string, fallback?: ChannelBindingView): ChannelBindingView {
  if (fallback && fallback !== "placeholder") {
    return fallback;
  }
  if (channelId === "feishu") {
    return "feishu";
  }
  if (channelId === "weixin") {
    return "wechat";
  }
  return "placeholder";
}

export function buildChannelEntityId(channelId: string, accountId: string) {
  return `channel:${channelId}:${accountId}`;
}

export function buildCatalogEntityId(channelId: string) {
  return `catalog:${channelId}`;
}

export function resolveModalAccountLabel(accountId?: string | null) {
  const value = (accountId ?? "").trim();
  if (!value || value.toLowerCase() === "default") {
    return "主账号";
  }
  return value;
}

export function resolveChannelAvatarLabel(name: string) {
  return name.trim().slice(0, 1) || "C";
}

export function resolveAgentOptions(items: AgentInfo[]) {
  const mapped = items.map<WorkspaceChannelAgentOption>((item) => ({
    id: item.name,
    name: resolveWorkspaceAgentDisplayName(item.name, item.name),
    model: item.model,
    isDefault: item.is_default,
  }));
  return mapped.sort((left, right) => {
    if (left.isDefault) return -1;
    if (right.isDefault) return 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
