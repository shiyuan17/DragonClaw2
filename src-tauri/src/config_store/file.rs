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
    serde_json::from_str(&content).map_err(|error| format!("解析 openclaw.json 失败: {error}"))
}

pub fn save_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = openclaw_config_path()?;
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

    fs::write(&tmp_path, content).map_err(|error| format!("写入临时配置文件失败: {error}"))?;

    match fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            if path.exists() {
                fs::remove_file(path)
                    .map_err(|error| format!("替换旧配置文件失败: {error}"))?;
                fs::rename(&tmp_path, path).map_err(|error| {
                    format!("写入 openclaw.json 失败: {error} (rename error: {rename_error})")
                })?;
                return Ok(());
            }

            let _ = fs::remove_file(&tmp_path);
            Err(format!("写入 openclaw.json 失败: {rename_error}"))
        }
    }
}
