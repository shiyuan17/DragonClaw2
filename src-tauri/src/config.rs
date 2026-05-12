// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::Emitter;

use crate::config_store::ConfigRepository;
use crate::paths;
use crate::providers::{get_providers, CurrentConfig};

pub use crate::config_store::DEFAULT_GATEWAY_TOKEN;

/// Backwards-compatible helper. Prefer `paths::user_config_dir()` for new code.
pub fn get_user_openclaw_dir() -> Result<PathBuf, String> {
    paths::user_config_dir()
}

pub(crate) fn openclaw_config_path() -> Result<PathBuf, String> {
    ConfigRepository::path()
}

pub(crate) fn read_openclaw_config() -> Result<Value, String> {
    ConfigRepository::load_raw()
}

pub(crate) fn write_openclaw_config(config: &Value) -> Result<(), String> {
    ConfigRepository::replace(config)
}

pub(crate) fn ensure_config_roots(config: &mut Value) {
    ConfigRepository::ensure_config_roots(config);
}

pub(crate) fn set_main_workspace(
    config: &mut Value,
    workspace_path: Option<&str>,
) -> Result<PathBuf, String> {
    ConfigRepository::set_main_workspace(config, workspace_path)
}

pub(crate) fn ensure_gateway_config(config: &mut Value) {
    ConfigRepository::ensure_gateway_config(config);
}

pub(crate) fn ensure_default_workspace(config: &mut Value) {
    ConfigRepository::ensure_default_workspace(config);
}

fn main_agent_dir() -> Result<PathBuf, String> {
    Ok(get_user_openclaw_dir()?
        .join("agents")
        .join("main")
        .join("agent"))
}

fn load_json_file_or_default(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("读取 {} 失败: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("解析 {} 失败: {error}", path.display()))
}

fn save_pretty_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("JSON 文件路径无效: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("创建目录失败 ({}): {error}", parent.display()))?;

    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("序列化 {} 失败: {error}", path.display()))?;
    fs::write(path, content).map_err(|error| format!("写入 {} 失败: {error}", path.display()))
}

fn sync_main_agent_provider_models(provider: &str, provider_entry: &Value) -> Result<(), String> {
    let models_path = main_agent_dir()?.join("models.json");
    let mut agent_models = load_json_file_or_default(&models_path)?;
    if !agent_models.is_object() {
        agent_models = json!({});
    }
    if agent_models.get("providers").is_none() || !agent_models["providers"].is_object() {
        agent_models["providers"] = json!({});
    }

    agent_models["providers"][provider] = provider_entry.clone();
    save_pretty_json_file(&models_path, &agent_models)
}

pub(crate) fn read_model_reference(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .or_else(|| {
            value
                .get("primary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
        })
}

pub(crate) fn read_default_model(config: &Value) -> Option<String> {
    config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("model"))
        .and_then(read_model_reference)
}

pub(crate) fn read_main_agent_model(config: &Value) -> Option<String> {
    config
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)
        .and_then(|agents| {
            agents.iter().find(|agent| {
                agent
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|value| value.trim() == "main")
                    .unwrap_or(false)
            })
        })
        .and_then(|agent| agent.get("model"))
        .and_then(read_model_reference)
}

pub(crate) fn resolve_effective_main_model(config: &Value) -> Option<String> {
    read_main_agent_model(config).or_else(|| read_default_model(config))
}

pub(crate) fn set_main_agent_model(config: &mut Value, full_model_id: &str) -> Result<(), String> {
    let normalized_model_id = full_model_id.trim();
    if normalized_model_id.is_empty() {
        return Err("main agent model cannot be empty".to_string());
    }

    ensure_config_roots(config);

    if config["agents"].get("list").is_none() || !config["agents"]["list"].is_array() {
        config["agents"]["list"] = json!([]);
    }

    let agents = config["agents"]["list"]
        .as_array_mut()
        .ok_or("agents.list should be an array".to_string())?;
    let target_index = agents.iter().position(|agent| {
        agent
            .get("id")
            .and_then(Value::as_str)
            .map(|value| value.trim() == "main")
            .unwrap_or(false)
    });

    let index = if let Some(index) = target_index {
        index
    } else {
        agents.push(json!({ "id": "main" }));
        agents.len() - 1
    };

    if !agents[index].is_object() {
        agents[index] = json!({ "id": "main" });
    }

    let entry = agents[index]
        .as_object_mut()
        .ok_or("main agent entry should be an object".to_string())?;
    entry.insert("id".to_string(), Value::String("main".to_string()));
    entry.insert(
        "model".to_string(),
        Value::String(normalized_model_id.to_string()),
    );
    Ok(())
}

