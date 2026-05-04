// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

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

fn current_timestamp_millis() -> i64 {
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

fn open_chat_cache_connection() -> Result<Connection, String> {
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
                messages_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_session_history_cache_updated_at
            ON session_history_cache(updated_at DESC);
            ",
        )
        .map_err(|error| format!("初始化聊天缓存数据库失败: {error}"))?;
    Ok(connection)
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

    let connection = open_chat_cache_connection()?;
    connection
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
    Ok(())
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

    connection
        .execute(&sql, params_from_iter(normalized_keys.iter()))
        .map_err(|error| format!("裁剪聊天缓存失败: {error}"))?;
    Ok(())
}
