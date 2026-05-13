// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::chat_cache::{count_message_rows, open_chat_cache_connection};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRenderMessagePreview {
    pub index: i64,
    pub id: Option<String>,
    pub role: String,
    pub text_preview: String,
    pub timestamp: Option<i64>,
    pub text_hash: Option<String>,
    pub render_kind: String,
    pub full_text_length: i64,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatSessionRenderPage {
    pub session_key: String,
    pub agent_id: String,
    pub messages: Vec<WorkspaceRenderMessagePreview>,
    pub total: i64,
    pub start_index: Option<i64>,
    pub end_index: Option<i64>,
    pub has_more_before: bool,
    pub updated_at: Option<i64>,
    pub cached_at: i64,
    pub title: Option<String>,
}

#[tauri::command]
pub fn load_workspace_chat_session_render_page(
    session_key: String,
    agent_id: String,
    before_index: Option<i64>,
    limit: Option<i64>,
) -> Result<Option<WorkspaceChatSessionRenderPage>, String> {
    let normalized_session_key = session_key.trim();
    let normalized_agent_id = agent_id.trim();
    if normalized_session_key.is_empty() || normalized_agent_id.is_empty() {
        return Ok(None);
    }

    let page_limit = limit.unwrap_or(20).clamp(1, 60);
    let connection = open_chat_cache_connection()?;
    let cache_row = connection
        .query_row(
            "
            SELECT session_key, agent_id, updated_at, cached_at, title, message_count
            FROM session_history_cache
            WHERE session_key = ?1 AND agent_id = ?2
            LIMIT 1
            ",
            params![normalized_session_key, normalized_agent_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("read chat render cache row failed: {error}"))?;
    let Some(cache_row) = cache_row else {
        return Ok(None);
    };

    let existing_rows = count_message_rows(&connection, normalized_session_key)?;
    let total = cache_row.5.unwrap_or(existing_rows).max(existing_rows);
    let mut statement = connection
        .prepare(
            "
            SELECT message_index, message_id, role, text_preview, timestamp, text_hash, render_kind, full_text_length
            FROM session_history_message_cache
            WHERE session_key = ?1 AND (?2 IS NULL OR message_index < ?2)
            ORDER BY message_index DESC
            LIMIT ?3
            ",
        )
        .map_err(|error| format!("prepare chat render page failed: {error}"))?;
    let mut messages = statement
        .query_map(params![normalized_session_key, before_index, page_limit], |row| {
            let full_text_length = row.get::<_, Option<i64>>(7)?.unwrap_or(0);
            Ok(WorkspaceRenderMessagePreview {
                index: row.get(0)?,
                id: row.get(1)?,
                role: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "assistant".to_string()),
                text_preview: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                timestamp: row.get(4)?,
                text_hash: row.get(5)?,
                render_kind: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "plain".to_string()),
                full_text_length,
                truncated: full_text_length > 1200,
            })
        })
        .map_err(|error| format!("read chat render page failed: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect chat render page failed: {error}"))?;

    messages.sort_by_key(|message| message.index);
    let start_index = messages.first().map(|message| message.index);
    let end_index = messages.last().map(|message| message.index);

    Ok(Some(WorkspaceChatSessionRenderPage {
        session_key: cache_row.0,
        agent_id: cache_row.1,
        messages,
        total,
        start_index,
        end_index,
        has_more_before: start_index.map(|index| index > 0).unwrap_or(false),
        updated_at: cache_row.2,
        cached_at: cache_row.3,
        title: cache_row.4,
    }))
}
