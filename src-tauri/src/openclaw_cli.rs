// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde_json::Value;

use crate::{environment, paths};

fn create_bundled_node_script_command(script_path: &Path) -> Result<Command, String> {
    let node_bin = environment::get_node_binary()?;
    if !script_path.exists() {
        return Err(format!(
            "Bundled Node.js script not found: {}",
            script_path.display()
        ));
    }

    let node_dir = node_bin
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve bundled Node.js directory".to_string())?;

    let mut command = Command::new(&node_bin);
    command.arg(script_path);

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    if let Some(current_path) = std::env::var_os("PATH") {
        let mut path_entries = std::env::split_paths(&current_path).collect::<Vec<_>>();
        path_entries.insert(0, node_dir);
        let new_path = std::env::join_paths(path_entries)
            .map_err(|error| format!("Failed to build PATH for OpenClaw CLI: {error}"))?;
        command.env("PATH", new_path);
    }

    Ok(command)
}

pub fn create_openclaw_cli_command() -> Result<Command, String> {
    let engine_dir = paths::engine_dir()?;
    let entry_path = engine_dir.join("openclaw.mjs");
    let mut command = create_bundled_node_script_command(&entry_path)?;
    command.current_dir(&engine_dir);
    Ok(command)
}

pub fn create_bundled_npm_cli_command() -> Result<Command, String> {
    let node_bin = environment::get_node_binary()?;
    let node_dir = node_bin
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve bundled Node.js directory".to_string())?;
    let npm_cli_path = node_dir
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js");
    create_bundled_node_script_command(&npm_cli_path)
}

pub fn read_openclaw_engine_version() -> Result<String, String> {
    let engine_dir = paths::engine_dir()?;

    let version_file = engine_dir.join(".openclaw_version");
    if version_file.exists() {
        let version = fs::read_to_string(&version_file)
            .map_err(|error| format!("Failed to read OpenClaw version marker: {error}"))?;
        let trimmed = version.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let package_path = engine_dir.join("package.json");
    let raw = fs::read_to_string(&package_path)
        .map_err(|error| format!("Failed to read OpenClaw package.json: {error}"))?;
    let parsed = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Failed to parse OpenClaw package.json: {error}"))?;
    parsed
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "OpenClaw package.json does not contain a usable version".to_string())
}
