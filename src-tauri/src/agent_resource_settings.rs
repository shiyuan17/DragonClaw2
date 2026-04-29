// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use crate::{config, paths};

const CORE_TOOL_NAMES: &[&str] = &[
    "browser",
    "canvas",
    "nodes",
    "cron",
    "message",
    "gateway",
    "agents_list",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "session_status",
    "memory_search",
    "memory_get",
    "web_search",
    "web_fetch",
    "image",
    "read",
    "write",
    "edit",
    "apply_patch",
    "exec",
    "process",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillConfig {
    pub agent_id: String,
    pub selected_skill_names: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillSaveResult {
    pub agent_id: String,
    pub selected_skill_names: Vec<String>,
    pub applies_on_next_message: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolConfig {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub also_allow: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deny: Option<Vec<String>>,
}

#[tauri::command]
pub fn get_agent_skill_config(agent_id: String) -> Result<AgentSkillConfig, String> {
    let agent_id = normalize_agent_id(&agent_id)?;
    let config = load_openclaw_config()?;
    let selected_skill_names = find_agent_entry(&config, &agent_id)
        .and_then(|entry| entry.get("skills"))
        .and_then(Value::as_array)
        .map(|values| read_string_array(values))
        .unwrap_or_default();

    Ok(AgentSkillConfig {
        agent_id,
        selected_skill_names,
    })
}

#[tauri::command]
pub fn save_agent_skill_config(
    agent_id: String,
    skill_names: Vec<String>,
) -> Result<AgentSkillSaveResult, String> {
    let agent_id = normalize_agent_id(&agent_id)?;
    let selected_skill_names = normalize_string_list(skill_names);
    let mut config = load_openclaw_config()?;
    let entry = ensure_agent_entry_mut(&mut config, &agent_id)?;
    entry.insert(
        "skills".to_string(),
        Value::Array(
            selected_skill_names
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    write_openclaw_config(&config)?;
    clear_agent_main_session_skills_snapshot(&agent_id);

    Ok(AgentSkillSaveResult {
        agent_id,
        selected_skill_names,
        applies_on_next_message: true,
    })
}

#[tauri::command]
pub fn get_agent_tool_config(agent_id: String) -> Result<AgentToolConfig, String> {
    let agent_id = normalize_agent_id(&agent_id)?;
    let config = load_openclaw_config()?;
    let tools = find_agent_entry(&config, &agent_id)
        .and_then(|entry| entry.get("tools"))
        .and_then(Value::as_object);

    Ok(AgentToolConfig {
        agent_id,
        profile: tools
            .and_then(|value| value.get("profile"))
            .and_then(Value::as_str)
            .map(|value| value.to_string()),
        allow: tools
            .and_then(|value| value.get("allow"))
            .and_then(Value::as_array)
            .map(|values| read_string_array(values)),
        also_allow: tools
            .and_then(|value| value.get("alsoAllow"))
            .and_then(Value::as_array)
            .map(|values| read_string_array(values)),
        deny: tools
            .and_then(|value| value.get("deny"))
            .and_then(Value::as_array)
            .map(|values| read_string_array(values)),
    })
}

#[tauri::command]
pub fn save_agent_tool_config(
    agent_id: String,
    selected_tool_names: Vec<String>,
) -> Result<AgentToolConfig, String> {
    let agent_id = normalize_agent_id(&agent_id)?;
    let normalized_tools = normalize_string_list(selected_tool_names);
    let mut config = load_openclaw_config()?;
    let entry = ensure_agent_entry_mut(&mut config, &agent_id)?;

    let tools_value = entry
        .entry("tools".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !tools_value.is_object() {
        *tools_value = Value::Object(Map::new());
    }

    let tools = tools_value
        .as_object_mut()
        .ok_or("Agent tools config should be an object")?;
    tools.remove("profile");
    tools.remove("allow");
    tools.remove("alsoAllow");
    tools.remove("deny");

    let has_unknown_tool = normalized_tools
        .iter()
        .any(|name| !CORE_TOOL_NAMES.contains(&name.as_str()));
    let full_selection = !has_unknown_tool
        && normalized_tools.len() == CORE_TOOL_NAMES.len()
        && CORE_TOOL_NAMES
            .iter()
            .all(|tool| normalized_tools.iter().any(|item| item == tool));

    if full_selection {
        tools.insert("profile".to_string(), Value::String("full".to_string()));
    } else {
        tools.insert(
            "allow".to_string(),
            Value::Array(normalized_tools.iter().cloned().map(Value::String).collect()),
        );
    }

    write_openclaw_config(&config)?;

    Ok(AgentToolConfig {
        agent_id,
        profile: if full_selection {
            Some("full".to_string())
        } else {
            None
        },
        allow: if full_selection {
            None
        } else {
            Some(normalized_tools)
        },
        also_allow: None,
        deny: None,
    })
}

fn load_openclaw_config() -> Result<Value, String> {
    let config_path = config::get_user_openclaw_dir()?.join("openclaw.json");
    if !config_path.exists() {
        return Ok(json!({}));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| format!("读取 openclaw.json 失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 openclaw.json 失败: {error}"))
}

fn write_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = config::get_user_openclaw_dir()?.join("openclaw.json");
    let serialized = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化 openclaw.json 失败: {error}"))?;
    fs::write(&config_path, serialized)
        .map_err(|error| format!("写入 openclaw.json 失败: {error}"))
}

fn normalize_agent_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Agent id 不能为空".to_string());
    }

    Ok(trimmed.to_ascii_lowercase())
}

fn normalize_string_list(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }

        let owned = trimmed.to_string();
        if seen.insert(owned.clone()) {
            normalized.push(owned);
        }
    }

    normalized
}

fn read_string_array(values: &[Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn ensure_object_mut<'a>(value: &'a mut Value) -> Result<&'a mut Map<String, Value>, String> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }

    value.as_object_mut().ok_or("Config root should be an object".to_string())
}

fn ensure_agent_entry_mut<'a>(
    config: &'a mut Value,
    agent_id: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let root = ensure_object_mut(config)?;
    let agents = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !agents.is_object() {
        *agents = Value::Object(Map::new());
    }

    let agents_object = agents
        .as_object_mut()
        .ok_or("agents should be an object".to_string())?;
    let list = agents_object
        .entry("list".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !list.is_array() {
        *list = Value::Array(Vec::new());
    }

    let list = list
        .as_array_mut()
        .ok_or("agents.list should be an array".to_string())?;
    let target_index = list.iter().position(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .map(|value| value.trim() == agent_id)
            .unwrap_or(false)
    });

    let index = if let Some(index) = target_index {
        index
    } else {
        list.push(json!({ "id": agent_id }));
        list.len() - 1
    };

    if !list[index].is_object() {
        list[index] = Value::Object(Map::new());
    }

    let entry = list[index]
        .as_object_mut()
        .ok_or("agent entry should be an object".to_string())?;
    entry
        .entry("id".to_string())
        .or_insert_with(|| Value::String(agent_id.to_string()));
    Ok(entry)
}

