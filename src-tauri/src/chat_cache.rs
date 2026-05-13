// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::chat_cache_preview::build_cached_message_preview;
use crate::chat_cache_schema::{ensure_chat_history_cache_schema_v2, reset_chat_history_cache_rows};
use crate::paths;

const CHAT_CACHE_DB_FILE: &str = "workspace-chat-cache.db";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatSessionCacheRow {
    pub session_key: String,
    pub agent_id: String,
    pub updated_at: Option<i64>,
    pub cached_at: i64,
    pub title: Option<String>,
    pub messages_json: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatSessionCacheSummary {
    pub session_key: String,
    pub agent_id: String,
    pub updated_at: Option<i64>,
    pub cached_at: i64,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChatSessionCachePage {
    pub session_key: String,
    pub agent_id: String,
    pub messages: Vec<Value>,
    pub total: i64,
    pub start_index: Option<i64>,
    pub end_index: Option<i64>,
    pub has_more_before: bool,
    pub updated_at: Option<i64>,
    pub cached_at: i64,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAgentCacheInput {
    pub agent_id: String,
    pub name: Option<String>,
    pub identity_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAgentCacheRow {
    pub agent_id: String,
    pub name: Option<String>,
    pub identity_json: Option<String>,
    pub is_default: bool,
    pub scope: String,
    pub cached_at: i64,
}

pub(crate) fn current_timestamp_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .ok()
        .and_then(|millis| i64::try_from(millis).ok())
        .unwrap_or(0)
}

fn chat_cache_db_path() -> Result<PathBuf, String> {
    Ok(paths::user_config_dir()?.join(CHAT_CACHE_DB_FILE))
}

pub(crate) fn open_chat_cache_connection() -> Result<Connection, String> {
    let db_path = chat_cache_db_path()?;
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建聊天缓存目录失败: {error}"))?;
    }

    let connection =
        Connection::open(&db_path).map_err(|error| format!("打开聊天缓存数据库失败: {error}"))?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS session_history_cache (
                session_key TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                updated_at INTEGER,
                cached_at INTEGER NOT NULL,
                title TEXT,
                messages_json TEXT NOT NULL,
                message_count INTEGER,
                last_message_summary TEXT,
                message_rows_migrated_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_session_history_cache_updated_at
            ON session_history_cache(updated_at DESC);
            CREATE TABLE IF NOT EXISTS session_history_message_cache (
                session_key TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                message_json TEXT NOT NULL,
                message_id TEXT,
                role TEXT,
                text_preview TEXT,
                timestamp INTEGER,
                text_hash TEXT,
                render_kind TEXT,
                full_text_length INTEGER,
                PRIMARY KEY(session_key, message_index),
                FOREIGN KEY(session_key) REFERENCES session_history_cache(session_key) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_session_history_message_cache_session_index
            ON session_history_message_cache(session_key, message_index DESC);
            CREATE TABLE IF NOT EXISTS agent_list_cache (
                agent_id TEXT PRIMARY KEY,
                name TEXT,
                identity_json TEXT,
                is_default INTEGER NOT NULL DEFAULT 0,
                scope TEXT NOT NULL DEFAULT 'workspace',
                cached_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agent_list_cache_cached_at
            ON agent_list_cache(cached_at DESC);
            ",
        )
        .map_err(|error| format!("初始化聊天缓存数据库失败: {error}"))?;
    ensure_chat_history_cache_schema_v2(&connection)?;
    Ok(connection)
}

fn is_legacy_demo_agent(agent_id: &str, name: Option<&str>) -> bool {
    let normalized_id = agent_id.trim().to_ascii_lowercase();
    if normalized_id == "ops" || normalized_id == "product" {
        return true;
    }

    let normalized_name = name.unwrap_or("").trim();
    normalized_name == "运营协作 Agent" || normalized_name == "产品策略 Agent"
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn remove_legacy_demo_agents(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "
            DELETE FROM agent_list_cache
            WHERE agent_id IN ('ops', 'product')
               OR name IN ('运营协作 Agent', '产品策略 Agent')
            ",
            [],
        )
        .map_err(|error| format!("清理旧 Agent 缓存失败: {error}"))?;
    Ok(())
}

pub(crate) fn parse_message_values(messages_json: &str) -> Vec<Value> {
    serde_json::from_str::<Value>(messages_json)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default()
}

fn normalize_summary_text(value: &str) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    if normalized.len() <= 96 {
        return Some(normalized);
    }
    Some(format!("{}...", normalized.chars().take(95).collect::<String>().trim_end()))
}

fn extract_message_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => normalize_summary_text(text),
        Value::Array(items) => normalize_summary_text(
            &items
                .iter()
                .filter_map(extract_message_text)
                .collect::<Vec<_>>()
                .join("\n\n"),
        ),
        Value::Object(map) => ["text", "value", "content", "message", "output", "input", "title", "prompt"]
            .iter()
            .filter_map(|key| map.get(*key))
            .filter_map(extract_message_text)
            .next(),
        _ => None,
    }
}

pub(crate) fn extract_last_message_summary(messages: &[Value]) -> Option<String> {
    messages.iter().rev().find_map(|message| {
        if message
            .get("role")
            .and_then(Value::as_str)
            .is_some_and(|role| role == "tool")
        {
            return None;
        }
        extract_message_text(message)
    })
}

pub(crate) fn update_session_message_metadata(
    connection: &Connection,
    session_key: &str,
    message_count: i64,
    last_message_summary: Option<String>,
    migrated_at: Option<i64>,
) -> Result<(), String> {
    connection
        .execute(
            "
            UPDATE session_history_cache
            SET message_count = ?2,
                last_message_summary = ?3,
                message_rows_migrated_at = COALESCE(?4, message_rows_migrated_at)
            WHERE session_key = ?1
            ",
            params![session_key, message_count, last_message_summary, migrated_at],
        )
        .map_err(|error| format!("update chat message metadata failed: {error}"))?;
    Ok(())
}

pub(crate) fn insert_message_rows(
    connection: &Connection,
    session_key: &str,
    start_index: i64,
    messages: &[Value],
) -> Result<(), String> {
    for (offset, message) in messages.iter().enumerate() {
        let preview = build_cached_message_preview(message);
        let message_json = serde_json::to_string(message)
            .map_err(|error| format!("serialize chat message cache row failed: {error}"))?;
        connection
            .execute(
                "
                INSERT INTO session_history_message_cache (
                    session_key, message_index, message_json, message_id, role, text_preview,
                    timestamp, text_hash, render_kind, full_text_length
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ON CONFLICT(session_key, message_index) DO UPDATE SET
                    message_json = excluded.message_json,
                    message_id = excluded.message_id,
                    role = excluded.role,
                    text_preview = excluded.text_preview,
                    timestamp = excluded.timestamp,
                    text_hash = excluded.text_hash,
                    render_kind = excluded.render_kind,
                    full_text_length = excluded.full_text_length
                ",
                params![
                    session_key,
                    start_index + i64::try_from(offset).unwrap_or(0),
                    message_json,
                    preview.id,
                    preview.role,
                    preview.text_preview,
                    preview.timestamp,
                    preview.text_hash,
                    preview.render_kind,
                    preview.full_text_length,
                ],
            )
            .map_err(|error| format!("write chat message cache row failed: {error}"))?;
    }

    Ok(())
}

fn upsert_message_rows(
    connection: &Connection,
    session_key: &str,
    messages: &[Value],
) -> Result<(), String> {
    if messages.is_empty() {
        connection
            .execute(
                "DELETE FROM session_history_message_cache WHERE session_key = ?1",
                params![session_key],
            )
            .map_err(|error| format!("clear chat message cache rows failed: {error}"))?;
        return update_session_message_metadata(
            connection,
            session_key,
            0,
            None,
            Some(current_timestamp_millis()),
        );
    }

    let existing_total = count_message_rows(connection, session_key)?;
    let incoming_len = i64::try_from(messages.len()).unwrap_or(0);
    let start_index = (existing_total - incoming_len).max(0);
    connection
        .execute(
            "DELETE FROM session_history_message_cache WHERE session_key = ?1 AND message_index >= ?2",
            params![session_key, start_index],
        )
        .map_err(|error| format!("replace chat message cache rows failed: {error}"))?;
    insert_message_rows(connection, session_key, start_index, messages)?;
    let total = (start_index + incoming_len).max(existing_total);
    update_session_message_metadata(
        connection,
        session_key,
        total,
        extract_last_message_summary(messages),
        Some(current_timestamp_millis()),
    )
}

pub(crate) fn count_message_rows(connection: &Connection, session_key: &str) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM session_history_message_cache WHERE session_key = ?1",
            params![session_key],
            |row| row.get(0),
        )
        .map_err(|error| format!("count chat message cache rows failed: {error}"))
}

