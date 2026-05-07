import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import type { AgencyRosterRoleProfile } from "../../types";
import { loadAgencyRoleProfile, MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { pickWorkspaceCloneDefaultIllustrationAvatar } from "./workspaceCloneAvatarPresets";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceEntity } from "./workspaceCloneTypes";
import "../../styles/workspace-agent-info-modal.css";

interface WorkspaceCloneAgentInfoModalProps {
  show: boolean;
  selectedEntity: WorkspaceEntity | null;
  onClose: () => void;
}

type RuleTone = "must" | "forbid" | "general";

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

function getStatusLabel(status?: WorkspaceEntity["status"]) {
  if (status === "online") {
    return "在线";
  }
  if (status === "busy") {
    return "忙碌";
  }
  return "离线";
}

function buildFallbackProfile(entity: WorkspaceEntity): AgencyRosterRoleProfile {
  return {
    name: entity.name.trim() || MAIN_AGENT_DISPLAY_NAME,
    mission: entity.currentWork?.trim() || "当前 Agent 资料仍在同步中。",
    identity: entity.subtitle?.trim() || "当前会话暂未提供完整身份描述。",
    capabilities: [],
    likes: [],
    dislikes: [],
    rules: [],
    workflow: [],
    tags: [getStatusLabel(entity.status)],
    usageScenarios: [],
    personalityRadar: { ...DEFAULT_RADAR },
  };
}

function getAvatarData(entity: WorkspaceEntity | null) {
  const avatarUrl =
    entity?.avatarUrl?.trim() ||
    (entity?.entityType === "agents" ? pickWorkspaceCloneDefaultIllustrationAvatar(entity.id) : "") ||
    "";
  const fallback = entity?.name?.trim().slice(0, 1) || "A";
  return { avatarUrl, fallback };
}

