import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceSlashCommandDefinition, WorkspaceSkillOption } from "./workspaceCloneTypes";

export type WorkspaceComposerSuggestionItem = {
  key: string;
  title: string;
  subtitle: string;
  meta?: string;
} & ({ kind: "command"; command: WorkspaceSlashCommandDefinition } | { kind: "skill"; skill: WorkspaceSkillOption });

export interface WorkspaceComposerSuggestionSection {
  key: "commands" | "skills";
  label: string;
  items: WorkspaceComposerSuggestionItem[];
}

interface WorkspaceCloneComposerSuggestionPopoverProps {
  highlightedSuggestionIndex: number;
  flatSuggestions: WorkspaceComposerSuggestionItem[];
  suggestionSections: WorkspaceComposerSuggestionSection[];
  onSelectSuggestion: (item: WorkspaceComposerSuggestionItem) => void;
}

export function WorkspaceCloneComposerSuggestionPopover({
  highlightedSuggestionIndex,
  flatSuggestions,
  suggestionSections,
  onSelectSuggestion,
}: WorkspaceCloneComposerSuggestionPopoverProps) {
  if (flatSuggestions.length === 0) {
    return (
      <div className="workspace-clone__composer-suggestion-popover" role="listbox" aria-label="命令与技能建议">
        <div className="workspace-clone__composer-suggestion-empty">
          <strong>没有匹配的命令或技能</strong>
          <span>继续输入可缩小范围，或按 Esc 关闭建议面板。</span>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-clone__composer-suggestion-popover" role="listbox" aria-label="命令与技能建议">
      <div className="workspace-clone__composer-suggestion-sections">
        {suggestionSections.map((section) => (
          <div key={section.key} className="workspace-clone__composer-suggestion-section">
            <div className="workspace-clone__composer-suggestion-section-title">{section.label}</div>
            <div className="workspace-clone__composer-suggestion-list">
              {section.items.map((item) => {
                const itemIndex = flatSuggestions.findIndex((candidate) => candidate.key === item.key);
                const isActive = itemIndex === highlightedSuggestionIndex;

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`workspace-clone__composer-suggestion-item ${isActive ? "is-active" : ""}`}
                    onClick={() => onSelectSuggestion(item)}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className={`workspace-clone__composer-suggestion-icon is-${item.kind}`}>
                      <WorkspaceCloneIcon name={item.kind === "command" ? "terminal" : "sparkles"} size={14} strokeWidth={1.9} />
                    </span>
                    <span className="workspace-clone__composer-suggestion-copy">
                      <span className="workspace-clone__composer-suggestion-title-row">
                        <strong>{item.title}</strong>
                        {item.meta ? <em>{item.meta}</em> : null}
                      </span>
                      <span>{item.subtitle}</span>
                    </span>
                    {isActive ? (
                      <span className="workspace-clone__composer-suggestion-enter" aria-hidden="true">
                        <WorkspaceCloneIcon name="chevron-right" size={13} strokeWidth={2} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
