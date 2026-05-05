import { useCallback, useEffect, useMemo, useState } from "react";
import { loadImapSmtpEmailBinding, saveImapSmtpEmailBinding } from "../../api/emailSkillBinding";
import { useFeedback } from "../useFeedback";
import type { EmailSkillBindingProvider, EmailSkillBindingSnapshot } from "../../types";
import { deriveWorkspaceIntegrationFlowState } from "./workspaceIntegrationFlow";

type WorkspaceEmailBindingProvider = Exclude<EmailSkillBindingProvider, ""> | "";

interface ProviderDefaults {
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  imapTls: boolean;
  smtpSecure: boolean;
}

const PROVIDER_ORDER: WorkspaceEmailBindingProvider[] = [
  "qq",
  "163",
  "gmail",
  "outlook",
  "sina",
  "sohu",
  "custom",
  "",
];

const EMAIL_PROVIDER_DEFAULTS: Record<Exclude<WorkspaceEmailBindingProvider, "">, ProviderDefaults> = {
  qq: {
    imapHost: "imap.qq.com",
    imapPort: "993",
    smtpHost: "smtp.qq.com",
    smtpPort: "587",
    imapTls: true,
    smtpSecure: false,
  },
  "163": {
    imapHost: "imap.163.com",
    imapPort: "993",
    smtpHost: "smtp.163.com",
    smtpPort: "465",
    imapTls: true,
    smtpSecure: true,
  },
  gmail: {
    imapHost: "imap.gmail.com",
    imapPort: "993",
    smtpHost: "smtp.gmail.com",
    smtpPort: "587",
    imapTls: true,
    smtpSecure: false,
  },
  outlook: {
    imapHost: "outlook.office365.com",
    imapPort: "993",
    smtpHost: "smtp.office365.com",
    smtpPort: "587",
    imapTls: true,
    smtpSecure: false,
  },
  sina: {
    imapHost: "imap.sina.com",
    imapPort: "993",
    smtpHost: "smtp.sina.com",
    smtpPort: "465",
    imapTls: true,
    smtpSecure: true,
  },
  sohu: {
    imapHost: "imap.sohu.com",
    imapPort: "993",
    smtpHost: "smtp.sohu.com",
    smtpPort: "465",
    imapTls: true,
    smtpSecure: true,
  },
  custom: {
    imapHost: "",
    imapPort: "993",
    smtpHost: "",
    smtpPort: "465",
    imapTls: true,
    smtpSecure: true,
  },
};

const EMAIL_PROVIDER_LABELS: Record<Exclude<WorkspaceEmailBindingProvider, "">, string> = {
  qq: "QQ 邮箱",
  "163": "163 邮箱",
  gmail: "Gmail",
  outlook: "Outlook",
  sina: "新浪邮箱",
  sohu: "搜狐邮箱",
  custom: "其他邮箱",
};

function normalizeEmailBindingProvider(value: string): WorkspaceEmailBindingProvider {
  const normalized = value.trim().toLowerCase();
  return PROVIDER_ORDER.includes(normalized as WorkspaceEmailBindingProvider)
    ? (normalized as WorkspaceEmailBindingProvider)
    : "";
}

function getProviderDefaults(provider: WorkspaceEmailBindingProvider): ProviderDefaults {
  if (!provider) {
    return EMAIL_PROVIDER_DEFAULTS.custom;
  }
  return EMAIL_PROVIDER_DEFAULTS[provider];
}

function buildDraftFromSnapshot(snapshot: EmailSkillBindingSnapshot) {
  return {
    provider: normalizeEmailBindingProvider(snapshot.provider ?? ""),
    account: snapshot.emailAccount?.trim() || "",
    authorizationCode: "",
    customImapHost: snapshot.imapHost?.trim() || "",
    customImapPort: snapshot.imapPort?.trim() || "993",
    customSmtpHost: snapshot.smtpHost?.trim() || "",
    customSmtpPort: snapshot.smtpPort?.trim() || "465",
    customImapTls: snapshot.imapTls !== false,
    customSmtpSecure: snapshot.smtpSecure === true,
  };
}

