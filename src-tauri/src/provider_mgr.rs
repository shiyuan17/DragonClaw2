// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

//! Provider management — reads/writes the `models.providers` section of openclaw.json
//! using proper serde_json parsing (not string manipulation).

use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::get_user_openclaw_dir;

/// A saved provider as stored in openclaw.json models.providers
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedProvider {
    pub name: String,
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

/// Read openclaw.json as serde_json::Value
fn read_config() -> Result<serde_json::Value, String> {
    let path = get_user_openclaw_dir()?.join("openclaw.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取 openclaw.json 失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 openclaw.json 失败: {}", e))
}

/// Write serde_json::Value back to openclaw.json
fn write_config(value: &serde_json::Value) -> Result<(), String> {
    let path = get_user_openclaw_dir()?.join("openclaw.json");
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("写入 openclaw.json 失败: {}", e))
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
            let base_url = value.get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let api = value.get("api")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let has_api_key = value.get("apiKey")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
                || value.get("auth").is_some();

            let models: Vec<SavedModel> = value.get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter().filter_map(|m| {
                        let id = m.get("id")?.as_str()?.to_string();
                        let name = m.get("name")
                            .and_then(|n| n.as_str())
                            .map(|s| s.to_string());
                        Some(SavedModel { id, name })
                    }).collect()
                })
                .unwrap_or_default();

            let model_count = models.len();

            providers.push(SavedProvider {
                name: name.clone(),
                base_url,
                api,
                has_api_key,
                model_count,
                models,
            });
        }
    }

    // Sort alphabetically, but keep common ones first
    providers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(providers)
}

/// Get all available models across all providers (for agent model selection)
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
pub fn delete_provider(name: String) -> Result<(), String> {
    let mut config = read_config()?;

    let removed = config
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.as_object_mut())
        .map(|obj| obj.remove(&name))
        .flatten();

    if removed.is_none() {
        return Err(format!("Provider '{}' 不存在", name));
    }

    write_config(&config)?;
    Ok(())
}

/// Remove a single model from a provider's models array
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
            return Err(format!("模型 '{}' 不存在于 '{}'", model_id, provider_name));
        }
        write_config(&config)?;
        Ok(())
    } else {
        Err(format!("Provider '{}' 不存在或无模型列表", provider_name))
    }
}

/// Add a model to a provider's models array without switching the default model
#[tauri::command]
pub fn add_model_to_provider(provider_name: String, model_id: String) -> Result<(), String> {
    let mut config = read_config()?;

    let provider_obj = config
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.get_mut(&provider_name));

    if provider_obj.is_none() {
        return Err(format!("Provider '{}' 不存在", provider_name));
    }

    let prov = provider_obj.unwrap();
    if prov.get("models").is_none() {
        prov["models"] = serde_json::json!([]);
    }

    let arr = prov.get_mut("models").unwrap().as_array_mut()
        .ok_or("models 不是数组")?;

    let already_exists = arr.iter().any(|m|
        m.get("id").and_then(|id| id.as_str()) == Some(&model_id)
    );

    if already_exists {
        return Ok(()); // Already present, no-op
    }

    arr.push(serde_json::json!({
        "id": model_id,
        "name": model_id,
        "reasoning": false,
        "input": ["text"],
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
        "contextWindow": 128000,
        "maxTokens": 8192
    }));

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
