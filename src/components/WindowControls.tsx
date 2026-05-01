// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import type { MouseEvent } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

export type WindowPlatform = "mac" | "win" | "other";

interface WindowControlsProps {
  windowPlatform: WindowPlatform;
  isMaximized: boolean;
  disabled: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

function stopWindowDrag(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function WindowControls({
  windowPlatform,
  isMaximized,
  disabled,
  onClose,
  onMinimize,
  onToggleMaximize,
}: WindowControlsProps) {
  const windowsLikeLayout = windowPlatform !== "mac";

  return (
    <div className={`window-controls ${windowPlatform}`} data-no-window-drag>
      <button
        type="button"
        className={`window-btn minimize ${windowsLikeLayout ? "window-btn--win" : ""}`}
        aria-label="Minimize"
        title="Minimize"
        disabled={disabled}
        onMouseDown={stopWindowDrag}
        onDoubleClick={stopWindowDrag}
        onClick={onMinimize}
      >
        {windowsLikeLayout ? (
          <Minus className="window-btn__icon" size={12} strokeWidth={1.7} aria-hidden="true" />
        ) : (
          <span className="window-btn__mac-glyph" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className={`window-btn maximize ${windowsLikeLayout ? "window-btn--win" : ""}`}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        title={isMaximized ? "Restore" : "Maximize"}
        disabled={disabled}
        onMouseDown={stopWindowDrag}
        onDoubleClick={stopWindowDrag}
        onClick={onToggleMaximize}
      >
        {windowsLikeLayout ? (
          isMaximized ? (
            <Copy className="window-btn__icon" size={11} strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <Square className="window-btn__icon" size={11} strokeWidth={1.7} aria-hidden="true" />
          )
        ) : (
          <span className="window-btn__mac-glyph" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className={`window-btn close ${windowsLikeLayout ? "window-btn--win" : ""}`}
        aria-label="Close"
        title="Close"
        disabled={disabled}
        onMouseDown={stopWindowDrag}
        onDoubleClick={stopWindowDrag}
        onClick={onClose}
      >
        {windowsLikeLayout ? (
          <X className="window-btn__icon" size={12} strokeWidth={1.7} aria-hidden="true" />
        ) : (
          <span className="window-btn__mac-glyph" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
