// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use std::fs;
use std::path::PathBuf;

use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use tauri::Emitter;

use crate::paths;
use crate::providers::{get_providers, CurrentConfig};

pub const DEFAULT_GATEWAY_TOKEN: &str = "openclaw-launcher-local";

/// Backwards-compatible helper. Prefer `paths::user_config_dir()` for new code.
pub fn get_user_openclaw_dir() -> Result<PathBuf, String> {
    paths::user_config_dir()
}

pub(crate) fn openclaw_config_path() -> Result<PathBuf, String> {
    paths::openclaw_config_path()
}

pub(crate) fn read_openclaw_config() -> Result<Value, String> {
    let config_path = openclaw_config_path()?;
    if !config_path.exists() {
        return Ok(json!({}));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| format!("读取 openclaw.json 失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 openclaw.json 失败: {error}"))
}

pub(crate) fn write_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = openclaw_config_path()?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化 openclaw.json 失败: {error}"))?;
    fs::write(&config_path, content)
        .map_err(|error| format!("写入 openclaw.json 失败: {error}"))
}

fn generate_gateway_token() -> String {
    let mut bytes = [0_u8; 24];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(crate) fn ensure_config_roots(config: &mut Value) {
    if !config.is_object() {
        *config = json!({});
    }
    if config.get("models").is_none() {
        config["models"] = json!({});
    }
    if config["models"].get("providers").is_none() {
        config["models"]["providers"] = json!({});
    }
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }
}

fn normalize_workspace_path(workspace_path: Option<&str>) -> Result<PathBuf, String> {
    let candidate = workspace_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or(paths::default_workspace_dir()?);

    if candidate.is_relative() {
        return Err("工作区路径必须是绝对路径".to_string());
    }

    fs::create_dir_all(&candidate).map_err(|error| format!("创建工作区目录失败: {error}"))?;
    candidate
        .canonicalize()
        .map_err(|error| format!("解析工作区目录失败: {error}"))
}

pub(crate) fn set_main_workspace(
    config: &mut Value,
    workspace_path: Option<&str>,
) -> Result<PathBuf, String> {
    ensure_config_roots(config);
    let workspace = normalize_workspace_path(workspace_path)?;

    config["agents"]["defaults"]["workspace"] =
        Value::String(workspace.to_string_lossy().to_string());

    if config.get("sandbox").is_none() {
        config["sandbox"] = json!({});
    }
    config["sandbox"]["paths"] = json!([workspace.to_string_lossy().to_string()]);

    Ok(workspace)
}

fn default_gateway_config() -> Value {
    json!({
        "mode": "local",
        "auth": {
            "mode": "token",
            "token": generate_gateway_token()
        },
        "controlUi": {
            "allowInsecureAuth": true,
            "dangerouslyDisableDeviceAuth": true
        }
    })
}

pub(crate) fn ensure_gateway_config(config: &mut Value) {
    if !config.get("gateway").map(|value| value.is_object()).unwrap_or(false) {
        config["gateway"] = default_gateway_config();
        return;
    }

    let gateway = config
        .get_mut("gateway")
        .and_then(Value::as_object_mut)
        .expect("gateway should be an object after initialization");

    gateway
        .entry("mode".to_string())
        .or_insert_with(|| json!("local"));

    let auth = gateway
        .entry("auth".to_string())
        .or_insert_with(|| json!({}));
    if !auth.is_object() {
        *auth = json!({});
    }
    if let Some(auth_obj) = auth.as_object_mut() {
        auth_obj
            .entry("mode".to_string())
            .or_insert_with(|| json!("token"));

        let should_rotate_token = auth_obj
            .get("token")
            .and_then(Value::as_str)
            .map(|token| token.trim().is_empty() || token == DEFAULT_GATEWAY_TOKEN)
            .unwrap_or(true);
        if should_rotate_token {
            auth_obj.insert("token".to_string(), json!(generate_gateway_token()));
        }
    }

    let control_ui = gateway
        .entry("controlUi".to_string())
        .or_insert_with(|| json!({}));
    if !control_ui.is_object() {
        *control_ui = json!({});
    }
    if let Some(control_ui_obj) = control_ui.as_object_mut() {
        control_ui_obj
            .entry("allowInsecureAuth".to_string())
            .or_insert_with(|| json!(true));
        control_ui_obj
            .entry("dangerouslyDisableDeviceAuth".to_string())
            .or_insert_with(|| json!(true));
    }
}

