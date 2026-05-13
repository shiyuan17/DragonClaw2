// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::chat_cache::{
    list_workspace_agent_cache, replace_workspace_agent_cache, WorkspaceAgentCacheInput,
};

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
