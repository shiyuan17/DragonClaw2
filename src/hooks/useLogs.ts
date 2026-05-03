// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * useLogs Hook
 *
 * Manages application logs with auto-scroll, ANSI stripping,
 * and human-readable translation.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { LogEntry } from "../types";
import { humanizeLog } from "../utils/log-humanizer";
import { stripAnsi } from "../utils/ansi-strip";

interface IncomingLogEntry {
    level: string;
    message: string;
}

export function useLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [repairToast, setRepairToast] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);
    const pendingLogsRef = useRef<LogEntry[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushPendingLogs = useCallback(() => {
        const pending = pendingLogsRef.current;
        if (pending.length === 0) {
            return;
        }

        pendingLogsRef.current = [];
        setLogs((prev) => [...prev, ...pending].slice(-300));
    }, []);

    const scheduleLogFlush = useCallback(() => {
        if (flushTimerRef.current !== null) {
            return;
        }

        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            flushPendingLogs();
        }, 200);
    }, [flushPendingLogs]);

    const addLogs = useCallback((entries: IncomingLogEntry[]) => {
        let shouldShowRepairToast = false;
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

        for (const entry of entries) {
            const cleanMsg = stripAnsi(entry.message);
            const humanized = humanizeLog(cleanMsg);
            pendingLogsRef.current.push({
                time,
                level: entry.level,
                message: cleanMsg,
                humanized,
            });

            if (cleanMsg.includes("device signature invalid") || cleanMsg.includes("signature invalid")) {
                shouldShowRepairToast = true;
            }
        }

        scheduleLogFlush();

        if (shouldShowRepairToast) {
            setRepairToast(true);
        }
    }, [scheduleLogFlush]);

    const addLog = useCallback((level: string, message: string) => {
        addLogs([{ level, message }]);
    }, [addLogs]);

    // Auto-scroll logs
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs]);

    useEffect(
        () => () => {
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
        },
        [],
    );

    return {
        logs,
        repairToast,
        setRepairToast,
        logRef,
        addLog,
        addLogs,
    };
}
