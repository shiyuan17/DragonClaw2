// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::paths;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LauncherState {
    pub setup_completed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_launch_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_port: Option<u16>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub provider_display_names: HashMap<String, String>,
}

fn launcher_state_path() -> Result<PathBuf, String> {
    paths::dragonclaw_launcher_state_path()
}

fn now_unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn read_launcher_state_from_path(path: &Path) -> Result<LauncherState, String> {
    if !path.exists() {
        return Ok(LauncherState::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read DragonClaw launcher state: {error}"))?;
    serde_json::from_str::<LauncherState>(&raw)
        .map_err(|error| format!("Failed to parse DragonClaw launcher state: {error}"))
}

fn write_launcher_state_to_path(path: &Path, state: &LauncherState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Failed to create DragonClaw launcher state directory: {error}")
        })?;
    }

    let serialized = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize DragonClaw launcher state: {error}"))?;
    fs::write(path, serialized)
        .map_err(|error| format!("Failed to write DragonClaw launcher state: {error}"))
}

fn update_launcher_state_internal(
    mutator: impl FnOnce(&mut LauncherState),
) -> Result<LauncherState, String> {
    let path = launcher_state_path()?;
    let mut state = read_launcher_state_from_path(&path)?;
    mutator(&mut state);
    write_launcher_state_to_path(&path, &state)?;
    Ok(state)
}

pub fn read_launcher_state() -> Result<LauncherState, String> {
    read_launcher_state_from_path(&launcher_state_path()?)
}

pub fn read_provider_display_names() -> Result<HashMap<String, String>, String> {
    Ok(read_launcher_state()?.provider_display_names)
}

pub fn update_provider_display_names(
    mutator: impl FnOnce(&mut HashMap<String, String>),
) -> Result<HashMap<String, String>, String> {
    let state = update_launcher_state_internal(|state| {
        mutator(&mut state.provider_display_names);
    })?;
    Ok(state.provider_display_names)
}

pub fn mark_launcher_setup_completed_internal(
    last_known_port: Option<u16>,
) -> Result<LauncherState, String> {
    update_launcher_state_internal(|state| {
        state.setup_completed = true;
        if let Some(port) = last_known_port {
            state.last_known_port = Some(port);
        }
    })
}

pub fn record_launcher_launch_internal(
    last_known_port: Option<u16>,
) -> Result<LauncherState, String> {
    update_launcher_state_internal(|state| {
        state.last_launch_at = Some(now_unix_timestamp());
        if let Some(port) = last_known_port {
            state.last_known_port = Some(port);
        }
    })
}

#[tauri::command]
pub fn get_launcher_state() -> Result<LauncherState, String> {
    read_launcher_state()
}

#[tauri::command]
pub fn mark_launcher_setup_completed(
    last_known_port: Option<u16>,
) -> Result<LauncherState, String> {
    mark_launcher_setup_completed_internal(last_known_port)
}
