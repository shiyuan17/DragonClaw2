// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * SetupWizard Component
 *
 * Renders the startup/initialization screen and the workspace selection wizard.
 * Shown during "checking", "initializing", "launching", and "workspace" phases.
 *
 * Phase 5.14: light high-fidelity onboarding refresh based on the guide mock.
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { FolderSearch } from "lucide-react";
import logo from "../assets/dragonclaw-logo.png";
import type { AppPhase } from "../types";

interface SetupWizardProps {
    phase: AppPhase;
    progress: number;
    progressMsg: string;
    workspacePath: string;
    loading: boolean;
    appVersion: string;
    onSelectFolder: () => void;
    onConfirmWorkspace: () => void;
}

interface SetupStageLayoutProps {
    appVersion: string;
    title: string;
    description: string;
    progress?: number;
    showPercent?: boolean;
    children?: ReactNode;
    actions?: ReactNode;
}

function SetupStageLayout({
    appVersion,
    title,
    description,
    progress,
    showPercent = false,
    children,
    actions,
}: SetupStageLayoutProps) {
    const hasProgress = typeof progress === "number";
    const clampedProgress = hasProgress ? Math.max(0, Math.min(100, progress)) : 0;

    return (
        <div className="startup-container">
            <motion.div
                className="startup-box"
                initial={{ opacity: 0, y: 24, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
            >
                <div className="startup-hero-stage">
                    <img src={logo} alt="DragonClaw" className="startup-hero-logo" />
                </div>
                <div className="startup-eyebrow">DRAGONCLAW</div>
                <h1 className="startup-title">{title}</h1>

                {hasProgress && (
                    <div className="startup-progress-group" aria-hidden="true">
                        <div className="startup-progress-bar">
                            <motion.div
                                className="startup-progress-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${clampedProgress}%` }}
                                transition={{ ease: "easeOut", duration: 0.35 }}
                            />
                        </div>
                        {showPercent && clampedProgress > 0 && (
                            <div className="startup-percent">{clampedProgress}%</div>
                        )}
                    </div>
                )}

                <p className="startup-description">{description}</p>
                {children}
                {actions}
            </motion.div>
            <div className="startup-version">v{appVersion}</div>
        </div>
    );
}

export function SetupWizard({
    phase,
    progress,
    progressMsg,
    workspacePath,
    loading,
    appVersion,
    onSelectFolder,
    onConfirmWorkspace,
}: SetupWizardProps) {
    if (phase === "checking" || phase === "initializing") {
        const title = phase === "checking" ? "DragonClaw 姝ｅ湪妫€鏌ョ幆澧? : "DragonClaw 姝ｅ湪鍒濆鍖?";
        const description = progressMsg || (phase === "checking"
            ? "姝ｅ湪纭杩愯鐜涓庡叧閿緷璧栵紝璇风◢鍊欍€?"
            : "姝ｅ湪鍑嗗蹇呰缁勪欢涓庨粯璁ら厤缃紝璇风◢鍊欍€?");

        return (
            <SetupStageLayout
                appVersion={appVersion}
                title={title}
                description={description}
                progress={progress}
                showPercent
            />
        );
    }

    if (phase === "launching") {
        return (
            <SetupStageLayout
                appVersion={appVersion}
                title="鍗冲皢灏辩华"
                description={progressMsg || "姝ｅ湪鍑嗗浣犵殑宸ヤ綔鍙帮紝璇风◢鍊欍€?"}
                progress={Math.max(progress, 12)}
            />
        );
    }

    if (phase === "workspace") {
        return (
            <SetupStageLayout
                appVersion={appVersion}
                title="閫夋嫨宸ヤ綔鍖?"
                description="DragonClaw 浼氬湪杩欎釜鐩綍涓垱寤哄拰绠＄悊宸ヤ綔椤圭洰銆備綘鍙互閫夋嫨浠绘剰鏂囦欢澶癸紝鎴栫洿鎺ユ部鐢ㄩ粯璁ょ洰褰曘€?"
            >
                <div className="startup-workspace-panel">
                    <div className="startup-workspace-label">褰撳墠宸ヤ綔鍖虹洰褰?/div>
                    <code className="workspace-path">
                        {workspacePath || "~/Documents/OpenClaw-Projects (榛樿)"}
                    </code>
                </div>

                <div className="startup-actions">
                    <button className="startup-btn startup-btn--secondary" onClick={onSelectFolder} type="button">
                        <FolderSearch size={14} strokeWidth={1.6} />
                        娴忚鐩綍
                    </button>
                    <button
                        className="startup-btn startup-btn--primary"
                        onClick={onConfirmWorkspace}
                        disabled={loading}
                        type="button"
                    >
                        纭骞剁户缁?
                    </button>
                </div>
            </SetupStageLayout>
        );
    }

    return null;
}
