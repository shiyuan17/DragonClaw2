// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import "./App.css";
import qrAlipay from "./assets/qr-alipay.jpg";
import qrWechat from "./assets/qr-wechat.jpg";

import type { HomeView, TabId } from "./types";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { Header } from "./components/Header";
import { ModelSwitchModal } from "./components/ModelSwitchModal";
import { RepairToast } from "./components/RepairToast";
import { SetupWizard } from "./components/SetupWizard";
import { StartupOverlay } from "./components/StartupOverlay";
import { Modal } from "./components/ui/Modal";
import { useConfig } from "./hooks/useConfig";
import { useLogs } from "./hooks/useLogs";
import { useService } from "./hooks/useService";
import { useSetup } from "./hooks/useSetup";

const WorkspaceCloneReadyPage = lazy(() => import("./components/ready/WorkspaceCloneReadyPage"));
const LegacyHomeReadyPage = lazy(() => import("./components/ready/LegacyHomeReadyPage"));

function dismissBootSplash() {
  if (typeof document === "undefined") return;

  const bootSplash = document.getElementById("boot-splash");
  if (!bootSplash || bootSplash.dataset.dismissed === "true") {
    return;
  }

  bootSplash.dataset.dismissed = "true";

  const removeBootSplash = () => {
    bootSplash.removeEventListener("transitionend", removeBootSplash);
    bootSplash.remove();
  };

  requestAnimationFrame(() => {
    bootSplash.classList.add("is-leaving");
    bootSplash.addEventListener("transitionend", removeBootSplash, { once: true });
    window.setTimeout(removeBootSplash, 320);
  });
}

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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [homeView] = useState<HomeView>("workspace-clone");
  const [activeSettingsTab, setActiveSettingsTab] = useState<"general" | "logs" | "about">("general");
  const [running, setRunning] = useState(false);
  const startingUpRef = useRef<(value: boolean) => void>(() => { });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{ title: string; msg: string; url?: string } | null>(null);
  const [appVersion, setAppVersion] = useState("0.0.0");
  const updateChecked = useRef(false);

  useEffect(() => {
    getVersion().then((version) => setAppVersion(version)).catch(() => { });
  }, []);

  useEffect(() => {
    dismissBootSplash();
  }, []);

  const {
    logs,
    repairToast,
    setRepairToast,
    logRef,
    addLog,
  } = useLogs();

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
    infoModalTitle,
    setInfoModalTitle,
    refreshCurrentConfig,
    checkApiKey,
    handleSaveConfig,
    handleSetModel,
    handleUpsertSavedProviderConfig,
    handleDeleteSavedProviderConfig,
    handleOpenRegister,
    handleReset,
    confirmReset,
    handleReinstall,
    configVersion,
    resetModalState,
  } = useConfig({ addLog, running, setRunning, setStartingUp: (value) => startingUpRef.current(value) });

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
    clearSetupError,
    retrySetup,
    handleSelectFolder,
    handleConfirmWorkspace,
    handleSwitchWorkspace,
  } = useSetup({ addLog, checkApiKey, setRunning });

  const {
    loading: serviceLoading,
    startingUp,
    setStartingUp,
    uptime,
    servicePort,
    reinstalling,
    repairing,
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
  });

  const loading = setupLoading || serviceLoading;
  startingUpRef.current = setStartingUp;

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
          setFeedbackModal({
            title: "发现更新",
            msg: `发现新版本 v${latestVersion}，\n当前版本 v${appVersion}`,
            url: data.html_url || "https://github.com/shiyuan17/DragonClaw2/security/releases",
          });
        }
      } catch {
        // Silently ignore network errors.
      }
    })();
  }, [appVersion, phase]);

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
  const consoleUrl = servicePort
    ? `http://localhost:${servicePort}`
    : null;

  const handleExportDiagnostics = async () => {
    const savePath = await save({
      defaultPath: `openclaw-diagnostics-${Date.now()}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!savePath) return;

    const logLines = logs.map((entry) => `[${entry.time}] [${entry.level}] ${entry.humanized || entry.message}`);
    try {
      await invoke("export_diagnostics_zip", { savePath, logs: logLines });
      setFeedbackModal({ title: "导出成功", msg: `诊断信息已导出到：\n${savePath}` });
    } catch (error: unknown) {
      setFeedbackModal({ title: "导出错误", msg: `导出失败: ${error}` });
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch("https://api.github.com/repos/shiyuan/dragonclaw/releases/latest");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const rawTag = data.tag_name || "";
      const isSemver = /^v?\d+\.\d+\.\d+$/.test(rawTag);
      const latestVersion = rawTag.replace(/^v/, "");

      if (isSemver && latestVersion !== appVersion) {
        setFeedbackModal({
          title: "发现更新",
          msg: `发现新版本 v${latestVersion}，\n当前版本 v${appVersion}`,
          url: data.html_url || "https://github.com/shiyuan17/DragonClaw2/security/releases",
        });
      } else {
        setFeedbackModal({ title: "无可用更新", msg: `当前版本 v${appVersion} 已是最新版本` });
      }
    } catch {
      setFeedbackModal({ title: "网络错误", msg: "检查更新失败，请检查网络连接" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const showWorkspaceCloneHome = phase === "ready" && homeView === "workspace-clone";

  return (
    <div className={`app ${showWorkspaceCloneHome ? "app--workspace-clone" : ""}`}>
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
            setupError={setupError}
            onDismissError={clearSetupError}
            onRetry={retrySetup}
            onSelectFolder={handleSelectFolder}
            onConfirmWorkspace={handleConfirmWorkspace}
          />
        ) : (
          <Suspense fallback={<ReadyPageFallback />}>
            {showWorkspaceCloneHome ? (
              <WorkspaceCloneReadyPage
                running={running}
                loading={loading}
                servicePort={servicePort}
                gatewayToken={gatewayToken}
                consoleUrl={consoleUrl}
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
            ) : (
              <LegacyHomeReadyPage
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                activeSettingsTab={activeSettingsTab}
                setActiveSettingsTab={setActiveSettingsTab}
                running={running}
                loading={loading}
                appVersion={appVersion}
                servicePort={servicePort}
                consoleUrl={consoleUrl}
                uptime={uptime}
                currentModelName={currentModelName}
                currentProviderName={currentProviderName}
                workspacePath={workspacePath}
                currentConfig={currentConfig}
                providers={providers}
                filteredProviders={filteredProviders}
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
                configVersion={configVersion}
                resetModalState={resetModalState}
                checkApiKey={checkApiKey}
                handleSaveConfig={handleSaveConfig}
                logs={logs}
                logRef={logRef}
                setShowKeyModal={setShowKeyModal}
                setShowModelSwitchModal={setShowModelSwitchModal}
                setStartingUp={setStartingUp}
                setRunning={setRunning}
                addLog={addLog}
                reinstalling={reinstalling}
                repairing={repairing}
                handleStart={handleStart}
                handleStop={handleStop}
                handleSwitchWorkspace={handleSwitchWorkspace}
                handleReinstall={handleReinstall}
                handleRepairConnection={handleRepairConnection}
                handleReset={handleReset}
                setInfoModalTitle={setInfoModalTitle}
                onExportDiagnostics={handleExportDiagnostics}
                onCheckUpdate={handleCheckUpdate}
                checkingUpdate={checkingUpdate}
              />
            )}
          </Suspense>
        )}
      </div>

      <Modal show={!!infoModalTitle} onClose={() => setInfoModalTitle("")} title={infoModalTitle} maxWidth={360}>
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
        <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setInfoModalTitle("")}>关闭</button>
      </Modal>

      <Modal show={!!feedbackModal} onClose={() => setFeedbackModal(null)} title={feedbackModal?.title || ""} maxWidth={360}>
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
          <div style={{ fontSize: 14, whiteSpace: "pre-line", color: "var(--text-primary)" }}>{feedbackModal?.msg}</div>
        </div>
        {feedbackModal?.url ? (
          <button
            className="btn-primary btn-hero"
            style={{ width: "100%" }}
            onClick={() => {
              invoke("open_url", { url: feedbackModal.url });
              setFeedbackModal(null);
            }}
          >
            前往下载页面
          </button>
        ) : (
          <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setFeedbackModal(null)}>确定</button>
        )}
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

      <StartupOverlay show={startingUp} />

      <RepairToast
        show={repairToast}
        repairing={repairing}
        onRepair={handleRepairConnection}
        onDismiss={() => setRepairToast(false)}
      />

      <ApiKeyModal
        show={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        providers={providers}
        filteredProviders={filteredProviders}
        currentConfig={currentConfig}
        activeTab={activeTab}
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
  );
}

export default App;
