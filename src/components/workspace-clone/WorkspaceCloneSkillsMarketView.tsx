import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME, resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import { useFeedback } from "../../hooks/useFeedback";
import type { AgentInfo, SkillHubInstallRuntimeInfo } from "../../types";
import { installSkillMarketSkill, loadInstalledSkillMarketSlugs } from "../../api/skillMarket";
import {
  fetchSkillTop50,
  fetchSkillsByCategory,
  fetchSkillsByKeyword,
  type SkillMarketCategory,
  type SkillMarketSkill,
} from "../../services/skillsMarket";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

const PAGE_SIZE = 100;

type MarketCategoryId = "top" | SkillMarketCategory;

type MarketCategoryOption = {
  id: MarketCategoryId;
  label: string;
  hint: string;
};

type InstallTargetOption = {
  id: string;
  name: string;
  subtitle: string;
  isMain: boolean;
};

function buildKeyboardHandler(onOpen: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); }
  };
}

const MARKET_CATEGORIES: MarketCategoryOption[] = [
  { id: "top", label: "热门推荐", hint: "Top 50 技能" },
  { id: "ai-intelligence", label: "AI 智能", hint: "智能体与推理增强" },
  { id: "developer-tools", label: "开发工具", hint: "工程与研发效率" },
  { id: "productivity", label: "效率协作", hint: "办公与流程自动化" },
  { id: "data-analysis", label: "数据分析", hint: "洞察、报表与可视化" },
  { id: "content-creation", label: "内容创作", hint: "文案、媒体与运营" },
  { id: "security-compliance", label: "安全合规", hint: "风险控制与治理" },
  { id: "communication-collaboration", label: "沟通协同", hint: "协作、连接与集成" },
];

function normalizeSlug(value: string | null | undefined) { return (value ?? "").trim().toLowerCase(); }