pub(crate) fn ensure_default_workspace(config: &mut Value) {
    if config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("workspace"))
        .and_then(Value::as_str)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return;
    }

    let _ = set_main_workspace(config, None);
}

#[tauri::command]
pub fn migrate_gateway_config() -> Result<String, String> {
    let mut config = read_openclaw_config()?;
    let original = config.clone();

    ensure_gateway_config(&mut config);
    ensure_default_workspace(&mut config);

    if config != original {
        write_openclaw_config(&config)?;
        return Ok("Gateway 配置已更新".to_string());
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

    let primary = config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("model"))
        .and_then(|model| model.get("primary"))
        .and_then(Value::as_str)
        .map(|value| value.to_string());

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

    let mut config = read_openclaw_config()?;
    ensure_config_roots(&mut config);

    config["models"]["providers"][&provider] = new_provider_entry;
    config["agents"]["defaults"]["model"] = json!({ "primary": full_model_id });

    if let Some(provider_meta) = provider_info {
        for model in &provider_meta.models {
            let key = format!("{provider}/{}", model.id);
            config["agents"]["defaults"]["models"][&key] = json!({});
        }
    }

    ensure_gateway_config(&mut config);
    ensure_default_workspace(&mut config);
    write_openclaw_config(&config)?;

    let agent_dir = get_user_openclaw_dir()?.join("agents").join("main").join("agent");
    let _ = fs::create_dir_all(&agent_dir);
    let models_path = agent_dir.join("models.json");
    let mut agent_models: Value = if models_path.exists() {
        let content = fs::read_to_string(&models_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };
    if agent_models.get("providers").is_none() {
        agent_models["providers"] = json!({});
    }
    agent_models["providers"][&provider] = json!({
        "baseUrl": effective_base_url,
        "apiKey": api_key,
        "api": api_type,
        "models": model_defs,
    });
    let _ = fs::write(
        &models_path,
        serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
    );

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
        provider_info.map(|item| item.name.as_str()).unwrap_or(&provider),
        full_model_id
    ))
}

#[tauri::command]
pub fn set_default_model(app: tauri::AppHandle, model_id: String) -> Result<String, String> {
    let mut config = read_openclaw_config()?;
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

    ensure_config_roots(&mut config);
    config["agents"]["defaults"]["model"] = json!({ "primary": full_model_id });

    if !provider_name.is_empty() {
        if let Some(provider_obj) = config
            .get_mut("models")
            .and_then(|models| models.get_mut("providers"))
            .and_then(|providers| providers.get_mut(provider_name))
        {
            if let Some(models) = provider_obj.get_mut("models").and_then(Value::as_array_mut) {
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
    write_openclaw_config(&config)?;

    let agent_dir = get_user_openclaw_dir()?.join("agents").join("main").join("agent");
    let models_path = agent_dir.join("models.json");
    if models_path.exists() {
        if let Ok(content) = fs::read_to_string(&models_path) {
            if let Ok(mut agent_models) = serde_json::from_str::<Value>(&content) {
                if !provider_name.is_empty() {
                    if let Some(provider) = agent_models
                        .get_mut("providers")
                        .and_then(|providers| providers.get_mut(provider_name))
                    {
                        if let Some(models) = provider.get_mut("models").and_then(Value::as_array_mut) {
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
        fs::remove_file(&config_path).map_err(|error| format!("删除 openclaw.json 失败: {error}"))?;
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
