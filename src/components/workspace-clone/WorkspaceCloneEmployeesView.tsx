import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Modal } from "../ui/Modal";
import type { AgencyRosterDivision, AgencyRosterRole } from "../../types";
import { loadAgencyRoleDefinition, loadAgencyRoster } from "../../data/agencyRoster";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

const DIVISION_FILTER_ALL = "__all__";

const rosterDivisions = loadAgencyRoster();

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

export function WorkspaceCloneEmployeesView() {
  const [divisionFilter, setDivisionFilter] = useState(DIVISION_FILTER_ALL);
  const [searchValue, setSearchValue] = useState("");
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [installingIds, setInstallingIds] = useState<string[]>([]);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<AgencyRosterRole | null>(null);
  const [definitionLoading, setDefinitionLoading] = useState(false);
  const [definitionError, setDefinitionError] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const roleDefinitionLoadSeqRef = useRef(0);

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
        setNotice(`已将「${role.name}」加入本地员工列表。`);
      } catch (installError) {
        setError(installError instanceof Error ? installError.message : `加入「${role.name}」失败。`);
      } finally {
        setInstallingIds((current) => current.filter((item) => item !== role.agentId));
      }
    },
    [installingIds, installedIds, refreshInstalledIds],
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
        setNotice(`已移除「${role.name}」。`);
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : `移除「${role.name}」失败。`);
      } finally {
        setRemovingIds((current) => current.filter((item) => item !== role.agentId));
      }
    },
    [refreshInstalledIds, removingIds],
  );

  const closeSelectedRole = useCallback(() => {
    roleDefinitionLoadSeqRef.current += 1;
    setSelectedRole(null);
    setDefinitionLoading(false);
    setDefinitionError("");
  }, []);

  const handleOpenRole = useCallback((role: AgencyRosterRole) => {
    const loadSeq = roleDefinitionLoadSeqRef.current + 1;
    roleDefinitionLoadSeqRef.current = loadSeq;
    setSelectedRole(role);
    setDefinitionError("");
    setDefinitionLoading(true);

    void loadAgencyRoleDefinition(role.agentId)
      .then((sections) => {
        if (roleDefinitionLoadSeqRef.current !== loadSeq) {
          return;
        }

        if (sections.length > 0) {
          setSelectedRole((current) =>
            current?.agentId === role.agentId
              ? {
                  ...current,
                  definitionSections: sections,
                }
              : current,
          );
        }
      })
      .catch((loadError) => {
        if (roleDefinitionLoadSeqRef.current !== loadSeq) {
          return;
        }

        setDefinitionError(loadError instanceof Error ? loadError.message : "完整分身定义加载失败。");
      })
      .finally(() => {
        if (roleDefinitionLoadSeqRef.current === loadSeq) {
          setDefinitionLoading(false);
        }
      });
  }, []);

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

        {(notice || error) && (
          <div className={`workspace-employees__feedback ${error ? "is-error" : "is-success"}`}>
            <span>{error || notice}</span>
          </div>
        )}

        {filteredDivisions.length === 0 ? (
          <div className="workspace-employees__empty workspace-employees__empty--roles">
            <strong>没有匹配的角色</strong>
            <p>试试更短的关键词，或者切换上面的部门分类。</p>
          </div>
        ) : (
          <div className="workspace-employees__division-list">
            {filteredDivisions.map((division) => (
              <section key={division.id} className="workspace-employees__division">
                <header className="workspace-employees__section-head">
                  <div>
                    <strong>{division.title}</strong>
                    <p>点击卡片查看分身定义详情，安装状态会直接显示在卡片操作按钮上。</p>
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
                        aria-label={`查看 ${role.name} 的分身定义详情`}
                        onClick={() => handleOpenRole(role)}
                        onKeyDown={buildKeyboardHandler(() => handleOpenRole(role))}
                      >
                        <div className="workspace-employees__role-card-head">
                          <div className="workspace-employees__role-avatar">
                            {role.name.slice(0, 1) || "员"}
                          </div>
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
        maxWidth={980}
        overlayClassName="workspace-employees-modal__overlay"
        contentClassName="workspace-employees-modal__surface"
      >
        {selectedRole ? (
          <section className="workspace-employees-modal">
            <header className="workspace-employees-modal__header">
              <div>
                <span className="workspace-employees__eyebrow">分身定义详情</span>
                <h3>{selectedRole.name}</h3>
                <p>{selectedRole.description}</p>
              </div>
              <div className="workspace-employees-modal__header-actions">
                <button
                  type="button"
                  className="workspace-model-modal__icon"
                  onClick={closeSelectedRole}
                  aria-label="关闭分身定义详情"
                >
                  <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
                </button>
              </div>
            </header>

            <div className="workspace-employees-modal__body">
              <section className="workspace-employees-modal__meta">
                <article className="workspace-employees-modal__meta-card">
                  <span>名称</span>
                  <strong>{selectedRole.name}</strong>
                </article>
                <article className="workspace-employees-modal__meta-card">
                  <span>Agent ID</span>
                  <strong>{selectedRole.agentId}</strong>
                </article>
                <article className="workspace-employees-modal__meta-card">
                  <span>部门</span>
                  <strong>{selectedRole.divisionTitle}</strong>
                </article>
                <article className="workspace-employees-modal__meta-card">
                  <span>来源</span>
                  <strong>{selectedRole.source}</strong>
                </article>
              </section>

              {selectedRole.tags.length > 0 && (
                <section className="workspace-employees-modal__tags" aria-label="角色标签">
                  {selectedRole.tags.map((tag) => (
                    <span key={`${selectedRole.agentId}-detail-${tag}`} className="workspace-employees__tag workspace-employees__tag--soft">
                      {tag}
                    </span>
                  ))}
                </section>
              )}

              {(definitionLoading || definitionError) && (
                <div className={`workspace-employees__feedback ${definitionError ? "is-error" : "is-success"}`}>
                  <span>{definitionError || "正在加载完整分身定义..."}</span>
                </div>
              )}

              <section className="workspace-employees-modal__content">
                {selectedRole.definitionSections.map((section) => (
                  <article key={`${selectedRole.agentId}-${section.id}`} className="workspace-employees-modal__section">
                    <div className="workspace-employees-modal__section-head">
                      <strong>{section.label}</strong>
                    </div>
                    <div className="workspace-employees-modal__definition">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          </section>
        ) : null}
      </Modal>
    </>
  );
}
