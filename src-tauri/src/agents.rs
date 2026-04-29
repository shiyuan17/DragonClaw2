// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{config, paths};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentInfo {
    pub name: String,
    pub model: Option<String>,
    pub has_sessions: bool,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentDetail {
    pub name: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub system_prompt: Option<String>,
    pub has_sessions: bool,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub path: String,
}

pub(crate) fn normalize_agent_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Agent id 不能为空".to_string());
    }
    if trimmed == "main" {
        return Ok("main".to_string());
    }
    if trimmed.len() > 32 {
        return Err("Agent 名称不能超过 32 个字符".to_string());
    }

    let first = trimmed.chars().next().ok_or("Agent id 不能为空")?;
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err("Agent 名称只能包含小写字母、数字和连字符，且必须以字母或数字开头".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return Err("Agent 名称只能包含小写字母、数字和连字符".to_string());
    }

    Ok(trimmed.to_string())
}

fn agents_dir() -> Result<PathBuf, String> {
    let dir = config::get_user_openclaw_dir()?.join("agents");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| format!("创建 agents 目录失败: {error}"))?;
    }
    Ok(dir)
}

fn canonicalize_existing(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("解析路径失败: {error}"))
}

fn ensure_path_within_base(base: &Path, candidate: &Path) -> Result<(), String> {
    let base_canonical = canonicalize_existing(base)?;
    let parent = candidate.parent().ok_or("Invalid agent path")?;
    let parent_canonical = canonicalize_existing(parent)?;

    if !parent_canonical.starts_with(&base_canonical) {
        return Err("Agent 路径越界".to_string());
    }

    if candidate.exists() {
        let candidate_canonical = canonicalize_existing(candidate)?;
        if !candidate_canonical.starts_with(&base_canonical) {
            return Err("Agent 路径越界".to_string());
        }
    }

    Ok(())
}

fn resolve_agent_path(agent_id: &str) -> Result<PathBuf, String> {
    let dir = agents_dir()?;
    let path = dir.join(agent_id);
    ensure_path_within_base(&dir, &path)?;
    Ok(path)
}

fn default_agent_workspace_dir(agent_id: &str) -> Result<PathBuf, String> {
    let dir = paths::user_config_dir()?
        .join("workspace-dragonclaw")
        .join("agency-agents")
        .join(agent_id);
    Ok(dir)
}

fn collect_skills_from_dir(dir: &PathBuf, skills: &mut Vec<SkillInfo>) {
    if !dir.exists() {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }

        let skill_md = entry.path().join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }

        let content = match fs::read_to_string(&skill_md) {
            Ok(content) => content,
            Err(_) => continue,
        };

        let mut skill_name = entry.file_name().to_string_lossy().to_string();
        let mut description = String::new();

        if content.starts_with("---") {
            if let Some(end) = content[3..].find("---") {
                let frontmatter = &content[3..3 + end];
                for line in frontmatter.lines() {
                    let line = line.trim();
                    if let Some(value) = line.strip_prefix("name:") {
                        skill_name = value
                            .trim()
                            .trim_matches('"')
                            .trim_matches('\'')
                            .to_string();
                    } else if let Some(value) = line.strip_prefix("description:") {
                        description = value
                            .trim()
                            .trim_matches('"')
                            .trim_matches('\'')
                            .to_string();
                    }
                }
            }
        }

        if skills
            .iter()
            .any(|skill| skill.name.eq_ignore_ascii_case(&skill_name))
        {
            continue;
        }

        skills.push(SkillInfo {
            name: skill_name,
            description,
            path: entry.path().to_string_lossy().to_string(),
        });
    }
}

fn global_skills_dir() -> Result<PathBuf, String> {
    Ok(config::get_user_openclaw_dir()?.join("skills"))
}

fn workspace_skills_dir() -> Result<PathBuf, String> {
    Ok(paths::main_workspace_dir()?.join("skills"))
}

fn skillhub_workspace_skills_dir() -> Result<PathBuf, String> {
    paths::skillhub_workspace_skills_dir()
}

fn extract_model_from_dir(agent_path: &PathBuf) -> (Option<String>, Option<String>) {
    let models_path = agent_path.join("agent").join("models.json");
    if !models_path.exists() {
        return (None, None);
    }
    let content = match fs::read_to_string(&models_path) {
        Ok(content) => content,
        Err(_) => return (None, None),
    };
    let json: Value = match serde_json::from_str(&content) {
        Ok(value) => value,
        Err(_) => return (None, None),
    };

    let provider = json
        .get("providers")
        .and_then(Value::as_object)
        .and_then(|providers| providers.keys().next().map(|key| key.to_string()));

    let model = json
        .get("providers")
        .and_then(Value::as_object)
        .and_then(|providers| providers.values().next())
        .and_then(|provider| provider.get("models"))
        .and_then(Value::as_array)
        .and_then(|models| models.first())
        .and_then(|model| model.get("id"))
        .and_then(Value::as_str)
        .map(|value| value.to_string());

    (model, provider)
}

