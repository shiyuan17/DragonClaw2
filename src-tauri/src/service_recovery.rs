// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::Manager;

use super::support::{
    clear_runtime_issue, emit_service_log, find_launcher_gateway_processes, read_runtime_state,
    terminate_owned_child_if_matching_pid, validate_existing_process_for_ready_with_timeout,
    ExistingProcessValidation, LauncherProcessInfo, ServiceRuntimeState, TrackedServiceProcess,
};
use super::{
    emit_service_port, lifecycle_snapshot, launcher_state, now_unix_timestamp,
    openclaw_cli, set_service_lifecycle, set_tracked_process, spawn_heartbeat_monitor,
    terminate_process_by_pid, gateway_ws_url, summarize_gateway_probe_failure,
    ServiceLifecycleStatus, ServiceState, EXISTING_PROCESS_RPC_CHECK_TIMEOUT_MS, MAX_PORT,
    DEFAULT_PORT,
};

pub(super) fn verify_gateway_rpc_ready_with_timeout(
    port: u16,
    token: &str,
    timeout_ms: u64,
) -> Result<(), String> {
    let url = gateway_ws_url(port);
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| format!("Failed to build OpenClaw gateway RPC validation command: {error}"))?;
    command
        .arg("gateway")
        .arg("status")
        .arg("--json")
        .arg("--require-rpc")
        .arg("--url")
        .arg(&url)
        .arg("--token")
        .arg(token)
        .arg("--timeout")
        .arg(timeout_ms.to_string())
        .env("OPENCLAW_GATEWAY_TOKEN", token)
        .env("OPENCLAW_GATEWAY_AUTH_TOKEN", token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = openclaw_cli::run_command_with_timeout(
        &mut command,
        Duration::from_millis(timeout_ms + 3_000),
        "OpenClaw gateway RPC readiness check",
    )?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "OpenClaw gateway RPC validation failed ({}): {}",
            url,
            summarize_gateway_probe_failure(output)
        ))
    }
}

fn tracked_process_from_launcher_process(
    process: &LauncherProcessInfo,
    runtime_state: Option<&ServiceRuntimeState>,
) -> TrackedServiceProcess {
    let started_at = runtime_state
        .filter(|runtime| runtime.pid == process.pid && runtime.port == process.port)
        .map(|runtime| runtime.started_at)
        .unwrap_or_else(now_unix_timestamp);

    TrackedServiceProcess {
        pid: process.pid,
        port: process.port,
        started_at,
    }
}

pub(super) fn preferred_known_port(state: &ServiceState) -> u16 {
    let launcher_port = launcher_state::read_launcher_state()
        .ok()
        .and_then(|snapshot| snapshot.last_known_port);
    let current_port = *state.port.lock().unwrap();

    launcher_port
        .filter(|port| (*port >= DEFAULT_PORT) && (*port <= MAX_PORT))
        .unwrap_or(current_port)
}

pub(super) fn reconcile_launcher_gateway_processes(
    app: &tauri::AppHandle,
    state: &ServiceState,
) -> Result<Option<TrackedServiceProcess>, String> {
    let mut processes = find_launcher_gateway_processes()?;
    if processes.is_empty() {
        return Ok(None);
    }

    let runtime_state = read_runtime_state()?;
    let preferred_port = preferred_known_port(state);
    processes.sort_by_key(|process| {
        let runtime_rank = runtime_state
            .as_ref()
            .map(|runtime| {
                if runtime.pid == process.pid && runtime.port == process.port {
                    0
                } else {
                    1
                }
            })
            .unwrap_or(1);
        let preferred_rank = if process.port == preferred_port { 0 } else { 1 };
        (runtime_rank, preferred_rank, process.port, process.pid)
    });

    let keep = processes[0].clone();
    let tracked = tracked_process_from_launcher_process(&keep, runtime_state.as_ref());
    set_tracked_process(state, Some(tracked.clone()));

    if processes.len() > 1 {
        emit_service_log(
            app,
            "warn",
            format!(
                "Multiple launcher-owned OpenClaw processes detected; keeping pid={} port={} and cleaning {} stale instance(s).",
                tracked.pid,
                tracked.port,
                processes.len() - 1
            ),
        );
    }

    for stale in processes.into_iter().skip(1) {
        if stale.pid == tracked.pid {
            continue;
        }

        match terminate_process_by_pid(stale.pid) {
            Ok(()) => emit_service_log(
                app,
                "warn",
                format!(
                    "Cleaned stale launcher-owned OpenClaw process pid={} port={}.",
                    stale.pid, stale.port
                ),
            ),
            Err(error) => emit_service_log(
                app,
                "warn",
                format!(
                    "Failed to clean stale launcher-owned OpenClaw process pid={} port={}: {}",
                    stale.pid, stale.port, error
                ),
            ),
        }
    }

    Ok(Some(tracked))
}

pub(super) fn spawn_existing_process_validation(
    app: tauri::AppHandle,
    process: TrackedServiceProcess,
) {
    let should_start = {
        let state = app.state::<ServiceState>();
        state
            .inner()
            .existing_process_validation_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    };

    if !should_start {
        return;
    }

    std::thread::spawn(move || {
        let validation_result = {
            let state = app.state::<ServiceState>();
            validate_existing_process_for_ready_with_timeout(
                state.inner(),
                process.clone(),
                EXISTING_PROCESS_RPC_CHECK_TIMEOUT_MS,
            )
        };

        let state = app.state::<ServiceState>();
        state
            .inner()
            .existing_process_validation_running
            .store(false, Ordering::SeqCst);

        match validation_result {
            ExistingProcessValidation::Ready(existing) => {
                emit_service_port(&app, existing.port);
                clear_runtime_issue(state.inner());
                spawn_heartbeat_monitor(app.clone(), state.inner());
                let _ = launcher_state::record_launcher_launch_internal(Some(existing.port));
                set_service_lifecycle(
                    &app,
                    state.inner(),
                    Some(lifecycle_snapshot(
                        ServiceLifecycleStatus::Ready,
                        existing.port,
                        Some("Detected and validated an existing OpenClaw service".to_string()),
                        Some(existing.started_at),
                        None,
                    )),
                );
            }
            ExistingProcessValidation::Invalid { process, detail } => {
                let _ = terminate_owned_child_if_matching_pid(state.inner(), process.pid);
                let _ = terminate_process_by_pid(process.pid);
                emit_service_log(
                    &app,
                    "warn",
                    format!(
                        "Existing launcher-owned OpenClaw process failed validation; cleaned pid={} port={}.",
                        process.pid, process.port
                    ),
                );
                set_service_lifecycle(
                    &app,
                    state.inner(),
                    Some(lifecycle_snapshot(
                        ServiceLifecycleStatus::Failed,
                        process.port,
                        Some(detail.clone()),
                        Some(process.started_at),
                        Some(detail),
                    )),
                );
            }
        }
    });
}

