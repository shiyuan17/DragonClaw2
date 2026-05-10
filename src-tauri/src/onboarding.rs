// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

use crate::{
    agents, config, openclaw_cli, paths,
    skillhub_runtime::{
        build_command_result, build_runtime_info, ensure_skillhub_cli_installed,
        format_runtime_label, install_official_skillhub_blocking_v2,
        official_bootstrap_skill_installed, official_skillhub_cli_installed,
        resolve_skillhub_runtime, run_skillhub_install_to_dir, SkillHubCommandResult,
        SkillHubInstallRuntimeInfo,
    },
};

const FIND_SKILLS_NAME: &str = "find-skills";
const SKILLHUB_PREFERENCE_NAME: &str = "skillhub-preference";
static ONBOARDING_BACKGROUND_INSTALL_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OnboardingSkillSource {
    SkillHub,
    GitHub,
}

#[derive(Clone, Copy, Debug)]
struct TargetSkill {
    display_name: &'static str,
    aliases: &'static [&'static str],
    source: OnboardingSkillSource,
    skillhub_slug_candidates: &'static [&'static str],
    github_repo_url: Option<&'static str>,
    github_skill_name: Option<&'static str>,
}

const TARGET_SKILLS: &[TargetSkill] = &[
    TargetSkill {
        display_name: "Summarize",
        aliases: &["Summarize"],
        source: OnboardingSkillSource::SkillHub,
        skillhub_slug_candidates: &["summarize"],
        github_repo_url: None,
        github_skill_name: None,
    },
    TargetSkill {
        display_name: "agent browser",
        aliases: &["agent browser", "agent-browser"],
        source: OnboardingSkillSource::SkillHub,
        skillhub_slug_candidates: &["agent-browser"],
        github_repo_url: None,
        github_skill_name: None,
    },
    TargetSkill {
        display_name: "imap-smtp-email",
        aliases: &["imap-smtp-email"],
        source: OnboardingSkillSource::SkillHub,
        skillhub_slug_candidates: &["imap-smtp-email"],
        github_repo_url: None,
        github_skill_name: None,
    },
    TargetSkill {
        display_name: "Humanizer",
        aliases: &["Humanizer", "humanizer"],
        source: OnboardingSkillSource::SkillHub,
        skillhub_slug_candidates: &["humanizer"],
        github_repo_url: None,
        github_skill_name: None,
    },
    TargetSkill {
        display_name: "opencli-agent",
        aliases: &["opencli-agent", "opencli-adapter-author", "opencli"],
        source: OnboardingSkillSource::GitHub,
        skillhub_slug_candidates: &[],
        github_repo_url: Some("jackwener/opencli"),
        github_skill_name: Some("opencli-adapter-author"),
    },
    TargetSkill {
        display_name: "html-ppt-skill",
        aliases: &["html-ppt-skill", "html-ppt"],
        source: OnboardingSkillSource::GitHub,
        skillhub_slug_candidates: &[],
        github_repo_url: Some("https://github.com/lewislulu/html-ppt-skill"),
        github_skill_name: None,
    },
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

    let opencli_aliases = ["opencliagent", "opencliadapterauthor", "opencli"];
    if opencli_aliases.contains(&installed.as_str()) && opencli_aliases.contains(&expected.as_str())
    {
        return true;
    }

    let html_ppt_aliases = ["htmlpptskill", "htmlppt"];
    if html_ppt_aliases.contains(&installed.as_str())
        && html_ppt_aliases.contains(&expected.as_str())
    {
        return true;
    }

    expected_name == "agent browser" && installed.contains("agentbrowser")
}

fn find_target_skill_by_display_name(display_name: &str) -> Option<&'static TargetSkill> {
    TARGET_SKILLS.iter().find(|target| {
        target
            .display_name
            .eq_ignore_ascii_case(display_name.trim())
    })
}

fn find_target_skill_by_skillhub_slug(slug: &str) -> Option<&'static TargetSkill> {
    TARGET_SKILLS.iter().find(|target| {
        target
            .skillhub_slug_candidates
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(slug.trim()))
    })
}

fn aliases_match_installed_names(installed_names: &[String], aliases: &[&str]) -> bool {
    aliases.iter().any(|alias| {
        installed_names
            .iter()
            .any(|name| is_skill_match(name, alias))
    })
}

