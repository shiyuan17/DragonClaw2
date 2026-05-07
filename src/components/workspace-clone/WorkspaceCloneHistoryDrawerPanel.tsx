import { useEffect } from "react";

import type { WorkspaceHistoryFilter, WorkspaceHistoryItem } from "./workspaceCloneTypes";
import {
  buildCalendarKey,
  isHistoryTitleDebugEnabled,
  resolveHistoryCardTitle,
  type WorkspaceHistoryDebugItem,
} from "./workspaceCloneDrawerShared";

interface WorkspaceCloneHistoryDrawerPanelProps {
  historyItems: WorkspaceHistoryItem[];
  historyFilter: WorkspaceHistoryFilter;
  onSelectHistoryFilter: (filter: WorkspaceHistoryFilter) => void;
  onSelectHistorySession: (sessionKey: string) => void;
}

const HISTORY_FILTERS: Array<{ key: WorkspaceHistoryFilter; label: string }> = [
  { key: "all", label: "\u5168\u90e8" },
  { key: "today", label: "\u4eca\u5929" },
  { key: "yesterday", label: "\u6628\u5929" },
];

export function WorkspaceCloneHistoryDrawerPanel({
  historyItems,
  historyFilter,
  onSelectHistoryFilter,
  onSelectHistorySession,
}: WorkspaceCloneHistoryDrawerPanelProps) {
  const now = new Date();
  const todayKey = buildCalendarKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayKey = buildCalendarKey(yesterdayDate);
  const filteredHistoryItems = historyItems.filter((item) => {
    if (historyFilter === "all") {
      return true;
    }

    if (!item.updatedAt) {
      return false;
    }

    const itemKey = buildCalendarKey(new Date(item.updatedAt));
    return historyFilter === "today" ? itemKey === todayKey : itemKey === yesterdayKey;
  });

  useEffect(() => {
    if (!isHistoryTitleDebugEnabled()) {
      return;
    }

    console.table(
      filteredHistoryItems.map((item) => {
        const debugItem = item as WorkspaceHistoryDebugItem;
        const finalTitle = resolveHistoryCardTitle(item);

        return {
          sessionKey: item.sessionKey || item.id,
          rawTitle: item.title ?? "",
          itemTitle: item.title ?? "",
          finalTitle,
          isMain: Boolean(item.isMain),
          source: debugItem._historyTitleSource ?? (item.kind === "task-run" ? "task-run" : "fallback"),
        };
      }),
    );
  }, [filteredHistoryItems]);

  return (
    <>
      <div
        className="workspace-clone__drawer-filters workspace-clone__drawer-filters--history"
        role="tablist"
        aria-label="\u5386\u53f2\u4f1a\u8bdd\u65f6\u95f4\u7b5b\u9009"
      >
        {HISTORY_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`workspace-clone__drawer-filter ${historyFilter === filter.key ? "is-active" : ""}`}
            aria-selected={historyFilter === filter.key}
            onClick={() => onSelectHistoryFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="workspace-clone__drawer-body">
        {filteredHistoryItems.map((item) => {
          const sessionKey = item.sessionKey || item.id;
          const historyTitle = resolveHistoryCardTitle(item);
          const debugItem = item as WorkspaceHistoryDebugItem;

          return (
            <button
              key={item.id}
              type="button"
              className={`workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--history ${item.active ? "is-active" : ""}`}
              onClick={() => onSelectHistorySession(sessionKey)}
              title={historyTitle}
              data-history-title={historyTitle}
              data-history-title-source={debugItem._historyTitleSource ?? undefined}
            >
              <span className="workspace-clone__drawer-card-title" title={historyTitle}>
                {historyTitle}
              </span>
              <span className="workspace-clone__drawer-card-time">{item.time}</span>
            </button>
          );
        })}

        {filteredHistoryItems.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>\u6682\u65e0\u4f1a\u8bdd</strong>
            <small>
              {historyFilter === "all"
                ? "\u5f53\u524d\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u5386\u53f2\u4f1a\u8bdd\u3002"
                : "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u7684\u5386\u53f2\u4f1a\u8bdd\u3002"}
            </small>
          </section>
        ) : null}
      </div>
    </>
  );
}
