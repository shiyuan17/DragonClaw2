// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use std::path::PathBuf;

use crate::providers::{get_providers, CurrentConfig};
use tauri::Emitter;

pub const DEFAULT_GATEWAY_TOKEN: &str = "openclaw-launcher-local";

/// Get the ACTUAL OpenClaw config directory that the gateway reads: ~/.openclaw/
/// This is different from crate::paths::get_openclaw_dir() which returns the sandbox path
pub fn get_user_openclaw_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".openclaw");
    std::fs::create_dir_all(&dir).map_err(|e| format!("鍒涘缓 .openclaw 鐩綍澶辫触: {}", e))?;
    Ok(dir)
}

fn default_gateway_config() -> serde_json::Value {
    serde_json::json!({
        "mode": "local",
        "auth": {
            "mode": "token",
            "token": DEFAULT_GATEWAY_TOKEN
        },
        "controlUi": {
            "allowInsecureAuth": true,
            "dangerouslyDisableDeviceAuth": true
        }
    })
}

pub(crate) fn ensure_gateway_config(config: &mut serde_json::Value) {
    if !config.get("gateway").map(|value| value.is_object()).unwrap_or(false) {
        config["gateway"] = default_gateway_config();
        return;
    }

    let gateway = config
        .get_mut("gateway")
        .and_then(|value| value.as_object_mut())
        .expect("gateway should be an object after initialization");

    gateway
        .entry("mode".to_string())
        .or_insert_with(|| serde_json::json!("local"));

    let auth = gateway
        .entry("auth".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !auth.is_object() {
        *auth = serde_json::json!({});
    }
    if let Some(auth_obj) = auth.as_object_mut() {
        auth_obj
            .entry("mode".to_string())
            .or_insert_with(|| serde_json::json!("token"));
        auth_obj
            .entry("token".to_string())
            .or_insert_with(|| serde_json::json!(DEFAULT_GATEWAY_TOKEN));
    }

    let control_ui = gateway
        .entry("controlUi".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !control_ui.is_object() {
        *control_ui = serde_json::json!({});
    }
    if let Some(control_ui_obj) = control_ui.as_object_mut() {
        control_ui_obj
            .entry("allowInsecureAuth".to_string())
            .or_insert_with(|| serde_json::json!(true));
        control_ui_obj
            .entry("dangerouslyDisableDeviceAuth".to_string())
            .or_insert_with(|| serde_json::json!(true));
    }
}

pub(crate) fn ensure_default_workspace(config: &mut serde_json::Value) {
    if config.get("agents").is_none() {
        config["agents"] = serde_json::json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = serde_json::json!({});
    }
    if config["agents"]["defaults"].get("workspace").is_none() {
        let workspace = dirs::document_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Documents"))
            .join("OpenClaw-Projects");
        let _ = std::fs::create_dir_all(&workspace);
        config["agents"]["defaults"]["workspace"] =
            serde_json::Value::String(workspace.to_string_lossy().to_string());
    }
}

/// Migrate the gateway config at ~/.openclaw/openclaw.json to ensure
/// device auth is disabled and auth mode is set correctly for local Launcher use.
/// This must target ~/.openclaw/ (get_user_openclaw_dir) because that's where
/// the gateway actually reads its config, not the sandbox engine directory.
#[tauri::command]
pub fn migrate_gateway_config() -> Result<String, String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let config_path = openclaw_dir.join("openclaw.json");

    if !config_path.exists() {
        return Ok("No config to migrate yet".to_string());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("璇诲彇閰嶇疆澶辫触: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    let original = config.clone();

    ensure_gateway_config(&mut config);

    if config != original {
        let output = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("搴忓垪鍖栧け璐? {}", e))?;
        std::fs::write(&config_path, output)
            .map_err(|e| format!("鍐欏叆閰嶇疆澶辫触: {}", e))?;
        return Ok("鉁?宸蹭慨琛ョ綉鍏抽厤缃細绂佺敤璁惧绛惧悕鏍￠獙".to_string());
    }

    Ok("Config unchanged".to_string())
}

/// Get current OpenClaw config status
#[tauri::command]
pub fn get_current_config() -> Result<CurrentConfig, String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let config_path = openclaw_dir.join("openclaw.json");

    if !config_path.exists() {
        return Ok(CurrentConfig {
            has_api_key: false,
            provider: None,
            model: None,
            base_url: None,
            gateway_token: None,
        });
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("璇诲彇閰嶇疆澶辫触: {}", e))?;
    let config: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

    let has_key = config
        .get("models")
        .and_then(|m| m.get("providers"))
        .and_then(|p| p.as_object())
        .map(|obj| {
            obj.values().any(|v| {
                v.get("apiKey")
                    .and_then(|k| k.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || v.get("auth").is_some()
            })
        })
        .unwrap_or(false);

    let primary = config
        .get("agents")
        .and_then(|a| a.get("defaults"))
        .and_then(|d| d.get("model"))
        .and_then(|m| m.get("primary"))
        .and_then(|p| p.as_str())
        .map(|s| s.to_string());

    let provider = primary
        .as_ref()
        .and_then(|p| p.split('/').next())
        .map(|s| s.to_string());

    let gateway_token = config
        .get("gateway")
        .and_then(|gateway| gateway.get("auth"))
        .and_then(|auth| auth.get("token"))
        .and_then(|token| token.as_str())
        .map(|token| token.to_string());

    Ok(CurrentConfig {
        has_api_key: has_key,
        provider,
        model: primary,
        base_url: None,
        gateway_token,
    })
}

/// Save API key config - merges provider into existing openclaw.json
/// instead of replacing the entire file.
#[tauri::command]
pub fn save_api_config(
    app: tauri::AppHandle,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let config_path = openclaw_dir.join("openclaw.json");

    let providers = get_providers();
    let provider_info = providers.iter().find(|p| p.id == provider);
    let effective_base_url = base_url
        .clone()
        .or_else(|| provider_info.map(|p| p.base_url.clone()))
        .unwrap_or_default();
    let api_type = provider_info
        .map(|p| p.api_type.as_str())
        .unwrap_or("openai-completions");

    let selected_model = model.unwrap_or_else(|| {
        provider_info
            .and_then(|p| p.models.first())
            .map(|m| m.id.clone())
            .unwrap_or_default()
    });
    let full_model_id = format!("{}/{}", provider, selected_model);

    let model_defs: Vec<serde_json::Value> = provider_info
        .map(|p| &p.models)
        .unwrap_or(&vec![])
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "name": m.name,
                "reasoning": false,
                "input": ["text"],
                "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                "contextWindow": m.context_window,
                "maxTokens": m.max_tokens,
            })
        })
        .collect();

    let new_provider_entry = serde_json::json!({
        "baseUrl": effective_base_url,
        "apiKey": api_key,
        "api": api_type,
        "models": model_defs,
    });

    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("璇诲彇閰嶇疆澶辫触: {}", e))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if config.get("models").is_none() {
        config["models"] = serde_json::json!({});
    }
    if config["models"].get("providers").is_none() {
        config["models"]["providers"] = serde_json::json!({});
    }
    config["models"]["providers"][&provider] = new_provider_entry;

    if config.get("agents").is_none() {
        config["agents"] = serde_json::json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = serde_json::json!({});
    }
    config["agents"]["defaults"]["model"] = serde_json::json!({ "primary": full_model_id });

    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = serde_json::json!({});
    }
    if let Some(pi) = provider_info {
        for m in &pi.models {
            let key = format!("{}/{}", provider, m.id);
            config["agents"]["defaults"]["models"][&key] = serde_json::json!({});
        }
    }

    ensure_gateway_config(&mut config);
    ensure_default_workspace(&mut config);

    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("搴忓垪鍖栧け璐? {}", e))?;
    std::fs::write(&config_path, &output)
        .map_err(|e| format!("鍐欏叆閰嶇疆鏂囦欢澶辫触: {}", e))?;

    let agent_dir = openclaw_dir.join("agents").join("main").join("agent");
    let _ = std::fs::create_dir_all(&agent_dir);
    let models_path = agent_dir.join("models.json");
    let mut agent_models: serde_json::Value = if models_path.exists() {
        let content = std::fs::read_to_string(&models_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if agent_models.get("providers").is_none() {
        agent_models["providers"] = serde_json::json!({});
    }
    agent_models["providers"][&provider] = serde_json::json!({
        "baseUrl": effective_base_url,
        "apiKey": api_key,
        "api": api_type,
        "models": model_defs,
    });
    let _ = std::fs::write(
        &models_path,
        serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
    );

    let _ = app.emit(
        "config-updated",
        serde_json::json!({
            "provider": provider,
            "hasKey": true,
            "model": full_model_id,
        }),
    );

    Ok(format!(
        "鉁?{} 閰嶇疆宸蹭繚瀛橈紝妯″瀷: {}",
        provider_info.map(|p| p.name.as_str()).unwrap_or(&provider),
        full_model_id
    ))
}

/// Set the default model using serde_json.
/// Also persists custom model IDs into the provider's models array.
#[tauri::command]
pub fn set_default_model(app: tauri::AppHandle, model_id: String) -> Result<String, String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let config_path = openclaw_dir.join("openclaw.json");

    if !config_path.exists() {
        return Err("閰嶇疆鏂囦欢涓嶅瓨鍦紝璇峰厛閰嶇疆 API Key".into());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("璇诲彇閰嶇疆澶辫触: {}", e))?;
    let mut config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("瑙ｆ瀽閰嶇疆澶辫触: {}", e))?;

    let full_model_id = if model_id.contains('/') {
        model_id.clone()
    } else {
        let first_provider = config
            .get("models")
            .and_then(|m| m.get("providers"))
            .and_then(|p| p.as_object())
            .and_then(|obj| obj.keys().next().cloned())
            .unwrap_or_default();
        if first_provider.is_empty() {
            model_id.clone()
        } else {
            format!("{}/{}", first_provider, model_id)
        }
    };

    let parts: Vec<&str> = full_model_id.splitn(2, '/').collect();
    let (provider_name, bare_model_id) = if parts.len() == 2 {
        (parts[0], parts[1])
    } else {
        ("", full_model_id.as_str())
    };

    if config.get("agents").is_none() {
        config["agents"] = serde_json::json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = serde_json::json!({});
    }
    config["agents"]["defaults"]["model"] = serde_json::json!({ "primary": full_model_id });

    if !provider_name.is_empty() {
        if let Some(provider_obj) = config
            .get_mut("models")
            .and_then(|m| m.get_mut("providers"))
            .and_then(|p| p.get_mut(provider_name))
        {
            let models_arr = provider_obj.get_mut("models").and_then(|m| m.as_array_mut());

            if let Some(arr) = models_arr {
                let already_exists = arr
                    .iter()
                    .any(|m| m.get("id").and_then(|id| id.as_str()) == Some(bare_model_id));
                if !already_exists {
                    arr.push(serde_json::json!({
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

    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = serde_json::json!({});
    }
    config["agents"]["defaults"]["models"][&full_model_id] = serde_json::json!({});

    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("搴忓垪鍖栧け璐? {}", e))?;
    std::fs::write(&config_path, &output).map_err(|e| format!("鍐欏叆閰嶇疆澶辫触: {}", e))?;

    let agent_dir = openclaw_dir.join("agents").join("main").join("agent");
    let models_path = agent_dir.join("models.json");
    if models_path.exists() {
        if let Ok(mc) = std::fs::read_to_string(&models_path) {
            if let Ok(mut agent_models) = serde_json::from_str::<serde_json::Value>(&mc) {
                if !provider_name.is_empty() {
                    if let Some(p) = agent_models
                        .get_mut("providers")
                        .and_then(|p| p.get_mut(provider_name))
                    {
                        if let Some(arr) = p.get_mut("models").and_then(|m| m.as_array_mut()) {
                            let exists = arr
                                .iter()
                                .any(|m| m.get("id").and_then(|id| id.as_str()) == Some(bare_model_id));
                            if !exists {
                                arr.push(serde_json::json!({
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
                let _ = std::fs::write(
                    &models_path,
                    serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
                );
            }
        }
    }

    let _ = app.emit(
        "config-updated",
        serde_json::json!({
            "model": full_model_id,
        }),
    );

    Ok(format!("鉁?榛樿妯″瀷宸插垏鎹负: {}", full_model_id))
}

/// Reset config - delete openclaw.json and auth to simulate fresh install
#[tauri::command]
pub fn reset_config(app: tauri::AppHandle) -> Result<String, String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let config_path = openclaw_dir.join("openclaw.json");

    if config_path.exists() {
        std::fs::remove_file(&config_path).map_err(|e| format!("鍒犻櫎閰嶇疆澶辫触: {}", e))?;
    }

    let models_path = openclaw_dir
        .join("agents")
        .join("main")
        .join("agent")
        .join("models.json");
    if models_path.exists() {
        let _ = std::fs::remove_file(&models_path);
    }

    let _ = app.emit(
        "config-updated",
        serde_json::json!({
            "provider": serde_json::Value::Null,
            "hasKey": false,
            "model": serde_json::Value::Null,
        }),
    );

    Ok("鉁?閰嶇疆宸查噸缃紝璇烽噸鏂伴厤缃?API Key".to_string())
}
