import { useMemo, useState } from "react";

import {
  getWorkspaceChatFileCategoryLabel,
  getWorkspaceChatFileSourceRoleLabel,
  WORKSPACE_CHAT_FILE_FILTERS,
} from "./workspaceCloneChatFiles";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceChatFileCategory, WorkspaceChatFileItem } from "./workspaceCloneTypes";

interface WorkspaceCloneFilesDrawerPanelProps {
  fileItems: WorkspaceChatFileItem[];
  onOpenChatFile: (item: WorkspaceChatFileItem) => void;
}

function resolveChatFileIconName(category: WorkspaceChatFileCategory): Parameters<typeof WorkspaceCloneIcon>[0]["name"] {
  switch (category) {
    case "website":
      return "globe";
    case "document":
      return "notebook";
    case "excel":
      return "folder";
    case "ppt":
      return "panel";
    case "image":
      return "paperclip";
    case "video":
      return "play";
    case "audio":
      return "voice";
    default:
      return "paperclip";
  }
}

export function WorkspaceCloneFilesDrawerPanel({
  fileItems,
  onOpenChatFile,
}: WorkspaceCloneFilesDrawerPanelProps) {
  const [fileFilter, setFileFilter] = useState<WorkspaceChatFileCategory>("all");
  const filteredFileItems = useMemo(
    () => (fileFilter === "all" ? fileItems : fileItems.filter((item) => item.category === fileFilter)),
    [fileFilter, fileItems],
  );

  return (
    <>
      <div className="workspace-clone__drawer-filters workspace-clone__drawer-filters--files" role="tablist" aria-label="聊天文件分类筛选">
        {WORKSPACE_CHAT_FILE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`workspace-clone__drawer-filter workspace-clone__drawer-filter--files ${fileFilter === filter.key ? "is-active" : ""}`}
            aria-selected={fileFilter === filter.key}
            onClick={() => setFileFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="workspace-clone__drawer-body">
        {filteredFileItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--file"
            onClick={() => onOpenChatFile(item)}
            title={item.target}
          >
            <div className="workspace-clone__file-card-head">
              <span className="workspace-clone__file-card-icon" aria-hidden="true">
                <WorkspaceCloneIcon name={resolveChatFileIconName(item.category)} size={15} strokeWidth={1.9} />
              </span>
              <div className="workspace-clone__file-card-copy">
                <strong className="workspace-clone__drawer-card-title">{item.title}</strong>
                <small className="workspace-clone__file-card-target">{item.target}</small>
              </div>
            </div>
            <div className="workspace-clone__file-card-meta">
              <span className="workspace-clone__resource-tag">{getWorkspaceChatFileCategoryLabel(item.category)}</span>
              <span>{getWorkspaceChatFileSourceRoleLabel(item.sourceRole)}</span>
              <span>{item.messageTime || "--:--"}</span>
            </div>
            <p className="workspace-clone__file-card-preview">{item.messagePreview}</p>
          </button>
        ))}

        {fileItems.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>暂无聊天文件</strong>
            <small>当前会话还没有可打开的文件或链接。</small>
          </section>
        ) : null}

        {fileItems.length > 0 && filteredFileItems.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>当前分类暂无文件</strong>
            <small>{`没有命中“${WORKSPACE_CHAT_FILE_FILTERS.find((item) => item.key === fileFilter)?.label || "当前分类"}”的文件或链接。`}</small>
          </section>
        ) : null}
      </div>
    </>
  );
}