export function WorkspaceCloneAgentInfoModal({
  show,
  selectedEntity,
  onClose,
}: WorkspaceCloneAgentInfoModalProps) {
  const [profile, setProfile] = useState<AgencyRosterRoleProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!show || !selectedEntity || selectedEntity.entityType !== "agents") {
      loadSeqRef.current += 1;
      setProfile(null);
      setLoading(false);
      setError("");
      return;
    }

    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    setProfile(buildFallbackProfile(selectedEntity));
    setLoading(true);
    setError("");

    void loadAgencyRoleProfile(selectedEntity.id)
      .then((nextProfile) => {
        if (loadSeqRef.current !== loadSeq) {
          return;
        }
        setProfile({
          ...nextProfile,
          name: selectedEntity.name.trim() || nextProfile.name || MAIN_AGENT_DISPLAY_NAME,
        });
      })
      .catch((loadError) => {
        if (loadSeqRef.current !== loadSeq) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "完整 Agent 资料加载失败。");
      })
      .finally(() => {
        if (loadSeqRef.current === loadSeq) {
          setLoading(false);
        }
      });
  }, [show, selectedEntity]);

  const isAgentEntity = selectedEntity?.entityType === "agents";
  const activeProfile = useMemo(() => {
    if (!selectedEntity || !isAgentEntity) {
      return null;
    }
    return profile ?? buildFallbackProfile(selectedEntity);
  }, [isAgentEntity, profile, selectedEntity]);

  const activeTags = useMemo(() => {
    if (!selectedEntity || !activeProfile) {
      return [];
    }
    return activeProfile.tags.length > 0 ? activeProfile.tags : [getStatusLabel(selectedEntity.status)];
  }, [activeProfile, selectedEntity]);

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

  const missionText = activeProfile?.mission.trim() || "暂无使命描述";
  const identityText = activeProfile?.identity.trim() || "暂无身份描述";
  const workflowItems = activeProfile?.workflow.length ? activeProfile.workflow : ["暂无工作流信息"];
  const capabilityItems = activeProfile?.capabilities.length ? activeProfile.capabilities : ["暂无能力标签"];
  const likeItems = activeProfile?.likes.length ? activeProfile.likes : ["暂无偏好"];
  const dislikeItems = activeProfile?.dislikes.length ? activeProfile.dislikes : ["暂无禁忌清单"];
  const { avatarUrl, fallback } = getAvatarData(selectedEntity);

  return (
    <Modal
      show={show}
      onClose={onClose}
      maxWidth={1180}
      overlayClassName="workspace-employees-modal__overlay"
      contentClassName="workspace-employees-modal__surface"
    >
      {isAgentEntity && selectedEntity && activeProfile ? (
        <section className="workspace-employees-modal">
          <header className="workspace-employees-modal__header">
            <div className="workspace-employees-modal__header-copy">
              <span className="workspace-employees__eyebrow">Agent 信息</span>
              <h3>{activeProfile.name || selectedEntity.name || MAIN_AGENT_DISPLAY_NAME}</h3>
              <p>{selectedEntity.subtitle?.trim() || "当前会话已接入该 Agent 的主会话上下文。"}</p>
            </div>
            <div className="workspace-employees-modal__header-actions">
              {loading ? <span className="workspace-employees-modal__loading-pill">正在补充完整资料</span> : null}
              <button
                type="button"
                className="workspace-model-modal__icon"
                onClick={onClose}
                aria-label="关闭 Agent 信息"
              >
                <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
              </button>
            </div>
          </header>

          <div className="workspace-employees-modal__body">
            {error ? (
              <div className="workspace-employees-modal__status is-error">
                <span>{error}</span>
              </div>
            ) : null}

            <section className="workspace-employees-modal__runtime-strip" aria-label="运行态信息">
              <article className="workspace-employees-modal__runtime-item">
                <span>状态</span>
                <strong>{getStatusLabel(selectedEntity.status)}</strong>
              </article>
              <article className="workspace-employees-modal__runtime-item">
                <span>当前工作</span>
                <strong>{selectedEntity.currentWork?.trim() || "等待后续同步"}</strong>
              </article>
              <article className="workspace-employees-modal__runtime-item">
                <span>最近输出</span>
                <strong>{selectedEntity.recentOutput?.trim() || "暂无"}</strong>
              </article>
            </section>

            <div className="workspace-employees-modal__grid">
              <div className="workspace-employees-modal__column workspace-employees-modal__column--left">
                <article className="workspace-employees-modal__card workspace-employees-modal__card--profile">
                  <div className="workspace-employees-modal__avatar-stage" aria-hidden="true">
                    {avatarUrl ? (
                      <img
                        className="workspace-employees-modal__avatar-image"
                        src={avatarUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="workspace-employees-modal__avatar-fallback">{fallback}</span>
                    )}
                  </div>
                  <div className="workspace-employees-modal__profile-copy">
                    <span className="workspace-employees-modal__meta-line">{selectedEntity.id}</span>
                    <h4>{activeProfile.name || selectedEntity.name || MAIN_AGENT_DISPLAY_NAME}</h4>
                    <div className="workspace-employees-modal__badge-row">
                      {activeTags.map((tag) => (
                        <span key={`${selectedEntity.id}-tag-${tag}`} className="workspace-employees-modal__skew-badge">
                          <span>{tag}</span>
                        </span>
                      ))}
                    </div>
                    <p className="workspace-employees-modal__quote">{identityText}</p>
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
                    <p>{missionText}</p>
                  </div>
                </article>

                <article className="workspace-employees-modal__card">
                  <header className="workspace-employees-modal__section-head is-plain">
                    <h4>执行流程</h4>
                  </header>
                  <div className="workspace-employees-modal__workflow-grid">
                    {workflowItems.map((item, index) => (
                      <div key={`${selectedEntity.id}-workflow-${index}`} className="workspace-employees-modal__workflow-item">
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
                    {capabilityItems.map((item) => (
                      <span key={`${selectedEntity.id}-capability-${item}`} className="workspace-employees-modal__chip">
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
                      <div key={`${selectedEntity.id}-${item.scoreLabel}`}>
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
                        {likeItems.map((item) => (
                          <li key={`${selectedEntity.id}-like-${item}`}>{item}</li>
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
                        {dislikeItems.map((item) => (
                          <li key={`${selectedEntity.id}-dislike-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="workspace-agent-info-fallback">
          <header className="workspace-agent-info-fallback__header">
            <div>
              <span className="workspace-employees__eyebrow">Agent 信息</span>
              <h3>{selectedEntity?.name?.trim() || "当前实体"}</h3>
              <p>当前选中实体不是 Agent 档案页，本轮仅迁移 agent 会话的 rich profile 弹窗。</p>
            </div>
            <button
              type="button"
              className="workspace-model-modal__icon"
              onClick={onClose}
              aria-label="关闭 Agent 信息"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </header>

          <div className="workspace-agent-info-fallback__body">
            <div className="workspace-agent-info-fallback__grid">
              <article>
                <span>实体类型</span>
                <strong>{selectedEntity?.entityType || "unknown"}</strong>
              </article>
              <article>
                <span>状态</span>
                <strong>{getStatusLabel(selectedEntity?.status)}</strong>
              </article>
              <article>
                <span>当前工作</span>
                <strong>{selectedEntity?.currentWork?.trim() || "暂无"}</strong>
              </article>
              <article>
                <span>最近输出</span>
                <strong>{selectedEntity?.recentOutput?.trim() || "暂无"}</strong>
              </article>
            </div>
          </div>
        </section>
      )}
    </Modal>
  );
}
