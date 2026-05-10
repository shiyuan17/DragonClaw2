use flate2::read::GzDecoder;
use regex_lite::Regex;
use serde_json::Value;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tar::Archive;

use crate::paths;

use super::{
    bootstrap_skill_path, build_command_result_from_parts, build_runtime_unavailable_message,
    skillhub_legacy_wrapper_path, skillhub_wrapper_path, validate_official_skillhub_install,
    ResolvedSkillHubRuntime, SkillHubCommandResult, FIND_SKILLS_NAME, SKILLHUB_PREFERENCE_NAME,
    SKILLHUB_SELF_UPDATE_URL_FALLBACK,
};

fn blocking_get_text(url: &str) -> Result<String, String> {
    let response =
        reqwest::blocking::get(url).map_err(|error| format!("下载 SkillHub 文本资源失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载 SkillHub 文本资源失败 ({status}): {url}"));
    }

    response
        .text()
        .map_err(|error| format!("读取 SkillHub 文本资源失败: {error}"))
}

fn blocking_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response =
        reqwest::blocking::get(url).map_err(|error| format!("下载 SkillHub 安装包失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载 SkillHub 安装包失败 ({status}): {url}"));
    }

    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("读取 SkillHub 安装包失败: {error}"))
}

pub(super) fn parse_skillhub_kit_url(installer_script: &str) -> Result<String, String> {
    let regex = Regex::new(r#"(?m)^KIT_URL="([^"]+)""#)
        .map_err(|error| format!("解析 SkillHub KIT_URL 规则失败: {error}"))?;
    regex
        .captures(installer_script)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "无法从 SkillHub 官方安装脚本中解析 KIT_URL。".to_string())
}

fn parse_skillhub_self_update_url(installer_script: &str) -> Option<String> {
    let regex = Regex::new(r#""self_update_url":\s*"([^"]+)""#).ok()?;
    regex
        .captures(installer_script)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
}

fn extract_skillhub_install_kit(destination_dir: &Path, archive_bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(destination_dir)
        .map_err(|error| format!("创建 SkillHub 临时目录失败: {error}"))?;
    let decoder = GzDecoder::new(Cursor::new(archive_bytes));
    let mut archive = Archive::new(decoder);
    archive
        .unpack(destination_dir)
        .map_err(|error| format!("解压 SkillHub 安装包失败: {error}"))
}

fn locate_skillhub_cli_source_dir(root: &Path) -> Result<PathBuf, String> {
    let mut stack = vec![root.to_path_buf()];

    while let Some(current) = stack.pop() {
        let cli_script = current.join("skills_store_cli.py");
        let installer = current.join("install.sh");
        if cli_script.is_file() && installer.is_file() {
            return Ok(current);
        }

        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            }
        }
    }

    Err("未在 SkillHub 安装包中找到 CLI 源目录。".to_string())
}

fn copy_file_into_place(source: &Path, target: &Path, label: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| format!("无法确定 {label} 目标目录。"))?;
    fs::create_dir_all(parent).map_err(|error| format!("创建 {label} 目标目录失败: {error}"))?;
    fs::copy(source, target).map_err(|error| format!("复制 {label} 失败: {error}"))?;
    Ok(())
}

fn ensure_skillhub_config(config_path: &Path, self_update_url: &str) -> Result<(), String> {
    let mut config_object = match fs::read_to_string(config_path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    };

    if !config_object.is_object() {
        config_object = serde_json::json!({});
    }

    let needs_update_url = config_object
        .get("self_update_url")
        .and_then(Value::as_str)
        .map(|value| value.trim().is_empty())
        .unwrap_or(true);
    if needs_update_url {
        config_object["self_update_url"] = Value::String(self_update_url.to_string());
    }

    let parent = config_path
        .parent()
        .ok_or_else(|| "无法确定 SkillHub config.json 目录。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建 SkillHub 配置目录失败: {error}"))?;
    let serialized = serde_json::to_string_pretty(&config_object)
        .map_err(|error| format!("序列化 SkillHub 配置失败: {error}"))?;
    fs::write(config_path, format!("{serialized}\n"))
        .map_err(|error| format!("写入 SkillHub 配置失败: {error}"))
}

fn build_windows_skillhub_wrapper(cli_path: &Path, runtime: &ResolvedSkillHubRuntime) -> String {
    let python_runtime = runtime
        .python_runtime
        .as_ref()
        .expect("python runtime is required for windows-native mode");
    let python_command = if python_runtime.prefix_args.is_empty() {
        python_runtime.program.clone()
    } else {
        format!("{} {}", python_runtime.program, python_runtime.prefix_args.join(" "))
    };

    format!(
        "@echo off\r\nsetlocal\r\nset \"CLI={}\"\r\nif not exist \"%CLI%\" (\r\n  >&2 echo Error: CLI not found at %CLI%\r\n  exit /b 1\r\n)\r\n{} \"%CLI%\" %*\r\n",
        cli_path.display(),
        python_command
    )
}

