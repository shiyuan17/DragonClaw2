// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::{agents, config, paths};

const MANAGED_SOURCE_FIELD: &str = "dragonclawManagedSource";
const MANAGED_SOURCE_VALUE: &str = "agency-roster";
const MANIFEST_JSON: &str = include_str!("../../src/data/agency-agents.json");
#[cfg(test)]
const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
#[cfg(test)]
const DEFAULT_WORKSPACE_OVERRIDE_ENV: &str = "DRAGONCLAW_DEFAULT_WORKSPACE_DIR";

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgencyManifest {
    roster_zh_raw: String,
    templates: HashMap<String, AgencyTemplate>,
}

#[derive(Debug, Deserialize, Clone)]
struct AgencyTemplate {
    locale: String,
    #[serde(rename = "AGENTS_MD")]
    agents_md: String,
    #[serde(rename = "IDENTITY_MD")]
    identity_md: String,
    #[serde(rename = "SOUL_MD")]
    soul_md: String,
}

#[derive(Debug, Clone)]
struct AgencyManifestData {
    installable_ids: HashSet<String>,
    templates: HashMap<String, AgencyTemplate>,
}

fn agency_manifest() -> &'static AgencyManifestData {
    static CACHE: OnceLock<AgencyManifestData> = OnceLock::new();
    CACHE.get_or_init(|| {
        let parsed: AgencyManifest =
            serde_json::from_str(MANIFEST_JSON).expect("parse agency agent manifest");

        AgencyManifestData {
            installable_ids: parse_installable_ids(&parsed.roster_zh_raw),
            templates: parsed.templates,
        }
    })
}

fn parse_installable_ids(raw: &str) -> HashSet<String> {
    raw.replace("\r\n", "\n")
        .split('\n')
        .filter_map(parse_roster_agent_id)
        .collect()
}

fn parse_roster_agent_id(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with('|') {
        return None;
    }

    let first_cell = trimmed.split('|').nth(1)?.trim();
    let code = first_cell.strip_prefix('`')?.strip_suffix('`')?.trim();
    if code.is_empty() {
        return None;
    }

    if !code
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return None;
    }

    Some(code.to_string())
}

fn agents_dir() -> Result<PathBuf, String> {
    let dir = config::get_user_openclaw_dir()?.join("agents");
    fs::create_dir_all(&dir).map_err(|error| format!("创建 agents 目录失败: {error}"))?;
    Ok(dir)
}

fn resolve_agent_path(agent_id: &str) -> Result<PathBuf, String> {
    Ok(agents_dir()?.join(agent_id))
}

fn managed_workspace_root() -> Result<PathBuf, String> {
    Ok(paths::user_config_dir()?
        .join("workspace-dragonclaw")
        .join("agency-agents"))
}

fn managed_workspace_dir(agent_id: &str) -> Result<PathBuf, String> {
    Ok(managed_workspace_root()?.join(agent_id))
}

fn main_models_path() -> Result<PathBuf, String> {
    Ok(agents_dir()?.join("main").join("agent").join("models.json"))
}

fn current_main_model_id(config_value: &Value) -> Option<String> {
    config_value
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("model"))
        .and_then(|model| model.get("primary"))
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn build_models_payload(config_value: &Value) -> Value {
    let providers = config_value
        .get("models")
        .and_then(|models| models.get("providers"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    json!({
        "providers": providers
    })
}

fn write_models_json(agent_dir: &Path, config_value: &Value) -> Result<(), String> {
    let target_path = agent_dir.join("models.json");
    let source_path = main_models_path()?;

    if source_path.is_file() {
        fs::copy(&source_path, &target_path)
            .map_err(|error| format!("复制主 Agent 模型配置失败: {error}"))?;
        return Ok(());
    }

    let payload = build_models_payload(config_value);
    fs::write(
        &target_path,
        serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("序列化模型配置失败: {error}"))?,
    )
    .map_err(|error| format!("写入模型配置失败: {error}"))
}

fn build_system_prompt(template: &AgencyTemplate) -> String {
    let mut sections = Vec::new();

    for content in [
        &template.agents_md,
        &template.identity_md,
        &template.soul_md,
    ] {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            sections.push(trimmed.to_string());
        }
    }

    sections.join("\n\n")
}

