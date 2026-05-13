// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use rusqlite::Connection;

const CHAT_HISTORY_CACHE_SCHEMA_VERSION: i64 = 2;

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("prepare chat cache schema check failed: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("read chat cache schema failed: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect chat cache schema failed: {error}"))?;
    Ok(columns)
}

fn ensure_columns(connection: &Connection, table: &str, columns: &[(&str, &str)]) -> Result<(), String> {
    let existing = table_columns(connection, table)?;
    for (name, definition) in columns {
        if existing.iter().any(|column| column == name) {
            continue;
        }
        connection
            .execute(&format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"), [])
            .map_err(|error| format!("upgrade chat cache schema failed: {error}"))?;
    }
    Ok(())
}

pub(crate) fn reset_chat_history_cache_rows(connection: &Connection) -> Result<(), String> {
    connection
        .execute("DELETE FROM session_history_message_cache", [])
        .map_err(|error| format!("clear chat message cache rows failed: {error}"))?;
    connection
        .execute("DELETE FROM session_history_cache", [])
        .map_err(|error| format!("clear chat history cache rows failed: {error}"))?;
    Ok(())
}

pub(crate) fn ensure_chat_history_cache_schema_v2(connection: &Connection) -> Result<(), String> {
    ensure_columns(
        connection,
        "session_history_cache",
        &[
            ("message_count", "INTEGER"),
            ("last_message_summary", "TEXT"),
            ("message_rows_migrated_at", "INTEGER"),
        ],
    )?;
    ensure_columns(
        connection,
        "session_history_message_cache",
        &[
            ("message_id", "TEXT"),
            ("role", "TEXT"),
            ("text_preview", "TEXT"),
            ("timestamp", "INTEGER"),
            ("text_hash", "TEXT"),
            ("render_kind", "TEXT"),
            ("full_text_length", "INTEGER"),
        ],
    )?;

    let version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("read chat cache schema version failed: {error}"))?;
    if version < CHAT_HISTORY_CACHE_SCHEMA_VERSION {
        reset_chat_history_cache_rows(connection)?;
        connection
            .pragma_update(None, "user_version", CHAT_HISTORY_CACHE_SCHEMA_VERSION)
            .map_err(|error| format!("write chat cache schema version failed: {error}"))?;
    }
    Ok(())
}
