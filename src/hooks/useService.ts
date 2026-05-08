// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * useService Hook
 *
 * Manages the runtime service lifecycle: start, stop, heartbeat monitoring,
 * port detection, uptime tracking, reinstall, and connection repair.
 * Setup/initialization logic lives in useSetup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { AppPhase, ServiceLifecycleSnapshot } from "../types";
import { captureTelemetryEvent } from "../utils/telemetry";

interface UseServiceOptions {
  addLog: (level: string, message: string) => void;
  checkApiKey: () => Promise<void>;
  setRepairToast: (show: boolean) => void;
  setShowReinstallModal: (show: boolean) => void;
  running: boolean;
  setRunning: (running: boolean) => void;
  setPhase: (phase: AppPhase) => void;
  setProgress: (progress: number) => void;
  setProgressMsg: (message: string) => void;
  serviceLifecycle: ServiceLifecycleSnapshot | null;
}

interface ServiceHeartbeatPayload {
  running: boolean;
  port?: number;
}

export function useService({
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
}: UseServiceOptions) {
  const [loading, setLoading] = useState(false);
  const [uptime, setUptime] = useState(0);
  const [servicePort, setServicePort] = useState(18789);
  const [reinstalling, setReinstalling] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLifecycleStatusRef = useRef<ServiceLifecycleSnapshot["status"] | null>(null);
  const startingUp = serviceLifecycle?.status === "service-starting";

  useEffect(() => {
    if (running) {
      setUptime(0);
      uptimeRef.current = setInterval(() => setUptime((value) => value + 1), 1000);
    } else {
      if (uptimeRef.current) {
        clearInterval(uptimeRef.current);
      }
      setUptime(0);
    }

    return () => {
      if (uptimeRef.current) {
        clearInterval(uptimeRef.current);
      }
    };
  }, [running]);

  useEffect(() => {
    if (typeof serviceLifecycle?.port === "number" && serviceLifecycle.port > 0) {
      setServicePort(serviceLifecycle.port);
    }
  }, [serviceLifecycle]);

  useEffect(() => {
    if (!serviceLifecycle) {
      return;
    }

    if (lastLifecycleStatusRef.current !== serviceLifecycle.status) {
      if (serviceLifecycle.status === "ready") {
        captureTelemetryEvent("launcher_service_ready");
      } else if (serviceLifecycle.status === "failed") {
        captureTelemetryEvent("launcher_service_failed");
      }
      lastLifecycleStatusRef.current = serviceLifecycle.status;
    }

    setRunning(serviceLifecycle.status === "ready");
  }, [serviceLifecycle, setRunning]);

  useEffect(() => {
    const unlistenHeartbeat = listen<ServiceHeartbeatPayload>("service-heartbeat", (event) => {
      setRunning(Boolean(event.payload.running));
      if (typeof event.payload.port === "number") {
        setServicePort(event.payload.port);
      }
    });

    const unlistenPort = listen<{ port: number }>("service-port", (event) => {
      setServicePort(event.payload.port);
    });

    return () => {
      unlistenHeartbeat.then((fn) => fn());
      unlistenPort.then((fn) => fn());
    };
  }, [setRunning]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    captureTelemetryEvent("launcher_service_start_requested");
    try {
      await invoke("start_service_silent");
      await checkApiKey().catch((error) => {
        addLog("warn", `刷新网关配置失败: ${error}`);
      });
    } catch (err) {
      addLog("error", `启动失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [addLog, checkApiKey]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    captureTelemetryEvent("launcher_service_stop_requested");
    try {
      await invoke("stop_service");
      setRunning(false);
    } catch (err) {
      addLog("error", `停止失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [addLog, setRunning]);

  const confirmReinstall = useCallback(async () => {
    setShowReinstallModal(false);
    setReinstalling(true);
    captureTelemetryEvent("launcher_environment_reinstall_requested");
    setPhase("initializing");
    setProgress(0);
    setProgressMsg("正在清理并重新安装环境...");

    try {
      await invoke("reinstall_environment");
      setPhase("ready");
      addLog("success", "环境重新安装完成");
      await checkApiKey();
    } catch (err) {
      addLog("error", `重新安装失败: ${err}`);
      setProgressMsg(`[!] 重新安装失败: ${err}`);
    } finally {
      setReinstalling(false);
    }
  }, [addLog, checkApiKey, setShowReinstallModal, setPhase, setProgress, setProgressMsg]);

  const handleRepairConnection = useCallback(async () => {
    setRepairing(true);
    setRepairToast(false);
    captureTelemetryEvent("launcher_service_repair_requested");
    addLog("info", "开始一键修复连接...");

    try {
      if (running) {
        addLog("info", "正在停止服务...");
        await invoke("stop_service");
        setRunning(false);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      addLog("info", "正在重新启动服务...");
      await invoke("start_service_silent");
      await checkApiKey().catch((error) => {
        addLog("warn", `刷新网关配置失败: ${error}`);
      });
      addLog("success", "[OK] 连接修复请求已提交，服务将重新就绪");
    } catch (err) {
      addLog("error", `修复失败: ${err}`);
    } finally {
      setRepairing(false);
    }
  }, [addLog, checkApiKey, running, setRepairToast, setRunning]);

  return {
    loading,
    startingUp,
    uptime,
    servicePort,
    reinstalling,
    repairing,
    handleStart,
    handleStop,
    confirmReinstall,
    handleRepairConnection,
  };
}