fn write_workspace_templates(
    workspace_dir: &Path,
    template: &AgencyTemplate,
) -> Result<(), String> {
    fs::create_dir_all(workspace_dir).map_err(|error| format!("创建员工工作区失败: {error}"))?;
    fs::write(workspace_dir.join("AGENTS.md"), &template.agents_md)
        .map_err(|error| format!("写入 AGENTS.md 失败: {error}"))?;
    fs::write(workspace_dir.join("IDENTITY.md"), &template.identity_md)
        .map_err(|error| format!("写入 IDENTITY.md 失败: {error}"))?;
    fs::write(workspace_dir.join("SOUL.md"), &template.soul_md)
        .map_err(|error| format!("写入 SOUL.md 失败: {error}"))?;
    Ok(())
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
    let existing_index = list.iter().position(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .map(|value| value.trim() == agent_id)
            .unwrap_or(false)
    });

    let target_index = if let Some(index) = existing_index {
        index
    } else {
        list.push(json!({ "id": agent_id }));
        list.len() - 1
    };

    if !list[target_index].is_object() {
        list[target_index] = Value::Object(Map::new());
    }

    let entry = list[target_index]
        .as_object_mut()
        .ok_or("agent entry should be an object".to_string())?;
    entry
        .entry("id".to_string())
        .or_insert_with(|| Value::String(agent_id.to_string()));
    Ok(entry)
}

fn find_agent_registry_entry<'a>(
    config_value: &'a Value,
    agent_id: &str,
) -> Option<&'a Map<String, Value>> {
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

fn read_agent_workspace_from_registry(config_value: &Value, agent_id: &str) -> Option<PathBuf> {
    find_agent_registry_entry(config_value, agent_id)
        .and_then(|entry| entry.get("workspace"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn is_managed_roster_entry(entry: Option<&Map<String, Value>>) -> bool {
    entry
        .and_then(|value| value.get(MANAGED_SOURCE_FIELD))
        .and_then(Value::as_str)
        .map(|value| value == MANAGED_SOURCE_VALUE)
        .unwrap_or(false)
}

fn upsert_managed_registry_entry(
    config_value: &mut Value,
    agent_id: &str,
    workspace_dir: &Path,
    model_id: Option<&str>,
) -> Result<(), String> {
    let entry = ensure_agent_registry_entry_mut(config_value, agent_id)?;
    entry.insert(
        "workspace".to_string(),
        Value::String(workspace_dir.to_string_lossy().to_string()),
    );
    entry.insert(
        MANAGED_SOURCE_FIELD.to_string(),
        Value::String(MANAGED_SOURCE_VALUE.to_string()),
    );

    if let Some(model_id) = model_id.filter(|value| !value.trim().is_empty()) {
        entry.insert("model".to_string(), json!({ "primary": model_id }));
    }

    Ok(())
}

fn remove_registry_entry(config_value: &mut Value, agent_id: &str) {
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
}

fn remove_agent_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("删除员工 Agent 目录失败: {error}"))?;
    } else {
        fs::remove_file(path).map_err(|error| format!("删除员工 Agent 文件失败: {error}"))?;
    }

    Ok(())
}

