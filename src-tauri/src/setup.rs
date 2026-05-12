// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/// OpenClaw setup orchestration.
use std::fs;
use std::path::PathBuf;

use serde_json::json;
use tauri::Emitter;

use crate::config;
use crate::config_store::ConfigRepository;
use crate::control_ui;
use crate::download;
use crate::environment;
use crate::installer;
use crate::launcher_state;
use crate::openclaw_cli;
use crate::paths;

const DEFAULT_FREE_MODELS: &[&str] = &[
    "openrouter/google/gemini-2.0-flash-exp:free",
    "openrouter/meta-llama/llama-4-maverick:free",
    "openrouter/microsoft/phi-4-reasoning:free",
    "openrouter/qwen/qwen3-235b-a22b:free",
];

fn ensure_default_agent_models(config_value: &mut serde_json::Value) {
    config::ensure_config_roots(config_value);
    let defaults = &mut config_value["agents"]["defaults"];
    let missing_defaults = defaults
        .get("models")
        .map(|value| value.is_null() || value.as_array().map(|items| items.is_empty()).unwrap_or(false) || value.as_object().map(|items| items.is_empty()).unwrap_or(false))
        .unwrap_or(true);
    if missing_defaults {
        defaults["models"] = json!(DEFAULT_FREE_MODELS);
    }
}

fn migrate_legacy_engine_config_if_needed(app: Option<&tauri::AppHandle>) -> Result<bool, String> {
    let user_config_path = paths::openclaw_config_path()?;
    if user_config_path.exists() {
        return Ok(false);
    }

    let legacy_config_path = paths::engine_dir()?.join("openclaw.json");
    if !legacy_config_path.exists() {
        return Ok(false);
    }

    let legacy_content = fs::read_to_string(&legacy_config_path).unwrap_or_default();
    let mut config_value = serde_json::from_str(&legacy_content).unwrap_or_else(|_| json!({}));
    config::ensure_gateway_config(&mut config_value);
    config::ensure_default_workspace(&mut config_value);
    ensure_default_agent_models(&mut config_value);
    ConfigRepository::replace(&config_value)?;

    if let Some(app_handle) = app {
        let _ = app_handle.emit(
            "setup-progress",
            json!({
                "stage": "config_migrate",
                "message": "已迁移旧版配置到 ~/.openclaw/openclaw.json",
                "percent": 95
            }),
        );
    }

    Ok(true)
}

#[tauri::command]
pub fn check_openclaw_exists() -> Result<bool, String> {
    let dir = paths::engine_dir()?;
    if !dir.join("package.json").exists() {
        return Ok(false);
    }
    Ok(!download::needs_download()?)
}

#[tauri::command]
pub fn check_node_modules_exists() -> Result<bool, String> {
    let dir = paths::engine_dir()?;
    let node_modules = dir.join("node_modules");
    let marker = node_modules.join(".install_complete");
    Ok(node_modules.exists()
        && node_modules.join(".pnpm").exists()
        && marker.exists()
        && installer::has_cli_build_output(&dir))
}

#[tauri::command]
pub fn check_config_exists() -> Result<bool, String> {
    let user_config_path = paths::openclaw_config_path()?;
    if user_config_path.exists() {
        return Ok(true);
    }

    migrate_legacy_engine_config_if_needed(None)
}

#[tauri::command]
pub fn inject_default_config(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<String, String> {
    let _ = migrate_legacy_engine_config_if_needed(Some(&app));

    let existed_before = config::read_openclaw_config()? != json!({});
    let mut resolved_workspace: Option<PathBuf> = None;
    ConfigRepository::update(|config_value| {
        config::ensure_gateway_config(config_value);
        let workspace = if workspace_path
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        {
            config::set_main_workspace(config_value, workspace_path.as_deref())?
        } else {
            config::ensure_default_workspace(config_value);
            paths::main_workspace_dir()?
        };
        ensure_default_agent_models(config_value);
        resolved_workspace = Some(workspace);
        Ok(())
    })?;
    let workspace = resolved_workspace.unwrap_or(paths::main_workspace_dir()?);
    launcher_state::mark_launcher_setup_completed_internal(None)?;

    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "config_inject",
            "message": format!("默认配置已就绪，工作区: {}", workspace.display()),
            "percent": 96
        }),
    );

    if existed_before {
        Ok("Config updated".to_string())
    } else {
        Ok("Config created".to_string())
    }
}

#[tauri::command]
pub fn inject_default_models(app: tauri::AppHandle) -> Result<String, String> {
    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "models_inject",
            "message": "模型配置已就绪 (OpenRouter 免费模型，开箱即用)",
            "percent": 97
        }),
    );

    Ok("Models configured via openclaw.json".to_string())
}

