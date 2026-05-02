import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgencyRosterDivision, AgencyRosterRole, InstalledAgencyEmployee } from "../../types";
import { loadAgencyRoleMap, loadAgencyRoster } from "../../data/agencyRoster";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

const DIVISION_FILTER_ALL = "__all__";

const rosterDivisions = loadAgencyRoster();
const agencyRoleMap = loadAgencyRoleMap();

function buildInstalledEmployees(installedIds: string[]) {
  return installedIds
    .map((agentId) => agencyRoleMap.get(agentId))
    .filter((role): role is AgencyRosterRole => Boolean(role))
    .map<InstalledAgencyEmployee>((role) => ({
      id: role.agentId,
      name: role.name,
      subtitle: role.description,
      divisionTitle: role.divisionTitle,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function includesAgentId(ids: string[], agentId: string) {
  return ids.some((item) => item === agentId);
}

export function WorkspaceCloneEmployeesView() {
  const [divisionFilter, setDivisionFilter] = useState(DIVISION_FILTER_ALL);
  const [searchValue, setSearchValue] = useState("");
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [installingIds, setInstallingIds] = useState<string[]>([]);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const deferredSearchValue = useDeferredValue(searchValue);

  const refreshInstalledIds = useCallback(async () => {
    const nextIds = await invoke<string[]>("load_installed_agency_agent_ids");
    setInstalledIds(nextIds);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const nextIds = await invoke<string[]>("load_installed_agency_agent_ids");
        if (!cancelled) {
          setInstalledIds(nextIds);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "读取已加入员工列表失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const installedEmployees = useMemo(() => buildInstalledEmployees(installedIds), [installedIds]);

  const normalizedQuery = deferredSearchValue.trim().toLowerCase();

  const filteredDivisions = useMemo<AgencyRosterDivision[]>(() => {
    const divisionsWithKeyword = rosterDivisions
      .map((division) => {
        if (!normalizedQuery) {
          return division;
        }

        const roles = division.roles.filter((role) =>
          `${role.name} ${role.description} ${role.agentId} ${role.tags.join(" ")}`
            .toLowerCase()
            .includes(normalizedQuery),
        );

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
        setError(installError instanceof Error ? installError.message : `加入「${role.name}」失败`);
      } finally {
        setInstallingIds((current) => current.filter((item) => item !== role.agentId));
      }
    },
    [installingIds, installedIds, refreshInstalledIds],
  );

  const handleRemove = useCallback(
    async (employee: InstalledAgencyEmployee) => {
      if (includesAgentId(removingIds, employee.id)) {
        return;
      }

      setError("");
      setNotice("");
      setRemovingIds((current) => [...current, employee.id]);

      try {
        await invoke<string>("uninstall_agency_agent", { agentId: employee.id });
        await refreshInstalledIds();
        setNotice(`已移除「${employee.name}」。`);
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : `移除「${employee.name}」失败`);
      } finally {
        setRemovingIds((current) => current.filter((item) => item !== employee.id));
      }
    },
    [refreshInstalledIds, removingIds],
  );

  return (
    <div className="workspace-employees">
      <section className="workspace-employees__hero">
        <div className="workspace-employees__hero-copy">
          <span className="workspace-employees__eyebrow">workspace-clone / employees</span>
          <h1>数字员工角色库</h1>
          <p>从旧仓库同步完整角色库，在这里完成筛选、搜索、加入和移除。当前页面只负责管理，不会自动跳回聊天页。</p>
        </div>
        <div className="workspace-employees__hero-stats">
          <article className="workspace-employees__hero-stat">
            <strong>{loading ? "..." : installedEmployees.length}</strong>
            <span>已加入</span>
          </article>
          <article className="workspace-employees__hero-stat">
            <strong>{visibleRoleCount}</strong>
            <span>当前可见</span>
          </article>
          <article className="workspace-employees__hero-stat">
            <strong>{totalRoleCount}</strong>
            <span>角色总数</span>
          </article>
        </div>
      </section>

      <section className="workspace-employees__toolbar">
        <div className="workspace-employees__filters" role="tablist" aria-label="员工分类筛选">
          {divisionFilterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={divisionFilter === option.id}
              className={`workspace-employees__filter ${divisionFilter === option.id ? "is-active" : ""}`}
              onClick={() => setDivisionFilter(option.id)}
            >
              <span>{option.label}</span>
              <small>{option.count}</small>
            </button>
          ))}
        </div>

        <label className="workspace-employees__search">
          <WorkspaceCloneIcon name="search" size={16} strokeWidth={1.9} />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="搜索角色名、职责、标签或 Agent ID"
            aria-label="搜索数字员工角色"
          />
        </label>
      </section>

      {(notice || error) && (
        <div className={`workspace-employees__feedback ${error ? "is-error" : "is-success"}`}>
          <span>{error || notice}</span>
        </div>
      )}

      <section className="workspace-employees__installed">
        <header className="workspace-employees__section-head">
          <div>
            <strong>已加入列表</strong>
            <p>这里只保留状态查看和移除入口，不触发聊天跳转。</p>
          </div>
          <small>{loading ? "读取中..." : `${installedEmployees.length} 个`}</small>
        </header>

        {loading ? (
          <div className="workspace-employees__empty">
            <strong>正在读取已加入员工</strong>
            <p>稍等片刻，我们正在同步本地 Agent 安装状态。</p>
          </div>
        ) : installedEmployees.length === 0 ? (
          <div className="workspace-employees__empty">
            <strong>还没有已加入员工</strong>
            <p>从下方角色卡片点击“加入”后，这里会立刻出现对应角色。</p>
          </div>
        ) : (
          <div className="workspace-employees__installed-list">
            {installedEmployees.map((employee) => {
              const removing = includesAgentId(removingIds, employee.id);
              return (
                <article key={employee.id} className="workspace-employees__installed-item">
                  <div className="workspace-employees__installed-avatar">
                    {employee.name.slice(0, 1) || "员"}
                  </div>
                  <div className="workspace-employees__installed-copy">
                    <div className="workspace-employees__installed-row">
                      <strong>{employee.name}</strong>
                      <span className="workspace-employees__state-pill">已加入</span>
                    </div>
                    <p>{employee.subtitle}</p>
                    <small>
                      {employee.divisionTitle} · {employee.id}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="workspace-employees__remove-btn"
                    disabled={removing}
                    onClick={() => {
                      void handleRemove(employee);
                    }}
                  >
                    <WorkspaceCloneIcon name="trash" size={14} strokeWidth={1.9} />
                    <span>{removing ? "移除中..." : "移除"}</span>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

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
                  <p>按旧仓库角色库同步，可直接安装为真实 Agent。</p>
                </div>
                <small>{division.roles.length} 个角色</small>
              </header>

              <div className="workspace-employees__role-grid">
                {division.roles.map((role) => {
                  const joined = includesAgentId(installedIds, role.agentId);
                  const installing = includesAgentId(installingIds, role.agentId);

                  return (
                    <article key={role.id} className="workspace-employees__role-card">
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
                        {role.tags.slice(0, 2).map((tag) => (
                          <span key={`${role.agentId}-${tag}`} className="workspace-employees__tag workspace-employees__tag--soft">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <footer className="workspace-employees__role-card-foot">
                        <span className="workspace-employees__role-division">{role.divisionTitle}</span>
                        <button
                          type="button"
                          className={`workspace-employees__join-btn ${joined ? "is-joined" : ""}`}
                          disabled={joined || installing}
                          onClick={() => {
                            void handleInstall(role);
                          }}
                        >
                          {joined ? "已加入" : installing ? "加入中..." : "加入"}
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
  );
}
