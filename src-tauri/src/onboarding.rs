// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::{agents, config, paths};

const FIND_SKILLS_NAME: &str = "find-skills";
const SKILLHUB_PREFERENCE_NAME: &str = "skillhub-preference";
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillHubInstallRuntimeInfo {
    pub bash_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bash_version: Option<String>,
    pub is_wsl_bash: bool,
    pub home_dir: String,
    pub openclaw_config_path: String,
    pub workspace_dir: String,
    pub workspace_skills_dir: String,
    pub skillhub_cli_home_dir: String,
    pub skillhub_wrapper_path: String,
    pub skillhub_cli_script_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillHubCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub runtime_info: SkillHubInstallRuntimeInfo,
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

fn trim_output(value: &[u8]) -> String {
    let text = String::from_utf8_lossy(value).trim().to_string();
    const MAX_CHARS: usize = 4000;
    if text.chars().count() <= MAX_CHARS {
        return text;
    }

    let mut shortened = text.chars().take(MAX_CHARS).collect::<String>();
    shortened.push_str("...");
    shortened
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn skillhub_cli_script_path() -> Result<PathBuf, String> {
    Ok(paths::skillhub_cli_home_dir()?.join("skills_store_cli.py"))
}

fn skillhub_wrapper_path() -> Result<PathBuf, String> {
    Ok(paths::local_bin_dir()?.join("skillhub"))
}

fn detect_bash_version() -> (bool, Option<String>) {
    match Command::new("bash").arg("--version").output() {
        Ok(output) => {
            let mut combined = trim_output(&output.stdout);
            if combined.is_empty() {
                combined = trim_output(&output.stderr);
            }
            let version = combined
                .lines()
                .next()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string);
            (output.status.success(), version)
        }
        Err(_) => (false, None),
    }
}

fn detect_wsl_bash() -> bool {
    if !cfg!(target_os = "windows") {
        return false;
    }

    let output = match Command::new("bash").args(["-lc", "uname -r"]).output() {
        Ok(output) => output,
        Err(_) => return false,
    };

    let combined = format!(
        "{} {}",
        trim_output(&output.stdout).to_ascii_lowercase(),
        trim_output(&output.stderr).to_ascii_lowercase()
    );
    combined.contains("microsoft") || combined.contains("wsl")
}

fn build_runtime_info() -> Result<SkillHubInstallRuntimeInfo, String> {
    let home_dir = paths::user_home_dir()?;
    let openclaw_config_path = paths::openclaw_config_path()?;
    let workspace_dir = paths::skillhub_workspace_dir()?;
    let workspace_skills_dir = paths::skillhub_workspace_skills_dir()?;
    let skillhub_cli_home_dir = paths::skillhub_cli_home_dir()?;
    let skillhub_wrapper_path = skillhub_wrapper_path()?;
    let skillhub_cli_script_path = skillhub_cli_script_path()?;
    let (bash_available, bash_version) = detect_bash_version();
    let is_wsl_bash = if bash_available {
        detect_wsl_bash()
    } else {
        false
    };

    Ok(SkillHubInstallRuntimeInfo {
        bash_available,
        bash_version,
        is_wsl_bash,
        home_dir: home_dir.to_string_lossy().to_string(),
        openclaw_config_path: openclaw_config_path.to_string_lossy().to_string(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        workspace_skills_dir: workspace_skills_dir.to_string_lossy().to_string(),
        skillhub_cli_home_dir: skillhub_cli_home_dir.to_string_lossy().to_string(),
        skillhub_wrapper_path: skillhub_wrapper_path.to_string_lossy().to_string(),
        skillhub_cli_script_path: skillhub_cli_script_path.to_string_lossy().to_string(),
    })
}

fn shell_path_for_runtime(
    path: &Path,
    runtime_info: &SkillHubInstallRuntimeInfo,
) -> Result<String, String> {
    if cfg!(target_os = "windows") && runtime_info.is_wsl_bash {
        return paths::windows_path_to_wsl(path);
    }
    Ok(path.to_string_lossy().to_string())
}

fn build_runtime_env(
    runtime_info: &SkillHubInstallRuntimeInfo,
) -> Result<Vec<(String, String)>, String> {
    let home_dir = PathBuf::from(&runtime_info.home_dir);
    let openclaw_config_path = PathBuf::from(&runtime_info.openclaw_config_path);
    let workspace_dir = PathBuf::from(&runtime_info.workspace_dir);
    let skillhub_config_path =
        PathBuf::from(&runtime_info.skillhub_cli_home_dir).join("config.json");

    Ok(vec![
        (
            "HOME".to_string(),
            shell_path_for_runtime(&home_dir, runtime_info)?,
        ),
        (
            "OPENCLAW_CONFIG_PATH".to_string(),
            shell_path_for_runtime(&openclaw_config_path, runtime_info)?,
        ),
        (
            "OPENCLAW_WORKSPACE".to_string(),
            shell_path_for_runtime(&workspace_dir, runtime_info)?,
        ),
        (
            "SKILLHUB_CONFIG_PATH".to_string(),
            shell_path_for_runtime(&skillhub_config_path, runtime_info)?,
        ),
        ("SKILLHUB_SKIP_SELF_UPGRADE".to_string(), "1".to_string()),
    ])
}

fn run_bash_command(
    runtime_info: &SkillHubInstallRuntimeInfo,
    script: &str,
) -> Result<std::process::Output, String> {
    if !runtime_info.bash_available {
        return Err("bash 不可用，无法运行 SkillHub 官方安装器".to_string());
    }

    let env_vars = build_runtime_env(runtime_info)?;
    let export_prefix = env_vars
        .iter()
        .map(|(key, value)| format!("export {key}={}", shell_quote(value)))
        .collect::<Vec<_>>()
        .join("; ");
    let full_script = format!("{export_prefix}; {script}");

    let mut command = Command::new("bash");
    command.arg("-lc").arg(full_script);

    for (key, value) in env_vars {
        command.env(key, value);
    }

    command
        .output()
        .map_err(|error| format!("运行 SkillHub bash 命令失败: {error}"))
}

fn bootstrap_skill_path(name: &str) -> Result<PathBuf, String> {
    Ok(paths::skillhub_workspace_skills_dir()?
        .join(name)
        .join("SKILL.md"))
}

fn official_skillhub_cli_installed() -> bool {
    skillhub_cli_script_path()
        .map(|path| path.is_file())
        .unwrap_or(false)
        || skillhub_wrapper_path()
            .map(|path| path.is_file())
            .unwrap_or(false)
}

fn official_bootstrap_skill_installed() -> bool {
    [FIND_SKILLS_NAME, SKILLHUB_PREFERENCE_NAME]
        .iter()
        .filter_map(|name| bootstrap_skill_path(name).ok())
        .any(|path| path.is_file())
}

fn validate_official_skillhub_install(
    runtime_info: &SkillHubInstallRuntimeInfo,
) -> Result<(), String> {
    let cli_script_path = PathBuf::from(&runtime_info.skillhub_cli_script_path);
    if !cli_script_path.is_file() {
        return Err(format!(
            "SkillHub 官方 CLI 未安装到预期位置: {}",
            cli_script_path.display()
        ));
    }

    for bootstrap_name in [FIND_SKILLS_NAME, SKILLHUB_PREFERENCE_NAME] {
        let path = bootstrap_skill_path(bootstrap_name)?;
        if !path.is_file() {
            return Err(format!(
                "SkillHub bootstrap 技能未安装到预期位置: {}",
                path.display()
            ));
        }
    }

    Ok(())
}

fn validate_recommended_skill_install(slug: &str) -> Result<(), String> {
    let skill_path = paths::main_workspace_dir()?
        .join("skills")
        .join(slug)
        .join("SKILL.md");
    if skill_path.is_file() {
        return Ok(());
    }

    Err(format!(
        "推荐技能未安装到主工作区 skills 目录: {}",
        skill_path.display()
    ))
}

fn build_command_result(
    runtime_info: SkillHubInstallRuntimeInfo,
    output: std::process::Output,
) -> SkillHubCommandResult {
    SkillHubCommandResult {
        success: output.status.success(),
        stdout: trim_output(&output.stdout),
        stderr: trim_output(&output.stderr),
        runtime_info,
    }
}

#[tauri::command]
pub fn get_skillhub_install_runtime_info() -> Result<SkillHubInstallRuntimeInfo, String> {
    build_runtime_info()
}

#[tauri::command]
pub fn install_official_skillhub() -> Result<SkillHubCommandResult, String> {
    let runtime_info = build_runtime_info()?;
    let output = run_bash_command(
        &runtime_info,
        "set -euo pipefail; curl -fsSL https://skillhub.cn/install/install.sh | bash",
    )?;
    let result = build_command_result(runtime_info.clone(), output);

    if !result.success {
        return Err(format!(
            "SkillHub 官方安装器执行失败。\nstdout:\n{}\n\nstderr:\n{}",
            result.stdout, result.stderr
        ));
    }

    validate_official_skillhub_install(&runtime_info).map_err(|error| {
        format!(
            "{}\nstdout:\n{}\n\nstderr:\n{}",
            error, result.stdout, result.stderr
        )
    })?;

    Ok(result)
}

#[tauri::command]
pub fn install_skillhub_recommended_skill(
    slug: String,
    display_name: String,
) -> Result<SkillHubCommandResult, String> {
    let runtime_info = build_runtime_info()?;
    if !official_skillhub_cli_installed() {
        return Err("SkillHub CLI 尚未安装，无法继续安装推荐技能".to_string());
    }

    let install_root = paths::main_workspace_dir()?.join("skills");
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("创建主工作区 skills 目录失败: {error}"))?;

    let cli_script_path = shell_path_for_runtime(
        &PathBuf::from(&runtime_info.skillhub_cli_script_path),
        &runtime_info,
    )?;
    let install_root_shell_path = shell_path_for_runtime(&install_root, &runtime_info)?;
    let slug = slug.trim().to_string();
    let display_name = display_name.trim().to_string();

    if slug.is_empty() || display_name.is_empty() {
        return Err("推荐技能安装参数不能为空".to_string());
    }

    let script = format!(
        "set -euo pipefail; python3 {cli} --skip-self-upgrade --dir {dir} install {slug} --force",
        cli = shell_quote(&cli_script_path),
        slug = shell_quote(&slug),
        dir = shell_quote(&install_root_shell_path),
    );
    let output = run_bash_command(&runtime_info, &script)?;
    let result = build_command_result(runtime_info, output);

    if !result.success {
        return Err(format!(
            "SkillHub 安装 {display_name} 失败。\nstdout:\n{}\n\nstderr:\n{}",
            result.stdout, result.stderr
        ));
    }

    validate_recommended_skill_install(&slug).map_err(|error| {
        format!(
            "{}\nstdout:\n{}\n\nstderr:\n{}",
            error, result.stdout, result.stderr
        )
    })?;

    Ok(result)
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

    fs::write(&path, serialized).map_err(|error| format!("写入引导技能安装状态失败: {error}"))?;

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
    let installed_names: Vec<String> = installed_skills
        .into_iter()
        .map(|skill| skill.name)
        .collect();

    let bootstrap_skill_present = installed_names.iter().any(|name| {
        is_skill_match(name, FIND_SKILLS_NAME) || is_skill_match(name, SKILLHUB_PREFERENCE_NAME)
    }) || official_bootstrap_skill_installed();
    let skill_hub_installed = official_skillhub_cli_installed() || bootstrap_skill_present;

    let installed_target_skill_count = TARGET_SKILLS
        .iter()
        .filter(|target| {
            installed_names
                .iter()
                .any(|name| is_skill_match(name, target))
        })
        .count();

    let should_backfill =
        !state_file_exists && !skill_hub_installed && installed_target_skill_count == 0;

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
