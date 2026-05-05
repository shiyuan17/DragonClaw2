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

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { AppPhase, ServiceLifecycleSnapshot } from "../types";

interface UseServiceOptions {
    addLog: (level: string, message: string) => void;
    checkApiKey: () => Promise<void>;
    setRepairToast: (show: boolean) => void;
    setShowReinstallModal: (show: boolean) => void;
    running: boolean;
    setRunning: (r: boolean) => void;
    // From useSetup - needed for reinstall to reset phase
    setPhase: (phase: AppPhase) => void;
    setProgress: (p: number) => void;
    setProgressMsg: (m: string) => void;
    serviceLifecycle: ServiceLifecycleSnapshot | null;
}

interface ServiceHeartbeatPayload {
    running: boolean;
    port?: number;
}

export function useService({
    addLog, checkApiKey, setRepairToast, setShowReinstallModal,
    running, setRunning,
    setPhase, setProgress, setProgressMsg,
    serviceLifecycle,
}: UseServiceOptions) {
    const [loading, setLoading] = useState(false);
    const [uptime, setUptime] = useState(0);
    const [servicePort, setServicePort] = useState(18789);
    const [reinstalling, setReinstalling] = useState(false);
    const [repairing, setRepairing] = useState(false);
    const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startingUp = serviceLifecycle?.status === "service-starting";

    // Uptime counter
    useEffect(() => {
        if (running) {
            setUptime(0);
            uptimeRef.current = setInterval(() => setUptime((u) => u + 1), 1000);
        } else {
            if (uptimeRef.current) clearInterval(uptimeRef.current);
            setUptime(0);
        }
        return () => { if (uptimeRef.current) clearInterval(uptimeRef.current); };
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

        setRunning(serviceLifecycle.status === "ready");
    }, [serviceLifecycle, setRunning]);

    useEffect(() => {
        const unlistenHeartbeat = listen<ServiceHeartbeatPayload>("service-heartbeat", (event) => {
            setRunning(Boolean(event.payload.running));
            if (typeof event.payload.port === "number") {
                setServicePort(event.payload.port);
            }
        });

        const unlistenPort = listen<{ port: number }>(
            "service-port",
            (event) => setServicePort(event.payload.port)
        );

        return () => {
            unlistenHeartbeat.then((fn) => fn());
            unlistenPort.then((fn) => fn());
        };
    }, []);

    const handleStart = useCallback(async () => {
        setLoading(true);
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
        setPhase("initializing");
        setProgress(0);
        setProgressMsg("正在清理并重新安装...");
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
        addLog("info", "开始一键修复连接...");
        try {
            if (running) {
                addLog("info", "正在停止服务...");
                await invoke("stop_service");
                setRunning(false);
                await new Promise(r => setTimeout(r, 1500));
            }
            addLog("info", "正在重新启动服务...");
            await invoke("start_service_silent");
            await checkApiKey().catch((error) => {
                addLog("warn", `刷新网关配置失败: ${error}`);
            });
            addLog("success", "[OK] 连接修复已提交，服务将重新就绪");
        } catch (err) {
            addLog("error", `修复失败: ${err}`);
        } finally {
            setRepairing(false);
        }
    }, [addLog, checkApiKey, running, setRepairToast, setRunning]);

    return {
        loading, startingUp,
        uptime, servicePort,
        reinstalling, repairing,
        handleStart,
        handleStop,
        confirmReinstall,
        handleRepairConnection,
    };
}
