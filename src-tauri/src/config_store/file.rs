// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::paths;

pub fn openclaw_config_path() -> Result<PathBuf, String> {
    paths::openclaw_config_path()
}

pub fn load_openclaw_config() -> Result<Value, String> {
    let config_path = openclaw_config_path()?;
    if !config_path.exists() {
        return Ok(json!({}));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| format!("读取 openclaw.json 失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| {
        if contains_json5_syntax(&content) || contains_include_hint(&content) {
            "检测到 openclaw.json 使用了 JSON5 或 $include 等 OpenClaw 高级配置语法。DragonClaw 当前不会整文件重写该配置，请通过 OpenClaw 官方 config patch 通道修改后再重试。".to_string()
        } else {
            format!("解析 openclaw.json 失败: {error}")
        }
    })
}

pub fn save_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = openclaw_config_path()?;
    guard_existing_config_rewritable(&config_path)?;
    validate_openclaw_config_shape(config)?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化 openclaw.json 失败: {error}"))?;
    atomic_write_text(&config_path, &content)
}

fn atomic_write_text(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "openclaw.json 路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败: {error}"))?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let tmp_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("openclaw.json"),
        nonce
    ));
    let rollback_path = parent.join(format!(
        ".{}.{}.rollback",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("openclaw.json"),
        nonce
    ));
    let durable_backup_path = parent
        .join(".openclaw-config-backups")
        .join(format!("openclaw.{nonce}.json.bak"));

    fs::write(&tmp_path, content).map_err(|error| format!("写入临时配置文件失败: {error}"))?;
    validate_json_file(&tmp_path)?;

    if !path.exists() {
        fs::rename(&tmp_path, path).map_err(|error| format!("写入 openclaw.json 失败: {error}"))?;
        return validate_json_file(path);
    }

    if let Some(backup_parent) = durable_backup_path.parent() {
        fs::create_dir_all(backup_parent)
            .map_err(|error| format!("创建 openclaw.json 备份目录失败: {error}"))?;
        fs::copy(path, &durable_backup_path)
            .map_err(|error| format!("备份 openclaw.json 失败: {error}"))?;
    }

    fs::rename(path, &rollback_path).map_err(|error| format!("备份旧配置文件失败: {error}"))?;

    match fs::rename(&tmp_path, path) {
        Ok(()) => {
            if let Err(validate_error) = validate_json_file(path) {
                let _ = fs::remove_file(path);
                let restore_result = fs::rename(&rollback_path, path);
                return match restore_result {
                    Ok(()) => Err(format!(
                        "写入 openclaw.json 后校验失败: {validate_error}; 已恢复旧配置"
                    )),
                    Err(restore_error) => Err(format!(
                        "写入 openclaw.json 后校验失败: {validate_error}; 恢复旧配置失败: {restore_error}"
                    )),
                };
            }
            let _ = fs::remove_file(&rollback_path);
            Ok(())
        }
        Err(write_error) => {
            let restore_result = fs::rename(&rollback_path, path);
            let _ = fs::remove_file(&tmp_path);
            match restore_result {
                Ok(()) => Err(format!("写入 openclaw.json 失败: {write_error}")),
                Err(restore_error) => Err(format!(
                    "写入 openclaw.json 失败: {write_error}; 恢复旧配置失败: {restore_error}"
                )),
            }
        }
    }
}

fn validate_json_file(path: &Path) -> Result<(), String> {
    let content = fs::read_to_string(path).map_err(|error| format!("读取候选配置失败: {error}"))?;
    let parsed = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("候选配置 JSON 校验失败: {error}"))?;
    validate_openclaw_config_shape(&parsed)
}

fn validate_openclaw_config_shape(config: &Value) -> Result<(), String> {
    let Some(root) = config.as_object() else {
        return Err("openclaw.json 根节点必须是 JSON object".to_string());
    };

    if let Some(models) = root.get("models") {
        let Some(models_obj) = models.as_object() else {
            return Err("openclaw.json models 必须是 object".to_string());
        };
        if let Some(providers) = models_obj.get("providers") {
            if !providers.is_object() {
                return Err("openclaw.json models.providers 必须是 object".to_string());
            }
        }
    }

    if let Some(agents) = root.get("agents") {
        let Some(agents_obj) = agents.as_object() else {
            return Err("openclaw.json agents 必须是 object".to_string());
        };
        if let Some(defaults) = agents_obj.get("defaults") {
            if !defaults.is_object() {
                return Err("openclaw.json agents.defaults 必须是 object".to_string());
            }
        }
        if let Some(list) = agents_obj.get("list") {
            if !list.is_array() {
                return Err("openclaw.json agents.list 必须是 array".to_string());
            }
        }
    }

    if let Some(gateway) = root.get("gateway") {
        let Some(gateway_obj) = gateway.as_object() else {
            return Err("openclaw.json gateway 必须是 object".to_string());
        };
        if let Some(auth) = gateway_obj.get("auth") {
            if !auth.is_object() {
                return Err("openclaw.json gateway.auth 必须是 object".to_string());
            }
        }
        if let Some(control_ui) = gateway_obj.get("controlUi") {
            if !control_ui.is_object() {
                return Err("openclaw.json gateway.controlUi 必须是 object".to_string());
            }
        }
    }

    Ok(())
}