fn build_alias_candidates<'a>(
    display_name: &'a str,
    secondary_name: Option<&'a str>,
) -> Vec<&'a str> {
    let mut aliases = Vec::new();
    let trimmed_display_name = display_name.trim();
    if !trimmed_display_name.is_empty() {
        aliases.push(trimmed_display_name);
    }

    if let Some(name) = secondary_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if !aliases.iter().any(|alias| alias.eq_ignore_ascii_case(name)) {
            aliases.push(name);
        }
    }

    aliases
}

fn load_state_with_presence() -> Result<(bool, OnboardingSkillInstallState), String> {
    let path = onboarding_state_path()?;
    if !path.exists() {
        return Ok((false, OnboardingSkillInstallState::default()));
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取引导技能安装状态失败: {error}"))?;
    let state =
        serde_json::from_str(&content).map_err(|error| format!("解析引导技能安装状态失败: {error}"))?;
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

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn create_pending_state() -> OnboardingSkillInstallState {
    OnboardingSkillInstallState {
        required: true,
        completed: false,
        skipped: false,
        results: Vec::new(),
        last_attempt_at: Some(now_ms()),
    }
}

fn build_result_state(
    results: Vec<OnboardingSkillInstallResultItem>,
) -> OnboardingSkillInstallState {
    let completed = !results.is_empty() && results.iter().all(|item| item.status == "installed");
    OnboardingSkillInstallState {
        required: !completed,
        completed,
        skipped: false,
        results,
        last_attempt_at: Some(now_ms()),
    }
}

fn save_onboarding_state_value(
    state: &OnboardingSkillInstallState,
) -> Result<OnboardingSkillInstallState, String> {
    let path = onboarding_state_path()?;
    let serialized = serde_json::to_string_pretty(state)
        .map_err(|error| format!("序列化引导技能安装状态失败: {error}"))?;

    fs::write(&path, serialized).map_err(|error| format!("写入引导技能安装状态失败: {error}"))?;

    Ok(state.clone())
}

fn emit_onboarding_log(app: &tauri::AppHandle, level: &str, message: impl AsRef<str>) {
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": level,
            "message": message.as_ref(),
        }),
    );
}

fn installed_skill_names() -> Vec<String> {
    agents::list_skills()
        .map(|skills| skills.into_iter().map(|skill| skill.name).collect())
        .unwrap_or_default()
}

fn target_skill_installed(installed_names: &[String], target: &TargetSkill) -> bool {
    aliases_match_installed_names(installed_names, target.aliases)
}

fn summarize_command_result(result: &SkillHubCommandResult) -> String {
    let parts = [result.stdout.trim(), result.stderr.trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        "安装完成".to_string()
    } else {
        parts.join("\n\n")
    }
}

fn save_background_results(
    results: &[OnboardingSkillInstallResultItem],
) -> Result<OnboardingSkillInstallState, String> {
    save_onboarding_state_value(&build_result_state(results.to_vec()))
}

fn validate_target_skill_install(aliases: &[&str]) -> Result<(), String> {
    let installed_skills = agents::list_skills()?;
    let installed_names: Vec<String> = installed_skills
        .into_iter()
        .map(|skill| skill.name)
        .collect();

    if aliases_match_installed_names(&installed_names, aliases) {
        return Ok(());
    }

    Err(format!(
        "推荐技能未出现在主工作区技能列表中: {}",
        aliases.join(", ")
    ))
}

fn build_github_skill_install_args(repo_url: &str, skill_name: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "--yes".to_string(),
        "--package".to_string(),
        "skills".to_string(),
        "--".to_string(),
        "skills".to_string(),
        "add".to_string(),
        repo_url.trim().to_string(),
        "-a".to_string(),
        "openclaw".to_string(),
        "--copy".to_string(),
        "-y".to_string(),
    ];

    if let Some(name) = skill_name.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--skill".to_string());
        args.push(name.to_string());
    }

    args
}

fn install_skillhub_recommended_skill_blocking_v2(
    slug: String,
    display_name: String,
) -> Result<SkillHubCommandResult, String> {
    let runtime = resolve_skillhub_runtime()?;
    ensure_skillhub_cli_installed()?;

    let install_root = paths::main_workspace_dir()?.join("skills");
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("创建主工作区 skills 目录失败: {error}"))?;

    let normalized_slug = slug.trim().to_string();
    let normalized_display_name = display_name.trim().to_string();
    if normalized_slug.is_empty() || normalized_display_name.is_empty() {
        return Err("推荐技能安装参数不能为空。".to_string());
    }

    let result = run_skillhub_install_to_dir(
        &runtime,
        &normalized_slug,
        &install_root,
        "安装 SkillHub 推荐技能",
    )?;

    if !result.success {
        return Err(format!(
            "SkillHub 安装 {normalized_display_name} 失败。\nstdout:\n{}\n\nstderr:\n{}",
            result.stdout, result.stderr
        ));
    }

    let alias_candidates = find_target_skill_by_display_name(&normalized_display_name)
        .or_else(|| find_target_skill_by_skillhub_slug(&normalized_slug))
        .map(|target| target.aliases.to_vec())
        .unwrap_or_else(|| build_alias_candidates(&normalized_display_name, Some(&normalized_slug)));

    validate_target_skill_install(&alias_candidates).map_err(|error| {
        format!(
            "{}\nstdout:\n{}\n\nstderr:\n{}",
            error, result.stdout, result.stderr
        )
    })?;

    Ok(result)
}

