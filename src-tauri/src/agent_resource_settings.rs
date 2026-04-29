// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{agents, config, paths};

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
    let config_value = load_openclaw_config()?;
    let selected_skill_names = find_agent_entry(&config_value, &agent_id)
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
    let mut config_value = load_openclaw_config()?;
    let entry = ensure_agent_entry_mut(&mut config_value, &agent_id)?;
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
    write_openclaw_config(&config_value)?;
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
    let config_value = load_openclaw_config()?;
    let tools = find_agent_entry(&config_value, &agent_id)
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
    let previous_config = get_agent_tool_config(agent_id.clone())?;
    let previous_selected = build_selected_tool_names(&previous_config);
    if previous_selected == normalized_tools {
        return Ok(previous_config);
    }

    let mut config_value = load_openclaw_config()?;
    let entry = ensure_agent_entry_mut(&mut config_value, &agent_id)?;

    let tools_value = entry
        .entry("tools".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !tools_value.is_object() {
        *tools_value = Value::Object(Map::new());
    }

    let tools = tools_value
        .as_object_mut()
        .ok_or("Agent tools config should be an object")?;
    let preserved_deny = previous_config
        .deny
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter(|item| !normalized_tools.iter().any(|selected| selected == item))
        .collect::<Vec<_>>();

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

    if !preserved_deny.is_empty() {
        tools.insert(
            "deny".to_string(),
            Value::Array(preserved_deny.iter().cloned().map(Value::String).collect()),
        );
    }

    write_openclaw_config(&config_value)?;

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
        deny: if preserved_deny.is_empty() {
            None
        } else {
            Some(preserved_deny)
        },
    })
}

fn load_openclaw_config() -> Result<Value, String> {
    config::read_openclaw_config()
}

fn write_openclaw_config(config_value: &Value) -> Result<(), String> {
    config::write_openclaw_config(config_value)
}

fn normalize_agent_id(value: &str) -> Result<String, String> {
    agents::normalize_agent_id(value)
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

fn build_selected_tool_names(config_value: &AgentToolConfig) -> Vec<String> {
    let mut selected = if config_value.profile.as_deref() == Some("full") {
        CORE_TOOL_NAMES.iter().map(|item| item.to_string()).collect::<Vec<_>>()
    } else {
        normalize_string_list(config_value.allow.clone().unwrap_or_default())
    };

    for item in normalize_string_list(config_value.also_allow.clone().unwrap_or_default()) {
        if !selected.iter().any(|selected_item| selected_item == &item) {
            selected.push(item);
        }
    }

    let deny = config_value.deny.clone().unwrap_or_default();
    selected.retain(|item| !deny.iter().any(|denied| denied == item));
    selected
}

fn ensure_object_mut<'a>(value: &'a mut Value) -> Result<&'a mut Map<String, Value>, String> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }

    value
        .as_object_mut()
        .ok_or("Config root should be an object".to_string())
}

fn ensure_agent_entry_mut<'a>(
    config_value: &'a mut Value,
    agent_id: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let root = ensure_object_mut(config_value)?;
    let agents_value = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !agents_value.is_object() {
        *agents_value = Value::Object(Map::new());
    }

    let agents_object = agents_value
        .as_object_mut()
        .ok_or("agents should be an object".to_string())?;
    let list_value = agents_object
        .entry("list".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !list_value.is_array() {
        *list_value = Value::Array(Vec::new());
    }

    let list = list_value
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

fn find_agent_entry<'a>(config_value: &'a Value, agent_id: &str) -> Option<&'a Map<String, Value>> {
    config_value
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