fn maybe_delete_managed_workspace(workspace: &Path, agent_id: &str) -> Result<(), String> {
    if !workspace.exists() {
        return Ok(());
    }

    let root = managed_workspace_root()?;
    let root_canonical = if root.exists() {
        root.canonicalize()
            .map_err(|error| format!("解析员工工作区根目录失败: {error}"))?
    } else {
        return Ok(());
    };

    let workspace_canonical = workspace
        .canonicalize()
        .map_err(|error| format!("解析员工工作区失败: {error}"))?;
    let is_target_workspace = workspace_canonical.starts_with(&root_canonical)
        && workspace_canonical
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value == agent_id)
            .unwrap_or(false);

    if is_target_workspace {
        fs::remove_dir_all(workspace).map_err(|error| format!("删除员工工作区失败: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn install_agency_agent(agent_id: String) -> Result<String, String> {
    let normalized_agent_id = agents::normalize_agent_id(&agent_id)?;
    let manifest = agency_manifest();

    if !manifest.installable_ids.contains(&normalized_agent_id) {
        return Err(format!("数字员工 '{normalized_agent_id}' 不在角色库中"));
    }

    let template = manifest
        .templates
        .get(&normalized_agent_id)
        .ok_or_else(|| format!("角色模板缺失: {normalized_agent_id}"))?;
    let agent_path = resolve_agent_path(&normalized_agent_id)?;
    let workspace_dir = managed_workspace_dir(&normalized_agent_id)?;
    let agent_dir = agent_path.join("agent");
    let config_value = config::read_openclaw_config()?;
    let registry_entry = find_agent_registry_entry(&config_value, &normalized_agent_id);
    let managed_entry = is_managed_roster_entry(registry_entry);

    if (registry_entry.is_some() || agent_path.exists()) && !managed_entry {
        return Err(format!(
            "已存在同名 Agent '{normalized_agent_id}'，且不属于角色库托管，已拒绝覆盖"
        ));
    }

    fs::create_dir_all(&agent_dir).map_err(|error| format!("创建员工 Agent 目录失败: {error}"))?;
    write_models_json(&agent_dir, &config_value)?;
    fs::write(agent_dir.join("auth.json"), "{}")
        .map_err(|error| format!("写入 auth.json 失败: {error}"))?;

    let system_prompt = build_system_prompt(template);
    fs::write(
        agent_dir.join("agent.json"),
        serde_json::to_string_pretty(&json!({
            "systemPrompt": system_prompt,
        }))
        .map_err(|error| format!("序列化 agent.json 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 agent.json 失败: {error}"))?;

    write_workspace_templates(&workspace_dir, template)?;

    let mut next_config_value = config_value;
    config::ensure_config_roots(&mut next_config_value);
    config::ensure_gateway_config(&mut next_config_value);
    config::ensure_default_workspace(&mut next_config_value);
    let main_model_id = current_main_model_id(&next_config_value);
    upsert_managed_registry_entry(
        &mut next_config_value,
        &normalized_agent_id,
        &workspace_dir,
        main_model_id.as_deref(),
    )?;
    config::write_openclaw_config(&next_config_value)?;

    Ok(format!(
        "数字员工 '{normalized_agent_id}' 已加入（模板语言: {}）",
        template.locale
    ))
}

#[tauri::command]
pub fn uninstall_agency_agent(agent_id: String) -> Result<String, String> {
    let trimmed = agent_id.trim();
    if trimmed.is_empty() {
        return Ok("数字员工已移除".to_string());
    }

    let normalized_agent_id = match agents::normalize_agent_id(trimmed) {
        Ok(value) => value,
        Err(_) => return Ok("数字员工已移除".to_string()),
    };

    if normalized_agent_id == "main" {
        return Err("默认 Agent 'main' 不可删除".to_string());
    }

    let manifest = agency_manifest();
    if !manifest.installable_ids.contains(&normalized_agent_id) {
        return Ok(format!(
            "数字员工 '{normalized_agent_id}' 不在角色库中，已跳过"
        ));
    }

    let mut config_value = config::read_openclaw_config()?;
    let registry_entry = find_agent_registry_entry(&config_value, &normalized_agent_id);
    if !is_managed_roster_entry(registry_entry) {
        return Ok(format!(
            "数字员工 '{normalized_agent_id}' 未由角色库托管，已跳过"
        ));
    }

    let workspace_dir = read_agent_workspace_from_registry(&config_value, &normalized_agent_id)
        .unwrap_or(managed_workspace_dir(&normalized_agent_id)?);
    let agent_path = resolve_agent_path(&normalized_agent_id)?;

    remove_agent_path(&agent_path)?;
    remove_registry_entry(&mut config_value, &normalized_agent_id);
    config::write_openclaw_config(&config_value)?;
    maybe_delete_managed_workspace(&workspace_dir, &normalized_agent_id)?;

    Ok(format!("数字员工 '{normalized_agent_id}' 已移除"))
}

#[tauri::command]
pub fn load_installed_agency_agent_ids() -> Result<Vec<String>, String> {
    let manifest = agency_manifest();
    let config_value = config::read_openclaw_config()?;
    let list = config_value
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut installed_ids = list
        .iter()
        .filter_map(|item| item.as_object())
        .filter(|entry| is_managed_roster_entry(Some(*entry)))
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|id| manifest.installable_ids.contains(*id))
        .filter_map(|id| {
            let agent_path = resolve_agent_path(id).ok()?;
            if agent_path.is_dir() {
                Some(id.to_string())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    installed_ids.sort();
    Ok(installed_ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("lock env")
    }

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "dragonclaw2-{prefix}-{}-{nonce}",
            std::process::id(),
        ))
    }

    fn with_mock_env<F, R>(config_root: &Path, default_workspace: &Path, run: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _lock = env_lock();
        let previous_config_root = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();
        let previous_workspace = std::env::var(DEFAULT_WORKSPACE_OVERRIDE_ENV).ok();

        unsafe {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, config_root);
            std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, default_workspace);
        }

        let result = run();

        unsafe {
            if let Some(value) = previous_config_root {
                std::env::set_var(USER_CONFIG_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
            }

            if let Some(value) = previous_workspace {
                std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(DEFAULT_WORKSPACE_OVERRIDE_ENV);
            }
        }

        result
    }

    fn write_mock_openclaw_config(config_root: &Path) {
        fs::create_dir_all(config_root).expect("create config root");
        let payload = json!({
            "models": {
                "providers": {
                    "openai": {
                        "baseUrl": "https://api.openai.com/v1",
                        "apiKey": "sk-test",
                        "api": "openai-completions",
                        "models": [
                            {
                                "id": "gpt-5",
                                "name": "GPT-5"
                            }
                        ]
                    }
                }
            },
            "agents": {
                "defaults": {
                    "workspace": config_root.join("workspace-main").to_string_lossy().to_string(),
                    "model": {
                        "primary": "openai/gpt-5"
                    },
                    "models": {
                        "openai/gpt-5": {}
                    }
                }
            }
        });

        fs::write(
            config_root.join("openclaw.json"),
            serde_json::to_string_pretty(&payload).expect("serialize mock config"),
        )
        .expect("write mock config");
    }

    fn write_mock_main_models(config_root: &Path) {
        let main_agent_dir = config_root.join("agents").join("main").join("agent");
        fs::create_dir_all(&main_agent_dir).expect("create main agent dir");
        fs::write(
            main_agent_dir.join("models.json"),
            serde_json::to_string_pretty(&json!({
                "providers": {
                    "openai": {
                        "baseUrl": "https://api.openai.com/v1",
                        "apiKey": "sk-test",
                        "api": "openai-completions",
                        "models": [
                            {
                                "id": "gpt-5",
                                "name": "GPT-5"
                            }
                        ]
                    }
                }
            }))
            .expect("serialize main models"),
        )
        .expect("write main models");
    }

    #[test]
    fn install_and_uninstall_agency_agent_are_idempotent() {
        let temp_root = unique_temp_dir("agency-install");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("workspace-main");

        write_mock_openclaw_config(&config_root);
        write_mock_main_models(&config_root);

        with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            let agent_id = "engineering-autonomous-optimization-architect".to_string();

            install_agency_agent(agent_id.clone()).expect("install agency agent");
            install_agency_agent(agent_id.clone()).expect("reinstall agency agent");

            let installed_ids = load_installed_agency_agent_ids().expect("load installed ids");
            assert!(installed_ids.contains(&agent_id));

            let agent_json_path = config_root
                .join("agents")
                .join(&agent_id)
                .join("agent")
                .join("agent.json");
            assert!(agent_json_path.is_file());

            let workspace_dir = config_root
                .join("workspace-dragonclaw")
                .join("agency-agents")
                .join(&agent_id);
            assert!(workspace_dir.join("AGENTS.md").is_file());
            assert!(workspace_dir.join("IDENTITY.md").is_file());
            assert!(workspace_dir.join("SOUL.md").is_file());

            uninstall_agency_agent(agent_id.clone()).expect("uninstall agency agent");
            uninstall_agency_agent(agent_id.clone()).expect("repeat uninstall agency agent");

            let remaining_ids = load_installed_agency_agent_ids().expect("reload installed ids");
            assert!(!remaining_ids.contains(&agent_id));
            assert!(!config_root.join("agents").join(&agent_id).exists());
            assert!(!workspace_dir.exists());
        });

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn install_agency_agent_refuses_to_override_unmanaged_agent() {
        let temp_root = unique_temp_dir("agency-conflict");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("workspace-main");

        write_mock_openclaw_config(&config_root);
        write_mock_main_models(&config_root);

        with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            let agent_id = "engineering-frontend-developer";
            let unmanaged_agent_dir = config_root.join("agents").join(agent_id).join("agent");
            fs::create_dir_all(&unmanaged_agent_dir).expect("create unmanaged agent dir");

            let result = install_agency_agent(agent_id.to_string());
            assert!(result.is_err());
        });

        let _ = fs::remove_dir_all(temp_root);
    }
}