function formatCount(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}w`;
  }

  return String(Math.round(value));
}

function formatVersion(value: string | null | undefined) { return (value ?? "").trim() || "v1.0.0"; }

function getSkillDescription(skill: SkillMarketSkill) {
  return skill.descriptionZh.trim() || skill.description.trim() || "暂无技能描述。";
}

function getCategoryLabel(category: string | null | undefined) {
  const normalized = (category ?? "").trim().toLowerCase();
  return MARKET_CATEGORIES.find((item) => item.id === normalized)?.label || normalized || "未分类";
}

function buildInstallTargetOptions(agents: AgentInfo[], currentAgentId: string | null) {
  const options = agents.map<InstallTargetOption>((agent) => ({
    id: agent.name,
    name: resolveWorkspaceAgentDisplayName(agent.name, agent.name),
    subtitle: agent.model?.trim() || (agent.is_default ? "默认 Agent" : `agentId: ${agent.name}`),
    isMain: agent.is_default || agent.name === "main",
  }));

  if (!options.some((item) => item.id === "main")) {
    options.unshift({
      id: "main",
      name: MAIN_AGENT_DISPLAY_NAME,
      subtitle: "默认 Agent",
      isMain: true,
    });
  }

  const sorted = [...options].sort((left, right) => {
    if (left.isMain !== right.isMain) {
      return left.isMain ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });

  const fallbackSelected = currentAgentId?.trim() || "main";
  return {
    options: sorted,
    selected: sorted.some((item) => item.id === fallbackSelected) ? [fallbackSelected] : [sorted[0]?.id || "main"],
  };
}

function getSkillHubRuntimeSummary(runtimeInfo: SkillHubInstallRuntimeInfo | null) {
  if (!runtimeInfo) {
    return "";
  }

  switch (runtimeInfo.installMode) {
    case "bash-shell":
      return `将通过 bash 安装${runtimeInfo.isWslBash ? " (WSL)" : ""}`;
    case "windows-native":
      return `将通过 Windows 原生 Python 安装（${runtimeInfo.pythonVersion || "python"}）`;
    default:
      return "当前环境缺少 bash 和 Python，无法安装 SkillHub 技能";
  }
}

function getSkillHubRuntimeBlockingMessage(runtimeInfo: SkillHubInstallRuntimeInfo | null) {
  if (!runtimeInfo || runtimeInfo.installMode !== "unavailable") return "";

  return runtimeInfo.pythonAvailable
    ? "未检测到可用 bash。"
    : "未检测到可用 bash，也未检测到 Python 3。请先安装 WSL/Git Bash 或 Python 3。";
}

interface WorkspaceCloneSkillsMarketViewProps {
  currentAgentId: string | null;
  onRefreshCurrentAgentSkills: () => Promise<void> | void;
}

export function WorkspaceCloneSkillsMarketView({
  currentAgentId,
  onRefreshCurrentAgentSkills,
}: WorkspaceCloneSkillsMarketViewProps) {
  const { pushFeedback } = useFeedback();
  const [activeCategory, setActiveCategory] = useState<MarketCategoryId>("top");
  const [searchValue, setSearchValue] = useState("");
  const [skills, setSkills] = useState<SkillMarketSkill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailSkill, setDetailSkill] = useState<SkillMarketSkill | null>(null);
  const [installSkill, setInstallSkill] = useState<SkillMarketSkill | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installTargets, setInstallTargets] = useState<InstallTargetOption[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [installTargetsLoading, setInstallTargetsLoading] = useState(false);
  const [installError, setInstallError] = useState("");
  const [installRuntimeInfo, setInstallRuntimeInfo] = useState<SkillHubInstallRuntimeInfo | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<string[]>([]);
  const requestSeqRef = useRef(0);
  const deferredSearchValue = useDeferredValue(searchValue);

  const currentCategory = useMemo(
    () => MARKET_CATEGORIES.find((item) => item.id === activeCategory) ?? MARKET_CATEGORIES[0],
    [activeCategory],
  );

  const pagedSkills = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return skills.slice(start, start + PAGE_SIZE);
  }, [page, skills]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(skills.length / PAGE_SIZE)), [skills.length]);
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages]);
  const summaryText = useMemo(
    () => `${currentCategory.label} · ${pagedSkills.length} / ${Math.max(total, skills.length)} · ${page}/${totalPages}`,
    [currentCategory.label, page, pagedSkills.length, skills.length, total, totalPages],
  );

  const refreshInstalledSlugs = async () => {
    setInstalledLoading(true);
    try {
      const nextSlugs = await loadInstalledSkillMarketSlugs();
      setInstalledSlugs(nextSlugs.map((item) => normalizeSlug(item)).filter(Boolean));
    } catch (installedError) {
      setError(installedError instanceof Error ? installedError.message : "读取已安装技能失败。");
    } finally {
      setInstalledLoading(false);
    }
  };

  useEffect(() => {
    void refreshInstalledSlugs();
  }, []);

  useEffect(() => {
    const message = notice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-skills-market-notice",
      persistent: false,
    });
  }, [notice, pushFeedback]);

  useEffect(() => {
    const message = error.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "技能市场",
      message,
      dedupeKey: "workspace-skills-market-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [error, pushFeedback]);

  useEffect(() => {
    const message = installError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "技能安装",
      message,
      dedupeKey: "workspace-skills-market-install-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [installError, pushFeedback]);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, deferredSearchValue]);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const keyword = deferredSearchValue.trim();
        const result = keyword
          ? await fetchSkillsByKeyword(keyword, {
              page: 1,
              pageSize: 200,
              sortBy: "score",
              order: "desc",
              category: activeCategory === "top" ? undefined : activeCategory,
            })
          : activeCategory === "top"
            ? await fetchSkillTop50()
            : await fetchSkillsByCategory(activeCategory, {
                page: 1,
                pageSize: 200,
                sortBy: "score",
                order: "desc",
              });

        if (cancelled || requestSeqRef.current !== requestId) {
          return;
        }

        setSkills(result.skills);
        setTotal(result.total);
      } catch (loadError) {
        if (cancelled || requestSeqRef.current !== requestId) {
          return;
        }

        setSkills([]);
        setTotal(0);
        setError(loadError instanceof Error ? loadError.message : "技能市场加载失败。");
      } finally {
        if (!cancelled && requestSeqRef.current === requestId) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, deferredSearchValue]);

  const installedSlugSet = useMemo(() => new Set(installedSlugs), [installedSlugs]);

  const handleOpenHomepage = async (skill: SkillMarketSkill) => {
    const target = skill.homepage?.trim() || "https://skillhub.cn/";
    try {
      await invoke<string>("open_url", { url: target });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "无法打开外部链接。");
    }
  };

  const handleOpenInstallModal = async (skill: SkillMarketSkill) => {
    setDetailSkill(null);
    setInstallSkill(skill);
    setInstallModalOpen(true);
    setInstallTargetsLoading(true);
    setInstallError("");
    setInstallRuntimeInfo(null);

    try {
      const [agents, runtimeInfo] = await Promise.all([
        invoke<AgentInfo[]>("list_agents"),
        invoke<SkillHubInstallRuntimeInfo>("get_skillhub_install_runtime_info"),
      ]);
      const built = buildInstallTargetOptions(agents, currentAgentId);
      setInstallTargets(built.options);
      setSelectedTargetIds(built.selected);
      setInstallRuntimeInfo(runtimeInfo);
    } catch (targetsError) {
      setInstallTargets([
        {
          id: "main",
          name: MAIN_AGENT_DISPLAY_NAME,
          subtitle: "默认 Agent",
          isMain: true,
        },
      ]);
      setSelectedTargetIds([currentAgentId?.trim() || "main"]);
      setInstallError(targetsError instanceof Error ? targetsError.message : "读取安装目标失败。");
    } finally {
      setInstallTargetsLoading(false);
    }
  };

  const handleToggleInstallTarget = (targetId: string) => {
    setSelectedTargetIds((current) =>
      current.includes(targetId)
        ? current.filter((item) => item !== targetId)
        : [...current, targetId],
    );
  };

  const handleConfirmInstall = async () => {
    if (!installSkill) {
      return;
    }

    if (installRuntimeInfo?.installMode === "unavailable") {
      setInstallError(getSkillHubRuntimeBlockingMessage(installRuntimeInfo) || "当前环境无法安装 SkillHub 技能。");
      return;
    }

    if (selectedTargetIds.length === 0) {
      setInstallError("请至少选择一个安装目标。");
      return;
    }

    setInstalling(true);
    setInstallError("");
    setError("");

    try {
      const message = await installSkillMarketSkill(installSkill.slug, selectedTargetIds);
      setNotice(message);
      setInstallModalOpen(false);
      await refreshInstalledSlugs();

      if (currentAgentId && selectedTargetIds.includes(currentAgentId)) {
        await onRefreshCurrentAgentSkills();
      } else if (!currentAgentId && selectedTargetIds.includes("main")) {
        await onRefreshCurrentAgentSkills();
      }
    } catch (submitError) {
      setInstallError(submitError instanceof Error ? submitError.message : "技能安装失败。");
    } finally {
      setInstalling(false);
    }
  };

  const detailInstalled = detailSkill ? installedSlugSet.has(normalizeSlug(detailSkill.slug)) : false;
  const selectedInstallTargets = useMemo(
    () => installTargets.filter((target) => selectedTargetIds.includes(target.id)),
    [installTargets, selectedTargetIds],
  );
  const primarySelectedTarget = selectedInstallTargets[0] ?? null;
  const installRuntimeSummary = getSkillHubRuntimeSummary(installRuntimeInfo);
  const installRuntimeBlockingMessage = getSkillHubRuntimeBlockingMessage(installRuntimeInfo);

  const renderCard = (skill: SkillMarketSkill) => {
    const installed = installedSlugSet.has(normalizeSlug(skill.slug));

    return (
      <article
        key={skill.slug || skill.name}
        className="workspace-skill-market__card"
        role="button"
        tabIndex={0}
        aria-label={`查看 ${skill.name} 详情`}
        onClick={() => setDetailSkill(skill)}
        onKeyDown={buildKeyboardHandler(() => setDetailSkill(skill))}
      >
        <header className="workspace-skill-market__card-head">
          <div className="workspace-skill-market__card-avatar">
            {(skill.name.trim().charAt(0) || "S").toUpperCase()}
          </div>
          <div className="workspace-skill-market__card-title">
            <strong>{skill.name}</strong>
            <p>{getSkillDescription(skill)}</p>
          </div>
        </header>

        <div className="workspace-skill-market__meta">
          <span>下载 {formatCount(skill.downloads)}</span>
          <span>星标 {formatCount(skill.stars)}</span>
          <span>{formatVersion(skill.version)}</span>
        </div>

        <div className="workspace-skill-market__tags">
          <span>{getCategoryLabel(skill.category)}</span>
          {skill.ownerName?.trim() ? <span>@{skill.ownerName}</span> : null}
          {installed ? <span className="workspace-skill-market__tag-installed">已安装</span> : null}
        </div>

        <footer className="workspace-skill-market__card-footer">
          <code>{skill.slug || "skill"}</code>
          <div className="workspace-skill-market__actions">
            <button
              type="button"
              className="workspace-model-modal__ghost"
              onClick={(event) => {
                event.stopPropagation();
                setDetailSkill(skill);
              }}
            >
              详情
            </button>
            <button
              type="button"
              className="workspace-model-modal__primary"
              onClick={(event) => {
                event.stopPropagation();
                void handleOpenInstallModal(skill);
              }}
              disabled={!skill.slug.trim() || installing}
            >
              {installed ? "安装到其他 Agent" : "安装技能"}
            </button>
          </div>
        </footer>
      </article>
    );
  };

  return (
    <div className="workspace-skill-market">
      <section className="workspace-employees__toolbar workspace-skill-market__toolbar">
        <div
          className="workspace-employees__filters workspace-skill-market__categories"
          role="tablist"
          aria-label="技能分类"
        >
          {MARKET_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={[
                "workspace-employees__filter",
                "workspace-skill-market__category",
                activeCategory === category.id ? "is-active" : "",
              ].join(" ").trim()}
              onClick={() => setActiveCategory(category.id)}
              title={category.hint}
            >
              <span>{category.label}</span>
            </button>
          ))}
        </div>

        <label className="workspace-employees__search workspace-skill-market__search">
          <WorkspaceCloneIcon name="search" size={16} strokeWidth={1.9} />
          <input
            type="search"
            value={searchValue}
            placeholder="搜索技能名称、描述或标签"
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="搜索技能市场技能"
          />
        </label>
      </section>

      <div className="workspace-skill-market__summary-row">
        <p className="workspace-skill-market__summary">
          {summaryText}
          {installedLoading ? "" : ` · 已安装 ${installedSlugs.length}`}
        </p>
        <button
          type="button"
          className="workspace-model-modal__ghost workspace-skill-market__refresh"
          onClick={() => void refreshInstalledSlugs()}
          disabled={installedLoading || loading}
        >
          {installedLoading ? "同步中..." : "刷新已安装状态"}
        </button>
      </div>

      <div className="workspace-skill-market__body">
        <div className="workspace-skill-market__content">
          {loading ? (
            <div className="workspace-skill-market__empty">
              <strong>正在加载技能市场</strong>
              <p>请稍候，正在同步最新技能列表。</p>
            </div>
          ) : pagedSkills.length === 0 ? (
            <div className="workspace-skill-market__empty">
              <strong>没有匹配的技能</strong>
              <p>
                {deferredSearchValue.trim()
                  ? "试试更短的关键词，或切换分类重试。"
                  : "当前分类下暂时没有可展示的技能。"}
              </p>
            </div>
          ) : (
            <div className="workspace-skill-market__grid">
              {pagedSkills.map((skill) => renderCard(skill))}
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <div className="workspace-skill-market__pagination-shell">
            <div className="workspace-skill-market__pagination">
              <button
                type="button"
                className="workspace-model-modal__ghost"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
              >
                上一页
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`workspace-skill-market__page ${pageNumber === page ? "is-active" : ""}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                className="workspace-model-modal__ghost"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        show={Boolean(detailSkill)}
        onClose={() => setDetailSkill(null)}
        maxWidth={820}
        overlayClassName="workspace-resource-modal__overlay"
        contentClassName="workspace-resource-modal__surface workspace-skill-market__modal-surface workspace-skill-market__modal-surface--detail"
      >
        {detailSkill ? (
          <div className="workspace-skill-market__modal workspace-skill-market__modal--detail">
            <div className="workspace-skill-market__modal-header">
              <div>
                <h3>{detailSkill.name}</h3>
                <p>{detailSkill.slug || "skill"}</p>
              </div>
              <button
                type="button"
                className="workspace-model-modal__icon"
                aria-label="关闭技能详情"
                onClick={() => setDetailSkill(null)}
              >
                <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
              </button>
            </div>

            <div className="workspace-skill-market__modal-body">
              <div className="workspace-skill-market__detail-stack">
                <section className="workspace-skill-market__detail-summary">
                  <div className="workspace-skill-market__detail-copy">
                    <div className="workspace-skill-market__detail-meta">
                      <span className="workspace-clone__resource-tag">{getCategoryLabel(detailSkill.category)}</span>
                    <span className="workspace-clone__resource-tag">{formatVersion(detailSkill.version)}</span>
                    {detailSkill.ownerName?.trim() ? (
                      <span className="workspace-clone__resource-tag">@{detailSkill.ownerName}</span>
                    ) : null}
                    {detailInstalled ? <span>已安装</span> : null}
                  </div>
                </div>
                <p className="workspace-skill-market__detail-desc">{getSkillDescription(detailSkill)}</p>
                <div className="workspace-skill-market__detail-actions">
                  <button
                    type="button"
                    className="workspace-model-modal__primary"
                    onClick={() => void handleOpenInstallModal(detailSkill)}
                    disabled={!detailSkill.slug.trim() || installing}
                  >
                    {detailInstalled ? "安装到其他 Agent" : "安装技能"}
                  </button>
                  <button
                    type="button"
                    className="workspace-model-modal__ghost"
                    onClick={() => void handleOpenHomepage(detailSkill)}
                  >
                    打开 SkillHub
                  </button>
                </div>
              </section>

              <section className="workspace-skill-market__detail-stats-grid">
                <div>
                  <strong>{formatCount(detailSkill.downloads)}</strong>
                  <small>下载量</small>
                </div>
                <div>
                  <strong>{formatCount(detailSkill.stars)}</strong>
                  <small>星标</small>
                </div>
                <div>
                  <strong>{formatCount(detailSkill.installs)}</strong>
                  <small>安装量</small>
                </div>
              </section>
            </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        show={installModalOpen}
        onClose={() => {
          if (!installing) {
            setInstallModalOpen(false);
          }
        }}
        maxWidth={860}
        overlayClassName="workspace-resource-modal__overlay"
        contentClassName="workspace-resource-modal__surface workspace-skill-market__modal-surface workspace-skill-market__modal-surface--install"
      >
        <div className="workspace-skill-market__modal workspace-skill-market__modal--install">
          <div className="workspace-skill-market__modal-header">
            <div>
              <h3>选择安装目标</h3>
              <p>{installSkill ? `技能：${installSkill.name}（支持多选）` : "请选择要安装技能的目标 Agent。"}</p>
            </div>
            <button
              type="button"
              className="workspace-model-modal__icon"
              aria-label="关闭安装目标弹窗"
              onClick={() => {
                if (!installing) {
                  setInstallModalOpen(false);
                }
              }}
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>

          <div className="workspace-skill-market__modal-body">
            {installTargetsLoading ? (
              <div className="workspace-skill-market__empty">
                <strong>正在读取安装目标</strong>
                <p>请稍候，正在同步已安装 Agent 列表。</p>
              </div>
            ) : (
              <div className="workspace-skill-market__install-stack">
                <section className="workspace-skill-market__install-summary">
                  <div className="workspace-skill-market__install-summary-head">
                    <div>
                      <span className="workspace-skill-market__panel-label">当前技能</span>
                      <div className="workspace-skill-market__install-skill-head">
                        <strong>{installSkill?.name ?? "未选择技能"}</strong>
                        <small>{installSkill?.slug || "skill"}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="workspace-model-modal__primary"
                      onClick={() => void handleConfirmInstall()}
                      disabled={installTargetsLoading || installing || installRuntimeInfo?.installMode === "unavailable"}
                    >
                      {installing ? "安装中..." : "确认安装"}
                    </button>
                  </div>

                  <div className="workspace-skill-market__detail-meta">
                    {installSkill ? <span>{getCategoryLabel(installSkill.category)}</span> : null}
                    {installSkill ? <span>{formatVersion(installSkill.version)}</span> : null}
                    {installSkill?.ownerName?.trim() ? <span>@{installSkill.ownerName}</span> : null}
                    {installSkill && installedSlugSet.has(normalizeSlug(installSkill.slug)) ? <span>已安装</span> : null}
                  </div>

                  <p className="workspace-skill-market__detail-desc">
                    {installSkill ? getSkillDescription(installSkill) : "请选择要安装的技能。"}
                  </p>

                  {installRuntimeSummary ? (
                    <p className="workspace-skill-market__detail-desc">{installRuntimeSummary}</p>
                  ) : null}

                  {installRuntimeBlockingMessage ? (
                    <p className="workspace-skill-market__detail-desc">{installRuntimeBlockingMessage}</p>
                  ) : null}

                  <div className="workspace-skill-market__install-selection-grid">
                    <div className="workspace-skill-market__install-selection-card">
                      <strong>{installTargets.length}</strong>
                      <small>可选目标</small>
                    </div>
                    <div className="workspace-skill-market__install-selection-card">
                      <strong>{selectedTargetIds.length}</strong>
                      <small>已选目标</small>
                    </div>
                    <div className="workspace-skill-market__install-selection-card">
                      <strong>{primarySelectedTarget?.name ?? "未选择"}</strong>
                      <small>首个目标</small>
                    </div>
                  </div>
                </section>

                <section className="workspace-skill-market__install-content">
                  <div className="workspace-skill-market__install-targets-head">
                    <div>
                      <span className="workspace-skill-market__panel-label">安装目标</span>
                      <strong>{installTargets.length} 个 Agent</strong>
                    </div>
                    <span className="workspace-skill-market__install-count">{selectedTargetIds.length} 已选</span>
                  </div>

                  <div className="workspace-skill-market__target-list">
                    {installTargets.map((target) => {
                      const selected = selectedTargetIds.includes(target.id);

                      return (
                        <label
                          key={target.id}
                          className={`workspace-skill-market__target-item ${selected ? "is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleToggleInstallTarget(target.id)}
                            disabled={installing}
                          />
                          <div className="workspace-skill-market__target-copy">
                            <div className="workspace-skill-market__target-head">
                              <strong>{target.name}</strong>
                              {target.isMain ? <span className="workspace-clone__resource-tag">{MAIN_AGENT_DISPLAY_NAME}</span> : null}
                            </div>
                            <small>{target.subtitle}</small>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="workspace-skill-market__install-footer">
                    <span>已选择 {selectedTargetIds.length} 个目标</span>
                    <button
                      type="button"
                      className="workspace-model-modal__ghost"
                      onClick={() => setInstallModalOpen(false)}
                      disabled={installing}
                    >
                      取消
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