#[tauri::command]
pub fn migrate_gateway_config() -> Result<String, String> {
    let original = read_openclaw_config()?;
    let next_config = ConfigRepository::update(|config| {
        ensure_gateway_config(config);
        ensure_default_workspace(config);
        Ok(())
    })?;

    if next_config != original {
        return Ok("Gateway 配置已迁移".to_string());
    }

    Ok("Config unchanged".to_string())
}

#[tauri::command]
pub fn get_current_config() -> Result<CurrentConfig, String> {
    let config = read_openclaw_config()?;

    let has_key = config
        .get("models")
        .and_then(|models| models.get("providers"))
        .and_then(Value::as_object)
        .map(|providers| {
            providers.values().any(|provider| {
                provider
                    .get("apiKey")
                    .and_then(Value::as_str)
                    .map(|api_key| !api_key.is_empty())
                    .unwrap_or(false)
                    || provider.get("auth").is_some()
            })
        })
        .unwrap_or(false);

    let primary = resolve_effective_main_model(&config);

    let provider = primary
        .as_ref()
        .and_then(|value| value.split('/').next())
        .map(|value| value.to_string());

    let gateway_token = config
        .get("gateway")
        .and_then(|gateway| gateway.get("auth"))
        .and_then(|auth| auth.get("token"))
        .and_then(Value::as_str)
        .map(|value| value.to_string());

    let workspace_path = config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("workspace"))
        .and_then(Value::as_str)
        .map(|value| value.to_string())
        .or_else(|| {
            paths::main_workspace_dir()
                .ok()
                .map(|workspace| workspace.to_string_lossy().to_string())
        });

    Ok(CurrentConfig {
        has_api_key: has_key,
        provider,
        model: primary,
        base_url: None,
        gateway_token,
        workspace_path,
    })
}

#[tauri::command]
pub fn save_api_config(
    app: tauri::AppHandle,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let providers = get_providers();
    let provider_info = providers.iter().find(|item| item.id == provider);
    let effective_base_url = base_url
        .clone()
        .or_else(|| provider_info.map(|item| item.base_url.clone()))
        .unwrap_or_default();
    let api_type = provider_info
        .map(|item| item.api_type.as_str())
        .unwrap_or("openai-completions");

    let selected_model = model.unwrap_or_else(|| {
        provider_info
            .and_then(|item| item.models.first())
            .map(|item| item.id.clone())
            .unwrap_or_default()
    });
    let full_model_id = format!("{provider}/{selected_model}");

    let model_defs: Vec<Value> = provider_info
        .map(|item| &item.models)
        .unwrap_or(&vec![])
        .iter()
        .map(|model| {
            json!({
                "id": model.id,
                "name": model.name,
                "reasoning": false,
                "input": ["text"],
                "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                "contextWindow": model.context_window,
                "maxTokens": model.max_tokens,
            })
        })
        .collect();

    let new_provider_entry = json!({
        "baseUrl": effective_base_url,
        "apiKey": api_key,
        "api": api_type,
        "models": model_defs,
    });

    ConfigRepository::update(|config| {
        ensure_config_roots(config);

        config["models"]["providers"][&provider] = new_provider_entry.clone();
        config["agents"]["defaults"]["model"] = json!({ "primary": full_model_id.clone() });
        set_main_agent_model(config, &full_model_id)?;

        if let Some(provider_meta) = provider_info {
            for model in &provider_meta.models {
                let key = format!("{provider}/{}", model.id);
                config["agents"]["defaults"]["models"][&key] = json!({});
            }
        }

        ensure_gateway_config(config);
        ensure_default_workspace(config);
        Ok(())
    })?;

    sync_main_agent_provider_models(&provider, &new_provider_entry)?;

    let _ = app.emit(
        "config-updated",
        json!({
            "provider": provider,
            "hasKey": true,
            "model": full_model_id,
        }),
    );

    Ok(format!(
        "已保存 {} 配置，默认模型: {}",
        provider_info
            .map(|item| item.name.as_str())
            .unwrap_or(&provider),
        full_model_id
    ))
}

