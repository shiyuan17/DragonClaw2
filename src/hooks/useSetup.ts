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
import type { AppPhase, CurrentConfig, LauncherState, ServiceLifecycleSnapshot } from "../types";
import {
  getOnboardingSkillInstallDiagnostics,
  markOnboardingSkillInstallRequired,
  shouldRunOnboardingSkillInstall,
  startOnboardingSkillInstallBackground,
} from "../utils/onboardingSkillInstaller";

const LAUNCH_POLL_INTERVAL_MS = 2000;
const LAUNCH_POLL_TIMEOUT_MS = 60000;
const ONBOARDING_BACKGROUND_DELAY_MS = 10000;

type IdleWindow = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number; cancelIdleCallback?: (handle: number) => void; };
interface ServiceLogPayload { level: string; message: string; }
interface ServiceLogBatchPayload { logs: ServiceLogPayload[]; }
const DEFAULT_LAUNCHER_STATE: LauncherState = { setupCompleted: false, lastLaunchAt: null, lastKnownPort: null };

interface UseSetupOptions {
  addLog: (level: string, message: string) => void;
  addLogs: (logs: ServiceLogPayload[]) => void;
  checkApiKey: () => Promise<void>;
  setRunning: (r: boolean) => void;
  serviceLifecycle: ServiceLifecycleSnapshot | null;
}

