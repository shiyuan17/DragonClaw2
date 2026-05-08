// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * useSetup Hook
 *
 * Manages the initial setup flow: environment checking, downloading,
 * installing dependencies, workspace selection, and config injection.
 * All setup-related Tauri command calls and event listeners live here.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppPhase, LauncherState, ServiceLifecycleSnapshot } from "../types";
import {
  getOnboardingSkillInstallDiagnostics,
  markOnboardingSkillInstallRequired,
} from "../utils/onboardingSkillInstaller";
import { captureSetupCompleted, captureSetupServiceStartRequested, captureWorkspaceConfigured } from "./setup-telemetry";
import {
  beginSetupEnvironmentCheck,
  configureSetupWorkspace,
  scheduleBackgroundOnboardingSkillInstall,
  startSetupLaunchPolling,
  syncSetupWorkspacePath,
} from "./useSetupFlow";
const LAUNCH_POLL_INTERVAL_MS = 2000;
const LAUNCH_POLL_TIMEOUT_MS = 60000;
const ENVIRONMENT_CHECK_TIMEOUT_MS = 20000;
const ONBOARDING_BACKGROUND_DELAY_MS = 10000;
interface ServiceLogPayload {
  level: string;
  message: string;
}
interface ServiceLogBatchPayload {
  logs: ServiceLogPayload[];
}
const DEFAULT_LAUNCHER_STATE: LauncherState = {
  setupCompleted: false,
  lastLaunchAt: null,
  lastKnownPort: null,
};
interface UseSetupOptions {
  addLog: (level: string, message: string) => void;
  addLogs: (logs: ServiceLogPayload[]) => void;
  checkApiKey: () => Promise<void>;
  setRunning: (running: boolean) => void;
  serviceLifecycle: ServiceLifecycleSnapshot | null;
  serviceLifecycleReady: boolean;
}
export function useSetup({
  addLog,
  addLogs,
  checkApiKey,
  setRunning,
  serviceLifecycle,
  serviceLifecycleReady,
}: UseSetupOptions) {
  const [phase, setPhase] = useState<AppPhase>("checking");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("正在检查环境...");
  const [workspacePath, setWorkspacePath] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [servicePort, setServicePort] = useState(18789);
  const phaseRef = useRef<AppPhase>("checking");
  const launchStartedRef = useRef(false);
  const launchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingIdleRef = useRef<number | null>(null);
  const onboardingInstallRunningRef = useRef(false);
  const startupFinalizingRef = useRef(false);
  const launchPollInFlightRef = useRef(false);
  const environmentCheckStartedRef = useRef(false);
  const environmentCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servicePortRef = useRef(18789);
  const serviceLifecycleRef = useRef<ServiceLifecycleSnapshot | null>(null);
  const finalizeStartupRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const checkEnvironmentRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    servicePortRef.current = servicePort;
  }, [servicePort]);
  useEffect(() => {
    serviceLifecycleRef.current = serviceLifecycle;
  }, [serviceLifecycle]);
  useEffect(() => {
    if (typeof serviceLifecycle?.port === "number" && serviceLifecycle.port > 0) {
      setServicePort(serviceLifecycle.port);
    }

    if (
      serviceLifecycle?.status === "ready"
      && phaseRef.current === "launching"
      && !startupFinalizingRef.current
    ) {
      void finalizeStartupRef.current(true);
    }

    if (serviceLifecycle?.status === "failed" && phaseRef.current === "launching") {
      launchStartedRef.current = false;
      if (launchFallbackRef.current) {
        clearTimeout(launchFallbackRef.current);
        launchFallbackRef.current = null;
      }

      const errorMessage = serviceLifecycle.lastError
        || serviceLifecycle.detail
        || "OpenClaw 服务启动失败";
      setSetupError(errorMessage);
      setProgressMsg("启动失败，请重试");
      setLoading(false);
      setRunning(false);
      addLog("error", errorMessage);
    }
  }, [addLog, serviceLifecycle, setRunning]);
  const setSetupPhase = useCallback((nextPhase: AppPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);
  const clearLaunchFallback = useCallback(() => {
    if (launchFallbackRef.current) {
      clearTimeout(launchFallbackRef.current);
      launchFallbackRef.current = null;
    }
  }, []);
  const clearEnvironmentCheckTimeout = useCallback(() => {
    if (environmentCheckTimeoutRef.current) {
      clearTimeout(environmentCheckTimeoutRef.current);
      environmentCheckTimeoutRef.current = null;
    }
  }, []);
  const clearOnboardingSchedule = useCallback(() => {
    if (onboardingDelayRef.current) {
      clearTimeout(onboardingDelayRef.current);
      onboardingDelayRef.current = null;
    }

    if (onboardingIdleRef.current !== null) {
      window.cancelIdleCallback?.(onboardingIdleRef.current);
      onboardingIdleRef.current = null;
    }
  }, []);
  const syncWorkspacePath = useCallback((fallback?: string) => syncSetupWorkspacePath({ fallback, setWorkspacePath }), []);
  const configureWorkspace = useCallback((nextWorkspacePath?: string | null) => (
    configureSetupWorkspace({ nextWorkspacePath, setWorkspacePath })
  ), []);

  const backfillOnboardingSkillStateIfNeeded = useCallback(async () => {
    try {
      const diagnostics = await getOnboardingSkillInstallDiagnostics();
      if (diagnostics.shouldBackfill) {
        addLog("info", "Detected missing onboarding skill install state for an existing user; backfill will run on this launch.");
        await markOnboardingSkillInstallRequired();
      }
    } catch (diagnosticsError) {
      addLog("warn", `Onboarding skill install diagnostics failed; skipping backfill check: ${diagnosticsError}`);
    }
  }, [addLog]);

  const startBackgroundOnboardingSkillInstall = useCallback(() => {
    scheduleBackgroundOnboardingSkillInstall({
      addLog,
      clearOnboardingSchedule,
      onboardingDelayRef,
      onboardingIdleRef,
      onboardingInstallRunningRef,
      onboardingBackgroundDelayMs: ONBOARDING_BACKGROUND_DELAY_MS,
    });
  }, [addLog, clearOnboardingSchedule]);

  const finalizeStartup = useCallback(async (force = false) => {
    if ((!force && phaseRef.current !== "launching") || startupFinalizingRef.current) {
      return;
    }

    startupFinalizingRef.current = true;
    clearLaunchFallback();
    clearEnvironmentCheckTimeout();
    launchStartedRef.current = false;
    setLoading(true);
    setRunning(true);
    setSetupError(null);

    try {
      setProgress(100);
      setProgressMsg("OpenClaw 服务已就绪");

      setRunning(true);
      setSetupPhase("ready");
      addLog("success", "OpenClaw 服务已启动");
      await checkApiKey();
      startBackgroundOnboardingSkillInstall();
    } finally {
      startupFinalizingRef.current = false;
      setLoading(false);
    }
  }, [
    addLog,
    checkApiKey,
    clearEnvironmentCheckTimeout,
    clearLaunchFallback,
    setRunning,
    setSetupPhase,
    startBackgroundOnboardingSkillInstall,
  ]);

  const startLaunchPolling = useCallback((message: string) => {
    startSetupLaunchPolling(message, {
      addLog,
      clearLaunchFallback,
      finalizeStartup,
      launchFallbackRef,
      launchPollInFlightRef,
      launchStartedRef,
      phaseRef,
      startupFinalizingRef,
      setLoading,
      setProgressMsg,
      setSetupError,
      pollIntervalMs: LAUNCH_POLL_INTERVAL_MS,
      pollTimeoutMs: LAUNCH_POLL_TIMEOUT_MS,
    });
  }, [addLog, clearLaunchFallback, finalizeStartup]);

  const launchService = useCallback(async () => {
    if (launchStartedRef.current || startupFinalizingRef.current) {
      return;
    }

    launchStartedRef.current = true;
    clearLaunchFallback();
    setSetupPhase("launching");
    setLoading(true);
    setSetupError(null);
    setProgress(98);
    captureSetupServiceStartRequested();
    setProgressMsg("正在启动 OpenClaw 服务...");

    try {
      const result = await invoke<string>("start_service_silent");

      if (result.toLowerCase().includes("already running")) {
        await finalizeStartup(true);
        return;
      }

      if (phaseRef.current !== "launching") {
        return;
      }

      startLaunchPolling("OpenClaw 服务启动中，等待就绪信号...");
    } catch (err) {
      launchStartedRef.current = false;
      setSetupError(String(err));
      setProgressMsg("启动失败，请重试");
      addLog("error", `启动失败: ${err}`);
      setLoading(false);
    }
  }, [addLog, clearLaunchFallback, finalizeStartup, setSetupPhase, startLaunchPolling]);

  const runSetup = useCallback(async () => {
    setLoading(true);
    setSetupError(null);

    try {
      await invoke("setup_openclaw");
      await markOnboardingSkillInstallRequired();
      captureSetupCompleted();
      addLog("success", "OpenClaw 初始化完成");
      await launchService();
    } catch (err) {
      addLog("error", `初始化失败: ${err}`);
      setSetupError(String(err));
    } finally {
      if (phaseRef.current !== "launching") {
        setLoading(false);
      }
    }
  }, [addLog, launchService]);

  const checkEnvironment = useCallback(async () => {
    try {
      const launcherState = await invoke<LauncherState>("get_launcher_state")
        .catch(() => DEFAULT_LAUNCHER_STATE);
      const nodeOk = await invoke<boolean>("check_node_exists");
      const openclawOk = await invoke<boolean>("check_openclaw_exists");
      const modulesOk = await invoke<boolean>("check_node_modules_exists");
      const lifecycleSnapshot = serviceLifecycleRef.current;
      const serviceReady = lifecycleSnapshot?.status === "ready";
      const serviceStarting = lifecycleSnapshot?.status === "service-starting";
      const environmentReady = nodeOk && openclawOk && modulesOk;
      const configOk = environmentReady
        ? await invoke<boolean>("check_config_exists")
        : false;

      if (environmentReady && configOk) {
        if (!launcherState.setupCompleted) {
          await invoke("mark_launcher_setup_completed", {
            lastKnownPort: launcherState.lastKnownPort ?? null,
          });
          addLog("info", "Detected an existing OpenClaw install without launcher state; backfilled the one-time setup marker.");
        }

        await syncWorkspacePath();
        await backfillOnboardingSkillStateIfNeeded();

        if (typeof launcherState.lastKnownPort === "number") {
          setServicePort(launcherState.lastKnownPort);
        }
        if (typeof lifecycleSnapshot?.port === "number" && lifecycleSnapshot.port > 0) {
          setServicePort(lifecycleSnapshot.port);
        }

        if (serviceReady) {
          addLog("info", "Detected an existing OpenClaw service in the background; reusing it now.");
          await finalizeStartup(true);
          return;
        }

        setRunning(false);
        setSetupError(null);
        setSetupPhase("launching");
        setProgress(98);
        if (serviceStarting) {
          setLoading(true);
          startLaunchPolling("OpenClaw 服务正在后台启动，请等待就绪信号...");
          addLog("info", "Detected an existing OpenClaw service that is still starting; waiting for lifecycle polling to confirm readiness.");
        } else {
          addLog("info", "Environment is ready but the OpenClaw service is not running yet; starting it now.");
          await launchService();
        }
        return;
      }

      if (environmentReady && !configOk) {
        addLog("info", "首次使用，正在自动配置默认工作区...");
        try {
          const resolvedWorkspacePath = await configureWorkspace(null);
          captureWorkspaceConfigured("auto");
          addLog("success", `[OK] 已自动配置默认工作区: ${resolvedWorkspacePath || "默认目录"}`);
        } catch (configError) {
          setSetupPhase("workspace");
          setLoading(false);
          addLog("warn", `默认工作区自动配置失败，已切换为手动选择: ${configError}`);
          return;
        }

        addLog("success", "[OK] 环境检查通过，所有组件就绪");
        if (serviceReady) {
          addLog("info", "检测到已有 OpenClaw 在后台运行，正在复用现有服务...");
          await finalizeStartup(true);
          return;
        }

        if (serviceStarting) {
          setRunning(false);
          setSetupPhase("launching");
          setLoading(true);
          setProgress(98);
          startLaunchPolling("OpenClaw 服务正在后台启动，请等待就绪信号...");
          addLog("info", "检测到 OpenClaw 服务正在后台启动，等待轮询确认 ready...");
          return;
        }

        await launchService();
        return;
      }

      setSetupPhase("initializing");
      addLog("info", "首次启动，开始初始化环境...");
      await runSetup();
    } catch (err) {
      addLog("error", `环境检查失败: ${err}`);
      setSetupPhase("initializing");
      await runSetup();
    }
  }, [
    addLog,
    backfillOnboardingSkillStateIfNeeded,
    configureWorkspace,
    finalizeStartup,
    launchService,
    runSetup,
    setRunning,
    setSetupPhase,
    startLaunchPolling,
    syncWorkspacePath,
  ]);

  const beginEnvironmentCheck = useCallback(() => {
    beginSetupEnvironmentCheck({
      addLog,
      clearEnvironmentCheckTimeout,
      environmentCheckStartedRef,
      environmentCheckTimeoutRef,
      phaseRef,
      setLoading,
      setProgressMsg,
      setSetupError,
      timeoutMs: ENVIRONMENT_CHECK_TIMEOUT_MS,
      runCheck: checkEnvironmentRef.current,
    });
  }, [addLog, clearEnvironmentCheckTimeout]);

  useEffect(() => {
    finalizeStartupRef.current = finalizeStartup;
    checkEnvironmentRef.current = checkEnvironment;
  }, [checkEnvironment, finalizeStartup]);

  useEffect(() => {
    const unlistenProgress = listen<{ stage: string; message: string; percent: number }>(
      "setup-progress",
      (event) => {
        setProgress(event.payload.percent);
        setProgressMsg(event.payload.message);
        addLog("info", event.payload.message);
      },
    );

    const unlistenLogs = listen<{ level: string; message: string }>(
      "service-log",
      (event) => {
        addLog(event.payload.level, event.payload.message);
      },
    );

    const unlistenLogBatch = listen<ServiceLogBatchPayload>(
      "service-log-batch",
      (event) => {
        const logs = Array.isArray(event.payload.logs) ? event.payload.logs : [];
        if (logs.length > 0) {
          addLogs(logs);
        }
      },
    );

    const unlistenPort = listen<{ port: number }>("service-port", (event) => {
      setServicePort(event.payload.port || 18789);
    });

    return () => {
      clearEnvironmentCheckTimeout();
      clearLaunchFallback();
      clearOnboardingSchedule();
      unlistenProgress.then((fn) => fn());
      unlistenLogs.then((fn) => fn());
      unlistenLogBatch.then((fn) => fn());
      unlistenPort.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!serviceLifecycleReady) {
      return;
    }

    beginEnvironmentCheck();
  }, [beginEnvironmentCheck, serviceLifecycleReady]);

  const handleSelectFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择你的工作区目录",
    });

    if (selected && typeof selected === "string") {
      setWorkspacePath(selected);
    }
  }, []);

  const handleConfirmWorkspace = useCallback(async () => {
    setLoading(true);

    try {
      const resolvedWorkspacePath = await configureWorkspace(workspacePath);
      captureWorkspaceConfigured("manual");
      addLog("success", `[OK] 工作区已配置: ${resolvedWorkspacePath || "默认目录"}`);
      await launchService();
    } catch (err) {
      addLog("error", `配置失败: ${err}`);
    } finally {
      if (phaseRef.current !== "launching") {
        setLoading(false);
      }
    }
  }, [addLog, configureWorkspace, launchService, workspacePath]);

  const handleSwitchWorkspace = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "切换工作区目录",
    });

    if (selected && typeof selected === "string") {
      setWorkspacePath(selected);
      setLoading(true);

      try {
        await invoke("inject_default_config", { workspacePath: selected });
        await syncWorkspacePath(selected);
        captureWorkspaceConfigured("switch");
        addLog("success", `[OK] 工作区已切换到: ${selected}`);
      } catch (err) {
        addLog("error", `切换失败: ${err}`);
      } finally {
        setLoading(false);
      }
    }
  }, [addLog, syncWorkspacePath]);

  const clearSetupError = useCallback(() => setSetupError(null), []);

  const retrySetup = useCallback(() => {
    setSetupError(null);
    clearEnvironmentCheckTimeout();

    if (phaseRef.current === "launching") {
      launchStartedRef.current = false;
      startupFinalizingRef.current = false;
      setProgressMsg("正在重试启动...");
      void launchService();
      return;
    }

    if (phaseRef.current === "checking") {
      environmentCheckStartedRef.current = false;
      setProgress(0);
      setProgressMsg("正在重新检查环境...");
      beginEnvironmentCheck();
      return;
    }

    setProgress(0);
    setProgressMsg("正在重试初始化...");
    void runSetup();
  }, [beginEnvironmentCheck, clearEnvironmentCheckTimeout, launchService, runSetup]);

  return {
    phase,
    setPhase: setSetupPhase,
    loading,
    setLoading,
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
  };
}