pub(crate) fn ensure_message_rows(
    connection: &Connection,
    session_key: &str,
    messages_json: &str,
) -> Result<i64, String> {
    let existing_total = count_message_rows(connection, session_key)?;
    if existing_total > 0 {
        return Ok(existing_total);
    }
    let migrated_total = connection
        .query_row(
            "
            SELECT message_count
            FROM session_history_cache
            WHERE session_key = ?1 AND message_rows_migrated_at IS NOT NULL
            LIMIT 1
            ",
            params![session_key],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|error| format!("read chat message metadata failed: {error}"))?
        .flatten();
    if let Some(total) = migrated_total {
        return Ok(total);
    }

    let messages = parse_message_values(messages_json);
    if messages.is_empty() {
        update_session_message_metadata(
            connection,
            session_key,
            0,
            None,
            Some(current_timestamp_millis()),
        )?;
        return Ok(0);
    }

    insert_message_rows(connection, session_key, 0, &messages)?;
    let total = i64::try_from(messages.len()).unwrap_or(0);
    update_session_message_metadata(
        connection,
        session_key,
        total,
        extract_last_message_summary(&messages),
        Some(current_timestamp_millis()),
    )?;
    Ok(total)
}

#[tauri::command]
pub fn load_workspace_chat_session_cache(
    session_key: String,
    agent_id: String,
) -> Result<Option<WorkspaceChatSessionCacheRow>, String> {
    let normalized_session_key = session_key.trim();
    let normalized_agent_id = agent_id.trim();
    if normalized_session_key.is_empty() || normalized_agent_id.is_empty() {
        return Ok(None);
    }

    let connection = open_chat_cache_connection()?;
    connection
        .query_row(
            "
            SELECT session_key, agent_id, updated_at, cached_at, title, messages_json
            FROM session_history_cache
            WHERE session_key = ?1 AND agent_id = ?2
            LIMIT 1
            ",
            params![normalized_session_key, normalized_agent_id],
            |row| {
                Ok(WorkspaceChatSessionCacheRow {
                    session_key: row.get(0)?,
                    agent_id: row.get(1)?,
                    updated_at: row.get(2)?,
                    cached_at: row.get(3)?,
                    title: row.get(4)?,
                    messages_json: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("读取聊天缓存失败: {error}"))
}

#[tauri::command]
pub fn upsert_workspace_chat_session_cache(
    session_key: String,
    agent_id: String,
    updated_at: Option<i64>,
    title: Option<String>,
    messages_json: String,
) -> Result<(), String> {
    let normalized_session_key = session_key.trim();
    let normalized_agent_id = agent_id.trim();
    if normalized_session_key.is_empty() || normalized_agent_id.is_empty() {
        return Err("会话缓存参数不完整".to_string());
    }

    let messages = parse_message_values(&messages_json);
    let mut connection = open_chat_cache_connection()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("打开聊天缓存事务失败: {error}"))?;
    transaction
        .execute(
            "
            INSERT INTO session_history_cache (
                session_key,
                agent_id,
                updated_at,
                cached_at,
                title,
                messages_json
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(session_key) DO UPDATE SET
                agent_id = excluded.agent_id,
                updated_at = excluded.updated_at,
                cached_at = excluded.cached_at,
                title = excluded.title,
                messages_json = excluded.messages_json
            ",
            params![
                normalized_session_key,
                normalized_agent_id,
                updated_at,
                current_timestamp_millis(),
                title
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                messages_json,
            ],
        )
        .map_err(|error| format!("写入聊天缓存失败: {error}"))?;
    upsert_message_rows(&transaction, normalized_session_key, &messages)?;
    transaction
        .commit()
        .map_err(|error| format!("commit chat cache failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_workspace_chat_session_cache_page(
    session_key: String,
    agent_id: String,
    before_index: Option<i64>,
    limit: Option<i64>,
) -> Result<Option<WorkspaceChatSessionCachePage>, String> {
    let normalized_session_key = session_key.trim();
    let normalized_agent_id = agent_id.trim();
    if normalized_session_key.is_empty() || normalized_agent_id.is_empty() {
        return Ok(None);
    }

    let page_limit = limit.unwrap_or(30).clamp(1, 100);
    let connection = open_chat_cache_connection()?;
    let cache_row = connection
        .query_row(
            "
            SELECT session_key, agent_id, updated_at, cached_at, title, message_count, message_rows_migrated_at
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
                    row.get::<_, Option<i64>>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("read chat cache page row failed: {error}"))?;
    let Some(cache_row) = cache_row else {
        return Ok(None);
    };

    let existing_rows = count_message_rows(&connection, normalized_session_key)?;
    let total = if existing_rows > 0 {
        cache_row.5.unwrap_or(existing_rows).max(existing_rows)
    } else if cache_row.6.is_some() {
        cache_row.5.unwrap_or(0)
    } else {
        let messages_json = connection
            .query_row(
                "SELECT messages_json FROM session_history_cache WHERE session_key = ?1 LIMIT 1",
                params![normalized_session_key],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| format!("read legacy chat cache payload failed: {error}"))?;
        ensure_message_rows(&connection, normalized_session_key, &messages_json)?
    };
    let rows = if let Some(before_index) = before_index {
        let mut statement = connection
            .prepare(
                "
                SELECT message_index, message_json
                FROM session_history_message_cache
                WHERE session_key = ?1 AND message_index < ?2
                ORDER BY message_index DESC
                LIMIT ?3
                ",
            )
            .map_err(|error| format!("prepare chat cache page failed: {error}"))?;
        let rows = statement
            .query_map(params![normalized_session_key, before_index, page_limit], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| format!("read chat cache page failed: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("collect chat cache page failed: {error}"))?;
        rows
    } else {
        let mut statement = connection
            .prepare(
                "
                SELECT message_index, message_json
                FROM session_history_message_cache
                WHERE session_key = ?1
                ORDER BY message_index DESC
                LIMIT ?2
                ",
            )
            .map_err(|error| format!("prepare chat cache page failed: {error}"))?;
        let rows = statement
            .query_map(params![normalized_session_key, page_limit], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| format!("read chat cache page failed: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("collect chat cache page failed: {error}"))?;
        rows
    };

    let mut indexed_messages = rows
        .into_iter()
        .filter_map(|(index, raw)| serde_json::from_str::<Value>(&raw).ok().map(|value| (index, value)))
        .collect::<Vec<_>>();
    indexed_messages.sort_by_key(|(index, _)| *index);

    let start_index = indexed_messages.first().map(|(index, _)| *index);
    let end_index = indexed_messages.last().map(|(index, _)| *index);
    let has_more_before = start_index.map(|index| index > 0).unwrap_or(false);
    let messages = indexed_messages.into_iter().map(|(_, value)| value).collect();

    Ok(Some(WorkspaceChatSessionCachePage {
        session_key: cache_row.0,
        agent_id: cache_row.1,
        messages,
        total,
        start_index,
        end_index,
        has_more_before,
        updated_at: cache_row.2,
        cached_at: cache_row.3,
        title: cache_row.4,
    }))
}

#[tauri::command]
pub fn list_workspace_chat_session_cache(
    agent_id: String,
) -> Result<Vec<WorkspaceChatSessionCacheSummary>, String> {
    let normalized_agent_id = agent_id.trim();
    if normalized_agent_id.is_empty() {
        return Ok(Vec::new());
    }

    let connection = open_chat_cache_connection()?;
    let mut statement = connection
        .prepare(
            "
            SELECT session_key, agent_id, updated_at, cached_at, title
            FROM session_history_cache
            WHERE agent_id = ?1
            ORDER BY COALESCE(updated_at, 0) DESC, cached_at DESC
            ",
        )
        .map_err(|error| format!("准备聊天缓存查询失败: {error}"))?;

    let rows = statement
        .query_map(params![normalized_agent_id], |row| {
            Ok(WorkspaceChatSessionCacheSummary {
                session_key: row.get(0)?,
                agent_id: row.get(1)?,
                updated_at: row.get(2)?,
                cached_at: row.get(3)?,
                title: row.get(4)?,
            })
        })
        .map_err(|error| format!("读取聊天缓存概览失败: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("整理聊天缓存概览失败: {error}"))
}

#[tauri::command]
pub fn prune_workspace_chat_session_cache(keep_session_keys: Vec<String>) -> Result<(), String> {
    let normalized_keys = keep_session_keys
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    let connection = open_chat_cache_connection()?;
    if normalized_keys.is_empty() {
        connection
            .execute("DELETE FROM session_history_message_cache", [])
            .map_err(|error| format!("clear chat page cache failed: {error}"))?;
        connection
            .execute("DELETE FROM session_history_cache", [])
            .map_err(|error| format!("清理聊天缓存失败: {error}"))?;
        return Ok(());
    }

    let placeholders = normalized_keys
        .iter()
        .enumerate()
        .map(|(index, _)| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let sql =
        format!("DELETE FROM session_history_cache WHERE session_key NOT IN ({placeholders})");
    let message_sql =
        format!("DELETE FROM session_history_message_cache WHERE session_key NOT IN ({placeholders})");
    connection
        .execute(&message_sql, params_from_iter(normalized_keys.iter()))
        .map_err(|error| format!("prune chat page cache failed: {error}"))?;

    connection
        .execute(&sql, params_from_iter(normalized_keys.iter()))
        .map_err(|error| format!("裁剪聊天缓存失败: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn reset_workspace_chat_history_cache() -> Result<(), String> {
    let connection = open_chat_cache_connection()?;
    reset_chat_history_cache_rows(&connection)
}

#[tauri::command]
pub fn list_workspace_agent_cache() -> Result<Vec<WorkspaceAgentCacheRow>, String> {
    let connection = open_chat_cache_connection()?;
    remove_legacy_demo_agents(&connection)?;

    let mut statement = connection
        .prepare(
            "
            SELECT agent_id, name, identity_json, is_default, scope, cached_at
            FROM agent_list_cache
            ORDER BY is_default DESC, cached_at DESC, agent_id ASC
            ",
        )
        .map_err(|error| format!("准备 Agent 缓存查询失败: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(WorkspaceAgentCacheRow {
                agent_id: row.get(0)?,
                name: row.get(1)?,
                identity_json: row.get(2)?,
                is_default: row.get::<_, i64>(3)? != 0,
                scope: row.get(4)?,
                cached_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("读取 Agent 缓存失败: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("整理 Agent 缓存失败: {error}"))
}

#[tauri::command]
pub fn replace_workspace_agent_cache(
    default_id: String,
    scope: String,
    agents: Vec<WorkspaceAgentCacheInput>,
) -> Result<(), String> {
    let normalized_default_id = default_id.trim().to_string();
    let normalized_scope = if scope.trim().is_empty() {
        "workspace".to_string()
    } else {
        scope.trim().to_string()
    };
    let cached_at = current_timestamp_millis();
    let mut connection = open_chat_cache_connection()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("打开 Agent 缓存事务失败: {error}"))?;

    transaction
        .execute("DELETE FROM agent_list_cache", [])
        .map_err(|error| format!("清空 Agent 缓存失败: {error}"))?;

    for agent in agents {
        let agent_id = agent.agent_id.trim().to_string();
        let name = normalize_optional_string(agent.name);
        if agent_id.is_empty() || is_legacy_demo_agent(&agent_id, name.as_deref()) {
            continue;
        }

        let identity_json = normalize_optional_string(agent.identity_json);
        transaction
            .execute(
                "
                INSERT INTO agent_list_cache (
                    agent_id,
                    name,
                    identity_json,
                    is_default,
                    scope,
                    cached_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
                params![
                    agent_id,
                    name,
                    identity_json,
                    if normalized_default_id == agent_id {
                        1
                    } else {
                        0
                    },
                    normalized_scope,
                    cached_at
                ],
            )
            .map_err(|error| format!("写入 Agent 缓存失败: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("提交 Agent 缓存失败: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn clear_workspace_agent_cache() -> Result<(), String> {
    let connection = open_chat_cache_connection()?;
    connection
        .execute("DELETE FROM agent_list_cache", [])
        .map_err(|error| format!("清空 Agent 缓存失败: {error}"))?;
    Ok(())
}

