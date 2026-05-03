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

import type { AppPhase } from "../types";

interface UseServiceOptions {
    addLog: (level: string, message: string) => void;
    checkApiKey: () => Promise<void>;
    setRepairToast: (show: boolean) => void;
    setShowReinstallModal: (show: boolean) => void;
    running: boolean;
    setRunning: (r: boolean) => void;
    // From useSetup — needed for reinstall to reset phase
    setPhase: (phase: AppPhase) => void;
    setProgress: (p: number) => void;
    setProgressMsg: (m: string) => void;
}

interface ServiceHeartbeatPayload {
    running: boolean;
    port?: number;
}

interface ServiceLogPayload {
    level: string;
    message: string;
}

interface ServiceLogBatchPayload {
    logs: ServiceLogPayload[];
}

function isServiceReadyLogMessage(message?: string) {
    const msg = message?.toLowerCase() || "";
    return (
        msg.includes("listening") ||
        msg.includes("started on") ||
        msg.includes("ready on") ||
        msg.includes("server is running") ||
        msg.includes("server started") ||
        msg.includes("正在打开浏览器")
    );
}

export function useService({
    addLog, checkApiKey, setRepairToast, setShowReinstallModal,
    running, setRunning,
    setPhase, setProgress, setProgressMsg,
}: UseServiceOptions) {
    const [loading, setLoading] = useState(false);
    const [uptime, setUptime] = useState(0);
    const [servicePort, setServicePort] = useState(18789);
    const [reinstalling, setReinstalling] = useState(false);
    const [repairing, setRepairing] = useState(false);
    const [startingUp, setStartingUp] = useState(false);
    const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const runningRef = useRef(running);
    const reportedUnexpectedExitRef = useRef(false);

    useEffect(() => {
        runningRef.current = running;
        if (running) {
            reportedUnexpectedExitRef.current = false;
        }
    }, [running]);

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

    // Runtime event listeners: heartbeat + port
    useEffect(() => {
        const unlistenHeartbeat = listen<ServiceHeartbeatPayload>("service-heartbeat", (event) => {
            if (typeof event.payload.port === "number") {
                setServicePort(event.payload.port);
            }

            if (event.payload.running) {
                reportedUnexpectedExitRef.current = false;
                if (!runningRef.current) {
                    runningRef.current = true;
                    setRunning(true);
                }
                return;
            }

            if (runningRef.current && !reportedUnexpectedExitRef.current) {
                reportedUnexpectedExitRef.current = true;
                runningRef.current = false;
                setRunning(false);
                addLog("error", "OpenClaw 服务进程已意外退出");
            }
        });

        const unlistenPort = listen<{ port: number }>(
            "service-port",
            (event) => setServicePort(event.payload.port)
        );

        // Listen for service-ready signal to dismiss startup overlay
        const unlistenLog = listen<{ level: string; message: string }>(
            "service-log",
            (event) => {
                if (isServiceReadyLogMessage(event.payload.message)) {
                    setStartingUp(false);
                }
            }
        );

        const unlistenLogBatch = listen<ServiceLogBatchPayload>(
            "service-log-batch",
            (event) => {
                const logs = Array.isArray(event.payload.logs) ? event.payload.logs : [];
                if (logs.some((log) => isServiceReadyLogMessage(log.message))) {
                    setStartingUp(false);
                }
            }
        );

        return () => {
            unlistenHeartbeat.then((fn) => fn());
            unlistenPort.then((fn) => fn());
            unlistenLog.then((fn) => fn());
            unlistenLogBatch.then((fn) => fn());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleStart = useCallback(async () => {
        setLoading(true);
        setStartingUp(true);
        try {
            await invoke("start_service_silent");
            runningRef.current = true;
            setRunning(true);
        } catch (err) {
            addLog("error", `启动失败: ${err}`);
            setStartingUp(false);
        } finally {
            setLoading(false);
        }
    }, [addLog]);

    const handleStop = useCallback(async () => {
        setLoading(true);
        try {
            await invoke("stop_service");
            runningRef.current = false;
            reportedUnexpectedExitRef.current = false;
            setRunning(false);
        } catch (err) {
            addLog("error", `停止失败: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [addLog]);

    const confirmReinstall = useCallback(async () => {
        setShowReinstallModal(false);
        setReinstalling(true);
        setPhase("initializing");
        setProgress(0);
        setProgressMsg("正在清理并重新安装...");
        try {
            await invoke("reinstall_environment");
            setPhase("ready");
            addLog("success", "环境重新安装完成！");
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
        addLog("info", "🔧 开始一键修复连接...");
        try {
            if (running) {
                addLog("info", "正在停止服务...");
                await invoke("stop_service");
                runningRef.current = false;
                setRunning(false);
                await new Promise(r => setTimeout(r, 1500));
            }
            addLog("info", "正在重新启动服务...");
            await invoke("start_service_silent");
            runningRef.current = true;
            setRunning(true);
            addLog("success", "[OK] 连接修复完成，服务已重启");
        } catch (err) {
            addLog("error", `修复失败: ${err}`);
        } finally {
            setRepairing(false);
        }
    }, [addLog, running, servicePort, setRepairToast]);

    return {
        loading, startingUp, setStartingUp,
        uptime, servicePort,
        reinstalling, repairing,
        handleStart,
        handleStop,
        confirmReinstall,
        handleRepairConnection,
    };
}