export function useSetup({ addLog, addLogs, checkApiKey, setRunning, serviceLifecycle }: UseSetupOptions) {
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
  const servicePortRef = useRef(18789);
  const finalizeStartupRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const checkEnvironmentRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { servicePortRef.current = servicePort; }, [servicePort]);

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

  const clearOnboardingSchedule = useCallback(() => {
    if (onboardingDelayRef.current) {
      clearTimeout(onboardingDelayRef.current);
      onboardingDelayRef.current = null;
    }

    if (onboardingIdleRef.current !== null) {
      const idleWindow = window as IdleWindow;
      idleWindow.cancelIdleCallback?.(onboardingIdleRef.current);
      onboardingIdleRef.current = null;
    }
  }, []);

  const syncWorkspacePath = useCallback(async (fallback?: string) => {
    try {
      const currentConfig = await invoke<CurrentConfig>("get_current_config");
      const nextPath = currentConfig.workspace_path?.trim() || fallback || "";
      setWorkspacePath(nextPath);
      return nextPath;
    } catch {
      if (typeof fallback === "string") {
        setWorkspacePath(fallback);
        return fallback;
      }
      return "";
    }
  }, []);

  const configureWorkspace = useCallback(async (nextWorkspacePath?: string | null) => {
    const trimmedWorkspacePath = typeof nextWorkspacePath === "string"
      ? nextWorkspacePath.trim()
      : "";

    await invoke("inject_default_config", {
      workspacePath: trimmedWorkspacePath || null,
    });
    await invoke("inject_default_models");
    await markOnboardingSkillInstallRequired();
    return await syncWorkspacePath(trimmedWorkspacePath || undefined);
  }, [syncWorkspacePath]);

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
    if (onboardingInstallRunningRef.current) {
      return;
    }

    clearOnboardingSchedule();

    const triggerInstall = async () => {
      if (onboardingInstallRunningRef.current) {
        return;
      }

      let needsOnboardingSkills = false;
      try {
        needsOnboardingSkills = await shouldRunOnboardingSkillInstall();
      } catch (error) {
        addLog("warn", `Onboarding skill install state check failed; background install skipped: ${error}`);
        return;
      }

      if (!needsOnboardingSkills) {
        return;
      }

      onboardingInstallRunningRef.current = true;
      addLog("info", "Onboarding recommended skill install was handed off to the backend background task.");

      try {
        await startOnboardingSkillInstallBackground();
      } catch (error) {
        addLog("error", `Background onboarding skill install failed to start: ${error}`);
      } finally {
        onboardingInstallRunningRef.current = false;
      }
    };

    onboardingDelayRef.current = setTimeout(() => {
      onboardingDelayRef.current = null;
      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        onboardingIdleRef.current = idleWindow.requestIdleCallback(
          () => {
            onboardingIdleRef.current = null;
            void triggerInstall();
          },
          { timeout: ONBOARDING_BACKGROUND_DELAY_MS },
        );
        return;
      }

      void triggerInstall();
    }, ONBOARDING_BACKGROUND_DELAY_MS);
  }, [addLog, clearOnboardingSchedule]);

  const finalizeStartup = useCallback(async (force = false) => {
    if ((!force && phaseRef.current !== "launching") || startupFinalizingRef.current) {
      return;
    }

    startupFinalizingRef.current = true;
    clearLaunchFallback();
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
  }, [addLog, checkApiKey, clearLaunchFallback, setRunning, setSetupPhase, startBackgroundOnboardingSkillInstall]);

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

      setProgressMsg("OpenClaw 服务启动中，等待就绪信号...");
      const fallbackStartedAt = Date.now();
      const pollServiceReady = async () => {
        if (phaseRef.current !== "launching" || startupFinalizingRef.current) {
          return;
        }

        if (!launchPollInFlightRef.current) {
          launchPollInFlightRef.current = true;
          try {
            const snapshot = await invoke<ServiceLifecycleSnapshot | null>("get_service_lifecycle_snapshot");
            if (snapshot?.status === "ready") {
              await finalizeStartup(true);
              return;
            }
            if (snapshot?.status === "failed") {
              launchStartedRef.current = false;
              const errorMessage = snapshot.lastError || snapshot.detail || "OpenClaw 服务启动失败";
              setSetupError(errorMessage);
              setProgressMsg("启动失败，请重试");
              addLog("error", errorMessage);
              setLoading(false);
              return;
            }
          } catch (pollError) {
            addLog("warn", `OpenClaw 启动状态检测失败: ${pollError}`);
          } finally {
            launchPollInFlightRef.current = false;
          }
        }

        if (Date.now() - fallbackStartedAt >= LAUNCH_POLL_TIMEOUT_MS) {
          launchStartedRef.current = false;
          setSetupError("OpenClaw 服务启动超时，请重试");
          setProgressMsg("启动超时，请重试");
          addLog("error", "OpenClaw 服务启动超时，未在 60 秒内确认 ready");
          setLoading(false);
          return;
        }

        launchFallbackRef.current = setTimeout(pollServiceReady, LAUNCH_POLL_INTERVAL_MS);
      };
      launchFallbackRef.current = setTimeout(pollServiceReady, LAUNCH_POLL_INTERVAL_MS);
    } catch (err) {
      launchStartedRef.current = false;
      setSetupError(String(err));
      setProgressMsg("启动失败，请重试");
      addLog("error", `启动失败: ${err}`);
      setLoading(false);
    }
  }, [addLog, clearLaunchFallback, finalizeStartup, setSetupPhase]);

  const runSetup = useCallback(async () => {
    setLoading(true);
    setSetupError(null);

    try {
      await invoke("setup_openclaw");
      await markOnboardingSkillInstallRequired();
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
      const lifecycleSnapshot = await invoke<ServiceLifecycleSnapshot | null>("get_service_lifecycle_snapshot");
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
          setProgressMsg("OpenClaw 服务正在后台启动，请等待就绪信号...");
          addLog("info", "Detected an existing OpenClaw service that is still starting; waiting for the structured lifecycle ready signal.");
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
            addLog("success", `[OK] 已自动配置默认工作区: ${resolvedWorkspacePath || "默认目录"}`);
          } catch (configError) {
            setSetupPhase("workspace");
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
          setProgressMsg("OpenClaw 服务正在后台启动，请等待就绪信号...");
          addLog("info", "检测到 OpenClaw 服务正在后台启动，等待结构化生命周期状态变为 ready...");
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
    launchService,
    runSetup,
    setRunning,
    setSetupPhase,
    syncWorkspacePath,
  ]);

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

    void checkEnvironmentRef.current();

    return () => {
      clearLaunchFallback();
      clearOnboardingSchedule();
      unlistenProgress.then((fn) => fn());
      unlistenLogs.then((fn) => fn());
      unlistenLogBatch.then((fn) => fn());
      unlistenPort.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (phaseRef.current === "launching") {
      launchStartedRef.current = false;
      startupFinalizingRef.current = false;
      setProgressMsg("正在重试启动...");
      void launchService();
      return;
    }

    setProgress(0);
    setProgressMsg("正在重试初始化...");
    void runSetup();
  }, [launchService, runSetup]);

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
