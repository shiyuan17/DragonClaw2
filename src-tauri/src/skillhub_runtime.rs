// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::{openclaw_cli, paths};

mod bootstrap;
#[cfg(test)]
mod tests;

use bootstrap::bootstrap_skillhub_windows_native;

const FIND_SKILLS_NAME: &str = "find-skills";
const SKILLHUB_PREFERENCE_NAME: &str = "skillhub-preference";
const SKILLHUB_INSTALLER_URL: &str = "https://skillhub.cn/install/install.sh";
const SKILLHUB_SELF_UPDATE_URL_FALLBACK: &str =
    "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/version.json";

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SkillHubInstallMode {
    BashShell,
    WindowsNative,
    #[default]
    Unavailable,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillHubInstallRuntimeInfo {
    pub bash_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bash_version: Option<String>,
    pub python_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub python_version: Option<String>,
    pub install_mode: SkillHubInstallMode,
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

#[derive(Debug, Clone)]
pub(crate) struct PythonRuntime {
    program: String,
    prefix_args: Vec<String>,
    version: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedSkillHubRuntime {
    pub(crate) info: SkillHubInstallRuntimeInfo,
    pub(crate) python_runtime: Option<PythonRuntime>,
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

pub(crate) fn skillhub_wrapper_file_name_for_target(is_windows: bool) -> &'static str {
    if is_windows {
        "skillhub.cmd"
    } else {
        "skillhub"
    }
}

pub(super) fn skillhub_wrapper_path() -> Result<PathBuf, String> {
    Ok(paths::local_bin_dir()?.join(skillhub_wrapper_file_name_for_target(cfg!(
        target_os = "windows"
    ))))
}

pub(super) fn skillhub_legacy_wrapper_path() -> Result<PathBuf, String> {
    Ok(paths::local_bin_dir()?.join(if cfg!(target_os = "windows") {
        "oc-skills.cmd"
    } else {
        "oc-skills"
    }))
}

pub(super) fn bootstrap_skill_path(name: &str) -> Result<PathBuf, String> {
    Ok(paths::skillhub_workspace_skills_dir()?.join(name).join("SKILL.md"))
}

fn extract_first_output_line(output: &std::process::Output) -> Option<String> {
    let mut combined = trim_output(&output.stdout);
    if combined.is_empty() {
        combined = trim_output(&output.stderr);
    }
    combined
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn detect_bash_version() -> (bool, Option<String>) {
    match Command::new("bash").arg("--version").output() {
        Ok(output) => (output.status.success(), extract_first_output_line(&output)),
        Err(_) => (false, None),
    }
}

fn detect_python_runtime() -> Option<PythonRuntime> {
    let candidates = [("python", Vec::<&str>::new()), ("py", vec!["-3"])];

    for (program, prefix_args) in candidates {
        let mut command = Command::new(program);
        command.args(&prefix_args).arg("--version");
        let output = match command.output() {
            Ok(output) => output,
            Err(_) => continue,
        };

        if !output.status.success() {
            continue;
        }

        return Some(PythonRuntime {
            program: program.to_string(),
            prefix_args: prefix_args.into_iter().map(str::to_string).collect(),
            version: extract_first_output_line(&output),
        });
    }

    None
}

pub(crate) fn resolve_skillhub_install_mode(
    is_windows: bool,
    bash_available: bool,
    python_available: bool,
) -> SkillHubInstallMode {
    if !is_windows {
        return SkillHubInstallMode::BashShell;
    }

    if bash_available {
        SkillHubInstallMode::BashShell
    } else if python_available {
        SkillHubInstallMode::WindowsNative
    } else {
        SkillHubInstallMode::Unavailable
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

pub fn build_runtime_info() -> Result<SkillHubInstallRuntimeInfo, String> {
    Ok(resolve_skillhub_runtime()?.info)
}

pub(crate) fn resolve_skillhub_runtime() -> Result<ResolvedSkillHubRuntime, String> {
    let home_dir = paths::user_home_dir()?;
    let openclaw_config_path = paths::openclaw_config_path()?;
    let workspace_dir = paths::skillhub_workspace_dir()?;
    let workspace_skills_dir = paths::skillhub_workspace_skills_dir()?;
    let skillhub_cli_home_dir = paths::skillhub_cli_home_dir()?;
    let skillhub_wrapper_path = skillhub_wrapper_path()?;
    let skillhub_cli_script_path = skillhub_cli_script_path()?;
    let (bash_available, bash_version) = detect_bash_version();
    let python_runtime = detect_python_runtime();
    let python_available = python_runtime.is_some();
    let python_version = python_runtime
        .as_ref()
        .and_then(|runtime| runtime.version.clone());
    let install_mode = resolve_skillhub_install_mode(
        cfg!(target_os = "windows"),
        bash_available,
        python_available,
    );
    let is_wsl_bash = if bash_available {
        detect_wsl_bash()
    } else {
        false
    };

    Ok(ResolvedSkillHubRuntime {
        info: SkillHubInstallRuntimeInfo {
            bash_available,
            bash_version,
            python_available,
            python_version,
            install_mode,
            is_wsl_bash,
            home_dir: home_dir.to_string_lossy().to_string(),
            openclaw_config_path: openclaw_config_path.to_string_lossy().to_string(),
            workspace_dir: workspace_dir.to_string_lossy().to_string(),
            workspace_skills_dir: workspace_skills_dir.to_string_lossy().to_string(),
            skillhub_cli_home_dir: skillhub_cli_home_dir.to_string_lossy().to_string(),
            skillhub_wrapper_path: skillhub_wrapper_path.to_string_lossy().to_string(),
            skillhub_cli_script_path: skillhub_cli_script_path.to_string_lossy().to_string(),
        },
        python_runtime,
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

pub(super) fn build_runtime_unavailable_message(
    runtime_info: &SkillHubInstallRuntimeInfo,
) -> String {
    if cfg!(target_os = "windows") {
        return "未检测到可用的 bash，也未检测到 Python 3，无法在当前 Windows 环境安装 SkillHub 技能。请先安装 WSL/Git Bash，或安装 Python 3 后重试。".to_string();
    }

    let _ = runtime_info;
    "未检测到可用的 bash，无法运行 SkillHub 安装器。".to_string()
}

pub fn format_runtime_label(runtime_info: &SkillHubInstallRuntimeInfo) -> String {
    match runtime_info.install_mode {
        SkillHubInstallMode::BashShell => {
            let version = runtime_info
                .bash_version
                .clone()
                .unwrap_or_else(|| "available".to_string());
            if runtime_info.is_wsl_bash {
                format!("bash {version} (WSL)")
            } else {
                format!("bash {version}")
            }
        }
        SkillHubInstallMode::WindowsNative => format!(
            "windows-native via {}",
            runtime_info
                .python_version
                .clone()
                .unwrap_or_else(|| "python".to_string())
        ),
        SkillHubInstallMode::Unavailable => {
            if cfg!(target_os = "windows") {
                "unavailable (missing bash and python)".to_string()
            } else {
                "unavailable (missing bash)".to_string()
            }
        }
    }
}

fn run_bash_command(
    runtime_info: &SkillHubInstallRuntimeInfo,
    script: &str,
    timeout: Duration,
    context: &str,
) -> Result<std::process::Output, String> {
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

    openclaw_cli::run_command_with_timeout(&mut command, timeout, context)
}

fn run_bash_command_checked(
    runtime_info: &SkillHubInstallRuntimeInfo,
    script: &str,
    timeout: Duration,
    context: &str,
) -> Result<std::process::Output, String> {
    if runtime_info.install_mode != SkillHubInstallMode::BashShell || !runtime_info.bash_available {
        return Err(build_runtime_unavailable_message(runtime_info));
    }

    run_bash_command(runtime_info, script, timeout, context)
}

fn create_python_command(runtime: &PythonRuntime) -> Command {
    let mut command = Command::new(&runtime.program);
    command.args(&runtime.prefix_args);
    command
}

pub(crate) fn build_skillhub_python_install_args(
    cli_path: &Path,
    install_root: &Path,
    slug: &str,
) -> Vec<String> {
    vec![
        cli_path.to_string_lossy().to_string(),
        "--skip-self-upgrade".to_string(),
        "--dir".to_string(),
        install_root.to_string_lossy().to_string(),
        "install".to_string(),
        slug.trim().to_string(),
        "--force".to_string(),
    ]
}

pub fn official_skillhub_cli_installed() -> bool {
    skillhub_cli_script_path()
        .map(|path| path.is_file())
        .unwrap_or(false)
        || skillhub_wrapper_path()
            .map(|path| path.is_file())
            .unwrap_or(false)
}

pub fn official_bootstrap_skill_installed() -> bool {
    [FIND_SKILLS_NAME, SKILLHUB_PREFERENCE_NAME]
        .iter()
        .filter_map(|name| bootstrap_skill_path(name).ok())
        .any(|path| path.is_file())
}

pub fn validate_official_skillhub_install(
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

pub fn build_command_result(
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

pub(super) fn build_command_result_from_parts(
    runtime_info: SkillHubInstallRuntimeInfo,
    success: bool,
    stdout: impl Into<String>,
    stderr: impl Into<String>,
) -> SkillHubCommandResult {
    SkillHubCommandResult {
        success,
        stdout: stdout.into(),
        stderr: stderr.into(),
        runtime_info,
    }
}

pub(crate) fn ensure_skillhub_cli_installed() -> Result<SkillHubCommandResult, String> {
    let runtime = resolve_skillhub_runtime()?;
    if validate_official_skillhub_install(&runtime.info).is_ok() {
        return Ok(build_command_result_from_parts(
            runtime.info,
            true,
            "SkillHub official installation already present.",
            "",
        ));
    }

    match runtime.info.install_mode {
        SkillHubInstallMode::BashShell => {
            let output = run_bash_command_checked(
                &runtime.info,
                &format!("set -euo pipefail; curl -fsSL {SKILLHUB_INSTALLER_URL} | bash"),
                Duration::from_secs(5 * 60),
                "安装 SkillHub 官方 CLI",
            )?;
            let result = build_command_result(runtime.info.clone(), output);
            if !result.success {
                return Err(format!(
                    "SkillHub 官方安装器执行失败。\nstdout:\n{}\n\nstderr:\n{}",
                    result.stdout, result.stderr
                ));
            }

            validate_official_skillhub_install(&runtime.info).map_err(|error| {
                format!(
                    "{}\nstdout:\n{}\n\nstderr:\n{}",
                    error, result.stdout, result.stderr
                )
            })?;

            Ok(result)
        }
        SkillHubInstallMode::WindowsNative => bootstrap_skillhub_windows_native(&runtime),
        SkillHubInstallMode::Unavailable => Err(build_runtime_unavailable_message(&runtime.info)),
    }
}

pub(crate) fn run_skillhub_install_to_dir(
    runtime: &ResolvedSkillHubRuntime,
    slug: &str,
    install_root: &Path,
    context: &str,
) -> Result<SkillHubCommandResult, String> {
    match runtime.info.install_mode {
        SkillHubInstallMode::BashShell => {
            let cli_script_path = shell_path_for_runtime(
                &PathBuf::from(&runtime.info.skillhub_cli_script_path),
                &runtime.info,
            )?;
            let install_root_shell_path = shell_path_for_runtime(install_root, &runtime.info)?;
            let script = format!(
                "set -euo pipefail; python3 {cli} --skip-self-upgrade --dir {dir} install {slug} --force",
                cli = shell_quote(&cli_script_path),
                slug = shell_quote(slug.trim()),
                dir = shell_quote(&install_root_shell_path),
            );
            let output = run_bash_command_checked(
                &runtime.info,
                &script,
                Duration::from_secs(3 * 60),
                context,
            )?;
            Ok(build_command_result(runtime.info.clone(), output))
        }
        SkillHubInstallMode::WindowsNative => {
            let python_runtime = runtime
                .python_runtime
                .as_ref()
                .ok_or_else(|| build_runtime_unavailable_message(&runtime.info))?;
            let cli_path = PathBuf::from(&runtime.info.skillhub_cli_script_path);
            let args = build_skillhub_python_install_args(&cli_path, install_root, slug);
            let mut command = create_python_command(python_runtime);
            command
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            let output = openclaw_cli::run_command_with_timeout(
                &mut command,
                Duration::from_secs(3 * 60),
                context,
            )?;
            Ok(build_command_result(runtime.info.clone(), output))
        }
        SkillHubInstallMode::Unavailable => Err(build_runtime_unavailable_message(&runtime.info)),
    }
}

pub(crate) fn install_skillhub_skill_to_dir_with_bootstrap(
    slug: &str,
    install_root: &Path,
) -> Result<SkillHubCommandResult, String> {
    let runtime = resolve_skillhub_runtime()?;
    ensure_skillhub_cli_installed()?;

    let normalized_slug = slug.trim().to_string();
    if normalized_slug.is_empty() {
        return Err("技能安装参数不能为空。".to_string());
    }

    fs::create_dir_all(install_root).map_err(|error| format!("创建技能目录失败: {error}"))?;
    run_skillhub_install_to_dir(&runtime, &normalized_slug, install_root, "安装 SkillHub 技能")
}

pub(crate) fn install_official_skillhub_blocking_v2() -> Result<SkillHubCommandResult, String> {
    ensure_skillhub_cli_installed()
}
