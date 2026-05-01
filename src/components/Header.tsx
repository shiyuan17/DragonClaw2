// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/dragonclaw-logo.png";
import { WindowControls, type WindowPlatform } from "./WindowControls";

function detectPlatform(): WindowPlatform {
  if (typeof navigator === "undefined") {
    return "other";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "win";
  return "other";
}

export function Header() {
  const [windowPlatform, setWindowPlatform] = useState<WindowPlatform>(detectPlatform());
  const [tauriReady, setTauriReady] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const cleanupFns = useRef<Array<() => void>>([]);
  const appWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);

  useEffect(() => {
    let active = true;

    async function syncWindowState() {
      try {
        const appWindow = getCurrentWindow();
        appWindowRef.current = appWindow;
        if (!active) return;

        setTauriReady(true);
        setIsMaximized(await appWindow.isMaximized());

        cleanupFns.current.forEach((cleanup) => cleanup());
        cleanupFns.current = [];

        const unlistenResize = await appWindow.onResized(async () => {
          try {
            setIsMaximized(await appWindow.isMaximized());
          } catch (error) {
            console.error("Failed to sync window maximized state after resize.", error);
          }
        });
        cleanupFns.current.push(unlistenResize);
      } catch (error) {
        appWindowRef.current = null;
        setTauriReady(false);
        setIsMaximized(false);
        console.error("Failed to initialize Tauri window controls.", error);
      }
    }

    setWindowPlatform(detectPlatform());
    void syncWindowState();

    return () => {
      active = false;
      appWindowRef.current = null;
      cleanupFns.current.forEach((cleanup) => cleanup());
      cleanupFns.current = [];
    };
  }, []);

  const handleDragMouseDown = async (event: ReactMouseEvent<HTMLElement>) => {
    if (!tauriReady || event.button !== 0) return;

    try {
      await appWindowRef.current?.startDragging();
    } catch (error) {
      console.error("Failed to start dragging the window.", error);
    }
  };

  const handleMinimize = async () => {
    if (!tauriReady) return;
    try {
      await appWindowRef.current?.minimize();
    } catch (error) {
      console.error("Failed to minimize the window.", error);
    }
  };

  const handleToggleMaximize = async () => {
    if (!tauriReady) return;

    try {
      const appWindow = appWindowRef.current;
      if (!appWindow) {
        setTauriReady(false);
        return;
      }
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        await appWindow.unmaximize();
        setIsMaximized(false);
        return;
      }

      await appWindow.maximize();
      setIsMaximized(true);
    } catch (error) {
      console.error("Failed to toggle the window maximize state.", error);
    }
  };

  const handleClose = async () => {
    if (!tauriReady) return;

    try {
      await appWindowRef.current?.close();
    } catch (error) {
      console.error("Failed to close the window.", error);
    }
  };

  return (
    <header className={`header ${isMaximized ? "is-maximized" : ""}`}>
      <div
        className="header__brand"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleToggleMaximize}
      >
        <span className="header__logo">
          <img src={logo} alt="DragonClaw" />
        </span>
        <strong className="header__title">DragonClaw</strong>
      </div>

      <div
        className="header__drag-fill"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleToggleMaximize}
      />

      <div className="header__actions" data-no-window-drag onMouseDown={(event) => event.stopPropagation()}>
        <WindowControls
          windowPlatform={windowPlatform}
          isMaximized={isMaximized}
          disabled={!tauriReady}
          onMinimize={handleMinimize}
          onToggleMaximize={handleToggleMaximize}
          onClose={handleClose}
        />
      </div>
    </header>
  );
}
