// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { invoke } from "@tauri-apps/api/core";
import { Activity, Cpu, Hexagon, Loader2, Play, Square } from "lucide-react";
import { motion } from "framer-motion";
import { formatUptime } from "../utils/log-humanizer";
import logo from "../assets/dragonclaw-logo.png";

interface DashboardTabProps {
    running: boolean;
    loading: boolean;
    servicePort: number;
    consoleUrl: string | null;
    uptime: number;
    currentModelName: string;
    currentProviderName: string;
    handleStart: () => void;
    handleStop: () => void;
    setShowKeyModal: (v: boolean) => void;
    setShowModelSwitchModal: (v: boolean) => void;
}

export function DashboardTab({
    running, loading, servicePort, consoleUrl, uptime,
    currentModelName, currentProviderName,
    handleStart, handleStop,
    setShowKeyModal, setShowModelSwitchModal,
}: DashboardTabProps) {
    return (
        <motion.div
            key="dashboard"
            className="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
        >
            <div className="dashboard-hero">
                <div className={`status-ring ${running ? "running" : "stopped"}`}>
                    <img src={logo} alt="DragonClaw" className="status-ring-logo" />
                </div>
                <h2 className="hero-status-text">
                    {running ? "OpenClaw 鏍稿績杩愯涓?" : "寮曟搸宸插氨缁?"}
                </h2>
                <div className="hero-subtext">
                    {running ? `鏈湴鎺ュ彛宸叉寕杞借嚦 localhost:${servicePort}` : "鐐瑰嚮涓嬫柟鎸夐挳鍚姩鏈湴 AI 椹卞姩鏍稿績"}
                </div>

                <div className="hero-controls">
                    <button
                        className={`btn-primary btn-hero ${running ? "stop" : "start"}`}
                        onClick={running ? handleStop : handleStart}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="spin" size={18} />
                                {running ? "涓柇涓?.." : "寮曟搸鍞ら啋涓?.."}
                            </>
                        ) : (
                            running ? <><Square size={16} fill="currentColor" /> 涓柇鏈嶅姟</> : <><Play size={16} fill="currentColor" /> 鍒濆鍖栧苟鍚姩</>
                        )}
                    </button>
                    {running && (
                        <button
                            className="btn-secondary btn-hero-sub animate-fade-in"
                            onClick={() => void invoke("open_console", { port: servicePort })}
                            disabled={!consoleUrl}
                        >
                            <Activity size={16} strokeWidth={2} /> 璁块棶鎺у埗鍙?
                        </button>
                    )}
                </div>
            </div>

            <div className="dashboard-stats">
                <div className="stat-card" onClick={() => setShowModelSwitchModal(true)} style={{ cursor: "pointer" }} title="鐐瑰嚮鍒囨崲妯″瀷">
                    <div className="stat-icon"><Cpu size={16} strokeWidth={2} /></div>
                    <div className="stat-details">
                        <div className="stat-label">椹卞姩妯″瀷 (鐐瑰嚮鍒囨崲)</div>
                        <div className="stat-value">{currentModelName}</div>
                    </div>
                </div>

                <div className="stat-card" onClick={() => setShowKeyModal(true)} style={{ cursor: "pointer" }} title="鐐瑰嚮閰嶇疆 API">
                    <div className="stat-icon"><Hexagon size={16} strokeWidth={2} /></div>
                    <div className="stat-details">
                        <div className="stat-label">璁＄畻鑺傜偣 (鎻愪緵鍟?</div>
                        <div className="stat-value">{currentProviderName}</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon"><Activity size={16} strokeWidth={2} /></div>
                    <div className="stat-details">
                        <div className="stat-label">杩炵画杩愯鏃堕暱</div>
                        <div className="stat-value">{running ? formatUptime(uptime) : "浼戠湢涓?"}</div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
