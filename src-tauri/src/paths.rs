// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/// Unified path management for DragonClaw.
///
/// - Engine source / sandbox paths should use `engine_dir()`
/// - User config paths under `~/.openclaw/` should use `user_config_dir()`
/// - Agent memory workspace roots should use `workspace_root_for_agent()`
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::environment;

const OPENCLAW_DIR_NAME: &str = "openclaw-engine";
const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
const DEFAULT_WORKSPACE_OVERRIDE_ENV: &str = "DRAGONCLAW_DEFAULT_WORKSPACE_DIR";

/// Get path to the local OpenClaw engine directory inside the sandbox.
pub fn engine_dir() -> Result<PathBuf, String> {
    Ok(environment::get_sandbox_dir()?.join(OPENCLAW_DIR_NAME))
}

/// Backwards-compatible alias for the sandbox engine directory.
pub fn get_openclaw_dir() -> Result<PathBuf, String> {
    engine_dir()
}

/// Get the DragonClaw user config directory under `~/.openclaw/`.
pub fn user_config_dir() -> Result<PathBuf, String> {
    if let Some(path) = env_override_path(USER_CONFIG_OVERRIDE_ENV) {
        fs::create_dir_all(&path).map_err(|error| format!("创建用户配置目录失败: {error}"))?;
        return Ok(path);
    }

    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".openclaw");
    fs::create_dir_all(&dir).map_err(|error| format!("创建用户配置目录失败: {error}"))?;
    Ok(dir)
}

/// Get the current user's home directory.
pub fn user_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot determine home directory".to_string())
}

/// Get the path to `~/.openclaw/openclaw.json`.
pub fn openclaw_config_path() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("openclaw.json"))
}

/// Get the path to `~/.openclaw/openclaw-service.json`.
pub fn openclaw_service_state_path() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("openclaw-service.json"))
}

/// Get the path to `~/.openclaw/dragonclaw-launcher.json`.
pub fn dragonclaw_launcher_state_path() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("dragonclaw-launcher.json"))
}

/// Get the path to `~/.openclaw/slash-commands.json`.
pub fn slash_commands_path() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("slash-commands.json"))
}

/// Resolve the workspace that the official SkillHub installer bootstraps into.
pub fn skillhub_workspace_dir() -> Result<PathBuf, String> {
    Ok(user_config_dir()?.join("workspace"))
}

/// Resolve the bootstrap skills directory used by the official SkillHub installer.
pub fn skillhub_workspace_skills_dir() -> Result<PathBuf, String> {
    Ok(skillhub_workspace_dir()?.join("skills"))
}

/// Resolve the official SkillHub CLI home directory.
pub fn skillhub_cli_home_dir() -> Result<PathBuf, String> {
    Ok(user_home_dir()?.join(".skillhub"))
}

/// Resolve the local bin directory where the SkillHub wrapper is installed.
pub fn local_bin_dir() -> Result<PathBuf, String> {
    Ok(user_home_dir()?.join(".local").join("bin"))
}

/// Convert an absolute Windows path into a WSL-style path.
pub fn windows_path_to_wsl(path: &Path) -> Result<String, String> {
    let raw = path.to_string_lossy().replace('\\', "/");
    let bytes = raw.as_bytes();

    if bytes.len() >= 2 && bytes[1] == b':' {
        let drive = raw
            .chars()
            .next()
            .ok_or("Cannot determine Windows drive letter".to_string())?
            .to_ascii_lowercase();
        let suffix = raw[2..].trim_start_matches('/');
        if suffix.is_empty() {
            return Ok(format!("/mnt/{drive}"));
        }
        return Ok(format!("/mnt/{drive}/{suffix}"));
    }

    Ok(raw)
}

/// Resolve the default workspace root used by the main agent.
pub fn default_workspace_dir() -> Result<PathBuf, String> {
    if let Some(path) = env_override_path(DEFAULT_WORKSPACE_OVERRIDE_ENV) {
        return Ok(path);
    }

    Ok(dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Documents"))
        .join("OpenClaw-Projects"))
}

