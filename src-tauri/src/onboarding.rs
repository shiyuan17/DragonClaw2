// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::paths;

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

fn onboarding_state_path() -> Result<PathBuf, String> {
    Ok(paths::user_config_dir()?.join("dragonclaw-onboarding.json"))
}

#[tauri::command]
pub fn get_onboarding_skill_install_state() -> Result<OnboardingSkillInstallState, String> {
    let path = onboarding_state_path()?;
    if !path.exists() {
        return Ok(OnboardingSkillInstallState::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取引导技能安装状态失败: {error}"))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("解析引导技能安装状态失败: {error}"))
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
