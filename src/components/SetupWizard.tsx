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
    const title = phase === "checking" ? "DragonClaw 正在检查环境" : "DragonClaw 正在初始化";
    const description = progressMsg || (
      phase === "checking"
        ? "正在确认运行环境与关键依赖，请稍候。"
        : "正在准备必要组件与默认配置，请稍候。"
    );

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
        title="即将就绪"
        description={progressMsg || "正在准备你的工作台，请稍候。"}
        progress={Math.max(progress, 12)}
      />
    );
  }

  if (phase === "workspace") {
    return (
      <SetupStageLayout
        appVersion={appVersion}
        title="选择工作区"
        description="DragonClaw 会在这个目录中创建和管理工作项目。你可以选择任意文件夹，或直接沿用默认目录。"
      >
        <div className="startup-workspace-panel">
          <div className="startup-workspace-label">当前工作区目录</div>
          <code className="workspace-path">
            {workspacePath || "~/Documents/OpenClaw-Projects (默认)"}
          </code>
        </div>

        <div className="startup-actions">
          <button className="startup-btn startup-btn--secondary" onClick={onSelectFolder} type="button">
            <FolderSearch size={14} strokeWidth={1.6} />
            浏览目录
          </button>
          <button
            className="startup-btn startup-btn--primary"
            onClick={onConfirmWorkspace}
            disabled={loading}
            type="button"
          >
            确认并继续
          </button>
        </div>
      </SetupStageLayout>
    );
  }

  return null;
}