#[tauri::command]
pub fn install_preset_skills(app: tauri::AppHandle) -> Result<String, String> {
    let openclaw_dir = paths::engine_dir()?;
    let skills_dir = openclaw_dir.join("skills");

    if skills_dir.join("skill-creator").join("SKILL.md").exists()
        && skills_dir.join("skill-finder").join("SKILL.md").exists()
    {
        return Ok("Preset skills already installed".to_string());
    }

    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "install_skills",
            "message": "正在安装预置技能包...",
            "percent": 98
        }),
    );

    let skill_creator_md = include_str!("../../docs/skills/skill-creator/SKILL.md");
    let skill_finder_md = include_str!("../../docs/skills/skill-finder/SKILL.md");

    let creator_dir = skills_dir.join("skill-creator");
    let finder_dir = skills_dir.join("skill-finder");
    fs::create_dir_all(&creator_dir)
        .map_err(|error| format!("创建 skill-creator 目录失败: {error}"))?;
    fs::create_dir_all(&finder_dir)
        .map_err(|error| format!("创建 skill-finder 目录失败: {error}"))?;

    fs::write(creator_dir.join("SKILL.md"), skill_creator_md)
        .map_err(|error| format!("写入 skill-creator 失败: {error}"))?;
    fs::write(finder_dir.join("SKILL.md"), skill_finder_md)
        .map_err(|error| format!("写入 skill-finder 失败: {error}"))?;

    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "skills_done",
            "message": "预置技能包安装完成 (skill-creator + skill-finder)",
            "percent": 99
        }),
    );

    Ok(format!(
        "Preset skills installed at: {}",
        skills_dir.display()
    ))
}

#[tauri::command]
pub async fn setup_openclaw(app: tauri::AppHandle) -> Result<String, String> {
    let sandbox = environment::get_sandbox_dir()?;
    match environment::check_disk_space(&sandbox, 500) {
        Ok(false) => {
            return Err(
                "磁盘空间不足，OpenClaw 至少需要 500MB 可用空间，请清理后重试。".to_string(),
            );
        }
        _ => {}
    }

    if let Some(warning) = environment::check_path_compatibility(&sandbox) {
        let _ = app.emit(
            "setup-progress",
            json!({
                "stage": "path_warning",
                "message": warning,
                "percent": 2
            }),
        );
    }

    #[cfg(target_os = "windows")]
    environment::enable_windows_long_paths();

    if !environment::check_node_exists()? {
        environment::download_and_install_node(app.clone()).await?;
    }

    download::download_openclaw_source(app.clone()).await?;
    installer::run_npm_install(app.clone()).await?;

    let app_setup = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        inject_default_config(app_setup.clone(), None)?;
        inject_default_models(app_setup.clone())?;
        install_preset_skills(app_setup)?;
        let _ = openclaw_cli::ensure_openclaw_cli_available()?;
        Ok(())
    })
    .await
    .map_err(|error| format!("安装收尾配置任务调度失败: {error}"))??;
    control_ui::schedule_control_ui_prepare(app.clone());


    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "all_done",
            "message": "OpenClaw 安装完成，可以点击启动了",
            "percent": 100
        }),
    );

    Ok("OpenClaw setup completed successfully".to_string())
}

#[tauri::command]
pub async fn reinstall_environment(app: tauri::AppHandle) -> Result<String, String> {
    let openclaw_dir = paths::engine_dir()?;
    let node_modules = openclaw_dir.join("node_modules");

    if node_modules.exists() {
        let _ = app.emit(
            "setup-progress",
            json!({
                "stage": "cleanup",
                "message": "正在清理旧的依赖目录...",
                "percent": 5
            }),
        );
        tokio::task::spawn_blocking(move || {
            let _ = std::fs::remove_dir_all(&node_modules);
        })
        .await
        .map_err(|error| format!("清理 node_modules 任务调度失败: {error}"))?;
    }

    let _ = app.emit(
        "setup-progress",
        json!({
            "stage": "cleanup",
            "message": "清理完成，开始重新安装...",
            "percent": 10
        }),
    );

    setup_openclaw(app).await
}

#[cfg(test)]
mod tests {
    use super::{
        check_node_modules_exists, ensure_default_agent_models, migrate_legacy_engine_config_if_needed,
        DEFAULT_FREE_MODELS,
    };
    use crate::test_env;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
    const SANDBOX_OVERRIDE_ENV: &str = "DRAGONCLAW_SANDBOX_DIR";