fn extract_system_prompt(agent_path: &PathBuf) -> Option<String> {
    let agent_json = agent_path.join("agent").join("agent.json");
    if !agent_json.exists() {
        return None;
    }

    let content = fs::read_to_string(&agent_json).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;
    json.get("systemPrompt")
        .and_then(Value::as_str)
        .map(|value| value.to_string())
}

fn ensure_object_mut<'a>(value: &'a mut Value) -> Result<&'a mut Map<String, Value>, String> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value
        .as_object_mut()
        .ok_or("Config root should be an object".to_string())
}

fn ensure_agent_registry_entry_mut<'a>(
    config_value: &'a mut Value,
    agent_id: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    config::ensure_config_roots(config_value);
    let root = ensure_object_mut(config_value)?;
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

fn sync_agent_registry(
    agent_id: &str,
    model: Option<&str>,
    workspace: &Path,
) -> Result<(), String> {
    let mut config_value = config::read_openclaw_config()?;
    let entry = ensure_agent_registry_entry_mut(&mut config_value, agent_id)?;
    entry.insert(
        "workspace".to_string(),
        Value::String(workspace.to_string_lossy().to_string()),
    );
    if let Some(model_id) = model.filter(|value| !value.trim().is_empty()) {
        entry.insert("model".to_string(), json!({ "primary": model_id }));
    }

    config::ensure_gateway_config(&mut config_value);
    config::ensure_default_workspace(&mut config_value);
    config::write_openclaw_config(&config_value)
}

fn read_agent_workspace_from_registry(agent_id: &str) -> Option<PathBuf> {
    let config_value = config::read_openclaw_config().ok()?;
    let items = config_value
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)?;
    items
        .iter()
        .find(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .map(|value| value.trim() == agent_id)
                .unwrap_or(false)
        })
        .and_then(|item| item.get("workspace"))
        .and_then(Value::as_str)
        .map(PathBuf::from)
}

fn remove_agent_registry(agent_id: &str) -> Result<(), String> {
    let mut config_value = config::read_openclaw_config()?;
    if let Some(list) = config_value
        .get_mut("agents")
        .and_then(|agents| agents.get_mut("list"))
        .and_then(Value::as_array_mut)
    {
        list.retain(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .map(|value| value.trim() != agent_id)
                .unwrap_or(true)
        });
    }

    config::write_openclaw_config(&config_value)
}

fn maybe_delete_managed_workspace(workspace: &Path, agent_id: &str) -> Result<(), String> {
    if !workspace.exists() {
        return Ok(());
    }

    let managed_root = paths::user_config_dir()?
        .join("workspace-dragonclaw")
        .join("agency-agents");
    let managed_root_canonical = if managed_root.exists() {
        managed_root
            .canonicalize()
            .map_err(|error| format!("解析工作区根目录失败: {error}"))?
    } else {
        return Ok(());
    };
    let workspace_canonical = workspace
        .canonicalize()
        .map_err(|error| format!("解析 Agent 工作区失败: {error}"))?;

    if workspace_canonical.starts_with(&managed_root_canonical)
        && workspace_canonical
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value == agent_id)
            .unwrap_or(false)
    {
        fs::remove_dir_all(workspace).map_err(|error| format!("删除 Agent 工作区失败: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_agents() -> Result<Vec<AgentInfo>, String> {
    let dir = agents_dir()?;
    let mut agents = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|error| format!("读取 agents 目录失败: {error}"))?;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let (model, _) = extract_model_from_dir(&entry.path());
        let has_sessions = entry.path().join("sessions").exists();

        agents.push(AgentInfo {
            is_default: name == "main",
            name,
            model,
            has_sessions,
        });
    }

    agents.sort_by(|left, right| {
        if left.is_default {
            return std::cmp::Ordering::Less;
        }
        if right.is_default {
            return std::cmp::Ordering::Greater;
        }
        left.name.cmp(&right.name)
    });

    Ok(agents)
}

#[tauri::command]
pub fn get_agent_detail(name: String) -> Result<AgentDetail, String> {
    let agent_id = normalize_agent_id(&name)?;
    let agent_path = resolve_agent_path(&agent_id)?;

    if !agent_path.exists() {
        return Err(format!("Agent '{agent_id}' 不存在"));
    }

    let (model, provider) = extract_model_from_dir(&agent_path);
    let system_prompt = extract_system_prompt(&agent_path);
    let has_sessions = agent_path.join("sessions").exists();

    Ok(AgentDetail {
        is_default: agent_id == "main",
        name: agent_id,
        model,
        provider,
        system_prompt,
        has_sessions,
    })
}

