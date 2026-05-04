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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("dragonclaw-{prefix}-{nonce}"))
    }

    fn with_mock_config_dir<F, R>(config_root: &Path, run: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _lock = crate::test_env::env_lock();
        std::env::set_var(USER_CONFIG_OVERRIDE_ENV, config_root);
        let result = run();
        std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
        result
    }

    #[test]
    fn agent_cache_replace_and_list_round_trip() {
        let temp_root = unique_temp_dir("agent-cache-round-trip");
        let config_root = temp_root.join(".openclaw");

        with_mock_config_dir(config_root.as_path(), || {
            replace_workspace_agent_cache(
                "main".to_string(),
                "workspace".to_string(),
                vec![
                    WorkspaceAgentCacheInput {
                        agent_id: "main".to_string(),
                        name: Some("主分身".to_string()),
                        identity_json: Some(r#"{"emoji":"M"}"#.to_string()),
                    },
                    WorkspaceAgentCacheInput {
                        agent_id: "support".to_string(),
                        name: Some("Support".to_string()),
                        identity_json: None,
                    },
                ],
            )
            .expect("replace agent cache");

            let rows = list_workspace_agent_cache().expect("list agent cache");
            assert_eq!(rows.len(), 2);
            assert_eq!(rows[0].agent_id, "main");
            assert!(rows[0].is_default);
            assert_eq!(rows[0].identity_json.as_deref(), Some(r#"{"emoji":"M"}"#));
        });

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn agent_cache_replace_clears_legacy_demo_agents() {
        let temp_root = unique_temp_dir("agent-cache-legacy");
        let config_root = temp_root.join(".openclaw");

        with_mock_config_dir(config_root.as_path(), || {
            replace_workspace_agent_cache(
                "ops".to_string(),
                "workspace".to_string(),
                vec![
                    WorkspaceAgentCacheInput {
                        agent_id: "ops".to_string(),
                        name: Some("运营协作 Agent".to_string()),
                        identity_json: None,
                    },
                    WorkspaceAgentCacheInput {
                        agent_id: "product".to_string(),
                        name: Some("产品策略 Agent".to_string()),
                        identity_json: None,
                    },
                    WorkspaceAgentCacheInput {
                        agent_id: "main".to_string(),
                        name: Some("主分身".to_string()),
                        identity_json: None,
                    },
                ],
            )
            .expect("replace agent cache");

            let rows = list_workspace_agent_cache().expect("list agent cache");
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].agent_id, "main");
        });

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn empty_agent_cache_replace_clears_rows() {
        let temp_root = unique_temp_dir("agent-cache-empty");
        let config_root = temp_root.join(".openclaw");

        with_mock_config_dir(config_root.as_path(), || {
            replace_workspace_agent_cache(
                "main".to_string(),
                "workspace".to_string(),
                vec![WorkspaceAgentCacheInput {
                    agent_id: "main".to_string(),
                    name: Some("主分身".to_string()),
                    identity_json: None,
                }],
            )
            .expect("replace agent cache");
            replace_workspace_agent_cache("".to_string(), "workspace".to_string(), Vec::new())
                .expect("clear through empty replace");

            let rows = list_workspace_agent_cache().expect("list agent cache");
            assert!(rows.is_empty());
        });

        let _ = std::fs::remove_dir_all(temp_root);
    }
}
