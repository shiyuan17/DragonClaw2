import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { loadOpenClawFeishuChannelFormValues, pollFeishuOpenClawQrResult, requestFeishuOpenClawQr } from "../../api/channels";
import type { OpenClawChannelAccountsSnapshotResponse } from "../../types";
import type { ChannelBindingModalState } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  FEISHU_LINK_POLICY,
  FEISHU_QR_AUTO_POLL_MAX_MS,
  FEISHU_QR_AUTO_POLL_MIN_MS,
  resolveModalAccountLabel,
  toMessage,
  validateExternalUrl,
} from "./workspaceChannelBindingShared";
import { deriveWorkspaceIntegrationFlowState } from "./workspaceIntegrationFlow";

interface UseWorkspaceFeishuBindingOptions {
  setModal: Dispatch<SetStateAction<ChannelBindingModalState>>;
  setModalNotice: (value: string) => void;
  setModalError: (value: string) => void;
  refreshChannels: () => Promise<OpenClawChannelAccountsSnapshotResponse>;
  resetModalFeedback: () => void;
}

export function useWorkspaceFeishuBinding({
  setModal,
  setModalNotice,
  setModalError,
  refreshChannels,
  resetModalFeedback,
}: UseWorkspaceFeishuBindingOptions) {
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

  const feishuQrTimerRef = useRef<number>(0);
  const feishuQrCheckingRef = useRef(false);

  useEffect(() => {
    feishuQrCheckingRef.current = feishuQrChecking;
  }, [feishuQrChecking]);

  const clearFeishuQrTimer = useCallback(() => {
    if (feishuQrTimerRef.current) {
      window.clearInterval(feishuQrTimerRef.current);
      feishuQrTimerRef.current = 0;
    }
  }, []);

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

  const applyFeishuPollResult = useCallback(async (
    pollResult: Awaited<ReturnType<typeof pollFeishuOpenClawQrResult>>,
  ) => {
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
    }
  }, [clearFeishuQrTimer, refreshChannels, setModal, setModalError, setModalNotice]);

  const startFeishuPolling = useCallback((deviceCode: string, intervalSeconds: number) => {
    clearFeishuQrTimer();
    const intervalMs = Math.max(
      FEISHU_QR_AUTO_POLL_MIN_MS,
      Math.min(FEISHU_QR_AUTO_POLL_MAX_MS, intervalSeconds * 1000),
    );
    feishuQrTimerRef.current = window.setInterval(() => {
      void (async () => {
        if (feishuQrCheckingRef.current) {
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
  }, [applyFeishuPollResult, clearFeishuQrTimer, setModalError]);

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
      setModalNotice("创建码已刷新，请尽快扫码完成机器人创建。");
      if ((response.deviceCode ?? "").trim()) {
        startFeishuPolling((response.deviceCode ?? "").trim(), response.pollIntervalSeconds || 5);
      }
    } catch (error) {
      setModalError(toMessage(error, "获取飞书创建二维码失败。"));
    } finally {
      setFeishuQrRequesting(false);
    }
  }, [clearFeishuQrTimer, resetModalFeedback, setModalError, setModalNotice, startFeishuPolling]);

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
  }, [
    applyFeishuPollResult,
    feishuAppId,
    feishuAppSecret,
    feishuAppSecretConfigured,
    feishuQrDeviceCode,
    setModalError,
    setModalNotice,
  ]);

  const loadFeishuBindingValues = useCallback(async (accountId: string) => {
    const values = await loadOpenClawFeishuChannelFormValues(accountId);
    const nextAccountId = values.appId || accountId;
    setModal((current) => ({
      ...current,
      accountId: nextAccountId,
      accountLabel: resolveModalAccountLabel(nextAccountId),
    }));
    setFeishuAppId(values.appId);
    setFeishuAppSecret("");
    setFeishuAppSecretConfigured(values.appSecretConfigured);
    setFeishuDmPolicy(values.dmPolicy);
    setFeishuAllowFromSessionIds(values.allowFrom);
    if (values.appId && values.appSecretConfigured) {
      setModalNotice("已检测到飞书凭证，你可以直接保存绑定，或手动更新凭证。");
    }
  }, [setModal, setModalNotice]);

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

  const feishuQrVisible = useMemo(() => Boolean(feishuQrTargetUrl.trim()), [feishuQrTargetUrl]);
  const feishuFlowState = useMemo(
    () => deriveWorkspaceIntegrationFlowState({
      loading: feishuQrRequesting || feishuQrChecking,
      awaitingExternal: feishuQrVisible,
      readyToSave: Boolean(feishuAppId.trim() && (feishuAppSecretConfigured || feishuAppSecret.trim())),
    }),
    [
      feishuAppId,
      feishuAppSecret,
      feishuAppSecretConfigured,
      feishuQrChecking,
      feishuQrRequesting,
      feishuQrVisible,
    ],
  );

  useEffect(() => clearFeishuQrTimer, [clearFeishuQrTimer]);

  return {
    feishuQrRequesting,
    feishuQrChecking,
    feishuQrVisible,
    feishuFlowState,
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
    feishuAllowFromDraft,
    feishuAllowFromSessionIds,
    setFeishuAllowFromSessionIds,
    resetFeishuState,
    loadFeishuBindingValues,
    handleRequestFeishuQr,
    handleCheckFeishuQr,
    setFeishuAllowFromDraft: setFeishuAllowFromDraftValue,
    toggleFeishuManualExpanded,
    toggleFeishuAppSecretVisible,
    addFeishuAllowFromSessionId,
    removeFeishuAllowFromSessionId,
  };
}
