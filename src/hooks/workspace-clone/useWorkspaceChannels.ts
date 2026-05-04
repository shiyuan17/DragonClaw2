import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeedback } from "../useFeedback";
import type {
  AgentInfo,
  OpenClawChannelAccountsSnapshotResponse,
  OpenClawChannelQrBindingSessionSnapshot,
  WorkspaceChannelId,
} from "../../types";
import {
  clearOpenClawChannelQrBindingSession,
  loadOpenClawChannelAccountsSnapshot,
  loadOpenClawChannelFormValues,
  pollFeishuOpenClawQrResult,
  pollOpenClawChannelQrBinding,
  removeOpenClawChannelConfig,
  requestFeishuOpenClawQr,
  saveOpenClawChannelBinding,
  saveOpenClawChannelConfig,
  startOpenClawChannelQrBinding,
} from "../../api/channels";
import { WORKSPACE_CHANNEL_CATALOG, resolveWorkspaceChannelName } from "../../components/workspace-clone/workspaceCloneChannels";
import { resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import type {
  ChannelBindingModalState,
  ChannelBindingView,
  DirectoryContextMenuState,
  WorkspaceChannelAgentOption,
  WorkspaceEntity,
  WorkspaceResourceItem,
} from "../../components/workspace-clone/workspaceCloneTypes";

const WEIXIN_LINK_POLICY = {
  allowedSchemes: new Set(["https:", "http:"]),
  allowedHosts: new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  allowedHostSuffixes: ["weixin.qq.com", "qq.com", "servicewechat.com", "wechat.com"],
  allowHttpLocalhost: true,
};

const FEISHU_LINK_POLICY = {
  allowedSchemes: new Set(["https:"]),
  allowedHosts: new Set<string>(),
  allowedHostSuffixes: ["feishu.cn", "larksuite.com"],
  allowHttpLocalhost: false,
};

const WEIXIN_QR_POLL_INTERVAL_MS = 2400;
const FEISHU_QR_AUTO_POLL_MIN_MS = 1500;
const FEISHU_QR_AUTO_POLL_MAX_MS = 30000;

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function validateExternalUrl(
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

function resolveChannelView(channelId: string, fallback?: ChannelBindingView): ChannelBindingView {
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

function buildChannelEntityId(channelId: string, accountId: string) {
  return `channel:${channelId}:${accountId}`;
}

function buildCatalogEntityId(channelId: string) {
  return `catalog:${channelId}`;
}

function resolveModalAccountLabel(accountId?: string | null) {
  const value = (accountId ?? "").trim();
  if (!value || value.toLowerCase() === "default") {
    return "主账号";
  }
  return value;
}

function resolveChannelAvatarLabel(name: string) {
  return name.trim().slice(0, 1) || "C";
}

function resolveAgentOptions(items: AgentInfo[]) {
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

export interface UseWorkspaceChannelsOptions {
  configVersion: number;
  enabled?: boolean;
}

export function useWorkspaceChannels({ configVersion, enabled = false }: UseWorkspaceChannelsOptions) {
  const { pushFeedback } = useFeedback();
  const [snapshot, setSnapshot] = useState<OpenClawChannelAccountsSnapshotResponse | null>(null);
  const [agents, setAgents] = useState<WorkspaceChannelAgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<DirectoryContextMenuState>(null);
  const [modal, setModal] = useState<ChannelBindingModalState>({
    open: false,
    channelId: "",
    channelName: "",
    accountId: "default",
    accountLabel: "主账号",
    view: "wechat",
    implemented: false,
  });
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalNotice, setModalNotice] = useState("");
  const [modalError, setModalError] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("main");
  const [weixinQrStarting, setWeixinQrStarting] = useState(false);
  const [weixinQrPolling, setWeixinQrPolling] = useState(false);
  const [weixinQrSnapshot, setWeixinQrSnapshot] = useState<OpenClawChannelQrBindingSessionSnapshot | null>(null);
  const [weixinQrImageUrl, setWeixinQrImageUrl] = useState("");
  const [weixinQrRenderError, setWeixinQrRenderError] = useState("");
  const [feishuQrRequesting, setFeishuQrRequesting] = useState(false);
  const [feishuQrChecking, setFeishuQrChecking] = useState(false);
  const [feishuQrTargetUrl, setFeishuQrTargetUrl] = useState("");
  const [feishuQrDeviceCode, setFeishuQrDeviceCode] = useState("");
  const [feishuQrUserCode, setFeishuQrUserCode] = useState("");
  const [feishuQrPollIntervalSeconds, setFeishuQrPollIntervalSeconds] = useState(5);
  const [feishuQrExpiresAtMs, setFeishuQrExpiresAtMs] = useState<number | null>(null);
  const [feishuAppId, setFeishuAppId] = useState("");
  const [feishuAppSecret, setFeishuAppSecret] = useState("");
  const [feishuAppSecretConfigured, setFeishuAppSecretConfigured] = useState(false);
  const [feishuDmPolicy, setFeishuDmPolicy] = useState("open");
  const [feishuManualExpanded, setFeishuManualExpanded] = useState(false);
  const [feishuAppSecretVisible, setFeishuAppSecretVisible] = useState(false);
  const [feishuAllowFromDraft, setFeishuAllowFromDraft] = useState("");
  const [feishuAllowFromSessionIds, setFeishuAllowFromSessionIds] = useState<string[]>([]);

  const weixinQrTimerRef = useRef<number>(0);
  const channelRefreshSeqRef = useRef(0);
  const weixinQrSnapshotRef = useRef<OpenClawChannelQrBindingSessionSnapshot | null>(null);
  /** Bumped in resetWeixinState so late invoke/poll responses never overwrite a newer binding attempt. */
  const weixinQrBindingGenerationRef = useRef(0);
  /** Cleared when polling stops; stale poll callbacks must not apply snapshots from an old sessionId. */
  const weixinQrActivePollSessionRef = useRef<string>("");
  /** Latest closeBindingModal; success handler runs later so it calls via ref. */
  const closeBindingModalRef = useRef<(() => Promise<void>) | null>(null);
  const feishuQrTimerRef = useRef<number>(0);

  const clearWeixinQrTimer = useCallback(() => {
    if (weixinQrTimerRef.current) {
      window.clearInterval(weixinQrTimerRef.current);
      weixinQrTimerRef.current = 0;
    }
    setWeixinQrPolling(false);
    weixinQrActivePollSessionRef.current = "";
  }, []);

  const clearFeishuQrTimer = useCallback(() => {
    if (feishuQrTimerRef.current) {
      window.clearInterval(feishuQrTimerRef.current);
      feishuQrTimerRef.current = 0;
    }
  }, []);

  const resetModalFeedback = useCallback(() => {
    setModalNotice("");
    setModalError("");
  }, []);

  const resetWeixinState = useCallback(async (clearSession = true) => {
    weixinQrBindingGenerationRef.current += 1;
    clearWeixinQrTimer();
    setWeixinQrStarting(false);
    const previousSessionId = weixinQrSnapshotRef.current?.sessionId?.trim() || "";
    weixinQrSnapshotRef.current = null;
    setWeixinQrSnapshot(null);
    setWeixinQrImageUrl("");
    setWeixinQrRenderError("");
    if (clearSession && previousSessionId) {
      await clearOpenClawChannelQrBindingSession(previousSessionId).catch(() => undefined);
    }
  }, [clearWeixinQrTimer]);

  const resetFeishuState = useCallback(() => {
    clearFeishuQrTimer();
    setFeishuQrRequesting(false);
    setFeishuQrChecking(false);
    setFeishuQrTargetUrl("");
    setFeishuQrDeviceCode("");
    setFeishuQrUserCode("");
    setFeishuQrPollIntervalSeconds(5);
    setFeishuQrExpiresAtMs(null);
    setFeishuAppId("");
    setFeishuAppSecret("");
    setFeishuAppSecretConfigured(false);
    setFeishuDmPolicy("open");
    setFeishuManualExpanded(false);
    setFeishuAppSecretVisible(false);
    setFeishuAllowFromDraft("");
    setFeishuAllowFromSessionIds([]);
  }, [clearFeishuQrTimer]);

  const refreshChannels = useCallback(async () => {
    const requestId = channelRefreshSeqRef.current + 1;
    channelRefreshSeqRef.current = requestId;
    const [nextSnapshot, nextAgents] = await Promise.all([
      loadOpenClawChannelAccountsSnapshot(),
      invoke<AgentInfo[]>("list_agents").catch(() => []),
    ]);
    if (channelRefreshSeqRef.current !== requestId) {
      return nextSnapshot;
    }
    setSnapshot(nextSnapshot);
    const nextAgentOptions = resolveAgentOptions(nextAgents);
    setAgents(nextAgentOptions);
    if (nextAgentOptions.length > 0) {
      setSelectedAgentId((current) => {
        if (nextAgentOptions.some((item) => item.id === current)) {
          return current;
        }
        return nextAgentOptions.find((item) => item.isDefault)?.id || nextAgentOptions[0]?.id || "main";
      });
    }
    return nextSnapshot;
  }, []);

  useEffect(() => {
    if (!enabled) {
      channelRefreshSeqRef.current += 1;
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    void refreshChannels()
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      channelRefreshSeqRef.current += 1;
      setLoading(false);
    };
  }, [configVersion, enabled, refreshChannels]);

  useEffect(() => () => {
    void resetWeixinState(true);
    clearFeishuQrTimer();
  }, [clearFeishuQrTimer, resetWeixinState]);

  const channelGroupMap = useMemo(() => {
    const map = new Map<string, OpenClawChannelAccountsSnapshotResponse["channels"][number]>();
    snapshot?.channels.forEach((group) => {
      map.set(group.channelType, group);
    });
    return map;
  }, [snapshot]);

  const channelEntities = useMemo<WorkspaceEntity[]>(() => {
    const boundEntities = (snapshot?.channels || []).flatMap((group) =>
      group.accounts
        .filter((account) => Boolean(account.agentId))
        .map<WorkspaceEntity>((account) => {
          const channelId = group.channelType as WorkspaceChannelId;
          const catalog = WORKSPACE_CHANNEL_CATALOG.find((item) => item.id === channelId);
          return {
            id: buildChannelEntityId(channelId, account.accountId),
            entityType: "channels",
            name: `${resolveWorkspaceChannelName(channelId)} / ${account.name}`,
            subtitle: account.agentId ? `已绑定到 ${account.agentId}` : "已配置，待绑定 Agent",
            status: account.agentId ? "online" : "busy",
            avatarLabel: resolveChannelAvatarLabel(resolveWorkspaceChannelName(channelId)),
            accent: channelId,
            iconSrc: catalog?.icon,
            channelId,
            channelAccountId: account.accountId,
            runtimeAgentId: account.agentId || null,
            isBoundChannel: true,
            implemented: Boolean(catalog?.implemented),
            currentWork: account.agentId
              ? "选中后会复用绑定 Agent 的主会话。"
              : "当前账号已配置完成，请补充绑定 Agent。",
            recentOutput: account.isDefault ? "默认频道账号" : "频道账号",
            channelLabel: account.accountId,
            actionLabel: "查看",
            emptyHint: account.agentId ? "" : "当前频道账号尚未绑定 Agent，请先完成绑定。",
          };
        }),
    );

    const catalogEntities = WORKSPACE_CHANNEL_CATALOG.map<WorkspaceEntity>((catalog) => {
      const group = channelGroupMap.get(catalog.id);
      const boundCount = group?.accounts.filter((account) => Boolean(account.agentId)).length || 0;
      const configuredCount = group?.accounts.filter((account) => account.configured).length || 0;
      const subtitle = boundCount > 0
        ? `已绑定 ${boundCount} 个账号`
        : configuredCount > 0
          ? `已配置 ${configuredCount} 个账号，待绑定 Agent`
          : catalog.description;
      const emptyHint = catalog.implemented
        ? "当前频道未绑定 Agent，请先完成二维码或凭证接入。"
        : "暂未开放自动接入，当前版本只保留目录与配置占位。";

      return {
        id: buildCatalogEntityId(catalog.id),
        entityType: "channels",
        name: catalog.name,
        subtitle,
        status: boundCount > 0 ? "online" : configuredCount > 0 ? "busy" : "offline",
        avatarLabel: resolveChannelAvatarLabel(catalog.name),
        accent: catalog.id,
        iconSrc: catalog.icon,
        channelId: catalog.id,
        channelAccountId: group?.defaultAccountId || "default",
        runtimeAgentId: null,
        isCatalogEntry: true,
        implemented: catalog.implemented,
        currentWork: emptyHint,
        recentOutput: catalog.implemented ? "点击绑定后可接入 Agent 主会话" : "本期保留占位目录卡片",
        actionLabel: boundCount > 0 ? "查看" : "绑定",
        emptyHint,
      };
    });

    return [...boundEntities, ...catalogEntities];
  }, [channelGroupMap, snapshot?.channels]);

  const channelResourceItems = useMemo<WorkspaceResourceItem[]>(() => {
    const boundItems = channelEntities
      .filter((entity) => entity.isBoundChannel)
      .map((entity) => ({
        id: entity.id,
        title: entity.name,
        subtitle: entity.runtimeAgentId
          ? `主会话复用 ${entity.runtimeAgentId}`
          : entity.emptyHint || "待补充 Agent 绑定",
        tag: entity.runtimeAgentId ? "已绑定" : "待完成",
      }));

    if (boundItems.length > 0) {
      return boundItems;
    }

    return WORKSPACE_CHANNEL_CATALOG.map((catalog) => ({
      id: catalog.id,
      title: catalog.name,
      subtitle: catalog.implemented ? "点击绑定后可接入 Agent 主会话" : "暂未开放自动接入",
      tag: catalog.implemented ? "待接入" : "占位",
    }));
  }, [channelEntities]);

  const sanitizeWeixinQrSnapshot = useCallback((
    snapshot: OpenClawChannelQrBindingSessionSnapshot,
    previousSnapshot?: OpenClawChannelQrBindingSessionSnapshot | null,
  ) => {
    const previous = previousSnapshot ?? null;
    const normalizedStatus = (snapshot.status || "").trim().toLowerCase();
    const shouldPreserveActiveQr = normalizedStatus !== "success" && normalizedStatus !== "error";
    const rawUrl = snapshot.qrUrl?.trim()
      || (shouldPreserveActiveQr ? previous?.qrUrl?.trim() || "" : "");
    const nextSnapshot: OpenClawChannelQrBindingSessionSnapshot = {
      ...snapshot,
      sessionId: snapshot.sessionId?.trim() || previous?.sessionId?.trim() || "",
      channelType: snapshot.channelType?.trim() || previous?.channelType?.trim() || "weixin",
      qrUrl: rawUrl || null,
      qrAscii: snapshot.qrAscii?.trim() || (shouldPreserveActiveQr ? previous?.qrAscii?.trim() || "" : "") || null,
    };
    if (!rawUrl) {
      return nextSnapshot;
    }
    const validated = validateExternalUrl(rawUrl, WEIXIN_LINK_POLICY);
    if (!validated.ok) {
      return {
        ...nextSnapshot,
        status: "error",
        qrUrl: null,
        detail: `已拦截不安全二维码链接: ${validated.reason}`,
      };
    }
    return {
      ...nextSnapshot,
      qrUrl: validated.url.toString(),
    };
  }, []);

  const applyWeixinQrSnapshot = useCallback((snapshot: OpenClawChannelQrBindingSessionSnapshot) => {
    const nextSnapshot = sanitizeWeixinQrSnapshot(snapshot, weixinQrSnapshotRef.current);
    weixinQrSnapshotRef.current = nextSnapshot;
    setWeixinQrSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [sanitizeWeixinQrSnapshot]);

  const weixinQrUrl = useMemo(() => (weixinQrSnapshot?.qrUrl ?? "").trim(), [weixinQrSnapshot?.qrUrl]);

  const hasActiveWeixinQrSession = useMemo(
    () =>
      weixinQrStarting
      || weixinQrPolling
      || Boolean(weixinQrSnapshot?.sessionId?.trim())
      || Boolean(weixinQrUrl),
    [weixinQrPolling, weixinQrSnapshot?.sessionId, weixinQrStarting, weixinQrUrl],
  );

  const resolveSelectedAgentForAutoBinding = useCallback(() => {
    const normalized = selectedAgentId.trim();
    if (normalized && agents.some((item) => item.id === normalized)) {
      return normalized;
    }
    return agents.find((item) => item.isDefault)?.id || agents[0]?.id || "";
  }, [agents, selectedAgentId]);

  const applySuccessfulWeixinQrBinding = useCallback(async (
    snapshot: OpenClawChannelQrBindingSessionSnapshot,
  ) => {
    const nextConfig = await refreshChannels();
    const group = nextConfig.channels.find((item) => item.channelType === "weixin");
    const accountId = group?.defaultAccountId || group?.accounts[0]?.accountId || "default";
    setModal((current) => ({
      ...current,
      accountId,
      accountLabel: resolveModalAccountLabel(accountId),
    }));

    const targetAgentId = resolveSelectedAgentForAutoBinding();
    if (!targetAgentId) {
      setModalNotice(
        snapshot.detail?.trim()
        || "微信已绑定成功，但未检测到可用数字员工，请先在「数字员工」中创建后再打开本弹窗完成关联。",
      );
      setModalError("");
      return;
    }

    await saveOpenClawChannelBinding({
      channelType: "weixin",
      accountId,
      agentId: targetAgentId,
      preferredDmScope: "per-channel-peer",
    });
    await refreshChannels();
    setSelectedAgentId(targetAgentId);
    const successHint =
      snapshot.detail?.trim()
      || `绑定成功，已关联数字员工「${targetAgentId}」。`;
    setModalNotice(successHint);
    setModalError("");
    globalThis.setTimeout(() => {
      void closeBindingModalRef.current?.();
    }, 1100);
  }, [refreshChannels, resolveSelectedAgentForAutoBinding]);

  useEffect(() => {
    if (!weixinQrUrl) {
      setWeixinQrImageUrl("");
      setWeixinQrRenderError("");
      return;
    }
    let disposed = false;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(weixinQrUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 260,
      }))
      .then((imageUrl) => {
        if (disposed) {
          return;
        }
        setWeixinQrImageUrl(imageUrl);
        setWeixinQrRenderError("");
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        setWeixinQrImageUrl("");
        setWeixinQrRenderError("二维码渲染失败，请刷新二维码后重试。");
      });
    return () => {
      disposed = true;
    };
  }, [weixinQrUrl]);

  const startWeixinPolling = useCallback((sessionId: string) => {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }
    clearWeixinQrTimer();
    setWeixinQrPolling(true);
    weixinQrActivePollSessionRef.current = normalizedSessionId;
    const runPoll = () => {
      void (async () => {
        const polledSessionId = normalizedSessionId;
        try {
          const rawSnapshot = await pollOpenClawChannelQrBinding(polledSessionId);
          if (weixinQrActivePollSessionRef.current !== polledSessionId) {
            return;
          }
          const nextSnapshot = applyWeixinQrSnapshot(rawSnapshot);
          const status = (nextSnapshot.status || "").trim().toLowerCase();
          if (status === "success") {
            clearWeixinQrTimer();
            await applySuccessfulWeixinQrBinding(nextSnapshot);
          } else if (status === "error") {
            clearWeixinQrTimer();
            setModalError(nextSnapshot.detail?.trim() || "微信二维码绑定失败，请重试。");
          } else if ((nextSnapshot.qrUrl ?? "").trim()) {
            setModalNotice(nextSnapshot.detail?.trim() || "二维码已生成，请使用微信扫码。");
          }
        } catch (error) {
          if (weixinQrActivePollSessionRef.current !== polledSessionId) {
            return;
          }
          clearWeixinQrTimer();
          setModalError(toMessage(error, "读取微信二维码状态失败。"));
        }
      })();
    };
    runPoll();
    weixinQrTimerRef.current = window.setInterval(runPoll, WEIXIN_QR_POLL_INTERVAL_MS);
  }, [applySuccessfulWeixinQrBinding, applyWeixinQrSnapshot, clearWeixinQrTimer]);

  const startWeixinQrBindingFlow = useCallback(async () => {
    resetModalFeedback();
    await resetWeixinState(true);
    const bindingGeneration = weixinQrBindingGenerationRef.current;
    setWeixinQrStarting(true);
    try {
      const rawSnapshot = await startOpenClawChannelQrBinding("weixin");
      if (bindingGeneration !== weixinQrBindingGenerationRef.current) {
        return;
      }
      const nextSnapshot = applyWeixinQrSnapshot(rawSnapshot);
      const status = (nextSnapshot.status || "").trim().toLowerCase();
      if (status === "success") {
        await applySuccessfulWeixinQrBinding(nextSnapshot);
        return;
      }
      if (status === "error") {
        setModalError(nextSnapshot.detail?.trim() || "微信二维码绑定失败，请重试。");
        return;
      }
      if (nextSnapshot.sessionId) {
        startWeixinPolling(nextSnapshot.sessionId);
      }
      if ((nextSnapshot.qrUrl ?? "").trim()) {
        setModalNotice(nextSnapshot.detail?.trim() || "二维码已生成，请使用微信扫码。");
      }
    } catch (error) {
      if (bindingGeneration === weixinQrBindingGenerationRef.current) {
        setModalError(toMessage(error, "启动微信二维码绑定失败。"));
      }
    } finally {
      if (bindingGeneration === weixinQrBindingGenerationRef.current) {
        setWeixinQrStarting(false);
      }
    }
  }, [applySuccessfulWeixinQrBinding, applyWeixinQrSnapshot, resetModalFeedback, resetWeixinState, startWeixinPolling]);

  const applyFeishuPollResult = useCallback(async (pollResult: Awaited<ReturnType<typeof pollFeishuOpenClawQrResult>>) => {
    const normalizedStatus = (pollResult.status ?? "").trim().toLowerCase();
    const appId = typeof pollResult.appId === "string" ? pollResult.appId.trim() : "";
    const pollMessage = typeof pollResult.message === "string" ? pollResult.message.trim() : "";

    if (normalizedStatus === "success" && appId) {
      clearFeishuQrTimer();
      setModal((current) => ({
        ...current,
        accountId: appId,
        accountLabel: resolveModalAccountLabel(appId),
        view: "manual",
      }));
      setFeishuAppId(appId);
      setFeishuAppSecret("");
      setFeishuAppSecretConfigured(true);
      setModalNotice(pollMessage || "已自动获取飞书凭证，请选择 Agent 并保存绑定。");
      setModalError("");
      await refreshChannels();
      return;
    }

    if (normalizedStatus === "pending") {
      setModalNotice(pollMessage || "飞书侧尚未完成授权，请扫码后稍候。");
      return;
    }

    clearFeishuQrTimer();
    if (normalizedStatus === "denied") {
      setModalError(pollMessage || "你已拒绝授权，请重新获取二维码。");
      return;
    }
    if (normalizedStatus === "expired") {
      setModalError(pollMessage || "创建码已过期，请重新获取。");
      return;
    }
    if (normalizedStatus === "error") {
      setModalError(pollMessage || "获取飞书凭证失败，请稍后重试。");
      return;
    }
  }, [clearFeishuQrTimer, refreshChannels]);

  const startFeishuPolling = useCallback((deviceCode: string, intervalSeconds: number) => {
    clearFeishuQrTimer();
    const intervalMs = Math.max(
      FEISHU_QR_AUTO_POLL_MIN_MS,
      Math.min(FEISHU_QR_AUTO_POLL_MAX_MS, intervalSeconds * 1000),
    );
    feishuQrTimerRef.current = window.setInterval(() => {
      void (async () => {
        if (feishuQrChecking) {
          return;
        }
        try {
          setFeishuQrChecking(true);
          const pollResult = await pollFeishuOpenClawQrResult(deviceCode);
          await applyFeishuPollResult(pollResult);
        } catch (error) {
          clearFeishuQrTimer();
          setModalError(toMessage(error, "检查飞书状态失败。"));
        } finally {
          setFeishuQrChecking(false);
        }
      })();
    }, intervalMs);
  }, [applyFeishuPollResult, clearFeishuQrTimer, feishuQrChecking]);

  const openBindingModal = useCallback(async (entity: WorkspaceEntity) => {
    if (!entity.channelId) {
      return;
    }

    if (!snapshot) {
      await refreshChannels().catch(() => undefined);
    }

    await resetWeixinState(true);
    resetFeishuState();
    resetModalFeedback();
    setContextMenu(null);
    setModal({
      open: true,
      channelId: entity.channelId,
      channelName: resolveWorkspaceChannelName(entity.channelId),
      accountId: entity.channelAccountId || "default",
      accountLabel: resolveModalAccountLabel(entity.channelLabel || entity.channelAccountId || "default"),
      view: resolveChannelView(entity.channelId, entity.channelId === "feishu" ? "feishu" : "wechat"),
      implemented: Boolean(entity.implemented),
    });
    setSelectedAgentId(entity.runtimeAgentId || agents.find((item) => item.isDefault)?.id || agents[0]?.id || "main");

    if (!entity.implemented) {
      setModalNotice("暂未开放自动接入，本期仅保留目录卡片与配置占位。");
      return;
    }

    setModalLoading(true);
    try {
      if (entity.channelId === "feishu") {
        const values = await loadOpenClawChannelFormValues({
          channelType: "feishu",
          accountId: entity.channelAccountId || "default",
        });
        const nextAccountId = values.appId?.trim() || entity.channelAccountId || "default";
        setModal((current) => ({
          ...current,
          accountId: nextAccountId,
          accountLabel: resolveModalAccountLabel(nextAccountId),
        }));
        setFeishuAppId(values.appId ?? "");
        setFeishuAppSecret("");
        setFeishuAppSecretConfigured((values.appSecretConfigured ?? "").trim().toLowerCase() === "true");
        setFeishuDmPolicy((values.dmPolicy ?? "open").trim() || "open");
        const nextAllowFrom = (values.allowFrom ?? "")
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item, index, array) => array.indexOf(item) === index);
        setFeishuAllowFromSessionIds(nextAllowFrom.filter((item) => item !== "*"));
        if ((values.appId ?? "").trim() && (values.appSecretConfigured ?? "").trim().toLowerCase() === "true") {
          setModalNotice("已检测到飞书凭证，你可以直接保存绑定，或手动更新凭证。");
        }
      }
      if (entity.channelId === "weixin") {
        const nextAccountId = entity.channelAccountId || channelGroupMap.get("weixin")?.defaultAccountId || "default";
        const hasConfiguredAccount = channelGroupMap
          .get("weixin")
          ?.accounts.some((account) => account.accountId === nextAccountId && account.configured) || false;
        setModal((current) => ({
          ...current,
          accountId: nextAccountId,
          accountLabel: resolveModalAccountLabel(nextAccountId),
        }));
        if (hasConfiguredAccount) {
          setModalNotice("当前微信频道已绑定，可在上方刷新二维码重新绑定。");
        }
      }
    } catch (error) {
      setModalError(toMessage(error, "读取频道配置失败。"));
    } finally {
      setModalLoading(false);
    }
    if (entity.channelId === "weixin") {
      const nextAccountId = entity.channelAccountId || channelGroupMap.get("weixin")?.defaultAccountId || "default";
      const hasConfiguredAccount = channelGroupMap
        .get("weixin")
        ?.accounts.some((account) => account.accountId === nextAccountId && account.configured) || false;
      if (!hasConfiguredAccount) {
        void startWeixinQrBindingFlow();
      }
    }
  }, [agents, channelGroupMap, refreshChannels, resetFeishuState, resetModalFeedback, resetWeixinState, snapshot, startWeixinQrBindingFlow]);

  const closeBindingModal = useCallback(async () => {
    setModal((current) => ({ ...current, open: false }));
    setModalLoading(false);
    setModalSaving(false);
    resetModalFeedback();
    await resetWeixinState(true);
    resetFeishuState();
  }, [resetFeishuState, resetModalFeedback, resetWeixinState]);

  closeBindingModalRef.current = closeBindingModal;

  const handleOpenExternalBindingLink = useCallback(async (rawUrl: string, channelId: WorkspaceChannelId | string) => {
    const policy = channelId === "feishu" ? FEISHU_LINK_POLICY : WEIXIN_LINK_POLICY;
    const validated = validateExternalUrl(rawUrl, policy);
    if (!validated.ok) {
      setModalError(`已拦截不安全外链: ${validated.reason}`);
      return;
    }
    try {
      await invoke("open_url", { url: validated.url.toString() });
    } catch (error) {
      setModalError(toMessage(error, "打开外链失败。"));
    }
  }, []);

  const handleRequestFeishuQr = useCallback(async () => {
    resetModalFeedback();
    clearFeishuQrTimer();
    setFeishuQrRequesting(true);
    try {
      const response = await requestFeishuOpenClawQr();
      const validated = validateExternalUrl(response.qrUrl ?? "", FEISHU_LINK_POLICY);
      if (!validated.ok) {
        throw new Error(`飞书返回了不安全的创建链接: ${validated.reason}`);
      }
      setFeishuQrTargetUrl(validated.url.toString());
      setFeishuQrDeviceCode((response.deviceCode ?? "").trim());
      setFeishuQrUserCode((response.userCode ?? "").trim());
      setFeishuQrPollIntervalSeconds(Number.isFinite(response.pollIntervalSeconds) ? response.pollIntervalSeconds : 5);
      setFeishuQrExpiresAtMs(Number.isFinite(response.expiresAtMs) ? response.expiresAtMs : null);
      setModalNotice("创建码已更新，请尽快扫码完成机器人创建。");
      if ((response.deviceCode ?? "").trim()) {
        startFeishuPolling((response.deviceCode ?? "").trim(), response.pollIntervalSeconds || 5);
      }
    } catch (error) {
      setModalError(toMessage(error, "获取飞书创建二维码失败。"));
    } finally {
      setFeishuQrRequesting(false);
    }
  }, [clearFeishuQrTimer, resetModalFeedback, startFeishuPolling]);

  const handleCheckFeishuQr = useCallback(async () => {
    const deviceCode = feishuQrDeviceCode.trim();
    if (!deviceCode) {
      if (feishuAppId.trim() && feishuAppSecretConfigured) {
        setModalNotice("已保存飞书凭证，可以直接保存绑定。");
      } else if (feishuAppId.trim() && feishuAppSecret.trim()) {
        setModalNotice("已填写飞书凭证，可以直接保存绑定。");
      } else {
        setModalError("未检测到创建码，请先获取二维码。");
      }
      return;
    }

    try {
      setFeishuQrChecking(true);
      const result = await pollFeishuOpenClawQrResult(deviceCode);
      await applyFeishuPollResult(result);
    } catch (error) {
      setModalError(toMessage(error, "检查飞书状态失败。"));
    } finally {
      setFeishuQrChecking(false);
    }
  }, [applyFeishuPollResult, feishuAppId, feishuAppSecret, feishuAppSecretConfigured, feishuQrDeviceCode]);

  const setFeishuAllowFromDraftValue = useCallback((value: string) => {
    setFeishuAllowFromDraft(value);
  }, []);

  const toggleFeishuManualExpanded = useCallback(() => {
    setFeishuManualExpanded((current) => !current);
  }, []);

  const toggleFeishuAppSecretVisible = useCallback(() => {
    setFeishuAppSecretVisible((current) => !current);
  }, []);

  const addFeishuAllowFromSessionId = useCallback(() => {
    const nextValue = feishuAllowFromDraft.trim();
    if (!nextValue) {
      return;
    }
    setFeishuAllowFromSessionIds((current) =>
      current.some((item) => item.toLowerCase() === nextValue.toLowerCase()) ? current : [...current, nextValue],
    );
    setFeishuAllowFromDraft("");
  }, [feishuAllowFromDraft]);

  const removeFeishuAllowFromSessionId = useCallback((sessionId: string) => {
    setFeishuAllowFromSessionIds((current) => current.filter((item) => item !== sessionId));
  }, []);

  const activeWeixinGroup = useMemo(
    () => (modal.channelId === "weixin" ? channelGroupMap.get("weixin") : null),
    [channelGroupMap, modal.channelId],
  );

  const isCurrentWeixinChannelAlreadyBound = useMemo(() => {
    if (!activeWeixinGroup) {
      return false;
    }
    const currentAccountId = modal.accountId.trim() || activeWeixinGroup.defaultAccountId || "default";
    return activeWeixinGroup.accounts.some(
      (account) => account.accountId === currentAccountId && account.configured,
    );
  }, [activeWeixinGroup, modal.accountId]);

  const weixinQrStatusTone = useMemo(() => {
    if (modal.channelId !== "weixin") {
      return "pending";
    }
    if (modalError.trim() || weixinQrRenderError.trim()) {
      return "error";
    }
    const status = (weixinQrSnapshot?.status || "").trim().toLowerCase();
    if (status === "success" || (isCurrentWeixinChannelAlreadyBound && !hasActiveWeixinQrSession)) {
      return "success";
    }
    return "pending";
  }, [
    hasActiveWeixinQrSession,
    isCurrentWeixinChannelAlreadyBound,
    modal.channelId,
    modalError,
    weixinQrRenderError,
    weixinQrSnapshot?.status,
  ]);

  const weixinQrStatusText = useMemo(() => {
    if (modal.channelId !== "weixin") {
      return "";
    }
    if (modalError.trim()) {
      return modalError.trim();
    }
    if (weixinQrRenderError.trim()) {
      return weixinQrRenderError.trim();
    }
    if (weixinQrStarting) {
      return "正在获取二维码，请稍候...";
    }
    if (weixinQrUrl) {
      return weixinQrSnapshot?.detail?.trim() || "等待扫码...";
    }
    if (hasActiveWeixinQrSession) {
      return "二维码加载中...";
    }
    if (isCurrentWeixinChannelAlreadyBound) {
      return modalNotice.trim() || "当前微信频道已绑定，可刷新二维码重新绑定。";
    }
    return modalNotice.trim() || "二维码加载中...";
  }, [
    hasActiveWeixinQrSession,
    isCurrentWeixinChannelAlreadyBound,
    modal.channelId,
    modalError,
    modalNotice,
    weixinQrSnapshot?.detail,
    weixinQrRenderError,
    weixinQrStarting,
    weixinQrUrl,
  ]);

  const weixinQrLogs = useMemo(
    () =>
      (weixinQrSnapshot?.logs || [])
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(-3),
    [weixinQrSnapshot?.logs],
  );

  const feishuQrVisible = useMemo(() => Boolean(feishuQrTargetUrl.trim()), [feishuQrTargetUrl]);

  const handleSaveBinding = useCallback(async () => {
    if (!modal.channelId || !modal.implemented) {
      return;
    }
    if (!selectedAgentId.trim()) {
      setModalError("请选择要接待该频道的 Agent。");
      return;
    }

    setModalSaving(true);
    resetModalFeedback();
    try {
      if (modal.channelId === "feishu") {
        const nextAccountId = feishuAppId.trim() || modal.accountId.trim() || "default";
        if (!feishuAppId.trim() && !feishuAppSecretConfigured && !feishuAppSecret.trim()) {
          throw new Error("请先完成飞书二维码授权，或手动填写 App ID / App Secret。");
        }
        if (feishuAppId.trim() && feishuAppSecret.trim()) {
          await saveOpenClawChannelConfig({
            channelType: "feishu",
            accountId: nextAccountId,
            config: {
              appId: feishuAppId.trim(),
              appSecret: feishuAppSecret.trim(),
              domain: "feishu",
              name: nextAccountId,
            },
          });
        }
        await saveOpenClawChannelConfig({
          channelType: "feishu",
          accountId: nextAccountId,
          config: {
            dmPolicy: feishuDmPolicy,
            allowFrom:
              feishuDmPolicy === "allowlist" ? feishuAllowFromSessionIds.join("\n") : "",
          },
        });
        await saveOpenClawChannelBinding({
          channelType: "feishu",
          accountId: nextAccountId,
          agentId: selectedAgentId,
          preferredDmScope: "per-channel-peer",
        });
      } else if (modal.channelId === "weixin") {
        const nextAccountId = modal.accountId.trim() || "default";
        const currentStatus = (weixinQrSnapshot?.status || "").trim().toLowerCase();
        const hasConfiguredAccount = Boolean(
          channelGroupMap
            .get("weixin")
            ?.accounts.some((account) => account.accountId === nextAccountId && account.configured),
        );
        if (!hasConfiguredAccount && currentStatus !== "success") {
          throw new Error("请先完成微信二维码绑定，再保存 Agent 绑定。");
        }
        await saveOpenClawChannelBinding({
          channelType: "weixin",
          accountId: nextAccountId,
          agentId: selectedAgentId,
          preferredDmScope: "per-channel-peer",
        });
      }

      await refreshChannels();
      pushFeedback({
        tone: "success",
        message: "频道绑定已保存。",
        dedupeKey: "workspace-channel-save-success",
        persistent: false,
      });
      await closeBindingModal();
    } catch (error) {
      setModalError(toMessage(error, "保存频道绑定失败。"));
    } finally {
      setModalSaving(false);
    }
  }, [
    channelGroupMap,
    closeBindingModal,
    feishuAllowFromSessionIds,
    feishuAppId,
    feishuAppSecret,
    feishuAppSecretConfigured,
    feishuDmPolicy,
    modal.accountId,
    modal.channelId,
    modal.implemented,
    refreshChannels,
    resetModalFeedback,
    selectedAgentId,
    weixinQrSnapshot?.status,
  ]);

  const handleRemoveBinding = useCallback(async (entity: WorkspaceEntity) => {
    if (!entity.channelId) {
      return;
    }
    const confirmed = window.confirm(`确认删除 ${entity.name} 的频道配置吗？`);
    if (!confirmed) {
      return;
    }
    try {
      await removeOpenClawChannelConfig({
        channelType: entity.channelId,
        accountId: entity.channelAccountId || null,
      });
      await refreshChannels();
      setContextMenu(null);
      pushFeedback({
        tone: "success",
        message: `${entity.name} 已移除绑定。`,
        dedupeKey: "workspace-channel-remove-success",
        persistent: false,
      });
    } catch (error) {
      setModalError(toMessage(error, "删除频道配置失败。"));
    }
  }, [refreshChannels]);

  return {
    loading,
    contextMenu,
    setContextMenu,
    channelEntities,
    channelResourceItems,
    agents,
    modal,
    setModal,
    modalLoading,
    modalSaving,
    modalNotice,
    modalError,
    selectedAgentId,
    setSelectedAgentId,
    weixinQrStarting,
    weixinQrPolling,
    weixinQrSnapshot,
    weixinQrImageUrl,
    weixinQrUrl,
    weixinQrLogs,
    hasActiveWeixinQrSession,
    isCurrentWeixinChannelAlreadyBound,
    weixinQrStatusTone,
    weixinQrStatusText,
    feishuQrRequesting,
    feishuQrChecking,
    feishuQrVisible,
    feishuQrTargetUrl,
    feishuQrDeviceCode,
    feishuQrUserCode,
    feishuQrPollIntervalSeconds,
    feishuQrExpiresAtMs,
    feishuAppId,
    setFeishuAppId,
    feishuAppSecret,
    setFeishuAppSecret,
    feishuAppSecretConfigured,
    feishuDmPolicy,
    setFeishuDmPolicy,
    feishuManualExpanded,
    feishuAppSecretVisible,
    toggleFeishuManualExpanded,
    toggleFeishuAppSecretVisible,
    feishuAllowFromDraft,
    setFeishuAllowFromDraft: setFeishuAllowFromDraftValue,
    feishuAllowFromSessionIds,
    setFeishuAllowFromSessionIds,
    addFeishuAllowFromSessionId,
    removeFeishuAllowFromSessionId,
    refreshChannels,
    openBindingModal,
    closeBindingModal,
    handleSaveBinding,
    handleRemoveBinding,
    handleOpenExternalBindingLink,
    handleRequestFeishuQr,
    handleCheckFeishuQr,
    startWeixinQrBindingFlow,
  };
}