/// Resolve the configured main workspace. Falls back to the default workspace path.
pub fn main_workspace_dir() -> Result<PathBuf, String> {
    if let Some(path) = configured_main_workspace_path() {
        return Ok(path);
    }

    default_workspace_dir()
}

/// Resolve the workspace root for the selected agent.
pub fn workspace_root_for_agent(agent_id: Option<&str>) -> Result<PathBuf, String> {
    let scope = normalize_agent_scope(agent_id);
    if scope == "main" {
        return main_workspace_dir();
    }

    if let Some(configured_path) =
        configured_agent_workspace_path(&scope).filter(|path| path.is_dir())
    {
        return Ok(configured_path);
    }

    let candidates = collect_agent_workspace_candidates(&scope)?;
    if let Some(existing_candidate) = candidates.iter().find(|path| path.is_dir()) {
        return Ok(existing_candidate.clone());
    }

    if let Some(configured_path) = configured_agent_workspace_path(&scope) {
        return Ok(configured_path);
    }

    if let Some(first_candidate) = candidates.into_iter().next() {
        return Ok(first_candidate);
    }

    main_workspace_dir()
}

fn env_override_path(key: &str) -> Option<PathBuf> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn read_openclaw_config() -> Option<Value> {
    let config_path = openclaw_config_path().ok()?;
    if !config_path.is_file() {
        return None;
    }

    let content = fs::read_to_string(config_path).ok()?;
    serde_json::from_str(&content).ok()
}

fn configured_main_workspace_path() -> Option<PathBuf> {
    let config = read_openclaw_config()?;
    let value = config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("workspace"))
        .and_then(Value::as_str)?;

    expand_tilde_path(value)
}

fn configured_agent_workspace_path(agent_id: &str) -> Option<PathBuf> {
    let config = read_openclaw_config()?;
    let target_id = agent_id.trim().to_ascii_lowercase();
    let target_alias = normalize_agent_id_for_matching(agent_id);

    let agents = config
        .get("agents")
        .and_then(|agents| agents.get("list"))
        .and_then(Value::as_array)?;

    let mut alias_match: Option<PathBuf> = None;

    for item in agents {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();
        let workspace = item
            .get("workspace")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(workspace) = workspace else {
            continue;
        };
        let Some(path) = expand_tilde_path(workspace) else {
            continue;
        };

        if id == target_id {
            return Some(path);
        }

        if alias_match.is_none() && normalize_agent_id_for_matching(&id) == target_alias {
            alias_match = Some(path);
        }
    }

    alias_match
}

fn expand_tilde_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed == "~" {
        return dirs::home_dir();
    }

    if let Some(rest) = trimmed.strip_prefix("~/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }

    Some(PathBuf::from(trimmed))
}

fn normalize_agent_scope(agent_id: Option<&str>) -> String {
    let normalized = agent_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
        .unwrap_or_else(|| "main".to_string());

    if normalized == "main" {
        return normalized;
    }

    if is_valid_agent_id(&normalized) {
        normalized
    } else {
        "main".to_string()
    }
}

fn normalize_agent_id_for_matching(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace('_', "-")
}

fn is_valid_agent_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 {
        return false;
    }

    if value.starts_with('-')
        || value.starts_with('_')
        || value.ends_with('-')
        || value.ends_with('_')
        || value.contains("..")
        || value.contains('/')
        || value.contains('\\')
    {
        return false;
    }

    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn collect_agent_scope_variants(scope: &str) -> Vec<String> {
    let normalized = scope.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut variants = vec![normalized.clone()];
    let dashed = normalized.replace('_', "-");
    if dashed != normalized {
        variants.push(dashed.clone());
    }

    let underscored = dashed.replace('-', "_");
    if !variants.iter().any(|item| item == &underscored) {
        variants.push(underscored);
    }

    variants.retain(|item| is_valid_agent_id(item));
    variants
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|path| path == &candidate) {
        paths.push(candidate);
    }
}

