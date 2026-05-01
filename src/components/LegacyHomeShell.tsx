// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import type { ReactNode, RefObject } from "react";
import { AnimatePresence } from "framer-motion";
import { Activity, BarChart3, Bot, Network, SlidersHorizontal } from "lucide-react";
import { AgentsTab } from "./AgentsTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { DashboardTab } from "./DashboardTab";
import { ModelsTab } from "./ModelsTab";
import { SettingsTab } from "./SettingsTab";
import type { CurrentConfig, LogEntry, ProviderInfo, TabId } from "../types";

interface LegacyHomeShellProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  activeSettingsTab: "general" | "logs" | "about";
  setActiveSettingsTab: (tab: "general" | "logs" | "about") => void;
  running: boolean;
  loading: boolean;
  appVersion: string;
  servicePort: number;
  consoleUrl: string | null;
  uptime: number;
  currentModelName: string;
  currentProviderName: string;
  workspacePath: string;
  currentConfig: CurrentConfig | null;
  providers: ProviderInfo[];
  filteredProviders: ProviderInfo[];
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  selectedProvider: string;
  setSelectedProvider: (value: string) => void;
  apiKeyInput: string;
  setApiKeyInput: (value: string) => void;
  baseUrlInput: string;
  setBaseUrlInput: (value: string) => void;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  configSaving: boolean;
  setConfigStatus: (message: string) => void;
  configVersion: number;
  resetModalState: () => void;
  checkApiKey: () => Promise<void>;
  handleSaveConfig: () => Promise<void>;
  logs: LogEntry[];
  logRef: RefObject<HTMLDivElement | null>;
  setShowKeyModal: (value: boolean) => void;
  setShowModelSwitchModal: (value: boolean) => void;
  setStartingUp: (value: boolean) => void;
  setRunning: (value: boolean) => void;
  addLog: (level: string, message: string) => void;
  reinstalling: boolean;
  repairing: boolean;
  handleStart: () => void;
  handleStop: () => void;
  handleSwitchWorkspace: () => void;
  handleReinstall: () => void;
  handleRepairConnection: () => void;
  handleReset: () => void;
  setInfoModalTitle: (value: string) => void;
  onExportDiagnostics: () => Promise<void>;
  onCheckUpdate: () => Promise<void>;
  checkingUpdate: boolean;
}

const LEGACY_TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "dashboard", label: "仪表盘", icon: <Activity size={18} strokeWidth={1.5} /> },
  { id: "models", label: "AI 引擎", icon: <Network size={18} strokeWidth={1.5} /> },
  { id: "agents", label: "智能体", icon: <Bot size={18} strokeWidth={1.5} /> },
  { id: "analytics", label: "数据统计", icon: <BarChart3 size={18} strokeWidth={1.5} /> },
  { id: "settings", label: "设置中心", icon: <SlidersHorizontal size={18} strokeWidth={1.5} /> },
];

export function LegacyHomeShell({
  activeTab,
  setActiveTab,
  activeSettingsTab,
  setActiveSettingsTab,
  running,
  loading,
  appVersion,
  servicePort,
  consoleUrl,
  uptime,
  currentModelName,
  currentProviderName,
  workspacePath,
  currentConfig,
  providers,
  filteredProviders,
  selectedCategory,
  setSelectedCategory,
  selectedProvider,
  setSelectedProvider,
  apiKeyInput,
  setApiKeyInput,
  baseUrlInput,
  setBaseUrlInput,
  selectedModel,
  setSelectedModel,
  configSaving,
  setConfigStatus,
  configVersion,
  resetModalState,
  checkApiKey,
  handleSaveConfig,
  logs,
  logRef,
  setShowKeyModal,
  setShowModelSwitchModal,
  setStartingUp,
  setRunning,
  addLog,
  reinstalling,
  repairing,
  handleStart,
  handleStop,
  handleSwitchWorkspace,
  handleReinstall,
  handleRepairConnection,
  handleReset,
  setInfoModalTitle,
  onExportDiagnostics,
  onCheckUpdate,
  checkingUpdate,
}: LegacyHomeShellProps) {
  return (
    <>
      <nav className="tab-nav">
        {LEGACY_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="tab-content">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <DashboardTab
              running={running}
              loading={loading}
              servicePort={servicePort}
              consoleUrl={consoleUrl}
              uptime={uptime}
              currentModelName={currentModelName}
              currentProviderName={currentProviderName}
              handleStart={handleStart}
              handleStop={handleStop}
              setShowKeyModal={setShowKeyModal}
              setShowModelSwitchModal={setShowModelSwitchModal}
            />
          )}

          {activeTab === "models" && (
            <ModelsTab
              providers={providers}
              filteredProviders={filteredProviders}
              currentConfig={currentConfig}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              apiKeyInput={apiKeyInput}
              setApiKeyInput={setApiKeyInput}
              baseUrlInput={baseUrlInput}
              setBaseUrlInput={setBaseUrlInput}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              configSaving={configSaving}
              setConfigStatus={setConfigStatus}
              setShowKeyModal={setShowKeyModal}
              handleSaveConfig={handleSaveConfig}
              configVersion={configVersion}
              resetModalState={resetModalState}
              onConfigChanged={checkApiKey}
              running={running}
              addLog={addLog}
              setRunning={setRunning}
              setStartingUp={setStartingUp}
            />
          )}

          {activeTab === "agents" && <AgentsTab />}
          {activeTab === "analytics" && <AnalyticsTab />}

          {activeTab === "settings" && (
            <SettingsTab
              activeSettingsTab={activeSettingsTab}
              setActiveSettingsTab={setActiveSettingsTab}
              workspacePath={workspacePath}
              servicePort={servicePort}
              currentConfig={currentConfig}
              running={running}
              reinstalling={reinstalling}
              repairing={repairing}
              logs={logs}
              logRef={logRef}
              handleSwitchWorkspace={handleSwitchWorkspace}
              handleReinstall={handleReinstall}
              handleRepairConnection={handleRepairConnection}
              handleReset={handleReset}
              setShowKeyModal={setShowKeyModal}
              setInfoModalTitle={setInfoModalTitle}
              onExportDiagnostics={onExportDiagnostics}
              checkingUpdate={checkingUpdate}
              appVersion={appVersion}
              onCheckUpdate={onCheckUpdate}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
