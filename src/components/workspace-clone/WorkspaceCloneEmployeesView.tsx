import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../ui/Modal";
import type { AgencyRosterDivision, AgencyRosterRole, AgencyRosterRoleProfile } from "../../types";
import { useFeedback } from "../../hooks/useFeedback";
import { loadAgencyRoleProfile, loadAgencyRoster } from "../../data/agencyRoster";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { pickWorkspaceCloneDefaultIllustrationAvatar } from "./workspaceCloneAvatarPresets";
import "../../styles/workspace-agent-info-modal.css";

const DIVISION_FILTER_ALL = "__all__";
const RADAR_CENTER_X = 100;
const RADAR_CENTER_Y = 100;
const DEFAULT_RADAR: Record<string, number> = {
  structure: 80,
  reliability: 80,
  empathy: 70,
  creativity: 70,
  execution: 80,
  system: 80,
};
const RADAR_AXES = [
  { keys: ["structure", "struct"], axisLabel: "结构化", scoreLabel: "结构", vertexX: 100, vertexY: 20 },
  { keys: ["reliability"], axisLabel: "可靠性", scoreLabel: "可靠", vertexX: 170, vertexY: 60 },
  { keys: ["system"], axisLabel: "系统性", scoreLabel: "系统", vertexX: 170, vertexY: 140 },
  { keys: ["execution"], axisLabel: "执行力", scoreLabel: "执行", vertexX: 100, vertexY: 180 },
  { keys: ["empathy"], axisLabel: "共情力", scoreLabel: "共情", vertexX: 30, vertexY: 140 },
  { keys: ["creativity"], axisLabel: "创造力", scoreLabel: "创意", vertexX: 30, vertexY: 60 },
] as const;
const MUST_RULE_PATTERNS = [/必须/u, /优先/u, /\bmust\b/i, /\balways\b/i, /\bshould\b/i];
const FORBID_RULE_PATTERNS = [/禁止/u, /避免/u, /不要/u, /不可/u, /\bforbid\b/i, /\bnever\b/i];

const rosterDivisions = loadAgencyRoster();

interface WorkspaceCloneEmployeesViewProps {
  onAgentRosterChanged?: () => Promise<void> | void;
}

type RuleTone = "must" | "forbid" | "general";

function includesAgentId(ids: string[], agentId: string) {
  return ids.some((item) => item === agentId);
}

function buildSearchText(role: AgencyRosterRole) {
  if (role.searchText) {
    return role.searchText;
  }

  return [
    role.name,
    role.description,
    role.agentId,
    role.divisionTitle,
    role.source,
    role.tags.join(" "),
    role.definitionPreview,
  ]
    .join(" ")
    .toLowerCase();
}

function buildKeyboardHandler(onOpen: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
}

function buildFallbackRoleProfile(role: AgencyRosterRole): AgencyRosterRoleProfile {
  return {
    name: role.name.trim(),
    mission: role.description.trim(),
    identity: role.definitionPreview.trim() || role.description.trim(),
    capabilities: [],
    likes: [],
    dislikes: [],
    rules: [],
    workflow: [],
    tags: role.tags,
    usageScenarios: [],
    personalityRadar: { ...DEFAULT_RADAR },
  };
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function resolveRadarScore(radar: Record<string, number>, keys: readonly string[]) {
  for (const key of keys) {
    const score = radar[key];
    if (typeof score === "number" && Number.isFinite(score)) {
      return clampScore(score);
    }
  }
  return 0;
}

function resolveRuleTone(rule: string): RuleTone {
  if (FORBID_RULE_PATTERNS.some((pattern) => pattern.test(rule))) {
    return "forbid";
  }
  if (MUST_RULE_PATTERNS.some((pattern) => pattern.test(rule))) {
    return "must";
  }
  return "general";
}

function getRuleToneLabel(tone: RuleTone) {
  if (tone === "must") {
    return "必须";
  }
  if (tone === "forbid") {
    return "禁忌";
  }
  return "规则";
}

function getRoleAvatarData(role: AgencyRosterRole) {
  return {
    avatarUrl: pickWorkspaceCloneDefaultIllustrationAvatar(role.agentId),
    fallback: role.name.trim().slice(0, 1) || "员",
  };
}

function renderRoleAvatar(role: AgencyRosterRole) {
  const { avatarUrl, fallback } = getRoleAvatarData(role);
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" loading="lazy" decoding="async" />;
  }
  return fallback;
}

