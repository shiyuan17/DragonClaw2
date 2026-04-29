// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

//! Provider management - reads/writes the `models.providers` section of openclaw.json
//! using proper serde_json parsing (not string manipulation).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;

use crate::config::{
    ensure_config_roots, ensure_default_workspace, ensure_gateway_config, get_user_openclaw_dir,
    read_openclaw_config, write_openclaw_config,
};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedProvider {
    pub name: String,
    pub display_name: Option<String>,
    pub base_url: String,
    pub api: Option<String>,
    pub has_api_key: bool,
    pub model_count: usize,
    pub models: Vec<SavedModel>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedModel {
    pub id: String,
    pub name: Option<String>,
}

fn read_config() -> Result<Value, String> {
    read_openclaw_config()
}

fn write_config(value: &Value) -> Result<(), String> {
    write_openclaw_config(value)
}

fn build_model_entry(model_id: &str) -> Value {
    json!({
        "id": model_id,
        "name": model_id,
        "reasoning": false,
        "input": ["text"],
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
        "contextWindow": 128000,
        "maxTokens": 8192
    })
}

fn first_provider_model(providers: &Map<String, Value>) -> Option<(String, String)> {
    providers.iter().find_map(|(provider_key, provider_value)| {
        let first_model_id = provider_value
            .get("models")
            .and_then(|models| models.as_array())
            .and_then(|models| {
                models
                    .iter()
                    .find_map(|model| model.get("id").and_then(|id| id.as_str()))
            })
            .map(|id| id.to_string());

        first_model_id.map(|model_id| (provider_key.clone(), model_id))
    })
}

fn sync_agent_models_provider(provider_key: &str, provider_entry: &Value) -> Result<(), String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let agent_dir = openclaw_dir.join("agents").join("main").join("agent");
    fs::create_dir_all(&agent_dir).map_err(|e| format!("Failed to create agent directory: {}", e))?;

    let models_path = agent_dir.join("models.json");
    let mut agent_models = if models_path.exists() {
        let content = fs::read_to_string(&models_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    if agent_models.get("providers").is_none() {
        agent_models["providers"] = json!({});
    }
    agent_models["providers"][provider_key] = provider_entry.clone();

    fs::write(
        &models_path,
        serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write models.json: {}", e))
}

fn remove_agent_models_provider(provider_key: &str) -> Result<(), String> {
    let openclaw_dir = get_user_openclaw_dir()?;
    let models_path = openclaw_dir
        .join("agents")
        .join("main")
        .join("agent")
        .join("models.json");

    if !models_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&models_path).unwrap_or_default();
    let mut agent_models = serde_json::from_str::<Value>(&content).unwrap_or(json!({}));

    if let Some(providers) = agent_models
        .get_mut("providers")
        .and_then(|value| value.as_object_mut())
    {
        providers.remove(provider_key);
    }

    fs::write(
        &models_path,
        serde_json::to_string_pretty(&agent_models).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write models.json: {}", e))
}

#[tauri::command]
pub fn list_saved_providers() -> Result<Vec<SavedProvider>, String> {
    let config = read_config()?;
    let mut providers = Vec::new();

    let providers_obj = config
        .get("models")
        .and_then(|m| m.get("providers"))
        .and_then(|p| p.as_object());

    if let Some(obj) = providers_obj {
        for (name, value) in obj {
            let base_url = value
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let api = value
                .get("api")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let display_name = value
                .get("displayName")
                .or_else(|| value.get("display_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let has_api_key = value
                .get("apiKey")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
                || value.get("auth").is_some();

            let models: Vec<SavedModel> = value
                .get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| {
                            let id = m.get("id")?.as_str()?.to_string();
                            let name = m
                                .get("name")
                                .and_then(|n| n.as_str())
                                .map(|s| s.to_string());
                            Some(SavedModel { id, name })
                        })
                        .collect()
                })
                .unwrap_or_default();

            providers.push(SavedProvider {
                name: name.clone(),
                display_name,
                base_url,
                api,
                has_api_key,
                model_count: models.len(),
                models,
            });
        }
    }

    providers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(providers)
}

#[tauri::command]
pub fn list_all_models() -> Result<Vec<SavedModel>, String> {
    let providers = list_saved_providers()?;
    let mut all_models = Vec::new();
    for p in providers {
        for m in &p.models {
            all_models.push(SavedModel {
                id: format!("{}/{}", p.name, m.id),
                name: Some(format!("{} ({})", m.name.clone().unwrap_or(m.id.clone()), p.name)),
            });
        }
    }
    Ok(all_models)
}

#[tauri::command]
pub fn upsert_saved_provider_config(
    app: tauri::AppHandle,
    provider_key: String,
    display_name: Option<String>,
    base_url: String,
    api: String,
    api_key: String,
    model_id: String,
    model_options: Option<Vec<String>>,
) -> Result<String, String> {
    let provider_key = provider_key.trim().to_string();
    let base_url = base_url.trim().to_string();
    let api = api.trim().to_string();
    let api_key = api_key.trim().to_string();
    let model_id = model_id.trim().to_string();

    if provider_key.is_empty() {
        return Err("provider_key cannot be empty".to_string());
    }
    if base_url.is_empty() {
        return Err("base_url cannot be empty".to_string());
    }
    if api.is_empty() {
        return Err("api cannot be empty".to_string());
    }
    if model_id.is_empty() {
        return Err("model_id cannot be empty".to_string());
    }

    let mut config = read_config()?;
    ensure_config_roots(&mut config);
    ensure_gateway_config(&mut config);
    ensure_default_workspace(&mut config);

    let existing_provider_entry = config
        .get("models")
        .and_then(|models| models.get("providers"))
        .and_then(|providers| providers.get(&provider_key))
        .cloned();

    let effective_api_key = if api_key.is_empty() {
        existing_provider_entry
            .as_ref()
            .and_then(|value| value.get("apiKey"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string()
    } else {
        api_key.clone()
    };

    let mut unique_models = vec![model_id.clone()];
    if let Some(options) = model_options {
        for option in options {
            let normalized = option.trim().to_string();
            if !normalized.is_empty() && !unique_models.iter().any(|item| item == &normalized) {
                unique_models.push(normalized);
            }
        }
    }

    let models = unique_models
        .iter()
        .map(|item| build_model_entry(item))
        .collect::<Vec<_>>();

    let mut provider_entry = json!({
        "baseUrl": base_url,
        "apiKey": effective_api_key,
        "api": api,
        "models": models,
    });

    if let Some(display_name_value) = display_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        provider_entry["displayName"] = json!(display_name_value);
    }

    config["models"]["providers"][&provider_key] = provider_entry.clone();
    config["agents"]["defaults"]["model"] = json!({
        "primary": format!("{}/{}", provider_key, model_id)
    });

    for model in &unique_models {
        let model_ref = format!("{}/{}", provider_key, model);
        config["agents"]["defaults"]["models"][&model_ref] = json!({});
    }

    write_config(&config)?;
    sync_agent_models_provider(&provider_key, &provider_entry)?;

    let _ = app.emit(
        "config-updated",
        json!({
            "provider": provider_key,
            "hasKey": !effective_api_key.is_empty(),
            "model": format!("{}/{}", provider_key, model_id),
        }),
    );

    Ok("Workspace model config saved".to_string())
}

#[tauri::command]
pub fn delete_saved_provider_config(
    app: tauri::AppHandle,
    provider_key: String,
) -> Result<String, String> {
    let provider_key = provider_key.trim().to_string();
    if provider_key.is_empty() {
        return Err("provider_key cannot be empty".to_string());
    }

    let mut config = read_config()?;
    ensure_config_roots(&mut config);

    let current_provider = config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("model"))
        .and_then(|model| model.get("primary"))
        .and_then(|primary| primary.as_str())
        .and_then(|primary| primary.split('/').next())
        .map(|provider| provider.to_string());

    let mut next_provider: Option<String> = None;
    let mut next_primary: Option<String> = None;
    {
        let providers = config["models"]["providers"]
            .as_object_mut()
            .ok_or("models.providers missing")?;

        if providers.len() <= 1 {
            return Err("At least one saved provider must remain".to_string());
        }

        if providers.remove(&provider_key).is_none() {
            return Err(format!("Provider '{}' not found", provider_key));
        }

        if current_provider.as_deref() == Some(provider_key.as_str()) {
            let (fallback_provider, fallback_model) =
                first_provider_model(providers).ok_or("No fallback provider model found")?;
            next_provider = Some(fallback_provider.clone());
            next_primary = Some(format!("{}/{}", fallback_provider, fallback_model));
        }
    }

    if let Some(primary) = next_primary.clone() {
        config["agents"]["defaults"]["model"] = json!({ "primary": primary });
    }

    if let Some(default_models) = config["agents"]["defaults"]["models"].as_object_mut() {
        let prefix = format!("{}/", provider_key);
        default_models.retain(|model_ref, _| !model_ref.starts_with(&prefix));
    }

    write_config(&config)?;
    remove_agent_models_provider(&provider_key)?;

    let _ = app.emit(
        "config-updated",
        json!({
            "provider": next_provider,
            "model": next_primary,
        }),
    );

    Ok("Workspace model config deleted".to_string())
}

#[tauri::command]
pub fn delete_provider(name: String) -> Result<(), String> {
    let mut config = read_config()?;

    let removed = config
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.as_object_mut())
        .map(|obj| obj.remove(&name))
        .flatten();

    if removed.is_none() {
        return Err(format!("Provider '{}' not found", name));
    }

    write_config(&config)?;
    Ok(())
}

#[tauri::command]
pub fn remove_model_from_provider(provider_name: String, model_id: String) -> Result<(), String> {
    let mut config = read_config()?;

    let models_arr = config
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.get_mut(&provider_name))
        .and_then(|prov| prov.get_mut("models"))
        .and_then(|m| m.as_array_mut());

    if let Some(arr) = models_arr {
        let original_len = arr.len();
        arr.retain(|m| m.get("id").and_then(|id| id.as_str()) != Some(&model_id));
        if arr.len() == original_len {
            return Err(format!("Model '{}' not found in '{}'", model_id, provider_name));
        }
        write_config(&config)?;
        Ok(())
    } else {
        Err(format!("Provider '{}' missing or has no models list", provider_name))
    }
}

#[tauri::command]
pub fn add_model_to_provider(provider_name: String, model_id: String) -> Result<(), String> {
    let mut config = read_config()?;

    let provider_obj = config
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.get_mut(&provider_name));

    if provider_obj.is_none() {
        return Err(format!("Provider '{}' not found", provider_name));
    }

    let prov = provider_obj.unwrap();
    if prov.get("models").is_none() {
        prov["models"] = json!([]);
    }

    let arr = prov
        .get_mut("models")
        .unwrap()
        .as_array_mut()
        .ok_or("models is not an array")?;

    let already_exists = arr
        .iter()
        .any(|m| m.get("id").and_then(|id| id.as_str()) == Some(&model_id));

    if already_exists {
        return Ok(());
    }

    arr.push(build_model_entry(&model_id));

    write_config(&config)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_provider_name_format() {
        let model_id = format!("{}/{}", "bailian", "glm-5");
        assert_eq!(model_id, "bailian/glm-5");
    }
}