export function useWorkspaceEmailBinding() {
  const { pushFeedback } = useFeedback();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<WorkspaceEmailBindingProvider>("");
  const [account, setAccount] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [boundProvider, setBoundProvider] = useState<WorkspaceEmailBindingProvider>("");
  const [boundAccount, setBoundAccount] = useState("");
  const [customImapHost, setCustomImapHost] = useState("");
  const [customImapPort, setCustomImapPort] = useState("993");
  const [customSmtpHost, setCustomSmtpHost] = useState("");
  const [customSmtpPort, setCustomSmtpPort] = useState("465");
  const [customImapTls, setCustomImapTls] = useState(true);
  const [customSmtpSecure, setCustomSmtpSecure] = useState(true);

  const isCustomProvider = provider === "custom";
  const isBound = Boolean(boundProvider && boundAccount);
  const boundProviderLabel = boundProvider ? EMAIL_PROVIDER_LABELS[boundProvider] : "";
  const providerOptions = useMemo(
    () =>
      (Object.keys(EMAIL_PROVIDER_LABELS) as Exclude<WorkspaceEmailBindingProvider, "">[]).map((value) => ({
        value,
        label: isBound && value === boundProvider ? `${EMAIL_PROVIDER_LABELS[value]}（已绑定）` : EMAIL_PROVIDER_LABELS[value],
      })),
    [boundProvider, isBound],
  );
  const accountPlaceholder = useMemo(() => {
    switch (provider) {
      case "qq":
        return "请输入 QQ 邮箱账号";
      case "163":
        return "请输入 163 邮箱账号";
      case "gmail":
        return "请输入 Gmail 邮箱账号";
      case "outlook":
        return "请输入 Outlook 邮箱账号";
      case "sina":
        return "请输入新浪邮箱账号";
      case "sohu":
        return "请输入搜狐邮箱账号";
      default:
        return "请输入邮箱账号";
    }
  }, [provider]);
  const flowState = useMemo(
    () => deriveWorkspaceIntegrationFlowState({
      loading,
      saving,
      readyToSave: Boolean(provider && account.trim() && authorizationCode.trim()),
      successDetail: notice,
      errorDetail: error,
      idleDetail: isBound ? `${boundProviderLabel} / ${boundAccount}` : "",
    }),
    [
      account,
      authorizationCode,
      boundAccount,
      boundProviderLabel,
      error,
      isBound,
      loading,
      notice,
      provider,
      saving,
    ],
  );

  const clearStatus = useCallback(() => {
    setNotice("");
    setError("");
  }, []);

  const resetDraft = useCallback(() => {
    const defaults = getProviderDefaults("custom");
    setProvider("");
    setAccount("");
    setAuthorizationCode("");
    setCustomImapHost(defaults.imapHost);
    setCustomImapPort(defaults.imapPort);
    setCustomSmtpHost(defaults.smtpHost);
    setCustomSmtpPort(defaults.smtpPort);
    setCustomImapTls(defaults.imapTls);
    setCustomSmtpSecure(defaults.smtpSecure);
  }, []);

  const setBoundState = useCallback(
    (
      nextProvider: WorkspaceEmailBindingProvider,
      nextAccount: string,
      hasAuthorizationCode: boolean,
    ) => {
      if (!nextProvider || !nextAccount.trim() || !hasAuthorizationCode) {
        setBoundProvider("");
        setBoundAccount("");
        return;
      }
      setBoundProvider(nextProvider);
      setBoundAccount(nextAccount.trim());
    },
    [],
  );

  const applySnapshot = useCallback(
    (snapshot: EmailSkillBindingSnapshot) => {
      const draft = buildDraftFromSnapshot(snapshot);
      setProvider(draft.provider);
      setAccount(draft.account);
      setAuthorizationCode("");
      setCustomImapHost(draft.customImapHost);
      setCustomImapPort(draft.customImapPort);
      setCustomSmtpHost(draft.customSmtpHost);
      setCustomSmtpPort(draft.customSmtpPort);
      setCustomImapTls(draft.customImapTls);
      setCustomSmtpSecure(draft.customSmtpSecure);
      setBoundState(draft.provider, draft.account, snapshot.hasAuthorizationCode === true);
    },
    [setBoundState],
  );

  const syncBoundState = useCallback(async () => {
    try {
      const snapshot = await loadImapSmtpEmailBinding();
      const nextProvider = normalizeEmailBindingProvider(snapshot.provider ?? "");
      setBoundState(
        nextProvider,
        snapshot.emailAccount?.trim() || "",
        snapshot.hasAuthorizationCode === true,
      );
    } catch {
      // Keep current UI state if the background sync fails.
    }
  }, [setBoundState]);

  const hydrateDraft = useCallback(
    async (options?: { clearStatus?: boolean }) => {
      setLoading(true);
      if (options?.clearStatus) {
        clearStatus();
      }
      try {
        const snapshot = await loadImapSmtpEmailBinding();
        applySnapshot(snapshot);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "邮箱绑定配置读取失败。");
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot, clearStatus],
  );

  const closeEmailBindingModal = useCallback(
    (options?: { clearStatus?: boolean; force?: boolean }) => {
      if (saving && !options?.force) {
        return;
      }
      setIsOpen(false);
      setAuthorizationCode("");
      if (options?.clearStatus) {
        clearStatus();
      }
    },
    [clearStatus, saving],
  );

  const openEmailBindingModal = useCallback(() => {
    resetDraft();
    setIsOpen(true);
    void hydrateDraft({ clearStatus: true });
  }, [hydrateDraft, resetDraft]);

  const updateProvider = useCallback((nextValue: string) => {
    const nextProvider = normalizeEmailBindingProvider(nextValue);
    setProvider(nextProvider);
    if (!nextProvider) {
      return;
    }
    const defaults = getProviderDefaults(nextProvider);
    setCustomImapHost(defaults.imapHost);
    setCustomImapPort(defaults.imapPort);
    setCustomSmtpHost(defaults.smtpHost);
    setCustomSmtpPort(defaults.smtpPort);
    setCustomImapTls(defaults.imapTls);
    setCustomSmtpSecure(defaults.smtpSecure);
  }, []);

  const validateDraft = useCallback(() => {
    if (!provider) {
      return "请选择邮箱类型。";
    }
    if (!account.trim()) {
      return "请输入邮箱账号。";
    }
    if (!authorizationCode.trim()) {
      return "请输入授权码或应用专用密码。";
    }
    if (!isCustomProvider) {
      return "";
    }
    if (!customImapHost.trim()) {
      return "请输入 IMAP Host。";
    }
    if (!customSmtpHost.trim()) {
      return "请输入 SMTP Host。";
    }
    if (!/^\d+$/.test(customImapPort.trim())) {
      return "IMAP 端口必须是数字。";
    }
    if (!/^\d+$/.test(customSmtpPort.trim())) {
      return "SMTP 端口必须是数字。";
    }

    const parsedImapPort = Number(customImapPort.trim());
    if (!Number.isInteger(parsedImapPort) || parsedImapPort < 1 || parsedImapPort > 65535) {
      return "IMAP 端口必须在 1-65535 范围内。";
    }
    const parsedSmtpPort = Number(customSmtpPort.trim());
    if (!Number.isInteger(parsedSmtpPort) || parsedSmtpPort < 1 || parsedSmtpPort > 65535) {
      return "SMTP 端口必须在 1-65535 范围内。";
    }

    return "";
  }, [
    account,
    authorizationCode,
    customImapHost,
    customImapPort,
    customSmtpHost,
    customSmtpPort,
    isCustomProvider,
    provider,
  ]);

  const saveBinding = useCallback(async () => {
    if (saving || loading) {
      return;
    }

    clearStatus();
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const result = await saveImapSmtpEmailBinding({
        provider,
        emailAccount: account,
        authorizationCode,
        customConfig: isCustomProvider
          ? {
              imapHost: customImapHost,
              imapPort: customImapPort,
              smtpHost: customSmtpHost,
              smtpPort: customSmtpPort,
              imapTls: customImapTls,
              smtpSecure: customSmtpSecure,
            }
          : null,
      });
      setBoundState(provider, account, true);
      setNotice(result.detail || "邮箱绑定已保存。");
      closeEmailBindingModal({ force: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "邮箱绑定配置保存失败。");
    } finally {
      setSaving(false);
    }
  }, [
    account,
    authorizationCode,
    clearStatus,
    closeEmailBindingModal,
    customImapHost,
    customImapPort,
    customImapTls,
    customSmtpHost,
    customSmtpPort,
    customSmtpSecure,
    isCustomProvider,
    loading,
    provider,
    saving,
    setBoundState,
    validateDraft,
  ]);

  useEffect(() => {
    void syncBoundState();
  }, [syncBoundState]);

  useEffect(() => {
    const message = notice.trim();
    if (!message) {
      return;
    }
    pushFeedback({
      tone: "success",
      title: "邮箱绑定",
      message,
      dedupeKey: "workspace-email-binding-notice",
      persistent: false,
    });
  }, [notice, pushFeedback]);

  useEffect(() => {
    const message = error.trim();
    if (!message) {
      return;
    }
    pushFeedback({
      tone: "error",
      title: "邮箱绑定",
      message,
      dedupeKey: "workspace-email-binding-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [error, pushFeedback]);

  return {
    isOpen,
    loading,
    saving,
    flowState,
    notice,
    error,
    provider,
    account,
    authorizationCode,
    boundProvider,
    boundAccount,
    boundProviderLabel,
    customImapHost,
    customImapPort,
    customSmtpHost,
    customSmtpPort,
    customImapTls,
    customSmtpSecure,
    isCustomProvider,
    isBound,
    providerOptions,
    accountPlaceholder,
    setAccount,
    setAuthorizationCode,
    setCustomImapHost,
    setCustomImapPort,
    setCustomSmtpHost,
    setCustomSmtpPort,
    setCustomImapTls,
    setCustomSmtpSecure,
    updateProvider,
    openEmailBindingModal,
    closeEmailBindingModal,
    saveBinding,
  };
}