export function WorkspaceCloneEmployeesView({ onAgentRosterChanged }: WorkspaceCloneEmployeesViewProps) {
  const { pushFeedback } = useFeedback();
  const [divisionFilter, setDivisionFilter] = useState(DIVISION_FILTER_ALL);
  const [searchValue, setSearchValue] = useState("");
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [installingIds, setInstallingIds] = useState<string[]>([]);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<AgencyRosterRole | null>(null);
  const [selectedRoleProfile, setSelectedRoleProfile] = useState<AgencyRosterRoleProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const profileLoadSeqRef = useRef(0);

  const refreshInstalledIds = useCallback(async () => {
    const nextIds = await invoke<string[]>("load_installed_agency_agent_ids");
    setInstalledIds(nextIds);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError("");
      try {
        const nextIds = await invoke<string[]>("load_installed_agency_agent_ids");
        if (!cancelled) {
          setInstalledIds(nextIds);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "读取已加入员工列表失败。");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const message = notice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-employees-notice",
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
      title: "数字员工",
      message,
      dedupeKey: "workspace-employees-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [error, pushFeedback]);

  useEffect(() => {
    const message = profileError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "分身详情",
      message,
      dedupeKey: "workspace-employees-profile-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [profileError, pushFeedback]);

  const normalizedQuery = deferredSearchValue.trim().toLowerCase();

  const filteredDivisions = useMemo<AgencyRosterDivision[]>(() => {
    const divisionsWithKeyword = rosterDivisions
      .map((division) => {
        if (!normalizedQuery) {
          return division;
        }

        const roles = division.roles.filter((role) => buildSearchText(role).includes(normalizedQuery));

        return {
          ...division,
          count: roles.length,
          roles,
        };
      })
      .filter((division) => division.roles.length > 0);

    if (divisionFilter === DIVISION_FILTER_ALL) {
      return divisionsWithKeyword;
    }

    return divisionsWithKeyword.filter((division) => division.id === divisionFilter);
  }, [divisionFilter, normalizedQuery]);

  const totalRoleCount = useMemo(
    () => rosterDivisions.reduce((sum, division) => sum + division.count, 0),
    [],
  );

  const visibleRoleCount = useMemo(
    () => filteredDivisions.reduce((sum, division) => sum + division.roles.length, 0),
    [filteredDivisions],
  );

  const divisionFilterOptions = useMemo(() => {
    const visibleCountByDivision = new Map(filteredDivisions.map((division) => [division.id, division.roles.length]));

    return [
      {
        id: DIVISION_FILTER_ALL,
        label: "全部",
        count: normalizedQuery ? visibleRoleCount : totalRoleCount,
      },
      ...rosterDivisions.map((division) => ({
        id: division.id,
        label: division.title,
        count: normalizedQuery ? visibleCountByDivision.get(division.id) ?? 0 : division.count,
      })),
    ];
  }, [filteredDivisions, normalizedQuery, totalRoleCount, visibleRoleCount]);

  useEffect(() => {
    if (!divisionFilterOptions.some((item) => item.id === divisionFilter)) {
      setDivisionFilter(DIVISION_FILTER_ALL);
    }
  }, [divisionFilter, divisionFilterOptions]);

  const handleInstall = useCallback(
    async (role: AgencyRosterRole) => {
      if (includesAgentId(installingIds, role.agentId) || includesAgentId(installedIds, role.agentId)) {
        return;
      }

      setError("");
      setNotice("");
      setInstallingIds((current) => [...current, role.agentId]);

      try {
        await invoke<string>("install_agency_agent", { agentId: role.agentId });
        await refreshInstalledIds();
        await Promise.resolve(onAgentRosterChanged?.()).catch(() => undefined);
        setNotice(`已将「${role.name}」加入本地员工列表。`);
      } catch (installError) {
        setError(installError instanceof Error ? installError.message : `加入「${role.name}」失败。`);
      } finally {
        setInstallingIds((current) => current.filter((item) => item !== role.agentId));
      }
    },
    [installingIds, installedIds, onAgentRosterChanged, refreshInstalledIds],
  );

  const handleRemove = useCallback(
    async (role: AgencyRosterRole) => {
      if (includesAgentId(removingIds, role.agentId)) {
        return;
      }

      setError("");
      setNotice("");
      setRemovingIds((current) => [...current, role.agentId]);

      try {
        await invoke<string>("uninstall_agency_agent", { agentId: role.agentId });
        await refreshInstalledIds();
        await Promise.resolve(onAgentRosterChanged?.()).catch(() => undefined);
        setNotice(`已移除「${role.name}」。`);
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : `移除「${role.name}」失败。`);
      } finally {
        setRemovingIds((current) => current.filter((item) => item !== role.agentId));
      }
    },
    [onAgentRosterChanged, refreshInstalledIds, removingIds],
  );

  const closeSelectedRole = useCallback(() => {
    profileLoadSeqRef.current += 1;
    setSelectedRole(null);
    setSelectedRoleProfile(null);
    setProfileLoading(false);
    setProfileError("");
  }, []);

  const handleOpenRole = useCallback((role: AgencyRosterRole) => {
    const loadSeq = profileLoadSeqRef.current + 1;
    profileLoadSeqRef.current = loadSeq;
    setSelectedRole(role);
    setSelectedRoleProfile(buildFallbackRoleProfile(role));
    setProfileError("");
    setProfileLoading(true);

    void loadAgencyRoleProfile(role.agentId)
      .then((profile) => {
        if (profileLoadSeqRef.current !== loadSeq) {
          return;
        }
        setSelectedRoleProfile(profile);
      })
      .catch((loadError) => {
        if (profileLoadSeqRef.current !== loadSeq) {
          return;
        }
        setProfileError(loadError instanceof Error ? loadError.message : "完整分身资料加载失败。");
      })
      .finally(() => {
        if (profileLoadSeqRef.current === loadSeq) {
          setProfileLoading(false);
        }
      });
  }, []);

  const activeProfile = useMemo(() => {
    if (!selectedRole) {
      return null;
    }
    return selectedRoleProfile ?? buildFallbackRoleProfile(selectedRole);
  }, [selectedRole, selectedRoleProfile]);

  const activeTags = useMemo(() => {
    if (!selectedRole || !activeProfile) {
      return [];
    }
    if (activeProfile.tags.length > 0) {
      return activeProfile.tags;
    }
    return [selectedRole.divisionTitle, selectedRole.source].filter(Boolean);
  }, [activeProfile, selectedRole]);

  const normalizedRuleItems = useMemo(() => {
    if (!activeProfile) {
      return [];
    }

    const source = activeProfile.rules.length > 0 ? activeProfile.rules : ["暂无执行规则"];
    return source.map((text, index) => {
      const tone = resolveRuleTone(text);
      return {
        id: `rule-${index}`,
        text,
        tone,
        toneLabel: getRuleToneLabel(tone),
      };
    });
  }, [activeProfile]);

  const radarMetrics = useMemo(() => {
    const radar = activeProfile?.personalityRadar ?? DEFAULT_RADAR;
    return RADAR_AXES.map((axis) => ({
      ...axis,
      score: resolveRadarScore(radar, axis.keys),
    }));
  }, [activeProfile]);

  const radarPolygonPoints = useMemo(
    () =>
      radarMetrics
        .map((axis) => {
          const ratio = axis.score / 100;
          const x = RADAR_CENTER_X + (axis.vertexX - RADAR_CENTER_X) * ratio;
          const y = RADAR_CENTER_Y + (axis.vertexY - RADAR_CENTER_Y) * ratio;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" "),
    [radarMetrics],
  );

  const activeMission = activeProfile?.mission.trim() || "暂无使命描述";
  const activeIdentity = activeProfile?.identity.trim() || "暂无身份描述";
  const activeWorkflow = activeProfile?.workflow.length ? activeProfile.workflow : ["暂无工作流信息"];
  const activeCapabilities = activeProfile?.capabilities.length ? activeProfile.capabilities : ["暂无能力标签"];
  const activeLikes = activeProfile?.likes.length ? activeProfile.likes : ["暂无偏好"];
  const activeDislikes = activeProfile?.dislikes.length ? activeProfile.dislikes : ["暂无禁忌清单"];

  return (
    <>
      <div className="workspace-employees">
        <section className="workspace-employees__toolbar">
          <div className="workspace-employees__filters" role="tablist" aria-label="员工部门分类筛选">
            {divisionFilterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={divisionFilter === option.id}
                className={`workspace-employees__filter ${divisionFilter === option.id ? "is-active" : ""}`}
                onClick={() => setDivisionFilter(option.id)}
                title={option.count > 0 ? `${option.label} (${option.count})` : option.label}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <label className="workspace-employees__search">
            <WorkspaceCloneIcon name="search" size={16} strokeWidth={1.9} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="搜索专家"
              aria-label="搜索数字员工角色"
            />
          </label>
        </section>

        {filteredDivisions.length === 0 ? (
          <div className="workspace-employees__empty workspace-employees__empty--roles">
            <strong>没有匹配的角色</strong>
            <p>试试更短的关键词，或者切换上方的部门分类。</p>
          </div>
        ) : (
          <div className="workspace-employees__division-list">
            {filteredDivisions.map((division) => (
              <section key={division.id} className="workspace-employees__division">
                <header className="workspace-employees__section-head">
                  <div>
                    <strong>{division.title}</strong>
                    <p>点击卡片查看分身资料详情，安装状态会直接显示在卡片操作按钮上。</p>
                  </div>
                  <small>{division.roles.length} 个角色</small>
                </header>

                <div className="workspace-employees__role-grid">
                  {division.roles.map((role) => {
                    const joined = includesAgentId(installedIds, role.agentId);
                    const installing = includesAgentId(installingIds, role.agentId);
                    const removing = includesAgentId(removingIds, role.agentId);

                    return (
                      <article
                        key={role.id}
                        className="workspace-employees__role-card"
                        role="button"
                        tabIndex={0}
                        aria-label={`查看 ${role.name} 的分身详情`}
                        onClick={() => handleOpenRole(role)}
                        onKeyDown={buildKeyboardHandler(() => handleOpenRole(role))}
                      >
                        <div className="workspace-employees__role-card-head">
                          <div className="workspace-employees__role-avatar">{renderRoleAvatar(role)}</div>
                          <div>
                            <strong>{role.name}</strong>
                            <small>{role.agentId}</small>
                          </div>
                        </div>

                        <p>{role.description}</p>

                        <div className="workspace-employees__role-tags">
                          <span className="workspace-employees__tag">{role.source}</span>
                          {role.tags.slice(0, 3).map((tag) => (
                            <span key={`${role.agentId}-${tag}`} className="workspace-employees__tag workspace-employees__tag--soft">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <footer className="workspace-employees__role-card-foot">
                          <span className="workspace-employees__role-division">{role.divisionTitle}</span>
                          <button
                            type="button"
                            className={[
                              "workspace-employees__join-btn",
                              joined ? "is-joined" : "",
                              removing ? "is-removing" : "",
                            ].join(" ").trim()}
                            disabled={installing || removing}
                            title={joined ? `移除 ${role.name}` : `加入 ${role.name}`}
                            aria-label={joined ? `移除 ${role.name}` : `加入 ${role.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (joined) {
                                void handleRemove(role);
                                return;
                              }
                              void handleInstall(role);
                            }}
                          >
                            {joined
                              ? removing
                                ? "移除中..."
                                : "已加入 · 移除"
                              : installing
                                ? "加入中..."
                                : "加入"}
                          </button>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Modal
        show={Boolean(selectedRole)}
        onClose={closeSelectedRole}
        maxWidth={1180}
        overlayClassName="workspace-employees-modal__overlay"
        contentClassName="workspace-employees-modal__surface"
      >
        {selectedRole && activeProfile ? (
          <section className="workspace-employees-modal">
            <header className="workspace-employees-modal__header">
              <div className="workspace-employees-modal__header-copy">
                <span className="workspace-employees__eyebrow">Agent 信息详情</span>
                <h3>{activeProfile.name || selectedRole.name}</h3>
                <p>{selectedRole.description}</p>
              </div>
              <div className="workspace-employees-modal__header-actions">
                {profileLoading ? <span className="workspace-employees-modal__loading-pill">正在补充完整资料</span> : null}
                <button
                  type="button"
                  className="workspace-model-modal__icon"
                  onClick={closeSelectedRole}
                  aria-label="关闭分身详情"
                >
                  <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
                </button>
              </div>
            </header>

            <div className="workspace-employees-modal__body">
              {profileError ? (
                <div className="workspace-employees-modal__status is-error">
                  <span>{profileError}</span>
                </div>
              ) : null}

              <div className="workspace-employees-modal__grid">
                <div className="workspace-employees-modal__column workspace-employees-modal__column--left">
                  <article className="workspace-employees-modal__card workspace-employees-modal__card--profile">
                    <div className="workspace-employees-modal__avatar-stage" aria-hidden="true">
                      {(() => {
                        const { avatarUrl, fallback } = getRoleAvatarData(selectedRole);
                        return avatarUrl ? (
                          <img
                            className="workspace-employees-modal__avatar-image"
                            src={avatarUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="workspace-employees-modal__avatar-fallback">{fallback}</span>
                        );
                      })()}
                    </div>
                    <div className="workspace-employees-modal__profile-copy">
                      <span className="workspace-employees-modal__meta-line">{selectedRole.agentId}</span>
                      <h4>{activeProfile.name || selectedRole.name}</h4>
                      <div className="workspace-employees-modal__badge-row">
                        <span className="workspace-employees-modal__skew-badge">
                          <span>{selectedRole.divisionTitle}</span>
                        </span>
                        <span className="workspace-employees-modal__skew-badge is-soft">
                          <span>{selectedRole.source}</span>
                        </span>
                        {activeTags.map((tag) => (
                          <span key={`${selectedRole.agentId}-tag-${tag}`} className="workspace-employees-modal__skew-badge is-muted">
                            <span>{tag}</span>
                          </span>
                        ))}
                      </div>
                      <p className="workspace-employees-modal__quote">{activeIdentity}</p>
                    </div>
                  </article>
                </div>

                <div className="workspace-employees-modal__column workspace-employees-modal__column--center">
                  <article className="workspace-employees-modal__card">
                    <header className="workspace-employees-modal__section-head">
                      <span className="workspace-employees-modal__icon-box">
                        <WorkspaceCloneIcon name="sparkles" size={16} strokeWidth={2} />
                      </span>
                      <h4>核心使命</h4>
                    </header>
                    <div className="workspace-employees-modal__mission">
                      <p>{activeMission}</p>
                    </div>
                  </article>

                  <article className="workspace-employees-modal__card">
                    <header className="workspace-employees-modal__section-head is-plain">
                      <h4>执行流程</h4>
                    </header>
                    <div className="workspace-employees-modal__workflow-grid">
                      {activeWorkflow.map((item, index) => (
                        <div key={`${selectedRole.agentId}-workflow-${index}`} className="workspace-employees-modal__workflow-item">
                          <span className="workspace-employees-modal__workflow-no">{`${index + 1}`.padStart(2, "0")}</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="workspace-employees-modal__card">
                    <header className="workspace-employees-modal__section-head is-plain">
                      <h4>能力矩阵</h4>
                    </header>
                    <div className="workspace-employees-modal__chip-row">
                      {activeCapabilities.map((item) => (
                        <span key={`${selectedRole.agentId}-capability-${item}`} className="workspace-employees-modal__chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>

                  <article className="workspace-employees-modal__card workspace-employees-modal__card--rules">
                    <header className="workspace-employees-modal__section-head is-plain">
                      <h4>执行规则</h4>
                    </header>
                    <div className="workspace-employees-modal__rule-grid">
                      {normalizedRuleItems.map((item) => (
                        <div
                          key={item.id}
                          className={[
                            "workspace-employees-modal__rule-item",
                            item.tone === "must" ? "is-must" : "",
                            item.tone === "forbid" ? "is-forbid" : "",
                          ].join(" ").trim()}
                        >
                          <span className={`workspace-employees-modal__rule-key is-${item.tone}`}>{item.toneLabel}</span>
                          <p>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="workspace-employees-modal__column workspace-employees-modal__column--right">
                  <article className="workspace-employees-modal__card workspace-employees-modal__card--radar">
                    <header className="workspace-employees-modal__section-head is-plain">
                      <h4>人格雷达</h4>
                    </header>
                    <svg viewBox="0 0 200 200" className="workspace-employees-modal__radar" aria-label="人格雷达图">
                      <polygon points="100,20 170,60 170,140 100,180 30,140 30,60" fill="none" />
                      <polygon points="100,60 135,80 135,120 100,140 65,120 65,80" fill="none" />
                      <line x1="100" y1="20" x2="100" y2="180" />
                      <line x1="30" y1="60" x2="170" y2="140" />
                      <line x1="170" y1="60" x2="30" y2="140" />
                      <polygon points={radarPolygonPoints} className="workspace-employees-modal__radar-poly" />
                      <text x="100" y="15" textAnchor="middle">{radarMetrics[0]?.axisLabel}</text>
                      <text x="175" y="60" textAnchor="start">{radarMetrics[1]?.axisLabel}</text>
                      <text x="175" y="145" textAnchor="start">{radarMetrics[2]?.axisLabel}</text>
                      <text x="100" y="195" textAnchor="middle">{radarMetrics[3]?.axisLabel}</text>
                      <text x="25" y="145" textAnchor="end">{radarMetrics[4]?.axisLabel}</text>
                      <text x="25" y="60" textAnchor="end">{radarMetrics[5]?.axisLabel}</text>
                    </svg>

                    <div className="workspace-employees-modal__score-grid">
                      {radarMetrics.map((item) => (
                        <div key={`${selectedRole.agentId}-${item.scoreLabel}`}>
                          <span>{item.scoreLabel}</span>
                          <strong>{item.score}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="workspace-employees-modal__card">
                    <div className="workspace-employees-modal__list-block">
                      <div>
                        <div className="workspace-employees-modal__list-title is-like">
                          <WorkspaceCloneIcon name="sparkles" size={16} strokeWidth={2} />
                          <span>偏好</span>
                        </div>
                        <ul>
                          {activeLikes.map((item) => (
                            <li key={`${selectedRole.agentId}-like-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="workspace-employees-modal__list-divider" />

                      <div>
                        <div className="workspace-employees-modal__list-title is-dislike">
                          <WorkspaceCloneIcon name="x" size={16} strokeWidth={2} />
                          <span>禁忌</span>
                        </div>
                        <ul className="is-muted">
                          {activeDislikes.map((item) => (
                            <li key={`${selectedRole.agentId}-dislike-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </Modal>
    </>
  );
}