fn build_windows_legacy_skillhub_wrapper(wrapper_path: &Path) -> String {
    format!("@echo off\r\nsetlocal\r\n\"{}\" %*\r\n", wrapper_path.display())
}

pub(super) fn bootstrap_skillhub_windows_native(
    runtime: &ResolvedSkillHubRuntime,
) -> Result<SkillHubCommandResult, String> {
    if runtime.python_runtime.is_none() {
        return Err(build_runtime_unavailable_message(&runtime.info));
    }

    let outer_script = blocking_get_text(super::SKILLHUB_INSTALLER_URL)?;
    let kit_url = parse_skillhub_kit_url(&outer_script)?;
    let archive_bytes = blocking_get_bytes(&kit_url)?;
    let temp_dir = std::env::temp_dir().join(format!("dragonclaw-skillhub-{}", uuid::Uuid::new_v4()));

    let result = (|| -> Result<SkillHubCommandResult, String> {
        extract_skillhub_install_kit(&temp_dir, &archive_bytes)?;
        let cli_source_dir = locate_skillhub_cli_source_dir(&temp_dir)?;
        let installer_script_path = cli_source_dir.join("install.sh");
        let installer_script = fs::read_to_string(&installer_script_path)
            .map_err(|error| format!("读取 SkillHub 内层安装脚本失败: {error}"))?;
        let self_update_url = parse_skillhub_self_update_url(&installer_script)
            .unwrap_or_else(|| SKILLHUB_SELF_UPDATE_URL_FALLBACK.to_string());

        let install_base = PathBuf::from(&runtime.info.skillhub_cli_home_dir);
        let bin_dir = paths::local_bin_dir()?;
        fs::create_dir_all(&install_base)
            .map_err(|error| format!("创建 SkillHub CLI 目录失败: {error}"))?;
        fs::create_dir_all(&bin_dir).map_err(|error| format!("创建 SkillHub bin 目录失败: {error}"))?;

        copy_file_into_place(
            &cli_source_dir.join("skills_store_cli.py"),
            &PathBuf::from(&runtime.info.skillhub_cli_script_path),
            "SkillHub CLI",
        )?;
        copy_file_into_place(
            &cli_source_dir.join("skills_upgrade.py"),
            &install_base.join("skills_upgrade.py"),
            "SkillHub 升级模块",
        )?;
        copy_file_into_place(
            &cli_source_dir.join("version.json"),
            &install_base.join("version.json"),
            "SkillHub version.json",
        )?;
        copy_file_into_place(
            &cli_source_dir.join("metadata.json"),
            &install_base.join("metadata.json"),
            "SkillHub metadata.json",
        )?;

        let optional_index = cli_source_dir.join("skills_index.local.json");
        if optional_index.is_file() {
            copy_file_into_place(
                &optional_index,
                &install_base.join("skills_index.local.json"),
                "SkillHub skills_index.local.json",
            )?;
        }

        ensure_skillhub_config(&install_base.join("config.json"), &self_update_url)?;

        let wrapper_path = skillhub_wrapper_path()?;
        fs::write(
            &wrapper_path,
            build_windows_skillhub_wrapper(
                &PathBuf::from(&runtime.info.skillhub_cli_script_path),
                runtime,
            ),
        )
        .map_err(|error| format!("写入 SkillHub Windows wrapper 失败: {error}"))?;

        let legacy_wrapper_path = skillhub_legacy_wrapper_path()?;
        fs::write(
            &legacy_wrapper_path,
            build_windows_legacy_skillhub_wrapper(&wrapper_path),
        )
        .map_err(|error| format!("写入 SkillHub legacy wrapper 失败: {error}"))?;

        let skill_source_dir = cli_source_dir.join("skill");
        copy_file_into_place(
            &skill_source_dir.join("SKILL.md"),
            &bootstrap_skill_path(FIND_SKILLS_NAME)?,
            "find-skills bootstrap",
        )?;
        copy_file_into_place(
            &skill_source_dir.join("SKILL.skillhub-preference.md"),
            &bootstrap_skill_path(SKILLHUB_PREFERENCE_NAME)?,
            "skillhub-preference bootstrap",
        )?;

        validate_official_skillhub_install(&runtime.info)?;

        Ok(build_command_result_from_parts(
            runtime.info.clone(),
            true,
            format!(
                "SkillHub Windows fallback install complete.\ncli: {}\nwrapper: {}\nskill: {}",
                runtime.info.skillhub_cli_script_path,
                runtime.info.skillhub_wrapper_path,
                runtime.info.workspace_skills_dir
            ),
            "",
        ))
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    result
}
