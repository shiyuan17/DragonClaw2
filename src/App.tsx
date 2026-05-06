// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import qrAlipay from "./assets/qr-alipay.jpg";
import qrWechat from "./assets/qr-wechat.jpg";
import { FeedbackCenterHost } from "./components/FeedbackCenterHost";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { Header } from "./components/Header";
import { ModelSwitchModal } from "./components/ModelSwitchModal";
import { SetupWizard } from "./components/SetupWizard";
import { Modal } from "./components/ui/Modal";
import { useConfig } from "./hooks/useConfig";
import { FeedbackProvider, useFeedback } from "./hooks/useFeedback";
import { useLogs } from "./hooks/useLogs";
import { useService } from "./hooks/useService";
import { useServiceLifecycle } from "./hooks/useServiceLifecycle";
import { useSetup } from "./hooks/useSetup";

const WorkspaceCloneReadyPage = lazy(() => import("./components/ready/WorkspaceCloneReadyPage"));

function ReadyPageFallback() {
  return (
    <div className="startup-container">
      <div className="startup-box">
        <h1 className="startup-title">DragonClaw 正在打开工作台</h1>
        <div className="startup-progress-group" aria-hidden="true">
          <div className="startup-progress-bar">
            <div className="startup-progress-fill" style={{ width: "42%" }} />
          </div>
        </div>
        <p className="startup-description">首页模块正在加载，请稍候。</p>
      </div>
    </div>
  );
}