#[tauri::command]
pub fn create_agent(
    name: String,
    model: Option<String>,
    system_prompt: Option<String>,
) -> Result<(), String> {
    let agent_id = normalize_agent_id(&name)?;
    if agent_id == "main" {
        return Err("不能创建名为 'main' 的 Agent".to_string());
    }

    let agent_path = resolve_agent_path(&agent_id)?;
    if agent_path.exists() {
        return Err(format!("Agent '{agent_id}' 已存在"));
    }

    let agent_dir = agent_path.join("agent");
    fs::create_dir_all(&agent_dir).map_err(|error| format!("创建目录失败: {error}"))?;

    let main_models = agents_dir()?.join("main").join("agent").join("models.json");
    let new_models = agent_dir.join("models.json");
    if main_models.exists() {
        fs::copy(&main_models, &new_models)
            .map_err(|error| format!("复制模型配置失败: {error}"))?;
    }

    if let Some(prompt) = system_prompt {
        let agent_json = json!({
            "systemPrompt": prompt
        });
        fs::write(
            agent_dir.join("agent.json"),
            serde_json::to_string_pretty(&agent_json).unwrap_or_default(),
        )
        .map_err(|error| format!("写入配置失败: {error}"))?;
    }

    fs::write(agent_dir.join("auth.json"), "{}").ok();

    let workspace = default_agent_workspace_dir(&agent_id)?;
    fs::create_dir_all(&workspace).map_err(|error| format!("创建 Agent 工作区失败: {error}"))?;
    sync_agent_registry(&agent_id, model.as_deref(), &workspace)?;

    Ok(())
}

#[tauri::command]
pub fn update_agent(name: String, system_prompt: Option<String>) -> Result<(), String> {
    let agent_id = normalize_agent_id(&name)?;
    let agent_path = resolve_agent_path(&agent_id)?;

    if !agent_path.exists() {
        return Err(format!("Agent '{agent_id}' 不存在"));
    }

    let agent_dir = agent_path.join("agent");
    if let Some(prompt) = system_prompt {
        let agent_json_path = agent_dir.join("agent.json");
        let mut json_value: Value = if agent_json_path.exists() {
            let content = fs::read_to_string(&agent_json_path)
                .map_err(|error| format!("读取配置失败: {error}"))?;
            serde_json::from_str(&content).unwrap_or(json!({}))
        } else {
            json!({})
        };

        json_value["systemPrompt"] = Value::String(prompt);
        fs::write(
            &agent_json_path,
            serde_json::to_string_pretty(&json_value).unwrap_or_default(),
        )
        .map_err(|error| format!("写入配置失败: {error}"))?;
    }

    let workspace = read_agent_workspace_from_registry(&agent_id)
        .unwrap_or(default_agent_workspace_dir(&agent_id)?);
    sync_agent_registry(&agent_id, None, &workspace)?;

    Ok(())
}

#[tauri::command]
pub fn delete_agent(name: String) -> Result<(), String> {
    let agent_id = normalize_agent_id(&name)?;
    if agent_id == "main" {
        return Err("默认 Agent 'main' 不可删除".to_string());
    }

    let agent_path = resolve_agent_path(&agent_id)?;
    if !agent_path.exists() {
        return Err(format!("Agent '{agent_id}' 不存在"));
    }

    let workspace = read_agent_workspace_from_registry(&agent_id)
        .unwrap_or(default_agent_workspace_dir(&agent_id)?);

    fs::remove_dir_all(&agent_path).map_err(|error| format!("删除 Agent 失败: {error}"))?;
    remove_agent_registry(&agent_id)?;
    maybe_delete_managed_workspace(&workspace, &agent_id)?;

    Ok(())
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<SkillInfo>, String> {
    let mut skills = Vec::new();
    if let Ok(dir) = workspace_skills_dir() {
        collect_skills_from_dir(&dir, &mut skills);
    }
    if let Ok(dir) = global_skills_dir() {
        collect_skills_from_dir(&dir, &mut skills);
    }
    if let Ok(dir) = skillhub_workspace_skills_dir() {
        collect_skills_from_dir(&dir, &mut skills);
    }

    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

#[cfg(test)]
mod tests {
    use super::normalize_agent_id;

    #[test]
    fn test_agent_name_validation() {
        assert_eq!(normalize_agent_id("main").unwrap(), "main");
        assert_eq!(normalize_agent_id("my-agent").unwrap(), "my-agent");
        assert_eq!(normalize_agent_id("coder123").unwrap(), "coder123");
        assert!(normalize_agent_id("").is_err());
        assert!(normalize_agent_id("-start").is_err());
        assert!(normalize_agent_id("UPPER").is_err());
        assert!(normalize_agent_id("has space").is_err());
        assert!(normalize_agent_id(&"a".repeat(33)).is_err());
        assert!(normalize_agent_id("../escape").is_err());
    }
}