#[tauri::command]
pub fn set_default_model(app: tauri::AppHandle, model_id: String) -> Result<String, String> {
    let config = read_openclaw_config()?;
    if config == json!({}) {
        return Err("尚未找到 openclaw.json，请先完成 API Key 配置".to_string());
    }

    let full_model_id = if model_id.contains('/') {
        model_id.clone()
    } else {
        let first_provider = config
            .get("models")
            .and_then(|models| models.get("providers"))
            .and_then(Value::as_object)
            .and_then(|providers| providers.keys().next().cloned())
            .unwrap_or_default();
        if first_provider.is_empty() {
            model_id.clone()
        } else {
            format!("{first_provider}/{model_id}")
        }
    };

    let parts: Vec<&str> = full_model_id.splitn(2, '/').collect();
    let (provider_name, bare_model_id) = if parts.len() == 2 {
        (parts[0], parts[1])
    } else {
        ("", full_model_id.as_str())
    };

    ConfigRepository::update(|config| {
        ensure_config_roots(config);
        config["agents"]["defaults"]["model"] = json!({ "primary": full_model_id.clone() });
        set_main_agent_model(config, &full_model_id)?;

        if !provider_name.is_empty() {
            if let Some(provider_obj) = config
                .get_mut("models")
                .and_then(|models| models.get_mut("providers"))
                .and_then(|providers| providers.get_mut(provider_name))
            {
                if let Some(models) = provider_obj.get_mut("models").and_then(Value::as_array_mut)
                {
                    let exists = models
                        .iter()
                        .any(|model| model.get("id").and_then(Value::as_str) == Some(bare_model_id));
                    if !exists {
                        models.push(json!({
                            "id": bare_model_id,
                            "name": bare_model_id,
                            "reasoning": false,
                            "input": ["text"],
                            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                            "contextWindow": 128000,
                            "maxTokens": 8192
                        }));
                    }
                }
            }
        }

        config["agents"]["defaults"]["models"][&full_model_id] = json!({});
        Ok(())
    })?;

    let agent_dir = get_user_openclaw_dir()?
        .join("agents")
        .join("main")
        .join("agent");
    let models_path = agent_dir.join("models.json");
    if models_path.exists() {
        if let Ok(content) = fs::read_to_string(&models_path) {
            if let Ok(mut agent_models) = serde_json::from_str::<Value>(&content) {
                if !provider_name.is_empty() {
                    if let Some(provider) = agent_models
                        .get_mut("providers")
                        .and_then(|providers| providers.get_mut(provider_name))
                    {
                        if let Some(models) =
                            provider.get_mut("models").and_then(Value::as_array_mut)
                        {
                            let exists = models.iter().any(|model| {
                                model.get("id").and_then(Value::as_str) == Some(bare_model_id)
                            });
                            if !exists {
                                models.push(json!({
                                    "id": bare_model_id,
                                    "name": bare_model_id,
                                    "reasoning": false,
                                    "input": ["text"],
                                    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                                    "contextWindow": 128000,
                                    "maxTokens": 8192
                                }));
                            }
                        }
                    }
                }
                let _ = fs::write(
                    &models_path,
                    serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
                );
            }
        }
    }

    let _ = app.emit(
        "config-updated",
        json!({
            "model": full_model_id,
        }),
    );

    Ok(format!("已切换默认模型: {full_model_id}"))
}

#[tauri::command]
pub fn reset_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = openclaw_config_path()?;
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|error| format!("删除 openclaw.json 失败: {error}"))?;
    }

    let models_path = get_user_openclaw_dir()?
        .join("agents")
        .join("main")
        .join("agent")
        .join("models.json");
    if models_path.exists() {
        let _ = fs::remove_file(&models_path);
    }

    let _ = app.emit(
        "config-updated",
        json!({
            "provider": Value::Null,
            "hasKey": false,
            "model": Value::Null,
        }),
    );

    Ok("已重置配置，请重新填写 API Key".to_string())
}
