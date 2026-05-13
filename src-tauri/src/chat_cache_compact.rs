// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::HashSet;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::chat_cache::{
    count_message_rows, current_timestamp_millis, extract_last_message_summary,
    insert_message_rows, open_chat_cache_connection, parse_message_values,
    update_session_message_metadata,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatSessionCacheCompactRow {
    pub session_key: String,
    pub agent_id: String,
    pub updated_at: Option<i64>,
    pub cached_at: i64,
    pub title: Option<String>,
    pub last_message_summary: Option<String>,
    pub message_count: i64,
    pub has_message_rows: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatCacheWarmResult {
    pub migrated_sessions: i64,
    pub skipped_sessions: i64,
    pub failed_sessions: Vec<String>,
}

fn migrate_session_rows(
    connection: &Connection,
    session_key: &str,
    messages_json: &str,
) -> Result<bool, String> {
    let existing_rows = count_message_rows(connection, session_key)?;
    if existing_rows > 0 {
        return Ok(false);
    }

    let messages = parse_message_values(messages_json);
    connection
        .execute(
            "DELETE FROM session_history_message_cache WHERE session_key = ?1",
            params![session_key],
        )
        .map_err(|error| format!("clear chat warm rows failed: {error}"))?;

    if !messages.is_empty() {
        insert_message_rows(connection, session_key, 0, &messages)?;
    }

    update_session_message_metadata(
        connection,
        session_key,
        i64::try_from(messages.len()).unwrap_or(0),
        extract_last_message_summary(&messages),
        Some(current_timestamp_millis()),
    )?;
    Ok(true)
}

#[tauri::command]
pub fn list_workspace_chat_session_cache_compact(
    agent_id: String,
    limit: Option<i64>,
) -> Result<Vec<WorkspaceChatSessionCacheCompactRow>, String> {
    let normalized_agent_id = agent_id.trim();
    if normalized_agent_id.is_empty() {
        return Ok(Vec::new());
    }

    let row_limit = limit.unwrap_or(20).clamp(1, 100);
    let connection = open_chat_cache_connection()?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                session_key,
                agent_id,
                updated_at,
                cached_at,
                title,
                last_message_summary,
                COALESCE(message_count, (
                    SELECT COUNT(*)
                    FROM session_history_message_cache rows
                    WHERE rows.session_key = session_history_cache.session_key
                ), 0) AS resolved_message_count,
                EXISTS (
                    SELECT 1
                    FROM session_history_message_cache rows
                    WHERE rows.session_key = session_history_cache.session_key
                    LIMIT 1
                ) AS has_message_rows
            FROM session_history_cache
            WHERE agent_id = ?1
            ORDER BY COALESCE(updated_at, 0) DESC, cached_at DESC
            LIMIT ?2
            ",
        )
        .map_err(|error| format!("prepare compact chat cache query failed: {error}"))?;

    let rows = statement
        .query_map(params![normalized_agent_id, row_limit], |row| {
            Ok(WorkspaceChatSessionCacheCompactRow {
                session_key: row.get(0)?,
                agent_id: row.get(1)?,
                updated_at: row.get(2)?,
                cached_at: row.get(3)?,
                title: row.get(4)?,
                last_message_summary: row.get(5)?,
                message_count: row.get(6)?,
                has_message_rows: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|error| format!("read compact chat cache failed: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect compact chat cache failed: {error}"))
}

#[tauri::command]
pub fn warm_workspace_chat_session_cache_pages(
    agent_id: Option<String>,
    session_keys: Option<Vec<String>>,
    limit_sessions: Option<i64>,
    page_limit: Option<i64>,
) -> Result<WorkspaceChatCacheWarmResult, String> {
    let normalized_agent_id = agent_id.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let target_session_keys = session_keys
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();
    let session_limit = limit_sessions.unwrap_or(3).clamp(1, 20) as usize;
    let _page_limit = page_limit.unwrap_or(30).clamp(1, 100);

    let connection = open_chat_cache_connection()?;
    let mut statement = connection
        .prepare(
            "
            SELECT session_key, messages_json, message_rows_migrated_at
            FROM session_history_cache
            WHERE (?1 IS NULL OR agent_id = ?1)
            ORDER BY COALESCE(updated_at, 0) DESC, cached_at DESC
            ",
        )
        .map_err(|error| format!("prepare chat cache warm query failed: {error}"))?;
    let rows = statement
        .query_map(params![normalized_agent_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
            ))
        })
        .map_err(|error| format!("read chat cache warm rows failed: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect chat cache warm rows failed: {error}"))?;

    let mut migrated_sessions = 0;
    let mut skipped_sessions = 0;
    let mut failed_sessions = Vec::new();
    for (session_key, messages_json, migrated_at) in rows {
        if !target_session_keys.is_empty() && !target_session_keys.contains(&session_key) {
            continue;
        }
        if migrated_at.is_some() || count_message_rows(&connection, &session_key).unwrap_or(0) > 0 {
            skipped_sessions += 1;
            continue;
        }
        if migrated_sessions as usize >= session_limit {
            break;
        }
        match migrate_session_rows(&connection, &session_key, &messages_json) {
            Ok(true) => migrated_sessions += 1,
            Ok(false) => skipped_sessions += 1,
            Err(_) => failed_sessions.push(session_key),
        }
    }

    Ok(WorkspaceChatCacheWarmResult {
        migrated_sessions,
        skipped_sessions,
        failed_sessions,
    })
}