fn install_github_skill_from_url_blocking(
    repo_url: String,
    display_name: String,
    skill_name: Option<String>,
) -> Result<SkillHubCommandResult, String> {
    let repo_url = repo_url.trim().to_string();
    let display_name = display_name.trim().to_string();
    let trimmed_skill_name = skill_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if repo_url.is_empty() || display_name.is_empty() {
        return Err("GitHub 技能安装参数不能为空。".to_string());
    }

    let known_target = find_target_skill_by_display_name(&display_name)
        .filter(|target| target.source == OnboardingSkillSource::GitHub);
    if let Some(target) = known_target {
        if let Some(expected_repo_url) = target.github_repo_url {
            if expected_repo_url != repo_url {
                return Err(format!(
                    "GitHub 技能仓库与预期不一致: expected {}, got {}",
                    expected_repo_url, repo_url
                ));
            }
        }

        let expected_skill_name = target.github_skill_name.map(str::trim);
        let actual_skill_name = trimmed_skill_name.as_deref().map(str::trim);
        if expected_skill_name != actual_skill_name {
            return Err(format!(
                "GitHub 技能名与预期不一致: expected {:?}, got {:?}",
                expected_skill_name, actual_skill_name
            ));
        }
    }

    let runtime_info = build_runtime_info()?;
    let workspace_dir = paths::main_workspace_dir()?;
    fs::create_dir_all(&workspace_dir)
        .map_err(|error| format!("创建主工作区目录失败: {error}"))?;

    let mut command = openclaw_cli::create_bundled_npm_cli_command()
        .map_err(|error| format!("构建 npm 命令失败: {error}"))?;
    let args = build_github_skill_install_args(&repo_url, trimmed_skill_name.as_deref());
    command
        .args(&args)
        .current_dir(&workspace_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = openclaw_cli::run_command_with_timeout(
        &mut command,
        Duration::from_secs(5 * 60),
        "安装 GitHub 技能",
    )?;
    let result = build_command_result(runtime_info, output);

    if !result.success {
        return Err(format!(
            "GitHub 安装 {display_name} 失败。\nstdout:\n{}\n\nstderr:\n{}",
            result.stdout, result.stderr
        ));
    }

    let alias_candidates = known_target
        .map(|target| target.aliases.to_vec())
        .unwrap_or_else(|| build_alias_candidates(&display_name, trimmed_skill_name.as_deref()));

    validate_target_skill_install(&alias_candidates).map_err(|error| {
        format!(
            "{}\nstdout:\n{}\n\nstderr:\n{}",
            error, result.stdout, result.stderr
        )
    })?;

    Ok(result)
}

fn push_background_result(
    app: &tauri::AppHandle,
    results: &mut Vec<OnboardingSkillInstallResultItem>,
    item: OnboardingSkillInstallResultItem,
) {
    results.push(item);
    if let Err(error) = save_background_results(results) {
        emit_onboarding_log(
            app,
            "warn",
            format!("Onboarding skill install state save failed: {error}"),
        );
    }
}

fn fail_pending_background_targets(
    app: &tauri::AppHandle,
    results: &mut Vec<OnboardingSkillInstallResultItem>,
    detail: String,
) {
    for name in
        std::iter::once("SkillHub").chain(TARGET_SKILLS.iter().map(|target| target.display_name))
    {
        if !results.iter().any(|item| item.name == name) {
            push_background_result(
                app,
                results,
                OnboardingSkillInstallResultItem {
                    name: name.to_string(),
                    status: "failed".to_string(),
                    detail: Some(detail.clone()),
                },
            );
        }
    }
}

fn run_onboarding_skill_install_background(app: tauri::AppHandle) {
    let mut results: Vec<OnboardingSkillInstallResultItem> = Vec::new();
    emit_onboarding_log(
        &app,
        "info",
        "Onboarding recommended skill install is running in the background.",
    );

    if let Err(error) = save_onboarding_state_value(&create_pending_state()) {
        emit_onboarding_log(
            &app,
            "error",
            format!("Onboarding skill install state init failed: {error}"),
        );
        return;
    }

    match build_runtime_info() {
        Ok(runtime_info) => {
            let runtime_label = format_runtime_label(&runtime_info);
            emit_onboarding_log(
                &app,
                "info",
                format!("SkillHub installer runtime: {runtime_label}"),
            );
        }
        Err(error) => {
            emit_onboarding_log(
                &app,
                "error",
                format!("SkillHub runtime check failed: {error}"),
            );
            fail_pending_background_targets(&app, &mut results, error);
            return;
        }
    }

    emit_onboarding_log(&app, "info", "开始安装 SkillHub 官方 CLI。");
    match install_official_skillhub_blocking_v2() {
        Ok(result) => {
            push_background_result(
                &app,
                &mut results,
                OnboardingSkillInstallResultItem {
                    name: "SkillHub".to_string(),
                    status: "installed".to_string(),
                    detail: Some(summarize_command_result(&result)),
                },
            );
            emit_onboarding_log(&app, "success", "SkillHub 官方安装完成。");
        }
        Err(error) => {
            emit_onboarding_log(&app, "error", format!("SkillHub 官方安装失败: {error}"));
            push_background_result(
                &app,
                &mut results,
                OnboardingSkillInstallResultItem {
                    name: "SkillHub".to_string(),
                    status: "failed".to_string(),
                    detail: Some(error.clone()),
                },
            );

            for target in TARGET_SKILLS {
                push_background_result(
                    &app,
                    &mut results,
                    OnboardingSkillInstallResultItem {
                        name: target.display_name.to_string(),
                        status: "failed".to_string(),
                        detail: Some("SkillHub 官方安装未完成，后续技能安装未执行。".to_string()),
                    },
                );
            }
            return;
        }
    }

    if get_onboarding_skill_install_diagnostics()
        .map(|diagnostics| !diagnostics.skill_hub_installed)
        .unwrap_or(false)
    {
        emit_onboarding_log(
            &app,
            "warn",
            "SkillHub 安装命令已返回成功，但诊断尚未确认官方安装产物。",
        );
    }

    let mut installed_names = installed_skill_names();
    for target in TARGET_SKILLS {
        if target_skill_installed(&installed_names, target) {
            push_background_result(
                &app,
                &mut results,
                OnboardingSkillInstallResultItem {
                    name: target.display_name.to_string(),
                    status: "installed".to_string(),
                    detail: Some("已在本地技能目录中检测到该技能。".to_string()),
                },
            );
            emit_onboarding_log(
                &app,
                "info",
                format!("{} 已存在，跳过重复安装。", target.display_name),
            );
            continue;
        }

        let installer_label = if target.source == OnboardingSkillSource::GitHub {
            "GitHub"
        } else {
            "SkillHub"
        };
        emit_onboarding_log(
            &app,
            "info",
            format!("开始通过 {installer_label} 安装 {}", target.display_name),
        );

        let install_result = match target.source {
            OnboardingSkillSource::GitHub => {
                let repo_url = target.github_repo_url.unwrap_or_default().to_string();
                install_github_skill_from_url_blocking(
                    repo_url,
                    target.display_name.to_string(),
                    target.github_skill_name.map(str::to_string),
                )
            }
            OnboardingSkillSource::SkillHub => {
                let slug = target
                    .skillhub_slug_candidates
                    .iter()
                    .find(|candidate| !candidate.trim().is_empty())
                    .copied()
                    .unwrap_or_default()
                    .to_string();
                install_skillhub_recommended_skill_blocking_v2(slug, target.display_name.to_string())
            }
        };

        match install_result {
            Ok(result) => {
                push_background_result(
                    &app,
                    &mut results,
                    OnboardingSkillInstallResultItem {
                        name: target.display_name.to_string(),
                        status: "installed".to_string(),
                        detail: Some(summarize_command_result(&result)),
                    },
                );
                emit_onboarding_log(&app, "success", format!("{} 安装完成", target.display_name));
            }
            Err(error) => {
                push_background_result(
                    &app,
                    &mut results,
                    OnboardingSkillInstallResultItem {
                        name: target.display_name.to_string(),
                        status: "failed".to_string(),
                        detail: Some(error.clone()),
                    },
                );
                emit_onboarding_log(
                    &app,
                    "error",
                    format!("{} 安装失败: {error}", target.display_name),
                );
            }
        }

        installed_names = installed_skill_names();
    }

    let completed = results.iter().all(|item| item.status == "installed");
    emit_onboarding_log(
        &app,
        if completed { "success" } else { "warn" },
        if completed {
            "推荐技能后台安装完成。".to_string()
        } else {
            "推荐技能后台安装结束，部分技能安装失败。".to_string()
        },
    );
}

#[tauri::command]
pub async fn get_skillhub_install_runtime_info() -> Result<SkillHubInstallRuntimeInfo, String> {
    tokio::task::spawn_blocking(build_runtime_info)
        .await
        .map_err(|error| format!("SkillHub 运行时信息收集任务调度失败: {error}"))?
}

#[tauri::command]
pub async fn install_official_skillhub() -> Result<SkillHubCommandResult, String> {
    tokio::task::spawn_blocking(install_official_skillhub_blocking_v2)
        .await
        .map_err(|error| format!("SkillHub 官方安装任务调度失败: {error}"))?
}

#[tauri::command]
pub async fn install_skillhub_recommended_skill(
    slug: String,
    display_name: String,
) -> Result<SkillHubCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        install_skillhub_recommended_skill_blocking_v2(slug, display_name)
    })
    .await
    .map_err(|error| format!("SkillHub 技能安装任务调度失败: {error}"))?
}

