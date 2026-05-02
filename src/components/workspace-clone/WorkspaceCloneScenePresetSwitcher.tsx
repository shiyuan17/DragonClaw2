import { useEffect, useMemo, useState } from "react";
import { WORKSPACE_SCENE_PRESET_GROUPS, type WorkspaceCloneScenePresetGroup } from "./workspaceCloneScenePresets";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneScenePresetSwitcherProps {
  disabled?: boolean;
  onSelectCase: (content: string) => void;
}

export function WorkspaceCloneScenePresetSwitcher({
  disabled = false,
  onSelectCase,
}: WorkspaceCloneScenePresetSwitcherProps) {
  const [activeGroupId, setActiveGroupId] = useState("");
  const activeGroup = useMemo<WorkspaceCloneScenePresetGroup | null>(
    () => WORKSPACE_SCENE_PRESET_GROUPS.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId],
  );

  useEffect(() => {
    if (disabled) {
      setActiveGroupId("");
    }
  }, [disabled]);

  const handleSelectGroup = (groupId: string) => {
    if (disabled) {
      return;
    }
    setActiveGroupId(groupId);
  };

  const handleBackToGroups = () => {
    setActiveGroupId("");
  };

  const handleSelectCase = (content: string) => {
    if (disabled) {
      return;
    }
    onSelectCase(content);
    setActiveGroupId("");
  };

  return (
    <section className="workspace-clone__scene-switcher" aria-label="快捷场景">
      {!activeGroup ? (
        <ul className="workspace-clone__scene-switcher-cards" aria-label="快捷场景列表">
          {WORKSPACE_SCENE_PRESET_GROUPS.map((group) => (
            <li key={group.id} className="workspace-clone__scene-switcher-card-item">
              <button
                className="workspace-clone__scene-switcher-card"
                type="button"
                disabled={disabled}
                aria-expanded={activeGroupId === group.id}
                aria-controls={`workspace-clone-scene-detail-${group.id}`}
                onClick={() => handleSelectGroup(group.id)}
              >
                <span className="workspace-clone__scene-switcher-card-head">
                  <span className="workspace-clone__scene-switcher-card-icon" aria-hidden="true">
                    <WorkspaceCloneIcon name={group.icon} size={18} strokeWidth={1.9} />
                  </span>
                  <span className="workspace-clone__scene-switcher-card-title">{group.title}</span>
                </span>
                <span className="workspace-clone__scene-switcher-card-description">{group.description}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section
          id={`workspace-clone-scene-detail-${activeGroup.id}`}
          className="workspace-clone__scene-switcher-detail"
          aria-label={`${activeGroup.title} 场景案例`}
        >
          <header className="workspace-clone__scene-switcher-detail-header">
            <button
              className="workspace-clone__scene-switcher-back"
              type="button"
              disabled={disabled}
              aria-label="返回场景列表"
              onClick={handleBackToGroups}
            >
              <WorkspaceCloneIcon
                name="chevron-right"
                className="workspace-clone__scene-switcher-back-icon"
                size={15}
                strokeWidth={2.1}
              />
              <span>返回场景</span>
            </button>
            <div className="workspace-clone__scene-switcher-detail-copy">
              <p>场景案例</p>
              <h3>{activeGroup.title}</h3>
            </div>
          </header>

          <ul className="workspace-clone__scene-switcher-cases" aria-label="场景案例列表">
            {activeGroup.cases.map((item) => (
              <li key={item.id} className="workspace-clone__scene-switcher-case-item">
                <button
                  className="workspace-clone__scene-switcher-case"
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectCase(item.content)}
                >
                  <span className="workspace-clone__scene-switcher-case-label">{item.label}</span>
                  <WorkspaceCloneIcon
                    name="chevron-right"
                    className="workspace-clone__scene-switcher-case-arrow"
                    size={14}
                    strokeWidth={2.1}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
