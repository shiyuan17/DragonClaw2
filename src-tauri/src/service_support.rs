// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::{
    resolve_gateway_token, set_tracked_process, verify_gateway_rpc_ready, ServiceState,
};
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct ServiceRuntimeState {
    pub pid: u32,
    pub port: u16,
    pub started_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct TrackedServiceProcess {
    pub pid: u32,
    pub port: u16,
    pub started_at: i64,
}

pub(super) enum ExistingProcessValidation {
    Ready(TrackedServiceProcess),
    Invalid {
        process: TrackedServiceProcess,
        detail: String,
    },
}

pub(super) fn runtime_state_path() -> Result<PathBuf, String> {
    paths::openclaw_service_state_path()
}

pub(super) fn to_runtime_state(process: &TrackedServiceProcess) -> ServiceRuntimeState {
    ServiceRuntimeState {
        pid: process.pid,
        port: process.port,
        started_at: process.started_at,
    }
}

pub(super) fn to_tracked_process(runtime: ServiceRuntimeState) -> TrackedServiceProcess {
    TrackedServiceProcess {
        pid: runtime.pid,
        port: runtime.port,
        started_at: runtime.started_at,
    }
}

pub(super) fn read_runtime_state_from_path(path: &Path) -> Result<Option<ServiceRuntimeState>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read OpenClaw runtime state: {error}"))?;
    let parsed = serde_json::from_str::<ServiceRuntimeState>(&raw)
        .map_err(|error| format!("Failed to parse OpenClaw runtime state: {error}"))?;
    Ok(Some(parsed))
}

pub(super) fn write_runtime_state_to_path(path: &Path, runtime: &ServiceRuntimeState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create OpenClaw runtime state directory: {error}"))?;
    }

    let serialized = serde_json::to_string_pretty(runtime)
        .map_err(|error| format!("Failed to serialize OpenClaw runtime state: {error}"))?;
    fs::write(path, serialized).map_err(|error| format!("Failed to write OpenClaw runtime state: {error}"))
}

pub(super) fn remove_runtime_state_file_at(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(path).map_err(|error| format!("Failed to remove OpenClaw runtime state: {error}"))
}

pub(super) fn read_runtime_state() -> Result<Option<ServiceRuntimeState>, String> {
    read_runtime_state_from_path(&runtime_state_path()?)
}

pub(super) fn persist_tracked_process(process: &TrackedServiceProcess) -> Result<(), String> {
    write_runtime_state_to_path(&runtime_state_path()?, &to_runtime_state(process))
}

pub(super) fn clear_persisted_runtime_state() -> Result<(), String> {
    remove_runtime_state_file_at(&runtime_state_path()?)
}

pub(super) fn clear_known_process_tracking(state: &ServiceState) {
    set_tracked_process(state, None);
    let _ = clear_persisted_runtime_state();
}

pub(super) fn emit_service_log(app: &tauri::AppHandle, level: &str, message: impl Into<String>) {
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": level,
            "message": message.into(),
        }),
    );
}

pub(super) fn set_runtime_issue(state: &ServiceState, detail: impl Into<String>) {
    let detail = detail.into();
    let should_reset_logged = {
        let mut issue = state.last_runtime_issue.lock().unwrap();
        if issue.as_deref() == Some(detail.as_str()) {
            false
        } else {
            *issue = Some(detail);
            true
        }
    };

    if should_reset_logged {
        *state.last_logged_runtime_issue.lock().unwrap() = None;
    }
}

pub(super) fn current_runtime_issue(state: &ServiceState) -> Option<String> {
    state.last_runtime_issue.lock().unwrap().clone()
}

pub(super) fn clear_runtime_issue(state: &ServiceState) {
    *state.last_runtime_issue.lock().unwrap() = None;
    *state.last_logged_runtime_issue.lock().unwrap() = None;
}

pub(super) fn emit_pending_runtime_issue_log(app: &tauri::AppHandle, state: &ServiceState, level: &str) {
    let Some(detail) = current_runtime_issue(state) else {
        return;
    };

    let mut logged = state.last_logged_runtime_issue.lock().unwrap();
    if logged.as_deref() == Some(detail.as_str()) {
        return;
    }

    emit_service_log(app, level, detail.clone());
    *logged = Some(detail);
}

pub(super) fn existing_process_validation_failure_detail(
    process: &TrackedServiceProcess,
    error: &str,
) -> String {
    format!(
        "RPC validation failed for existing process: pid={} port={} started_at={} detail={error}",
        process.pid, process.port, process.started_at
    )
}

pub(super) fn invalidate_existing_process(
    state: &ServiceState,
    _process: &TrackedServiceProcess,
    detail: String,
) {
    clear_known_process_tracking(state);
    set_runtime_issue(state, detail);
}

pub(super) fn validate_existing_process_for_ready(
    state: &ServiceState,
    process: TrackedServiceProcess,
) -> ExistingProcessValidation {
    let token = match resolve_gateway_token() {
        Ok(token) => token,
        Err(error) => {
            let detail = format!(
                "Gateway token missing while validating existing process: pid={} port={} started_at={} detail={error}",
                process.pid, process.port, process.started_at
            );
            invalidate_existing_process(state, &process, detail.clone());
            return ExistingProcessValidation::Invalid { process, detail };
        }
    };

    match verify_gateway_rpc_ready(process.port, &token) {
        Ok(()) => {
            clear_runtime_issue(state);
            ExistingProcessValidation::Ready(process)
        }
        Err(error) => {
            let detail = existing_process_validation_failure_detail(&process, &error);
            invalidate_existing_process(state, &process, detail.clone());
            ExistingProcessValidation::Invalid { process, detail }
        }
    }
}

pub(super) fn terminate_owned_child_if_matching_pid(state: &ServiceState, pid: u32) -> bool {
    let mut child_guard = state.child.lock().unwrap();
    let matches_owned_child = child_guard
        .as_ref()
        .map(|child| child.id() == pid)
        .unwrap_or(false);
    if !matches_owned_child {
        return false;
    }

    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    true
}

pub(super) fn summarize_plugin_config() -> Result<String, String> {
    let config = crate::config::read_openclaw_config()?;
    let Some(entries) = config
        .get("plugins")
        .and_then(|plugins| plugins.get("entries"))
        .and_then(serde_json::Value::as_object)
    else {
        return Ok("Plugin summary: none configured".to_string());
    };

    if entries.is_empty() {
        return Ok("Plugin summary: none configured".to_string());
    }

    let mut summary = entries
        .iter()
        .map(|(name, value)| {
            let enabled = value
                .get("enabled")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true);
            format!("{name}={}", if enabled { "enabled" } else { "disabled" })
        })
        .collect::<Vec<_>>();
    summary.sort();

    if summary.len() > 8 {
        let extra = summary.len() - 8;
        summary.truncate(8);
        summary.push(format!("+{extra} more"));
    }

    Ok(format!("Plugin summary: {}", summary.join(", ")))
}
