// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::{
    resolve_gateway_token, set_tracked_process, verify_gateway_rpc_ready_with_timeout,
    ServiceState,
};
use crate::openclaw_cli;
use crate::paths;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const WINDOWS_HIDDEN_WINDOW_FLAG: u32 = 0x0800_0000;
const PROCESS_DISCOVERY_TIMEOUT_SECS: u64 = 5;

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LauncherProcessInfo {
    pub pid: u32,
    pub port: u16,
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

pub(super) fn validate_existing_process_for_ready_with_timeout(
    state: &ServiceState,
    process: TrackedServiceProcess,
    timeout_ms: u64,
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

    match verify_gateway_rpc_ready_with_timeout(process.port, &token, timeout_ms) {
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

pub(super) fn parse_port_from_command_line(command_line: &str) -> Option<u16> {
    let tokens = command_line
        .split_whitespace()
        .map(|token| token.trim_matches('"'))
        .collect::<Vec<_>>();

    tokens
        .windows(2)
        .find_map(|pair| match pair {
            ["--port", value] => value.parse::<u16>().ok(),
            _ => None,
        })
}

pub(super) fn is_launcher_gateway_command_line(command_line: &str, entry_path: &Path) -> bool {
    let normalized = command_line.replace('/', "\\").to_ascii_lowercase();
    let normalized_entry = entry_path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();

    normalized.contains(normalized_entry.as_str()) && normalized.contains(" gateway")
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsProcessInfo {
    process_id: u32,
    command_line: Option<String>,
}

#[cfg(target_os = "windows")]
fn run_hidden_powershell(script: &str) -> Result<std::process::Output, String> {
    let mut command = std::process::Command::new("powershell");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);

    openclaw_cli::run_command_with_timeout(
        &mut command,
        std::time::Duration::from_secs(PROCESS_DISCOVERY_TIMEOUT_SECS),
        "Discover launcher-owned OpenClaw processes",
    )
}

#[cfg(target_os = "windows")]
pub(super) fn find_launcher_gateway_processes() -> Result<Vec<LauncherProcessInfo>, String> {
    let entry_path = paths::engine_dir()?.join("openclaw.mjs");
    let script = r#"
$items = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Select-Object ProcessId, CommandLine |
  ConvertTo-Json -Compress
if ($null -eq $items) { "" } else { $items }
"#;
    let output = run_hidden_powershell(script)?;
    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
      return Err(if stderr.is_empty() {
          "Failed to enumerate launcher-owned OpenClaw processes".to_string()
      } else {
          format!("Failed to enumerate launcher-owned OpenClaw processes: {stderr}")
      });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    let candidates = match serde_json::from_str::<Vec<WindowsProcessInfo>>(&stdout) {
        Ok(list) => list,
        Err(_) => serde_json::from_str::<WindowsProcessInfo>(&stdout)
            .map(|single| vec![single])
            .map_err(|error| format!("Failed to parse launcher-owned process discovery output: {error}"))?,
    };

    let mut processes = candidates
        .into_iter()
        .filter_map(|item| {
            let command_line = item.command_line?;
            if !is_launcher_gateway_command_line(&command_line, &entry_path) {
                return None;
            }

            let port = parse_port_from_command_line(&command_line)?;
            Some(LauncherProcessInfo {
                pid: item.process_id,
                port,
            })
        })
        .collect::<Vec<_>>();

    processes.sort_by_key(|item| (item.port, item.pid));
    processes.dedup_by(|left, right| left.pid == right.pid);
    Ok(processes)
}

#[cfg(not(target_os = "windows"))]
pub(super) fn find_launcher_gateway_processes() -> Result<Vec<LauncherProcessInfo>, String> {
    Ok(Vec::new())
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
