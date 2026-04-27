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
import type { AppPhase } from "../types";

interface UseSetupOptions {
    addLog: (level: string, message: string) => void;
    checkApiKey: () => Promise<void>;
    setRunning: (r: boolean) => void;
}

export function useSetup({ addLog, checkApiKey, setRunning }: UseSetupOptions) {
    const [phase, setPhase] = useState<AppPhase>("checking");
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState("正在检查环境...");
    const [workspacePath, setWorkspacePath] = useState("");
    const [setupError, setSetupError] = useState<string | null>(null);
    const phaseRef = useRef<AppPhase>("checking");
    const launchStartedRef = useRef(false);
    const launchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

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

    const finishLaunch = useCallback(async () => {
        if (phaseRef.current !== "launching") return;
        clearLaunchFallback();
        launchStartedRef.current = false;
        setProgress(100);
        setProgressMsg("OpenClaw 服务已就绪");
        setRunning(true);
        setSetupPhase("ready");
        setLoading(false);
        addLog("success", "OpenClaw 服务已启动");
        await checkApiKey();
    }, [addLog, checkApiKey, clearLaunchFallback, setRunning, setSetupPhase]);

    const launchService = useCallback(async () => {
        if (launchStartedRef.current) return;
        launchStartedRef.current = true;
        clearLaunchFallback();
        setSetupPhase("launching");
        setLoading(true);
        setSetupError(null);
        setProgress(98);
        setProgressMsg("正在启动 OpenClaw 服务...");

        try {
            const result = await invoke<string>("start_service_silent");
            setRunning(true);
            if (result.toLowerCase().includes("already running")) {
                await finishLaunch();
                return;
            }

            if (phaseRef.current !== "launching") return;
            setProgressMsg("OpenClaw 服务启动中，等待就绪信号...");
            launchFallbackRef.current = setTimeout(async () => {
                if (phaseRef.current !== "launching") return;
                try {
                    const alive = await invoke<boolean>("is_service_running");
                    if (alive) await finishLaunch();
                } catch {
                    // The visible error path is handled by the initial start call.
                }
            }, 15000);
        } catch (err) {
            launchStartedRef.current = false;
            setSetupError(String(err));
            setProgressMsg("启动失败，请重试");
            addLog("error", `启动失败: ${err}`);
            setLoading(false);
        }
    }, [addLog, clearLaunchFallback, finishLaunch, setRunning, setSetupPhase]);

    const runSetup = useCallback(async () => {
        setLoading(true);
        setSetupError(null);
        try {
            await invoke("setup_openclaw");
            addLog("success", "OpenClaw 初始化完成！");
            await launchService();
        } catch (err) {
            addLog("error", `初始化失败: ${err}`);
            setSetupError(String(err));
        } finally {
            if (phaseRef.current !== "launching") setLoading(false);
        }
    }, [addLog, launchService]);

    const checkEnvironment = useCallback(async () => {
        try {
            const nodeOk = await invoke<boolean>("check_node_exists");
            const openclawOk = await invoke<boolean>("check_openclaw_exists");
            const modulesOk = await invoke<boolean>("check_node_modules_exists");
            const serviceRunning = await invoke<boolean>("is_service_running");

            if (nodeOk && openclawOk && modulesOk) {
                const configOk = await invoke<boolean>("check_config_exists");
                if (!configOk) {
                    setSetupPhase("workspace");
                    addLog("info", "首次使用，请选择工作区目录");
                } else {
                    addLog("success", "[OK] 环境检查通过，所有组件就绪");
                    if (serviceRunning) {
                        setSetupPhase("ready");
                        setRunning(true);
                        await checkApiKey();
                    } else {
                        await launchService();
                    }
                }
            } else {
                setSetupPhase("initializing");
                addLog("info", "首次启动，开始初始化环境...");
                await runSetup();
            }
        } catch (err) {
            addLog("error", `环境检查失败: ${err}`);
            setSetupPhase("initializing");
            await runSetup();
        }
    }, [addLog, checkApiKey, launchService, runSetup, setRunning, setSetupPhase]);

    // On mount: check environment + register setup event listeners
    useEffect(() => {
        const unlistenProgress = listen<{ stage: string; message: string; percent: number }>(
            "setup-progress",
            (event) => {
                setProgress(event.payload.percent);
                setProgressMsg(event.payload.message);
                addLog("info", event.payload.message);
            }
        );

        const unlistenLogs = listen<{ level: string; message: string }>(
            "service-log",
            (event) => {
                addLog(event.payload.level, event.payload.message);
                const msg = event.payload.message?.toLowerCase() || "";
                if (
                    phaseRef.current === "launching" &&
                    (
                        msg.includes("listening") ||
                        msg.includes("started on") ||
                        msg.includes("ready on") ||
                        msg.includes("server is running") ||
                        msg.includes("server started")
                    )
                ) {
                    void finishLaunch();
                }
            }
        );

        checkEnvironment();

        return () => {
            clearLaunchFallback();
            unlistenProgress.then((fn) => fn());
            unlistenLogs.then((fn) => fn());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSelectFolder = useCallback(async () => {
        const selected = await open({ directory: true, multiple: false, title: "选择你的工作区目录" });
        if (selected && typeof selected === "string") setWorkspacePath(selected);
    }, []);

    const handleConfirmWorkspace = useCallback(async () => {
        setLoading(true);
        try {
            await invoke("inject_default_config");
            await invoke("inject_default_models");
            addLog("success", `[OK] 工作区已配置: ${workspacePath || "默认目录"}`);
            await launchService();
        } catch (err) {
            addLog("error", `配置失败: ${err}`);
        } finally {
            if (phaseRef.current !== "launching") setLoading(false);
        }
    }, [addLog, launchService, workspacePath]);

    const handleSwitchWorkspace = useCallback(async () => {
        const selected = await open({ directory: true, multiple: false, title: "切换工作区目录" });
        if (selected && typeof selected === "string") {
            setWorkspacePath(selected);
            setLoading(true);
            try {
                await invoke("inject_default_config");
                addLog("success", `[OK] 工作区已切换到: ${selected}`);
            } catch (err) {
                addLog("error", `切换失败: ${err}`);
            } finally {
                setLoading(false);
            }
        }
    }, [addLog]);

    const clearSetupError = useCallback(() => setSetupError(null), []);

    const retrySetup = useCallback(() => {
        setSetupError(null);
        if (phaseRef.current === "launching") {
            launchStartedRef.current = false;
            setProgressMsg("正在重试启动...");
            void launchService();
            return;
        }
        setProgress(0);
        setProgressMsg("正在重试初始化...");
        void runSetup();
    }, [launchService, runSetup]);

    return {
        phase, setPhase: setSetupPhase,
        loading, setLoading,
        progress, setProgress,
        progressMsg, setProgressMsg,
        workspacePath,
        setupError, clearSetupError, retrySetup,
        handleSelectFolder,
        handleConfirmWorkspace,
        handleSwitchWorkspace,
    };
}
