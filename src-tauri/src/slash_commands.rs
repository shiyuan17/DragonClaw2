// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandRecord {
    pub id: String,
    pub command: String,
    pub name: String,
    pub description: String,
    pub instruction: String,
}

#[tauri::command]
pub fn load_custom_slash_commands() -> Result<Vec<SlashCommandRecord>, String> {
    let path = paths::slash_commands_path()?;
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 slash-commands.json 失败: {error}"))?;
    serde_json::from_str::<Vec<SlashCommandRecord>>(&content)
        .map_err(|error| format!("解析 slash-commands.json 失败: {error}"))
}

#[tauri::command]
pub fn save_custom_slash_commands(
    commands: Vec<SlashCommandRecord>,
) -> Result<Vec<SlashCommandRecord>, String> {
    let normalized = normalize_custom_slash_commands(commands);
    write_custom_slash_commands(&normalized)?;
    Ok(normalized)
}

fn write_custom_slash_commands(commands: &[SlashCommandRecord]) -> Result<(), String> {
    let path = paths::slash_commands_path()?;
    ensure_parent_dir(&path)?;
    let serialized = serde_json::to_string_pretty(commands)
        .map_err(|error| format!("序列化 slash-commands.json 失败: {error}"))?;
    fs::write(&path, serialized).map_err(|error| format!("写入 slash-commands.json 失败: {error}"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Slash Command 配置目录失败: {error}"))?;
    }
    Ok(())
}

fn normalize_custom_slash_commands(commands: Vec<SlashCommandRecord>) -> Vec<SlashCommandRecord> {
    let mut seen_commands = HashSet::new();
    let mut normalized = Vec::new();

    for command in commands {
        let Some(next) = normalize_custom_slash_command(command) else {
            continue;
        };

        let command_key = next.command.to_ascii_lowercase();
        if seen_commands.insert(command_key) {
            normalized.push(next);
        }
    }

    normalized
}

fn normalize_custom_slash_command(command: SlashCommandRecord) -> Option<SlashCommandRecord> {
    let id = command.id.trim().to_string();
    let name = command.name.trim().to_string();
    let instruction = command.instruction.trim().to_string();

    if id.is_empty() || name.is_empty() || instruction.is_empty() {
        return None;
    }

    let command_value = if command.command.trim().is_empty() {
        normalize_slash_command_value(&name)
    } else {
        normalize_slash_command_value(&command.command)
    };

    Some(SlashCommandRecord {
        id,
        command: command_value,
        name,
        description: command.description.trim().to_string(),
        instruction,
    })
}

fn normalize_slash_command_value(value: &str) -> String {
    let trimmed = value.trim().trim_start_matches('/');
    let mut normalized = String::new();
    let mut last_was_dash = false;

    for character in trimmed.chars() {
        if character.is_ascii_alphanumeric() {
            normalized.push(character.to_ascii_lowercase());
            last_was_dash = false;
            continue;
        }

        if normalized.is_empty() || last_was_dash {
            continue;
        }

        normalized.push('-');
        last_was_dash = true;
    }

    while normalized.ends_with('-') {
        normalized.pop();
    }

    if normalized.is_empty() {
        "/command".to_string()
    } else {
        format!("/{}", normalized)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use super::*;
    use crate::test_env;

    const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";

    fn unique_test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "dragonclaw-slash-commands-{name}-{}",
            Uuid::new_v4()
        ))
    }

    fn with_test_user_config_dir<T>(name: &str, action: impl FnOnce(PathBuf) -> T) -> T {
        let _env_guard = test_env::env_lock();
        let test_dir = unique_test_dir(name);
        let previous = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();

        std::env::set_var(USER_CONFIG_OVERRIDE_ENV, &test_dir);
        let result = action(test_dir.clone());
        if let Some(previous) = previous {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, previous);
        } else {
            std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
        }
        let _ = fs::remove_dir_all(test_dir);
        result
    }

    #[test]
    fn load_returns_empty_when_file_missing() {
        with_test_user_config_dir("missing", |_test_dir| {
            let commands = load_custom_slash_commands().expect("missing file should return empty");
            assert!(commands.is_empty());
        });
    }

    #[test]
    fn load_returns_readable_error_for_invalid_json() {
        with_test_user_config_dir("invalid-json", |test_dir| {
            let path = test_dir.join("slash-commands.json");
            fs::create_dir_all(&test_dir).expect("create test config dir");
            fs::write(&path, "{not-json").expect("write invalid json");

            let error = load_custom_slash_commands().expect_err("invalid json should fail");
            assert!(error.contains("解析 slash-commands.json 失败"));
        });
    }

    #[test]
    fn save_normalizes_commands_and_deduplicates_by_command_value() {
        with_test_user_config_dir("normalize", |_test_dir| {
            let saved = save_custom_slash_commands(vec![
                SlashCommandRecord {
                    id: "cmd-1".to_string(),
                    command: "Review UI".to_string(),
                    name: "Review UI".to_string(),
                    description: "Compare UI changes".to_string(),
                    instruction: "Review current UI changes.".to_string(),
                },
                SlashCommandRecord {
                    id: "cmd-2".to_string(),
                    command: "/review_ui".to_string(),
                    name: "Review UI Duplicate".to_string(),
                    description: "Duplicate".to_string(),
                    instruction: "This duplicate should be dropped.".to_string(),
                },
            ])
            .expect("save should succeed");

            assert_eq!(saved.len(), 1);
            assert_eq!(saved[0].command, "/review-ui");
            assert_eq!(saved[0].name, "Review UI");
        });
    }

    #[test]
    fn save_filters_records_missing_required_fields() {
        with_test_user_config_dir("required-fields", |_test_dir| {
            let saved = save_custom_slash_commands(vec![
                SlashCommandRecord {
                    id: "".to_string(),
                    command: "/invalid".to_string(),
                    name: "Missing ID".to_string(),
                    description: "".to_string(),
                    instruction: "ignored".to_string(),
                },
                SlashCommandRecord {
                    id: "cmd-3".to_string(),
                    command: "".to_string(),
                    name: "  ".to_string(),
                    description: "".to_string(),
                    instruction: "ignored".to_string(),
                },
                SlashCommandRecord {
                    id: "cmd-4".to_string(),
                    command: "".to_string(),
                    name: "Summarize".to_string(),
                    description: "Useful helper".to_string(),
                    instruction: "Summarize the current task.".to_string(),
                },
            ])
            .expect("save should succeed");

            assert_eq!(saved.len(), 1);
            assert_eq!(saved[0].command, "/summarize");
        });
    }
}
