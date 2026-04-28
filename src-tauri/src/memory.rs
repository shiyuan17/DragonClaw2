// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::paths;

const MEMORY_FILE_SLOTS: [&str; 8] = [
    "AGENTS.md",
    "SOUL.md",
    "USER.md",
    "MEMORY.md",
    "IDENTITY.md",
    "BOOTSTRAP.md",
    "HEARTBEAT.md",
    "TOOLS.md",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryFileSnapshotItem {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub source_path: String,
    pub relative_path: String,
    pub updated_at_ms: i64,
    pub content: String,
    pub exists: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryFileSnapshotResponse {
    pub source_path: String,
    pub items: Vec<MemoryFileSnapshotItem>,
}

fn current_timestamp_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .ok()
        .and_then(|millis| i64::try_from(millis).ok())
        .unwrap_or(0)
}

fn summarize_memory_content(content: &str, exists: bool) -> String {
    let trimmed = content.trim();
    if !trimmed.is_empty() {
        return trimmed
            .replace('\n', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(72)
            .collect();
    }

    if exists {
        "文件为空，可直接写入记忆内容。".to_string()
    } else {
        "文件缺失，保存时会自动创建。".to_string()
    }
}

fn collect_memory_paths(agent_id: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let workspace_root = paths::workspace_root_for_agent(agent_id)?;
    Ok(MEMORY_FILE_SLOTS
        .iter()
        .map(|file_name| workspace_root.join(file_name))
        .collect())
}

fn build_snapshot_item(path: &Path) -> MemoryFileSnapshotItem {
    let exists = path.is_file();
    let content = if exists {
        fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    };
    let updated_at_ms = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|timestamp| timestamp.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .and_then(|millis| i64::try_from(millis).ok())
        .unwrap_or_else(current_timestamp_millis);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("memory.md");

    MemoryFileSnapshotItem {
        id: file_name.to_ascii_lowercase(),
        title: file_name.to_string(),
        summary: summarize_memory_content(&content, exists),
        source_path: path.to_string_lossy().to_string(),
        relative_path: file_name.to_string(),
        updated_at_ms,
        content,
        exists,
    }
}

#[tauri::command]
pub fn load_memory_file_snapshot(agent_id: Option<String>) -> Result<MemoryFileSnapshotResponse, String> {
    let workspace_root = paths::workspace_root_for_agent(agent_id.as_deref())?;
    let items = collect_memory_paths(agent_id.as_deref())?
        .iter()
        .map(|path| build_snapshot_item(path.as_path()))
        .collect();

    Ok(MemoryFileSnapshotResponse {
        source_path: workspace_root.to_string_lossy().to_string(),
        items,
    })
}

#[tauri::command]
pub fn save_source_file(
    kind: String,
    source_path: String,
    content: String,
    agent_id: Option<String>,
) -> Result<String, String> {
    if kind.trim().to_ascii_lowercase() != "memory" {
        return Err("当前仅支持保存 memory 类型文件".to_string());
    }

    let normalized_source_path = PathBuf::from(source_path.trim());
    let allowed_paths = collect_memory_paths(agent_id.as_deref())?;

    let Some(target_path) = allowed_paths
        .iter()
        .find(|path| **path == normalized_source_path)
        .cloned()
    else {
        return Err("目标文件不在允许编辑的记忆白名单内".to_string());
    };

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建记忆目录失败: {error}"))?;
    }

    fs::write(&target_path, content).map_err(|error| format!("保存记忆文件失败: {error}"))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
    const DEFAULT_WORKSPACE_OVERRIDE_ENV: &str = "DRAGONCLAW_DEFAULT_WORKSPACE_DIR";

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().expect("lock env")
    }

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "dragonclaw2-{prefix}-{}-{nonce}",
            std::process::id(),
        ))
    }

    fn with_mock_env<F, R>(config_root: &Path, default_workspace: &Path, run: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _lock = env_lock();
        let previous_config_root = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();
        let previous_workspace = std::env::var(DEFAULT_WORKSPACE_OVERRIDE_ENV).ok();

        unsafe {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, config_root);
            std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, default_workspace);
        }

        let result = run();

        unsafe {
            if let Some(value) = previous_config_root {
                std::env::set_var(USER_CONFIG_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
            }

            if let Some(value) = previous_workspace {
                std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(DEFAULT_WORKSPACE_OVERRIDE_ENV);
            }
        }

        result
    }

    #[test]
    fn memory_snapshot_returns_fixed_slots() {
        let temp_root = unique_temp_dir("memory-snapshot");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("workspace-main");

        fs::create_dir_all(&config_root).expect("create config root");

        let snapshot = with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            load_memory_file_snapshot(None).expect("load snapshot")
        });

        assert_eq!(snapshot.items.len(), MEMORY_FILE_SLOTS.len());
        assert_eq!(snapshot.items[0].title, "AGENTS.md");
        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn save_source_file_rejects_path_outside_whitelist() {
        let temp_root = unique_temp_dir("memory-save-reject");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("workspace-main");
        let rogue_file = temp_root.join("rogue.md");

        fs::create_dir_all(&config_root).expect("create config root");

        let result = with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            save_source_file(
                "memory".to_string(),
                rogue_file.to_string_lossy().to_string(),
                "forbidden".to_string(),
                None,
            )
        });

        assert!(result.is_err());
        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn save_source_file_creates_missing_memory_file() {
        let temp_root = unique_temp_dir("memory-save-create");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("workspace-main");

        fs::create_dir_all(&config_root).expect("create config root");

        with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            let snapshot = load_memory_file_snapshot(None).expect("load snapshot");
            let target = snapshot
                .items
                .iter()
                .find(|item| item.title == "MEMORY.md")
                .expect("memory slot");

            let saved_path = save_source_file(
                "memory".to_string(),
                target.source_path.clone(),
                "# long term memory".to_string(),
                None,
            )
            .expect("save memory");

            assert_eq!(saved_path, target.source_path);
            assert!(Path::new(&saved_path).is_file());
        });

        let _ = fs::remove_dir_all(temp_root);
    }
}
