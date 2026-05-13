import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneSessionWorkdirPickerProps {
  selectedPath: string;
  disabled?: boolean;
  variant?: "hero" | "composer";
  onSelectDirectory: () => Promise<void> | void;
  onClearDirectory: () => void;
}

function resolveWorkspaceDirectoryName(selectedPath: string) {
  const trimmedPath = selectedPath.trim().replace(/[\\/]+$/, "");
  if (!trimmedPath) {
    return "";
  }

  const segments = trimmedPath.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] || trimmedPath;
}

export function WorkspaceCloneSessionWorkdirPicker({
  selectedPath,
  disabled = false,
  variant = "composer",
  onSelectDirectory,
  onClearDirectory,
}: WorkspaceCloneSessionWorkdirPickerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasSelectedPath = selectedPath.trim().length > 0;
  const displayName = useMemo(() => resolveWorkspaceDirectoryName(selectedPath), [selectedPath]);
  const showTriggerCopy = variant === "hero" || (variant === "composer" && hasSelectedPath);
  const triggerClassName = [
    "workspace-clone__workdir-trigger",
    variant === "composer"
      ? [
          "workspace-clone__composer-pill",
          "workspace-clone__composer-pill--muted",
          !hasSelectedPath ? "workspace-clone__composer-pill--icon-only" : "",
          "workspace-clone__workdir-trigger--composer",
        ].join(" ")
      : "",
  ]
    .join(" ")
    .trim();

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const updateMenuRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      if (variant === "composer") {
        setMenuRect({
          left: rect.left,
          bottom: window.innerHeight - rect.top + 8,
          width: Math.max(rect.width, 220),
        });
        return;
      }

      setMenuRect({
        left: rect.left + rect.width / 2,
        top: rect.bottom + 10,
        width: Math.max(rect.width, 260),
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, variant]);

  useEffect(() => {
    if (!disabled) {
      return;
    }

    setMenuOpen(false);
  }, [disabled]);

  const handleSelectDirectory = async () => {
    setMenuOpen(false);
    await onSelectDirectory();
  };

  const handleClearDirectory = () => {
    setMenuOpen(false);
    onClearDirectory();
  };

  const menu = menuOpen && menuRect
    ? createPortal(
        <div
          ref={menuRef}
          className={`workspace-clone__workdir-menu workspace-clone__workdir-menu--portal workspace-clone__workdir-menu--${variant}`}
          style={{
            left: `${menuRect.left}px`,
            width: `${menuRect.width}px`,
            ...(typeof menuRect.top === "number" ? { top: `${menuRect.top}px`, transform: variant === "hero" ? "translateX(-50%)" : undefined } : {}),
            ...(typeof menuRect.bottom === "number" ? { bottom: `${menuRect.bottom}px` } : {}),
          }}
          role="menu"
          aria-label="工作目录选项"
        >
          <button type="button" className="workspace-clone__workdir-menu-item" onClick={() => void handleSelectDirectory()}>
            <WorkspaceCloneIcon name="folder" size={14} strokeWidth={1.9} />
            <span>选择新项目</span>
          </button>
          <button
            type="button"
            className="workspace-clone__workdir-menu-item"
            onClick={handleClearDirectory}
            disabled={!hasSelectedPath}
          >
            <WorkspaceCloneIcon name="x" size={14} strokeWidth={2} />
            <span>不需要项目</span>
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={[
        "workspace-clone__workdir-picker",
        `workspace-clone__workdir-picker--${variant}`,
        menuOpen ? "is-menu-open" : "",
        hasSelectedPath ? "is-selected" : "",
      ].join(" ").trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={() => setMenuOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={hasSelectedPath ? selectedPath : "选择工作目录"}
        title={hasSelectedPath ? selectedPath : "选择工作目录"}
      >
        <span className="workspace-clone__workdir-trigger-icon">
          <WorkspaceCloneIcon name="folder" size={14} strokeWidth={1.9} />
        </span>
        {showTriggerCopy ? (
          <span className="workspace-clone__workdir-trigger-copy">
            <strong>{hasSelectedPath ? displayName : "选择工作目录"}</strong>
            <small>{hasSelectedPath ? selectedPath : "为当前聊天指定默认工作目录"}</small>
          </span>
        ) : null}
        <WorkspaceCloneIcon
          name="chevron"
          size={12}
          strokeWidth={2}
          className={`workspace-clone__workdir-trigger-caret ${menuOpen ? "is-open" : ""}`}
        />
      </button>

      {menu}
    </div>
  );
}
