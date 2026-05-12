// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

//! Provider management - reads/writes the `models.providers` section of openclaw.json
//! using proper serde_json parsing (not string manipulation).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::sync::{Mutex, OnceLock};

use crate::config::{
    ensure_config_roots, ensure_default_workspace, ensure_gateway_config, get_user_openclaw_dir,
    read_default_model, read_main_agent_model, read_openclaw_config, set_main_agent_model,
    write_openclaw_config,
};
use crate::launcher_state;
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

const WORKSPACE_PROVIDER_SAVE_SYNC_EVENT: &str = "workspace-provider-config-sync";

#[derive(Debug, Clone)]
struct ProviderSaveRequest {
    provider_key: String,
    display_name: Option<String>,
    base_url: String,
    api: String,
    api_key: String,
    model_id: String,
    model_options: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct ProviderSaveOutcome {
    provider_key: String,
    model_id: String,
    has_api_key: bool,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProviderSaveSyncEvent {
    pub provider_key: String,
    pub operation: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ProviderSaveRequest {
    fn from_inputs(
        provider_key: String,
        display_name: Option<String>,
        base_url: String,
        api: String,
        api_key: String,
        model_id: String,
        model_options: Option<Vec<String>>,
    ) -> Result<Self, String> {
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

        Ok(Self {
            provider_key,
            display_name,
            base_url,
            api,
            api_key,
            model_id,
            model_options,
        })
    }
}

fn workspace_provider_save_queue() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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

fn normalize_display_name(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn extract_legacy_display_name(value: &Value) -> Option<String> {
    normalize_display_name(
        value
            .get("displayName")
            .or_else(|| value.get("display_name"))
            .and_then(Value::as_str),
    )
}

fn remove_legacy_display_name_fields(value: &mut Value) -> bool {
    let Some(object) = value.as_object_mut() else {
        return false;
    };

    let removed_camel = object.remove("displayName").is_some();
    let removed_snake = object.remove("display_name").is_some();
    removed_camel || removed_snake
}

fn load_provider_display_names_with_self_heal(
    config: &mut Value,
) -> Result<Map<String, Value>, String> {
    let mut display_names = launcher_state::read_provider_display_names()?;
    let mut display_names_changed = false;
    let mut config_changed = false;

    if let Some(providers) = config
        .get_mut("models")
        .and_then(|models| models.get_mut("providers"))
        .and_then(Value::as_object_mut)
    {
        for (provider_key, provider_value) in providers.iter_mut() {
            let legacy_display_name = extract_legacy_display_name(provider_value);
            if !display_names.contains_key(provider_key) {
                if let Some(legacy_value) = legacy_display_name {
                    display_names.insert(provider_key.clone(), legacy_value);
                    display_names_changed = true;
                }
            }

            if remove_legacy_display_name_fields(provider_value) {
                config_changed = true;
            }
        }
    }

    if display_names_changed {
        launcher_state::update_provider_display_names(|stored| {
            *stored = display_names.clone();
        })?;
    }

    if config_changed {
        write_config(config)?;
    }

    let display_name_values = display_names
        .into_iter()
        .map(|(key, value)| (key, Value::String(value)))
        .collect::<Map<String, Value>>();
    Ok(display_name_values)
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
    fs::create_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to create agent directory: {}", e))?;

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

fn persist_saved_provider_config(
    request: &ProviderSaveRequest,
    update_default_model: bool,
) -> Result<ProviderSaveOutcome, String> {
    let mut config = read_config()?;
    ensure_config_roots(&mut config);
    ensure_gateway_config(&mut config);
    ensure_default_workspace(&mut config);

    let existing_provider_entry = config
        .get("models")
        .and_then(|models| models.get("providers"))
        .and_then(|providers| providers.get(&request.provider_key))
        .cloned();

    let effective_api_key_value = if request.api_key.is_empty() {
        existing_provider_entry
            .as_ref()
            .and_then(|value| value.get("apiKey"))
            .cloned()
    } else {
        Some(Value::String(request.api_key.clone()))
    };
    let has_api_key = effective_api_key_value
        .as_ref()
        .map(|value| match value {
            Value::String(text) => !text.trim().is_empty(),
            Value::Null => false,
            Value::Object(object) => !object.is_empty(),
            _ => true,
        })
        .unwrap_or(false)
        || existing_provider_entry
            .as_ref()
            .and_then(|value| value.get("auth"))
            .is_some();

    let mut unique_models = vec![request.model_id.clone()];
    if let Some(options) = request.model_options.as_ref() {
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

    let mut provider_entry = existing_provider_entry.unwrap_or_else(|| json!({}));
    if !provider_entry.is_object() {
        provider_entry = json!({});
    }
    let provider_object = provider_entry
        .as_object_mut()
        .ok_or("provider entry should be an object".to_string())?;
    provider_object.insert(
        "baseUrl".to_string(),
        Value::String(request.base_url.clone()),
    );
    provider_object.insert("api".to_string(), Value::String(request.api.clone()));
    provider_object.insert("models".to_string(), Value::Array(models));
    if let Some(api_key_value) = effective_api_key_value {
        provider_object.insert("apiKey".to_string(), api_key_value);
    }

    config["models"]["providers"][&request.provider_key] = provider_entry.clone();

    if update_default_model {
        let full_model_ref = format!("{}/{}", request.provider_key, request.model_id);
        config["agents"]["defaults"]["model"] = json!({
            "primary": full_model_ref.clone()
        });
        set_main_agent_model(&mut config, &full_model_ref)?;

        for model in &unique_models {
            let model_ref = format!("{}/{}", request.provider_key, model);
            config["agents"]["defaults"]["models"][&model_ref] = json!({});
        }
    }

    write_config(&config)?;
    sync_agent_models_provider(&request.provider_key, &provider_entry)?;

    let next_display_name = normalize_display_name(request.display_name.as_deref());
    launcher_state::update_provider_display_names(|stored| {
        if let Some(display_name_value) = next_display_name.as_ref() {
            stored.insert(request.provider_key.clone(), display_name_value.clone());
        } else {
            stored.remove(&request.provider_key);
        }
    })?;

    Ok(ProviderSaveOutcome {
        provider_key: request.provider_key.clone(),
        model_id: request.model_id.clone(),
        has_api_key,
        message: "Workspace model config saved".to_string(),
    })
}

#[tauri::command]
pub fn list_saved_providers() -> Result<Vec<SavedProvider>, String> {
    let mut config = read_config()?;
    let mut providers = Vec::new();
    let display_name_map = load_provider_display_names_with_self_heal(&mut config)?;

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

            let display_name = display_name_map
                .get(name)
                .and_then(Value::as_str)
                .map(|value| value.to_string());

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
                name: Some(format!(
                    "{} ({})",
                    m.name.clone().unwrap_or(m.id.clone()),
                    p.display_name.clone().unwrap_or_else(|| p.name.clone())
                )),
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
    let request = ProviderSaveRequest::from_inputs(
        provider_key,
        display_name,
        base_url,
        api,
        api_key,
        model_id,
        model_options,
    )?;
    let outcome = persist_saved_provider_config(&request, true)?;
    let provider_key = outcome.provider_key.clone();
    let model_id = outcome.model_id.clone();
    let has_key = outcome.has_api_key;

    let _ = app.emit(
        "config-updated",
        json!({
            "provider": provider_key.clone(),
            "hasKey": has_key,
            "model": format!("{}/{}", provider_key, model_id),
        }),
    );

    Ok(outcome.message)
}

#[tauri::command]
pub fn enqueue_workspace_saved_provider_config(
    app: tauri::AppHandle,
    provider_key: String,
    display_name: Option<String>,
    base_url: String,
    api: String,
    api_key: String,
    model_id: String,
    model_options: Option<Vec<String>>,
) -> Result<String, String> {
    let request = ProviderSaveRequest::from_inputs(
        provider_key,
        display_name,
        base_url,
        api,
        api_key,
        model_id,
        model_options,
    )?;

    tauri::async_runtime::spawn({
        let app = app.clone();
        async move {
            let sync_event = {
                let _guard = workspace_provider_save_queue()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());

                match persist_saved_provider_config(&request, false) {
                    Ok(outcome) => WorkspaceProviderSaveSyncEvent {
                        provider_key: outcome.provider_key,
                        operation: "upsert".to_string(),
                        status: "success".to_string(),
                        message: outcome.message,
                        error: None,
                    },
                    Err(error) => WorkspaceProviderSaveSyncEvent {
                        provider_key: request.provider_key.clone(),
                        operation: "upsert".to_string(),
                        status: "error".to_string(),
                        message: "Workspace model config sync failed".to_string(),
                        error: Some(error),
                    },
                }
            };

            let _ = app.emit(WORKSPACE_PROVIDER_SAVE_SYNC_EVENT, sync_event);
        }
    });

    Ok("Workspace model config syncing".to_string())
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

    let current_provider = read_default_model(&config)
        .as_deref()
        .and_then(|primary| primary.split('/').next())
        .map(|provider| provider.to_string());
    let main_agent_model = read_main_agent_model(&config);
    let removed_model_prefix = format!("{}/", provider_key);
    let should_sync_main_agent = main_agent_model
        .as_deref()
        .map(|model_ref| model_ref.starts_with(&removed_model_prefix))
        .unwrap_or(false);

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

    if should_sync_main_agent {
        let fallback_main_model = next_primary.clone().or_else(|| read_default_model(&config));
        if let Some(model_ref) = fallback_main_model {
            set_main_agent_model(&mut config, &model_ref)?;
        }
    }

    write_config(&config)?;
    remove_agent_models_provider(&provider_key)?;
    launcher_state::update_provider_display_names(|stored| {
        stored.remove(&provider_key);
    })?;

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
    launcher_state::update_provider_display_names(|stored| {
        stored.remove(&name);
    })?;
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
            return Err(format!(
                "Model '{}' not found in '{}'",
                model_id, provider_name
            ));
        }
        write_config(&config)?;
        Ok(())
    } else {
        Err(format!(
            "Provider '{}' missing or has no models list",
            provider_name
        ))
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
#[path = "provider_mgr_tests.rs"]
mod tests;
