import { useMemo, useState } from "react";

import { sanitizeReadableText } from "../../utils/text-mojibake";
import {
  filterWorkspaceRuntimeLogs,
  getWorkspaceRuntimeLogCategoryLabel,
  getWorkspaceRuntimeLogRawTypeLabel,
  WORKSPACE_RUNTIME_LOG_FILTERS,
} from "./workspaceCloneLogs";
import type { WorkspaceRuntimeLogCategoryFilter, WorkspaceRuntimeLogItem } from "./workspaceCloneTypes";

interface WorkspaceCloneLogsDrawerPanelProps {
  logs: WorkspaceRuntimeLogItem[];
  selectedRuntimeLogId: string | null;
  onOpenRuntimeLogDetail: (logId: string) => void;
}

function resolveVisibleLogText(...values: string[]) {
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    return sanitizeReadableText(trimmed) || trimmed;
  }

  return "日志内容为空";
}

export function WorkspaceCloneLogsDrawerPanel({
  logs,
  selectedRuntimeLogId,
  onOpenRuntimeLogDetail,
}: WorkspaceCloneLogsDrawerPanelProps) {
  const [logFilter, setLogFilter] = useState<WorkspaceRuntimeLogCategoryFilter>("all");
  const filteredLogs = useMemo(() => filterWorkspaceRuntimeLogs(logs, logFilter), [logFilter, logs]);

  return (
    <>
      <div className="workspace-clone__drawer-filters workspace-clone__drawer-filters--logs" role="tablist" aria-label="运行日志分类筛选">
        {WORKSPACE_RUNTIME_LOG_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`workspace-clone__drawer-filter workspace-clone__drawer-filter--logs ${logFilter === filter.key ? "is-active" : ""}`}
            aria-selected={logFilter === filter.key}
            onClick={() => setLogFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="workspace-clone__drawer-body">
        {filteredLogs.map((item) => {
          const displayTitle = resolveVisibleLogText(item.title, item.summary, item.message);
          const displaySummary = resolveVisibleLogText(
            item.summary !== item.title ? item.summary : "",
            item.message !== item.summary ? item.message : "",
            item.summary,
            item.message,
            item.title,
          );
          const showSummaryBelowTitle = displaySummary !== displayTitle;

          return (
            <button
              key={item.id}
              type="button"
              className={`workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--log ${selectedRuntimeLogId === item.id ? "is-active" : ""}`}
              onClick={() => onOpenRuntimeLogDetail(item.id)}
              title={displaySummary}
            >
              <div className="workspace-clone__runtime-log-text">
                <strong className="workspace-clone__runtime-log-title">{displayTitle}</strong>
                {showSummaryBelowTitle ? (
                  <p className="workspace-clone__runtime-log-summary">{displaySummary}</p>
                ) : null}
              </div>
              <div className="workspace-clone__runtime-log-meta">
                <span>{item.time || "--:--:--"}</span>
                <span>{getWorkspaceRuntimeLogCategoryLabel(item.category)}</span>
                <span>{getWorkspaceRuntimeLogRawTypeLabel(item.rawType)}</span>
              </div>
            </button>
          );
        })}

        {logs.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>暂无运行日志</strong>
            <small>当前还没有可展示的运行日志。</small>
          </section>
        ) : null}

        {logs.length > 0 && filteredLogs.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>当前分类暂无日志</strong>
            <small>{`没有命中“${WORKSPACE_RUNTIME_LOG_FILTERS.find((item) => item.key === logFilter)?.label || "当前分类"}”的日志。`}</small>
          </section>
        ) : null}
      </div>
    </>
  );
}
