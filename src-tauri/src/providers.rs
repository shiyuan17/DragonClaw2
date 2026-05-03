// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/// Provider data management.
///
/// Loads the provider catalog from providers.json
/// and exposes Tauri commands for provider queries and URL opening.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub base_url: String,
    pub register_url: String,
    pub description: String,
    pub api_type: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub is_free: bool,
    pub context_window: u64,
    pub max_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentConfig {
    pub has_api_key: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub gateway_token: Option<String>,
    pub workspace_path: Option<String>,
}

#[tauri::command]
pub fn get_providers() -> Vec<ProviderInfo> {
    let json_str = include_str!("../resources/providers.json");
    serde_json::from_str(json_str).unwrap_or_else(|error| {
        eprintln!("Failed to parse providers.json: {error}");
        vec![]
    })
}

fn is_allowed_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    normalized.starts_with("https://")
        || normalized.starts_with("http://localhost:")
        || normalized.starts_with("http://127.0.0.1:")
        || normalized.starts_with("http://[::1]:")
}

#[tauri::command]
pub fn open_provider_register(provider_id: String) -> Result<String, String> {
    let providers = get_providers();
    if let Some(provider) = providers.iter().find(|item| item.id == provider_id) {
        open_url(provider.register_url.clone())?;
        Ok(format!("已打开 {} 注册页面", provider.name))
    } else {
        Err(format!("未知的提供商: {provider_id}"))
    }
}

#[tauri::command]
pub fn open_url(url: String) -> Result<String, String> {
    if !is_allowed_url(&url) {
        return Err("仅允许打开 https:// 链接或本地 localhost 控制台地址".to_string());
    }

    open::that(&url).map_err(|error| format!("打开链接失败: {error}"))?;
    Ok(format!("已打开: {url}"))
}
