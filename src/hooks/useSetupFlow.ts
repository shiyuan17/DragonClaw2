import { invoke } from "@tauri-apps/api/core";
import type { MutableRefObject } from "react";

import type {
  AppPhase,
  CurrentConfig,
  ServiceLifecycleSnapshot,
} from "../types";
import {
  markOnboardingSkillInstallRequired,
  shouldRunOnboardingSkillInstall,
  startOnboardingSkillInstallBackground,
} from "../utils/onboardingSkillInstaller";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface BackgroundOnboardingOptions {
  addLog: (level: string, message: string) => void;
  clearOnboardingSchedule: () => void;
  onboardingDelayRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onboardingIdleRef: MutableRefObject<number | null>;
  onboardingInstallRunningRef: MutableRefObject<boolean>;
  onboardingBackgroundDelayMs: number;
}

export function scheduleBackgroundOnboardingSkillInstall({
  addLog,
  clearOnboardingSchedule,
  onboardingDelayRef,
  onboardingIdleRef,
  onboardingInstallRunningRef,
  onboardingBackgroundDelayMs,
}: BackgroundOnboardingOptions) {
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
        { timeout: onboardingBackgroundDelayMs },
      );
      return;
    }

    void triggerInstall();
  }, onboardingBackgroundDelayMs);
}

interface LaunchPollingOptions {
  addLog: (level: string, message: string) => void;
  clearLaunchFallback: () => void;
  finalizeStartup: (force?: boolean) => Promise<void>;
  launchFallbackRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  launchPollInFlightRef: MutableRefObject<boolean>;
  launchStartedRef: MutableRefObject<boolean>;
  phaseRef: MutableRefObject<AppPhase>;
  startupFinalizingRef: MutableRefObject<boolean>;
  setLoading: (loading: boolean) => void;
  setProgressMsg: (message: string) => void;
  setSetupError: (error: string | null) => void;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

export function startSetupLaunchPolling(message: string, options: LaunchPollingOptions) {
  const {
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
    pollIntervalMs,
    pollTimeoutMs,
  } = options;

  clearLaunchFallback();
  setProgressMsg(message);
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

    if (Date.now() - fallbackStartedAt >= pollTimeoutMs) {
      launchStartedRef.current = false;
      setSetupError("OpenClaw 服务启动超时，请重试");
      setProgressMsg("启动超时，请重试");
      addLog("error", "OpenClaw 服务启动超时，未在 60 秒内确认 ready");
      setLoading(false);
      return;
    }

    launchFallbackRef.current = setTimeout(pollServiceReady, pollIntervalMs);
  };

  launchFallbackRef.current = setTimeout(pollServiceReady, pollIntervalMs);
}

interface EnvironmentCheckOptions {
  addLog: (level: string, message: string) => void;
  clearEnvironmentCheckTimeout: () => void;
  environmentCheckStartedRef: MutableRefObject<boolean>;
  environmentCheckTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  phaseRef: MutableRefObject<AppPhase>;
  setLoading: (loading: boolean) => void;
  setProgressMsg: (message: string) => void;
  setSetupError: (error: string | null) => void;
  timeoutMs: number;
  runCheck: () => Promise<void>;
}

export function beginSetupEnvironmentCheck(options: EnvironmentCheckOptions) {
  const {
    addLog,
    clearEnvironmentCheckTimeout,
    environmentCheckStartedRef,
    environmentCheckTimeoutRef,
    phaseRef,
    setLoading,
    setProgressMsg,
    setSetupError,
    timeoutMs,
    runCheck,
  } = options;

  if (environmentCheckStartedRef.current) {
    return;
  }

  environmentCheckStartedRef.current = true;
  setLoading(true);
  setSetupError(null);
  clearEnvironmentCheckTimeout();
  environmentCheckTimeoutRef.current = setTimeout(() => {
    if (phaseRef.current !== "checking") {
      return;
    }

    setSetupError("环境检查超时，请重试。");
    setProgressMsg("环境检查超时，请重试。");
    setLoading(false);
    addLog("error", "Environment check timed out before startup could advance out of checking.");
  }, timeoutMs);

  void runCheck().finally(() => {
    clearEnvironmentCheckTimeout();
    if (phaseRef.current === "checking") {
      setLoading(false);
    }
  });
}

interface SyncWorkspacePathOptions {
  fallback?: string;
  setWorkspacePath: (path: string) => void;
}

export async function syncSetupWorkspacePath({
  fallback,
  setWorkspacePath,
}: SyncWorkspacePathOptions) {
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
}

interface ConfigureWorkspaceOptions {
  nextWorkspacePath?: string | null;
  setWorkspacePath: (path: string) => void;
}

export async function configureSetupWorkspace({
  nextWorkspacePath,
  setWorkspacePath,
}: ConfigureWorkspaceOptions) {
  const trimmedWorkspacePath = typeof nextWorkspacePath === "string"
    ? nextWorkspacePath.trim()
    : "";

  await invoke("inject_default_config", {
    workspacePath: trimmedWorkspacePath || null,
  });
  await invoke("inject_default_models");
  await markOnboardingSkillInstallRequired();
  return syncSetupWorkspacePath({
    fallback: trimmedWorkspacePath || undefined,
    setWorkspacePath,
  });
}
