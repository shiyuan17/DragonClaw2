// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::{agents, config, paths};

const SKILLHUB_NAME: &str = "SkillHub";
const TARGET_SKILLS: &[&str] = &[
    "Summarize",
    "agent browser",
    "imap-smtp-email",
    "opencli",
    "Humanizer",
];

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingSkillInstallResultItem {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingSkillInstallState {
    pub required: bool,
    pub completed: bool,
    pub skipped: bool,
    #[serde(default)]
    pub results: Vec<OnboardingSkillInstallResultItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_attempt_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingSkillInstallDiagnostics {
    pub state_file_exists: bool,
    pub state_required: bool,
    pub state_completed: bool,
    pub main_agent_has_skills: bool,
    pub skill_hub_installed: bool,
    pub installed_target_skill_count: usize,
    pub should_backfill: bool,
}

fn onboarding_state_path() -> Result<PathBuf, String> {
    Ok(paths::user_config_dir()?.join("dragonclaw-onboarding.json"))
}

fn normalize_skill_name(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn is_skill_match(installed_name: &str, expected_name: &str) -> bool {
    let installed = normalize_skill_name(installed_name);
    let expected = normalize_skill_name(expected_name);

    if installed == expected || installed.contains(&expected) || expected.contains(&installed) {
        return true;
    }

    expected_name == "agent browser" && installed.contains("agentbrowser")
}

fn load_state_with_presence() -> Result<(bool, OnboardingSkillInstallState), String> {
    let path = onboarding_state_path()?;
    if !path.exists() {
        return Ok((false, OnboardingSkillInstallState::default()));
    }

    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取引导技能安装状态失败: {error}"))?;
    let state = serde_json::from_str(&content)
        .map_err(|error| format!("解析引导技能安装状态失败: {error}"))?;
    Ok((true, state))
}

fn read_main_agent_skill_names(config_value: &Value) -> Vec<String> {
    config_value
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("id")
                    .and_then(Value::as_str)
                    .map(|value| value.trim() == "main")
                    .unwrap_or(false)
            })
        })
        .and_then(|item| item.get("skills"))
        .and_then(Value::as_array)
        .map(|skills| {
            skills
                .iter()
                .filter_map(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_onboarding_skill_install_state() -> Result<OnboardingSkillInstallState, String> {
    let (_, state) = load_state_with_presence()?;
    Ok(state)
}

#[tauri::command]
pub fn save_onboarding_skill_install_state(
    state: OnboardingSkillInstallState,
) -> Result<OnboardingSkillInstallState, String> {
    let path = onboarding_state_path()?;
    let serialized = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("序列化引导技能安装状态失败: {error}"))?;

    fs::write(&path, serialized)
        .map_err(|error| format!("写入引导技能安装状态失败: {error}"))?;

    Ok(state)
}

#[tauri::command]
pub fn get_onboarding_skill_install_diagnostics(
) -> Result<OnboardingSkillInstallDiagnostics, String> {
    let (state_file_exists, state) = load_state_with_presence()?;
    let config_value = config::read_openclaw_config()?;
    let main_agent_skill_names = read_main_agent_skill_names(&config_value);
    let main_agent_has_skills = !main_agent_skill_names.is_empty();

    let installed_skills = agents::list_skills()?;
    let installed_names: Vec<String> = installed_skills.into_iter().map(|skill| skill.name).collect();

    let skill_hub_installed = installed_names
        .iter()
        .any(|name| is_skill_match(name, SKILLHUB_NAME))
        || main_agent_skill_names
            .iter()
            .any(|name| is_skill_match(name, SKILLHUB_NAME));

    let installed_target_skill_count = TARGET_SKILLS
        .iter()
        .filter(|target| installed_names.iter().any(|name| is_skill_match(name, target)))
        .count();

    let should_backfill = !state_file_exists
        && !main_agent_has_skills
        && !skill_hub_installed
        && installed_target_skill_count == 0;

    Ok(OnboardingSkillInstallDiagnostics {
        state_file_exists,
        state_required: state.required,
        state_completed: state.completed,
        main_agent_has_skills,
        skill_hub_installed,
        installed_target_skill_count,
        should_backfill,
    })
}