fn guard_existing_config_rewritable(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let content =
        fs::read_to_string(path).map_err(|error| format!("读取 openclaw.json 失败: {error}"))?;
    if contains_json5_syntax(&content) || root_has_include(&content) {
        return Err("检测到 openclaw.json 使用了 JSON5 或 $include 等 OpenClaw 高级配置语法。DragonClaw 为避免破坏 OpenClaw 可用性，已拒绝整文件重写；请通过 OpenClaw 官方 config patch 通道修改该配置。".to_string());
    }

    Ok(())
}

fn root_has_include(content: &str) -> bool {
    serde_json::from_str::<Value>(content)
        .ok()
        .and_then(|value| {
            value
                .as_object()
                .map(|object| object.contains_key("$include"))
        })
        .unwrap_or_else(|| contains_include_hint(content))
}

fn contains_include_hint(content: &str) -> bool {
    content.contains("\"$include\"") || content.contains("'$include'")
}

fn contains_json5_syntax(content: &str) -> bool {
    contains_comment_outside_string(content) || contains_trailing_comma_outside_string(content)
}

fn contains_comment_outside_string(content: &str) -> bool {
    let mut in_string = false;
    let mut escape = false;
    let mut previous = '\0';

    for ch in content.chars() {
        if in_string {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            previous = ch;
            continue;
        }

        if ch == '"' {
            in_string = true;
        } else if previous == '/' && (ch == '/' || ch == '*') {
            return true;
        }
        previous = ch;
    }

    false
}

fn contains_trailing_comma_outside_string(content: &str) -> bool {
    let chars = content.chars().collect::<Vec<_>>();
    let mut in_string = false;
    let mut escape = false;
    let mut index = 0;

    while index < chars.len() {
        let ch = chars[index];
        if in_string {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            index += 1;
            continue;
        }

        if ch == '"' {
            in_string = true;
        } else if ch == ',' {
            let mut next = index + 1;
            while next < chars.len() && chars[next].is_whitespace() {
                next += 1;
            }
            if next < chars.len() && matches!(chars[next], '}' | ']') {
                return true;
            }
        }

        index += 1;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "dragonclaw2-{prefix}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn with_mock_config_dir<T>(prefix: &str, run: impl FnOnce(&Path) -> T) -> T {
        let _lock = crate::test_env::env_lock();
        let temp_root = unique_temp_dir(prefix);
        let config_root = temp_root.join(".openclaw");
        fs::create_dir_all(&config_root).expect("create config root");
        let previous = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();

        unsafe {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, &config_root);
        }

        let result = run(&config_root);

        unsafe {
            if let Some(value) = previous {
                std::env::set_var(USER_CONFIG_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
            }
        }

        let _ = fs::remove_dir_all(temp_root);
        result
    }

    #[test]
    fn save_openclaw_config_writes_backup_and_valid_json() {
        with_mock_config_dir("config-safe-write", |config_root| {
            let config_path = config_root.join("openclaw.json");
            fs::write(&config_path, r#"{"models":{"providers":{}}}"#)
                .expect("write initial config");

            save_openclaw_config(&json!({
                "agents": {
                    "defaults": {}
                }
            }))
            .expect("save config");

            let next = fs::read_to_string(&config_path).expect("read saved config");
            let parsed: Value = serde_json::from_str(&next).expect("parse saved config");
            assert!(parsed["agents"]["defaults"].is_object());
            assert!(config_root.join(".openclaw-config-backups").is_dir());
        });
    }

    #[test]
    fn save_openclaw_config_rejects_root_include_without_rewrite() {
        with_mock_config_dir("config-include-guard", |config_root| {
            let config_path = config_root.join("openclaw.json");
            let original = r#"{"$include":["providers.json"],"models":{"providers":{}}}"#;
            fs::write(&config_path, original).expect("write include config");

            let result = save_openclaw_config(&json!({
                "models": {
                    "providers": {}
                }
            }));

            assert!(result
                .expect_err("include config should be rejected")
                .contains("$include"));
            assert_eq!(
                fs::read_to_string(&config_path).expect("read preserved config"),
                original
            );
        });
    }

    #[test]
    fn save_openclaw_config_rejects_invalid_shape_without_rewrite() {
        with_mock_config_dir("config-invalid-shape", |config_root| {
            let config_path = config_root.join("openclaw.json");
            let original = r#"{"models":{"providers":{}}}"#;
            fs::write(&config_path, original).expect("write initial config");

            let result = save_openclaw_config(&json!({
                "models": []
            }));

            assert!(result
                .expect_err("invalid shape should be rejected")
                .contains("models"));
            assert_eq!(
                fs::read_to_string(&config_path).expect("read preserved config"),
                original
            );
        });
    }

    #[test]
    fn json5_comment_detection_ignores_url_strings() {
        assert!(!contains_json5_syntax(
            r#"{"baseUrl":"https://example.com"}"#
        ));
        assert!(contains_json5_syntax("{\n// comment\n\"models\":{}\n}"));
    }
}
