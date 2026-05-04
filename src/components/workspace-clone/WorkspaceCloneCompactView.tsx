import type { WorkspaceMenuKey } from "../../types";

import { WORKSPACE_MENU_ITEMS } from "./workspaceCloneData";

const COMPACT_COPY: Record<Exclude<WorkspaceMenuKey, "chat" | "employees">, { title: string; description: string; bullets: string[] }> = {
  schedule: {
    title: "定时任务工作区骨架",
    description: "这里先保留定时任务栏目结构与信息节奏，后续再逐步迁移真实调度能力。",
    bullets: ["后续迁移任务列表、启停状态和调度设置。", "当前仅保留标题、说明卡片和状态占位。"],
  },
  knowledge: {
    title: "知识库管理工作区骨架",
    description: "先保留知识类工作区的分区结构，为后续资料树、上传区和知识面板预留接口位置。",
    bullets: ["占位卡片模拟知识源、文档集和索引状态。", "本次不接入任何真实文档或后端命令。"],
  },
  skills: {
    title: "技能市场工作区骨架",
    description: "保留技能市场的栏目名称、区块层级和卡片节奏，但暂不接入安装、搜索或管理逻辑。",
    bullets: ["为后续迁移技能列表、筛选和安装入口预留空间。", "当前仅展示静态推荐卡片和说明文案。"],
  },
  tasks: {
    title: "产品落地工作区骨架",
    description: "保留产品落地栏目的主体结构，为后续承接项目编排、分阶段推进和结果沉淀预留骨架。",
    bullets: ["当前不提供真实任务流。", "后续按 DragonClaw 的能力逐项接入。"],
  },
};

interface WorkspaceCloneCompactViewProps {
  activeMenu: WorkspaceMenuKey;
  workspaceModelName: string;
  running: boolean;
  uptimeLabel: string;
}

export function WorkspaceCloneCompactView({
  activeMenu,
  workspaceModelName,
  running,
  uptimeLabel,
}: WorkspaceCloneCompactViewProps) {
  if (activeMenu === "chat" || activeMenu === "employees") {
    return null;
  }

  const section = COMPACT_COPY[activeMenu as Exclude<WorkspaceMenuKey, "chat" | "employees">];
  const menuLabel = WORKSPACE_MENU_ITEMS.find((item) => item.key === activeMenu)?.label || "";

  return (
    <div className="workspace-clone__compact-panel">
      <div className="workspace-clone__compact-hero">
        <div className="workspace-clone__compact-badge">{menuLabel}</div>
        <h1>{section.title}</h1>
        <p>{section.description}</p>
      </div>
      <div className="workspace-clone__compact-grid">
        {section.bullets.map((bullet) => (
          <div key={bullet} className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">{menuLabel.slice(0, 1)}</div>
            <div>
              <strong>{menuLabel}</strong>
              <small>{bullet}</small>
            </div>
          </div>
        ))}
        <div className="workspace-clone__compact-card">
          <div className="workspace-clone__compact-card-icon">模</div>
          <div>
            <strong>当前模型</strong>
            <small>{workspaceModelName}</small>
          </div>
        </div>
        <div className="workspace-clone__compact-card">
          <div className="workspace-clone__compact-card-icon">运</div>
          <div>
            <strong>运行状态</strong>
            <small>{running ? `运行中 · ${uptimeLabel}` : "服务尚未启动，当前仅保留骨架页面。"}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