fn find_agent_entry<'a>(config: &'a Value, agent_id: &str) -> Option<&'a Map<String, Value>> {
    config
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("id")
                    .and_then(Value::as_str)
                    .map(|value| value.trim() == agent_id)
                    .unwrap_or(false)
            })
        })
        .and_then(Value::as_object)
}

fn clear_agent_main_session_skills_snapshot(agent_id: &str) {
    let _ = clear_agent_main_session_skills_snapshot_inner(agent_id);
}

fn clear_agent_main_session_skills_snapshot_inner(agent_id: &str) -> Result<(), String> {
    let sessions_path = resolve_agent_sessions_path(agent_id)?;
    if !sessions_path.is_file() {
        return Ok(());
    }

    let content = fs::read_to_string(&sessions_path)
        .map_err(|error| format!("读取 session store 失败: {error}"))?;
    let mut store: Value = serde_json::from_str(&content)
        .map_err(|error| format!("解析 session store 失败: {error}"))?;
    let session_key = format!("agent:{agent_id}:main");

    let Some(entry) = store.get_mut(&session_key).and_then(Value::as_object_mut) else {
        return Ok(());
    };

    if entry.remove("skillsSnapshot").is_none() {
        return Ok(());
    }

    let serialized = serde_json::to_string_pretty(&store)
        .map_err(|error| format!("序列化 session store 失败: {error}"))?;
    fs::write(&sessions_path, serialized)
        .map_err(|error| format!("写入 session store 失败: {error}"))?;
    Ok(())
}

fn resolve_agent_sessions_path(agent_id: &str) -> Result<PathBuf, String> {
    Ok(paths::user_config_dir()?
        .join("agents")
        .join(agent_id)
        .join("sessions")
        .join("sessions.json"))
}