fn collect_agent_workspace_candidates(scope: &str) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();
    let config_root = user_config_dir()?;

    for variant in collect_agent_scope_variants(scope) {
        push_unique_path(
            &mut candidates,
            config_root
                .join("workspace-dragonclaw")
                .join("agency-agents")
                .join(&variant),
        );
        push_unique_path(
            &mut candidates,
            config_root.join("agency-agents").join(&variant),
        );
        push_unique_path(
            &mut candidates,
            config_root
                .join("workspace")
                .join("agency-agents")
                .join(&variant),
        );
        push_unique_path(
            &mut candidates,
            config_root.join(format!("workspace-{variant}")),
        );
    }

    Ok(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

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

    fn write_mock_config(
        config_root: &Path,
        main_workspace: Option<&Path>,
        agent_id: Option<&str>,
        agent_workspace: Option<&Path>,
    ) {
        let mut payload = serde_json::json!({});

        if let Some(workspace) = main_workspace {
            payload["agents"]["defaults"]["workspace"] =
                Value::String(workspace.to_string_lossy().to_string());
        }

        if let (Some(id), Some(workspace)) = (agent_id, agent_workspace) {
            payload["agents"]["list"] = serde_json::json!([
                {
                    "id": id,
                    "workspace": workspace.to_string_lossy().to_string(),
                }
            ]);
        }

        fs::create_dir_all(config_root).expect("create config root");
        fs::write(
            config_root.join("openclaw.json"),
            serde_json::to_string_pretty(&payload).expect("serialize config"),
        )
        .expect("write config");
    }

    fn with_mock_env<F, R>(config_root: &Path, default_workspace: &Path, run: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _lock = crate::test_env::env_lock();
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

    #[test]
    fn main_workspace_dir_prefers_configured_workspace() {
        let temp_root = unique_temp_dir("paths-main");
        let config_root = temp_root.join(".openclaw");
        let configured_workspace = temp_root.join("configured-main-workspace");
        let default_workspace = temp_root.join("default-main-workspace");

        write_mock_config(
            config_root.as_path(),
            Some(configured_workspace.as_path()),
            None,
            None,
        );

        let resolved = with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            main_workspace_dir().expect("resolve main workspace")
        });

        assert_eq!(resolved, configured_workspace);
        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn workspace_root_for_agent_prefers_existing_candidate_when_config_workspace_is_missing() {
        let temp_root = unique_temp_dir("paths-agent-candidate");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("default-main-workspace");
        let stale_workspace = temp_root
            .join("configured")
            .join("engineering-frontend-developer");
        let candidate_workspace = config_root
            .join("workspace-dragonclaw")
            .join("agency-agents")
            .join("engineering-frontend-developer");

        fs::create_dir_all(&candidate_workspace).expect("create candidate workspace");
        write_mock_config(
            config_root.as_path(),
            None,
            Some("engineering-frontend-developer"),
            Some(stale_workspace.as_path()),
        );

        let resolved = with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            workspace_root_for_agent(Some("engineering-frontend-developer"))
                .expect("resolve agent workspace")
        });

        assert_eq!(resolved, candidate_workspace);
        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn workspace_root_for_agent_supports_underscore_alias() {
        let temp_root = unique_temp_dir("paths-agent-alias");
        let config_root = temp_root.join(".openclaw");
        let default_workspace = temp_root.join("default-main-workspace");
        let configured_workspace = temp_root
            .join("configured")
            .join("engineering-frontend-developer");

        fs::create_dir_all(&configured_workspace).expect("create configured workspace");
        write_mock_config(
            config_root.as_path(),
            None,
            Some("engineering-frontend-developer"),
            Some(configured_workspace.as_path()),
        );

        let resolved = with_mock_env(config_root.as_path(), default_workspace.as_path(), || {
            workspace_root_for_agent(Some("engineering_frontend_developer"))
                .expect("resolve alias workspace")
        });

        assert_eq!(resolved, configured_workspace);
        let _ = fs::remove_dir_all(temp_root);
    }
}
