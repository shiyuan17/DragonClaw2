// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::chat_cache::{
    current_timestamp_millis, load_workspace_chat_session_cache_page, open_chat_cache_connection,
    reset_workspace_chat_history_cache, upsert_workspace_chat_session_cache,
};
use crate::chat_cache_compact::{
    list_workspace_chat_session_cache_compact, warm_workspace_chat_session_cache_pages,
};
use crate::chat_cache_render::load_workspace_chat_session_render_page;

const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("dragonclaw-{prefix}-{nonce}"))
}

#[test]
fn compact_cache_list_returns_summary_without_message_payload() {
    let temp_root = unique_temp_dir("chat-cache-compact");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let messages = vec![
            serde_json::json!({ "id": "m-1", "role": "user", "text": "hello", "sessionKey": "agent:main:secondary" }),
            serde_json::json!({ "id": "m-2", "role": "assistant", "text": "latest useful assistant answer", "sessionKey": "agent:main:secondary" }),
        ];
        upsert_workspace_chat_session_cache(
            "agent:main:secondary".to_string(),
            "main".to_string(),
            Some(2),
            Some("cached".to_string()),
            serde_json::to_string(&messages).expect("serialize messages"),
        )
        .expect("upsert chat cache");

        let rows = list_workspace_chat_session_cache_compact("main".to_string(), Some(10))
            .expect("list compact cache");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].session_key, "agent:main:secondary");
        assert_eq!(rows[0].title.as_deref(), Some("cached"));
        assert_eq!(rows[0].last_message_summary.as_deref(), Some("latest useful assistant answer"));
        assert_eq!(rows[0].message_count, 2);
        assert!(rows[0].has_message_rows);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn warm_cache_pages_migrates_legacy_json_idempotently() {
    let temp_root = unique_temp_dir("chat-cache-warm");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let legacy_messages_json = serde_json::to_string(&vec![
                serde_json::json!({ "id": "m-1", "role": "user", "text": "start" }),
                serde_json::json!({ "id": "m-2", "role": "assistant", "text": "warm summary" }),
            ])
            .expect("serialize messages");
        let connection = open_chat_cache_connection().expect("open cache");
        connection
            .execute(
                "
                INSERT INTO session_history_cache (session_key, agent_id, updated_at, cached_at, title, messages_json)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
                rusqlite::params![
                    "agent:main:warm",
                    "main",
                    3_i64,
                    current_timestamp_millis(),
                    Option::<String>::None,
                    legacy_messages_json,
                ],
            )
            .expect("insert legacy cache row");

        let first = warm_workspace_chat_session_cache_pages(
            Some("main".to_string()),
            Some(vec!["agent:main:warm".to_string()]),
            Some(3),
            Some(30),
        )
        .expect("warm cache");
        assert_eq!(first.migrated_sessions, 1);
        assert_eq!(first.skipped_sessions, 0);

        let second = warm_workspace_chat_session_cache_pages(
            Some("main".to_string()),
            Some(vec!["agent:main:warm".to_string()]),
            Some(3),
            Some(30),
        )
        .expect("warm cache again");
        assert_eq!(second.migrated_sessions, 0);
        assert!(second.skipped_sessions >= 1);
        assert!(second.failed_sessions.is_empty());
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn render_page_reads_lightweight_message_previews() {
    let temp_root = unique_temp_dir("chat-cache-render");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let messages = (0..25)
            .map(|index| serde_json::json!({ "id": format!("m-{index}"), "role": "assistant", "text": format!("render message {index}"), "timestamp": index }))
            .collect::<Vec<_>>();
        upsert_workspace_chat_session_cache(
            "agent:main:render".to_string(),
            "main".to_string(),
            Some(25),
            Some("render".to_string()),
            serde_json::to_string(&messages).expect("serialize messages"),
        )
        .expect("upsert chat cache");

        let page = load_workspace_chat_session_render_page(
            "agent:main:render".to_string(),
            "main".to_string(),
            None,
            Some(20),
        )
        .expect("load render page")
        .expect("render page");
        assert_eq!(page.messages.len(), 20);
        assert_eq!(page.messages[0].index, 5);
        assert_eq!(page.messages[0].text_preview, "render message 5");
        assert_eq!(page.messages[19].index, 24);
        assert!(page.messages[0].text_hash.is_some());
        assert_eq!(page.total, 25);
        assert!(page.has_more_before);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn render_page_handles_corrupt_legacy_json_without_payload() {
    let temp_root = unique_temp_dir("chat-cache-render-corrupt");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        upsert_workspace_chat_session_cache(
            "agent:main:render-broken".to_string(),
            "main".to_string(),
            Some(1),
            None,
            "{not-json".to_string(),
        )
        .expect("upsert corrupt cache");

        let page = load_workspace_chat_session_render_page(
            "agent:main:render-broken".to_string(),
            "main".to_string(),
            None,
            Some(20),
        )
        .expect("load render page")
        .expect("render page");
        assert!(page.messages.is_empty());
        assert_eq!(page.total, 0);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn schema_v2_reset_clears_only_chat_history_cache() {
    let temp_root = unique_temp_dir("chat-cache-schema-v2");
    let config_root = temp_root.join(".openclaw");
    std::fs::create_dir_all(config_root.as_path()).expect("create config root");

    with_mock_config_dir(config_root.as_path(), || {
        let db_path = config_root.join("workspace-chat-cache.db");
        let connection = rusqlite::Connection::open(db_path).expect("open legacy db");
        connection
            .execute_batch(
                "
                CREATE TABLE session_history_cache (
                    session_key TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    updated_at INTEGER,
                    cached_at INTEGER NOT NULL,
                    title TEXT,
                    messages_json TEXT NOT NULL
                );
                CREATE TABLE session_history_message_cache (
                    session_key TEXT NOT NULL,
                    message_index INTEGER NOT NULL,
                    message_json TEXT NOT NULL,
                    PRIMARY KEY(session_key, message_index)
                );
                CREATE TABLE agent_list_cache (
                    agent_id TEXT PRIMARY KEY,
                    name TEXT,
                    identity_json TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    scope TEXT NOT NULL DEFAULT 'workspace',
                    cached_at INTEGER NOT NULL
                );
                INSERT INTO session_history_cache VALUES ('agent:main:old', 'main', 1, 1, 'old', '[]');
                INSERT INTO session_history_message_cache VALUES ('agent:main:old', 0, '{\"text\":\"old\"}');
                INSERT INTO agent_list_cache VALUES ('main', 'Main Agent', NULL, 1, 'workspace', 1);
                PRAGMA user_version = 1;
                ",
            )
            .expect("seed legacy db");
        drop(connection);

        let upgraded = open_chat_cache_connection().expect("open upgraded cache");
        let history_count: i64 = upgraded
            .query_row("SELECT COUNT(*) FROM session_history_cache", [], |row| row.get(0))
            .expect("count history");
        let message_count: i64 = upgraded
            .query_row("SELECT COUNT(*) FROM session_history_message_cache", [], |row| row.get(0))
            .expect("count messages");
        let agent_count: i64 = upgraded
            .query_row("SELECT COUNT(*) FROM agent_list_cache", [], |row| row.get(0))
            .expect("count agents");
        let version: i64 = upgraded
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");

        assert_eq!(history_count, 0);
        assert_eq!(message_count, 0);
        assert_eq!(agent_count, 1);
        assert_eq!(version, 2);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn reset_command_clears_chat_history_cache_only() {
    let temp_root = unique_temp_dir("chat-cache-reset");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let connection = open_chat_cache_connection().expect("open cache");
        connection
            .execute(
                "
                INSERT INTO agent_list_cache (agent_id, name, identity_json, is_default, scope, cached_at)
                VALUES ('main', 'Main Agent', NULL, 1, 'workspace', 1)
                ",
                [],
            )
            .expect("insert agent cache");
        drop(connection);
        upsert_workspace_chat_session_cache(
            "agent:main:reset".to_string(),
            "main".to_string(),
            Some(1),
            Some("reset".to_string()),
            serde_json::to_string(&vec![serde_json::json!({ "role": "assistant", "text": "reset me" })])
                .expect("serialize messages"),
        )
        .expect("upsert chat cache");

        reset_workspace_chat_history_cache().expect("reset chat cache");
        let connection = open_chat_cache_connection().expect("reopen cache");
        let history_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM session_history_cache", [], |row| row.get(0))
            .expect("count history");
        let agent_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM agent_list_cache", [], |row| row.get(0))
            .expect("count agents");
        assert_eq!(history_count, 0);
        assert_eq!(agent_count, 1);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn render_page_uses_preview_columns_without_parsing_corrupt_payloads() {
    let temp_root = unique_temp_dir("chat-cache-render-preview-only");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let messages = (0..5_000)
            .map(|index| serde_json::json!({ "id": format!("m-{index}"), "role": "assistant", "text": format!("preview-safe message {index} {}", "x".repeat(512)), "timestamp": index }))
            .collect::<Vec<_>>();
        upsert_workspace_chat_session_cache(
            "agent:main:large".to_string(),
            "main".to_string(),
            Some(5_000),
            Some("large".to_string()),
            serde_json::to_string(&messages).expect("serialize messages"),
        )
        .expect("upsert large cache");

        let connection = open_chat_cache_connection().expect("open cache");
        connection
            .execute(
                "UPDATE session_history_message_cache SET message_json = '{not-json' WHERE session_key = ?1",
                rusqlite::params!["agent:main:large"],
            )
            .expect("corrupt raw payloads");
        drop(connection);

        let page = load_workspace_chat_session_render_page(
            "agent:main:large".to_string(),
            "main".to_string(),
            None,
            Some(20),
        )
        .expect("load render page")
        .expect("render page");
        assert_eq!(page.messages.len(), 20);
        assert_eq!(page.total, 5_000);
        assert_eq!(page.start_index, Some(4_980));
        assert!(page.messages[0].text_preview.starts_with("preview-safe message 4980"));
        assert!(page.has_more_before);
    });

    let _ = std::fs::remove_dir_all(temp_root);
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
fn chat_session_cache_page_reads_recent_and_older_messages() {
    let temp_root = unique_temp_dir("chat-cache-page");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        let messages = (0..65)
            .map(|index| {
                serde_json::json!({ "id": format!("m-{index}"), "text": format!("message {index}") })
            })
            .collect::<Vec<_>>();
        upsert_workspace_chat_session_cache(
            "agent:main:secondary".to_string(),
            "main".to_string(),
            Some(65),
            Some("cached".to_string()),
            serde_json::to_string(&messages).expect("serialize messages"),
        )
        .expect("upsert chat cache");

        let recent = load_workspace_chat_session_cache_page(
            "agent:main:secondary".to_string(),
            "main".to_string(),
            None,
            Some(30),
        )
        .expect("load recent page")
        .expect("recent page");
        assert_eq!(recent.messages.len(), 30);
        assert_eq!(recent.total, 65);
        assert_eq!(recent.start_index, Some(35));
        assert_eq!(recent.end_index, Some(64));
        assert!(recent.has_more_before);

        let older = load_workspace_chat_session_cache_page(
            "agent:main:secondary".to_string(),
            "main".to_string(),
            recent.start_index,
            Some(30),
        )
        .expect("load older page")
        .expect("older page");
        assert_eq!(older.messages.len(), 30);
        assert_eq!(older.start_index, Some(5));
        assert_eq!(older.end_index, Some(34));
        assert!(older.has_more_before);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}

#[test]
fn chat_session_cache_page_handles_corrupt_legacy_json() {
    let temp_root = unique_temp_dir("chat-cache-corrupt");
    let config_root = temp_root.join(".openclaw");

    with_mock_config_dir(config_root.as_path(), || {
        upsert_workspace_chat_session_cache(
            "agent:main:broken".to_string(),
            "main".to_string(),
            Some(1),
            None,
            "{not-json".to_string(),
        )
        .expect("upsert corrupt cache");

        let page = load_workspace_chat_session_cache_page(
            "agent:main:broken".to_string(),
            "main".to_string(),
            None,
            Some(30),
        )
        .expect("load corrupt page")
        .expect("page exists");
        assert!(page.messages.is_empty());
        assert_eq!(page.total, 0);
        assert!(!page.has_more_before);
    });

    let _ = std::fs::remove_dir_all(temp_root);
}