#[tauri::command]
pub async fn install_github_skill_from_url(
    repo_url: String,
    display_name: String,
    skill_name: Option<String>,
) -> Result<SkillHubCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        install_github_skill_from_url_blocking(repo_url, display_name, skill_name)
    })
    .await
    .map_err(|error| format!("GitHub 技能安装任务调度失败: {error}"))?
}

#[tauri::command]
pub fn start_onboarding_skill_install_background(
    app: tauri::AppHandle,
) -> Result<OnboardingSkillInstallState, String> {
    let (_, state) = load_state_with_presence()?;
    if !state.required || state.completed || state.skipped {
        return Ok(state);
    }

    if ONBOARDING_BACKGROUND_INSTALL_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(state);
    }

    let pending_state = save_onboarding_state_value(&create_pending_state()).map_err(|error| {
        ONBOARDING_BACKGROUND_INSTALL_RUNNING.store(false, Ordering::SeqCst);
        error
    })?;

    tauri::async_runtime::spawn(async move {
        let result = tokio::task::spawn_blocking(move || {
            run_onboarding_skill_install_background(app);
        })
        .await;

        if let Err(error) = result {
            eprintln!("Onboarding skill install background task failed: {error}");
        }
        ONBOARDING_BACKGROUND_INSTALL_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(pending_state)
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
    save_onboarding_state_value(&state)
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
        .filter(|target| aliases_match_installed_names(&installed_names, target.aliases))
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

#[cfg(test)]
mod tests {
    use super::{build_github_skill_install_args, is_skill_match};

    #[test]
    fn skill_alias_matching_supports_opencli_agent_chain() {
        assert!(is_skill_match("opencli-agent", "opencli-agent"));
        assert!(is_skill_match("opencli-adapter-author", "opencli-agent"));
        assert!(is_skill_match("opencli", "opencli-agent"));
    }

    #[test]
    fn skill_alias_matching_supports_html_ppt_variants() {
        assert!(is_skill_match("html-ppt-skill", "html-ppt-skill"));
        assert!(is_skill_match("html-ppt", "html-ppt-skill"));
    }

    #[test]
    fn github_install_args_include_openclaw_copy_flags_and_skill_name() {
        let args =
            build_github_skill_install_args("jackwener/opencli", Some("opencli-adapter-author"));

        assert_eq!(
            args,
            vec![
                "exec",
                "--yes",
                "--package",
                "skills",
                "--",
                "skills",
                "add",
                "jackwener/opencli",
                "-a",
                "openclaw",
                "--copy",
                "-y",
                "--skill",
                "opencli-adapter-author",
            ]
        );
    }

    #[test]
    fn github_install_args_omit_skill_flag_when_not_provided() {
        let args =
            build_github_skill_install_args("https://github.com/lewislulu/html-ppt-skill", None);

        assert_eq!(
            args,
            vec![
                "exec",
                "--yes",
                "--package",
                "skills",
                "--",
                "skills",
                "add",
                "https://github.com/lewislulu/html-ppt-skill",
                "-a",
                "openclaw",
                "--copy",
                "-y",
            ]
        );
    }
}