    fn unique_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("dragonclaw-setup-{name}-{}", Uuid::new_v4()))
    }

    fn with_test_dirs<T>(name: &str, run: impl FnOnce(PathBuf, PathBuf) -> T) -> T {
        let _guard = test_env::env_lock();
        let root = unique_temp_dir(name);
        let config_dir = root.join("config");
        let sandbox_dir = root.join("sandbox");
        let previous_config = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();
        let previous_sandbox = std::env::var(SANDBOX_OVERRIDE_ENV).ok();

        unsafe {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, &config_dir);
            std::env::set_var(SANDBOX_OVERRIDE_ENV, &sandbox_dir);
        }

        let result = run(config_dir.clone(), sandbox_dir.clone());

        unsafe {
            if let Some(value) = previous_config {
                std::env::set_var(USER_CONFIG_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
            }

            if let Some(value) = previous_sandbox {
                std::env::set_var(SANDBOX_OVERRIDE_ENV, value);
            } else {
                std::env::remove_var(SANDBOX_OVERRIDE_ENV);
            }
        }

        let _ = fs::remove_dir_all(root);
        result
    }

    #[test]
    fn ensure_default_agent_models_backfills_only_when_missing() {
        let mut missing = json!({});
        ensure_default_agent_models(&mut missing);
        assert_eq!(missing["agents"]["defaults"]["models"], json!(DEFAULT_FREE_MODELS));

        let mut explicit_null = json!({
            "agents": { "defaults": { "models": null } }
        });
        ensure_default_agent_models(&mut explicit_null);
        assert_eq!(explicit_null["agents"]["defaults"]["models"], json!(DEFAULT_FREE_MODELS));

        let mut existing = json!({
            "agents": { "defaults": { "models": ["custom/model"] } }
        });
        ensure_default_agent_models(&mut existing);
        assert_eq!(existing["agents"]["defaults"]["models"], json!(["custom/model"]));
    }

    #[test]
    fn migrate_legacy_engine_config_copies_defaults_into_user_config() {
        with_test_dirs("migrate-legacy", |config_dir, sandbox_dir| {
            let engine_dir = sandbox_dir.join("openclaw-engine");
            fs::create_dir_all(&engine_dir).unwrap();
            fs::write(
                engine_dir.join("openclaw.json"),
                serde_json::to_string_pretty(&json!({
                    "models": {
                        "providers": {}
                    }
                }))
                .unwrap(),
            )
            .unwrap();

            let migrated =
                migrate_legacy_engine_config_if_needed(None).expect("legacy config migration should succeed");
            assert!(migrated);

            let saved = fs::read_to_string(config_dir.join("openclaw.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&saved).unwrap();
            assert!(parsed["gateway"]["auth"]["token"]
                .as_str()
                .map(|token| !token.trim().is_empty())
                .unwrap_or(false));
            assert_eq!(parsed["agents"]["defaults"]["models"], json!(DEFAULT_FREE_MODELS));
        });
    }

    #[test]
    fn migrate_legacy_engine_config_is_noop_when_user_config_exists() {
        with_test_dirs("migrate-noop", |config_dir, sandbox_dir| {
            let engine_dir = sandbox_dir.join("openclaw-engine");
            fs::create_dir_all(&config_dir).unwrap();
            fs::create_dir_all(&engine_dir).unwrap();
            fs::write(config_dir.join("openclaw.json"), "{}").unwrap();
            fs::write(engine_dir.join("openclaw.json"), r#"{"legacy":true}"#).unwrap();

            let migrated =
                migrate_legacy_engine_config_if_needed(None).expect("noop migration should succeed");
            assert!(!migrated);
            assert_eq!(fs::read_to_string(config_dir.join("openclaw.json")).unwrap(), "{}");
        });
    }

    #[test]
    fn check_node_modules_exists_requires_marker_pnpm_and_cli_build_output() {
        with_test_dirs("node-modules-ready", |_config_dir, sandbox_dir| {
            let engine_dir = sandbox_dir.join("openclaw-engine");
            let node_modules = engine_dir.join("node_modules");
            fs::create_dir_all(node_modules.join(".pnpm")).unwrap();
            fs::write(node_modules.join(".install_complete"), "").unwrap();
            fs::create_dir_all(engine_dir.join("dist")).unwrap();
            fs::write(engine_dir.join("dist").join("entry.js"), "").unwrap();

            assert!(check_node_modules_exists().unwrap());

            fs::remove_file(node_modules.join(".install_complete")).unwrap();
            assert!(!check_node_modules_exists().unwrap());
        });
    }
}