function AppShell() {
  const { pushFeedback } = useFeedback();
  const [running, setRunning] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState("");
  const [appVersion, setAppVersion] = useState("0.0.0");
  const updateChecked = useRef(false);

  useEffect(() => {
    getVersion().then((version) => setAppVersion(version)).catch(() => {});
  }, []);

  const {
    logs,
    repairToast,
    setRepairToast,
    addLog,
    addLogs,
  } = useLogs();
  const { serviceLifecycle } = useServiceLifecycle();

  const {
    providers,
    selectedCategory,
    setSelectedCategory,
    selectedProvider,
    setSelectedProvider,
    apiKeyInput,
    setApiKeyInput,
    baseUrlInput,
    setBaseUrlInput,
    selectedModel,
    setSelectedModel,
    configSaving,
    setConfigStatus,
    currentConfig,
    filteredProviders,
    showKeyModal,
    setShowKeyModal,
    showResetModal,
    setShowResetModal,
    showReinstallModal,
    setShowReinstallModal,
    showModelSwitchModal,
    setShowModelSwitchModal,
    infoModalTitle: legacyInfoModalTitle,
    setInfoModalTitle: setLegacyInfoModalTitle,
    refreshCurrentConfig,
    checkApiKey,
    handleSaveConfig,
    handleSetModel,
    handleUpsertSavedProviderConfig,
    handleDeleteSavedProviderConfig,
    handleOpenRegister,
    confirmReset,
    configVersion,
  } = useConfig({ addLog, running, setRunning });

  useEffect(() => {
    setInfoModalTitle(legacyInfoModalTitle);
  }, [legacyInfoModalTitle]);

  const {
    phase,
    setPhase,
    loading: setupLoading,
    progress,
    setProgress,
    progressMsg,
    setProgressMsg,
    workspacePath,
    setupError,
    retrySetup,
    handleSelectFolder,
    handleConfirmWorkspace,
  } = useSetup({ addLog, addLogs, checkApiKey, setRunning, serviceLifecycle });

  const {
    loading: serviceLoading,
    uptime,
    servicePort,
    handleStart,
    handleStop,
    confirmReinstall,
    handleRepairConnection,
  } = useService({
    addLog,
    checkApiKey,
    setRepairToast,
    setShowReinstallModal,
    running,
    setRunning,
    setPhase,
    setProgress,
    setProgressMsg,
    serviceLifecycle,
  });

  const loading = setupLoading || serviceLoading;

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }

    let cancelled = false;

    async function refreshGatewayConfig() {
      await invoke("migrate_gateway_config").catch(() => undefined);
      if (cancelled) {
        return;
      }
      await refreshCurrentConfig().catch((error) => {
        addLog("warn", `刷新网关配置失败: ${error}`);
      });
    }

    void refreshGatewayConfig();

    return () => {
      cancelled = true;
    };
  }, [addLog, phase, refreshCurrentConfig]);

  useEffect(() => {
    if (phase !== "ready" || updateChecked.current || appVersion === "0.0.0") return;
    updateChecked.current = true;

    (async () => {
      try {
        const res = await fetch("https://api.github.com/repos/shiyuan/dragonclaw/releases/latest");
        if (!res.ok) return;
        const data = await res.json();
        const rawTag = data.tag_name || "";
        const isSemver = /^v?\d+\.\d+\.\d+$/.test(rawTag);
        const latestVersion = rawTag.replace(/^v/, "");
        if (isSemver && latestVersion !== appVersion) {
          pushFeedback({
            tone: "info",
            title: "发现更新",
            message: `发现新版本 v${latestVersion}，\n当前版本 v${appVersion}`,
            actionLabel: "前往下载",
            onAction: async () => {
              await invoke("open_url", {
                url: data.html_url || "https://github.com/shiyuan17/DragonClaw2/security/releases",
              });
            },
            dedupeKey: "app-version-update",
          });
        }
      } catch {
        // Silently ignore network errors.
      }
    })();
  }, [appVersion, phase, pushFeedback]);

  useEffect(() => {
    if (!repairToast) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "连接异常",
      message: "检测到设备签名校验异常，你可以一键修复连接。",
      actionLabel: "修复连接",
      onAction: async () => {
        await handleRepairConnection();
      },
      dedupeKey: "repair-connection",
    });
    setRepairToast(false);
  }, [handleRepairConnection, pushFeedback, repairToast, setRepairToast]);

  useEffect(() => {
    if (!setupError) {
      return;
    }

    const isLaunchingError = phase === "launching";
    pushFeedback({
      tone: "error",
      title: isLaunchingError ? "启动失败" : "初始化失败",
      message: setupError,
      actionLabel: isLaunchingError ? "重试启动" : "重试",
      onAction: async () => {
        retrySetup();
      },
      dedupeKey: "setup-error",
    });
  }, [phase, pushFeedback, retrySetup, setupError]);

  useEffect(() => {
    const unlisten = listen("tray-restart-service", async () => {
      try {
        if (running) {
          await handleStop();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await handleStart();
      } catch (error) {
        addLog("error", `托盘重启服务失败: ${error}`);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addLog, handleStart, handleStop, running]);

  const currentProviderName = currentConfig?.provider
    ? providers.find((provider) => provider.id === currentConfig.provider)?.name
      || (currentConfig.provider === "custom" ? "自定义中转站" : currentConfig.provider)
    : (currentConfig?.has_api_key ? "自定义" : "未配置");
  const currentModelName = currentConfig?.model || "未选择";

  const gatewayToken = currentConfig?.gateway_token?.trim() || null;

  return (
    <>
      <FeedbackCenterHost />

      <div className={`app ${phase === "ready" ? "app--workspace-clone" : ""}`}>
        <Header />

        <div className="app-content">
          {phase !== "ready" ? (
            <SetupWizard
              phase={phase}
              progress={progress}
              progressMsg={progressMsg}
              workspacePath={workspacePath}
              loading={loading}
              appVersion={appVersion}
              onSelectFolder={handleSelectFolder}
              onConfirmWorkspace={handleConfirmWorkspace}
            />
          ) : (
            <Suspense fallback={<ReadyPageFallback />}>
              <WorkspaceCloneReadyPage
                running={running}
                loading={loading}
                servicePort={servicePort}
                gatewayToken={gatewayToken}
                uptime={uptime}
                currentModelName={currentModelName}
                currentProviderName={currentProviderName}
                currentConfig={currentConfig}
                configVersion={configVersion}
                providers={providers}
                workspacePath={workspacePath}
                logs={logs}
                handleStart={handleStart}
                handleStop={handleStop}
                refreshCurrentConfig={refreshCurrentConfig}
                handleSetModel={handleSetModel}
                handleUpsertSavedProviderConfig={handleUpsertSavedProviderConfig}
                handleDeleteSavedProviderConfig={handleDeleteSavedProviderConfig}
              />
            </Suspense>
          )}
        </div>

        <Modal show={!!infoModalTitle} onClose={() => setLegacyInfoModalTitle("")} title={infoModalTitle} maxWidth={360}>
          <div
            className="modal-desc"
            style={{
              marginTop: 16,
              marginBottom: 24,
              padding: 24,
              background: "var(--bg-card)",
              borderRadius: "var(--radius)",
              textAlign: "center",
            }}
          >
            {infoModalTitle.includes("赞赏") ? (
              <>
                <img
                  src={qrAlipay}
                  alt="支付宝收钱码"
                  style={{ width: "100%", maxWidth: 220, maxHeight: 280, objectFit: "contain", borderRadius: 8 }}
                />
                <div style={{ fontSize: 13, marginTop: 12, color: "var(--text-secondary)" }}>
                  如果 OpenClaw 对你有帮助，可以请作者喝杯咖啡
                </div>
              </>
            ) : (
              <>
                <img
                  src={qrWechat}
                  alt="微信公众号"
                  style={{ width: "100%", maxWidth: 220, maxHeight: 280, objectFit: "contain", borderRadius: 8 }}
                />
                <div style={{ fontSize: 13, marginTop: 12, color: "var(--text-secondary)" }}>
                  扫码关注微信公众号，获取最新动态
                </div>
              </>
            )}
          </div>
          <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setLegacyInfoModalTitle("")}>关闭</button>
        </Modal>

        <ModelSwitchModal
          show={showModelSwitchModal}
          onClose={() => setShowModelSwitchModal(false)}
          currentConfig={currentConfig}
          handleSetModel={handleSetModel}
          configVersion={configVersion}
        />

        <ConfirmModal
          show={showResetModal}
          title="重置配置"
          onCancel={() => setShowResetModal(false)}
          onConfirm={confirmReset}
          confirmLabel="确认重置"
        >
          <p style={{ marginBottom: 12 }}>仅重置 API Key 和模型配置（`openclaw.json` 中的 `models/agents` 部分）。</p>
          <p style={{ color: "var(--text-secondary)", marginBottom: 4 }}>不会删除：</p>
          <ul style={{ paddingLeft: 20, marginBottom: 12, color: "var(--text-secondary)" }}>
            <li>对话历史和记忆</li>
            <li>Agent 技能和书签</li>
            <li>工作区文件</li>
          </ul>
          <p style={{ color: "var(--accent-red)", marginBottom: 4 }}>将清除：</p>
          <ul style={{ paddingLeft: 20, color: "var(--text-secondary)" }}>
            <li>API Key 配置</li>
            <li>模型选择和默认模型</li>
          </ul>
        </ConfirmModal>

        <ConfirmModal
          show={showReinstallModal}
          title="重新安装运行环境"
          onCancel={() => setShowReinstallModal(false)}
          onConfirm={confirmReinstall}
          confirmLabel="确认重新安装"
        >
          <p style={{ marginBottom: 12 }}>这将删除 `node_modules` 并重新下载所有依赖，可能需要几分钟。</p>
          <p style={{ color: "var(--text-secondary)", marginBottom: 4 }}>适用于：</p>
          <ul style={{ paddingLeft: 20, marginBottom: 12, color: "var(--text-secondary)" }}>
            <li>安装过程出错</li>
            <li>环境损坏或依赖缺失</li>
            <li>版本升级后不兼容</li>
          </ul>
          <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>根据网络情况，可能需要 3-10 分钟</p>
        </ConfirmModal>

        <ApiKeyModal
          show={showKeyModal}
          onClose={() => setShowKeyModal(false)}
          providers={providers}
          filteredProviders={filteredProviders}
          currentConfig={currentConfig}
          activeTab="dashboard"
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedProvider={selectedProvider}
          setSelectedProvider={setSelectedProvider}
          apiKeyInput={apiKeyInput}
          setApiKeyInput={setApiKeyInput}
          baseUrlInput={baseUrlInput}
          setBaseUrlInput={setBaseUrlInput}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          configSaving={configSaving}
          setConfigStatus={setConfigStatus}
          onSaveConfig={handleSaveConfig}
          onOpenRegister={handleOpenRegister}
        />
      </div>
    </>
  );
}

function App() {
  return (
    <FeedbackProvider>
      <AppShell />
    </FeedbackProvider>
  );
}

export default App;
