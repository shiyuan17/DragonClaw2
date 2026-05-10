// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::agency_agents;
use crate::launcher_state;
use crate::openclaw_cli;
use crate::paths;
#[path = "service_recovery.rs"]
mod recovery;
#[path = "service_support.rs"]
mod support;
use recovery::{
    build_service_start_timeout_error, late_ready_during_rpc_probe, preferred_known_port,
    reconcile_launcher_gateway_processes, remaining_startup_budget_ms,
    spawn_existing_process_validation, startup_rpc_probe_timeout_ms,
    verify_gateway_rpc_ready_with_command_timeout, verify_gateway_rpc_ready_with_timeout,
};
use support::{
    clear_known_process_tracking, clear_runtime_issue, current_runtime_issue,
    emit_pending_runtime_issue_log, emit_service_log, persist_tracked_process,
    read_runtime_state, set_runtime_issue, summarize_plugin_config,
    terminate_owned_child_if_matching_pid, to_tracked_process,
    validate_existing_process_for_ready_with_timeout, ExistingProcessValidation,
    TrackedServiceProcess,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub(super) const DEFAULT_PORT: u16 = 18789;
pub(super) const MAX_PORT: u16 = 18899;
const CONNECT_TIMEOUT_MS: u64 = 200;
const SERVICE_READY_TIMEOUT_MS: u64 = 120_000;
pub(super) const EXISTING_PROCESS_RPC_CHECK_TIMEOUT_MS: u64 = 5_000;
pub(super) const STARTUP_RPC_CHECK_TIMEOUT_MS: u64 = 8_000;
const GATEWAY_RPC_CHECK_INTERVAL_MS: u64 = 1_000;
const WINDOWS_HIDDEN_WINDOW_FLAG: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceHeartbeatPayload {
    running: bool,
    port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceLogEntry {
    level: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(in crate::service) enum ServiceLifecycleStatus {
    #[serde(rename = "service-starting")]
    ServiceStarting,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "failed")]
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceLifecycleSnapshot {
    status: ServiceLifecycleStatus,
    port: u16,
    detail: Option<String>,
    started_at: Option<i64>,
    last_error: Option<String>,
}

/// Global state to hold the running OpenClaw child process.
pub struct ServiceState {
    pub(crate) child: Mutex<Option<Child>>,
    tracked_process: Mutex<Option<TrackedServiceProcess>>,
    pub(crate) port: Mutex<u16>,
    heartbeat_started: AtomicBool,
    lifecycle: Mutex<Option<ServiceLifecycleSnapshot>>,
    last_runtime_issue: Mutex<Option<String>>,
    last_logged_runtime_issue: Mutex<Option<String>>,
    manual_stop_requested: AtomicBool,
    existing_process_validation_running: AtomicBool,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            tracked_process: Mutex::new(None),
            port: Mutex::new(DEFAULT_PORT),
            heartbeat_started: AtomicBool::new(false),
            lifecycle: Mutex::new(None),
            last_runtime_issue: Mutex::new(None),
            last_logged_runtime_issue: Mutex::new(None),
            manual_stop_requested: AtomicBool::new(false),
            existing_process_validation_running: AtomicBool::new(false),
        }
    }
}

fn resolve_gateway_token() -> Result<String, String> {
    crate::config::get_current_config()
        .map_err(|error| format!("Failed to read gateway token: {error}"))?
        .gateway_token
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "Gateway token missing from openclaw.json".to_string())
}

pub(super) fn now_unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

pub(in crate::service) fn lifecycle_snapshot(
    status: ServiceLifecycleStatus,
    port: u16,
    detail: Option<String>,
    started_at: Option<i64>,
    last_error: Option<String>,
) -> ServiceLifecycleSnapshot {
    ServiceLifecycleSnapshot {
        status,
        port,
        detail,
        started_at,
        last_error,
    }
}

pub(in crate::service) fn set_service_lifecycle(
    app: &tauri::AppHandle,
    state: &ServiceState,
    snapshot: Option<ServiceLifecycleSnapshot>,
) {
    *state.lifecycle.lock().unwrap() = snapshot.clone();
    let _ = app.emit("service-lifecycle", snapshot);
}

fn clear_service_lifecycle(app: &tauri::AppHandle, state: &ServiceState) {
    set_service_lifecycle(app, state, None);
}

fn connect_to_port(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(CONNECT_TIMEOUT_MS),
    )
    .is_ok()
}

pub(super) fn gateway_ws_url(port: u16) -> String {
    format!("ws://127.0.0.1:{port}")
}

pub(super) fn summarize_gateway_probe_failure(output: std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit status {}", output.status)
    };

    detail.chars().take(500).collect()
}


/// Check if a port is truly available by:
/// 1. Trying to bind to it
/// 2. Trying to connect to it
fn is_port_available(port: u16) -> bool {
    if TcpListener::bind(("127.0.0.1", port)).is_err() {
        return false;
    }
    !connect_to_port(port)
}

#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    use std::ffi::c_void;

    type Handle = *mut c_void;

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32)
            -> Handle;
        fn GetExitCodeProcess(h_process: Handle, lp_exit_code: *mut u32) -> i32;
        fn CloseHandle(h_object: Handle) -> i32;
    }

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }

        let mut exit_code = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        let _ = CloseHandle(handle);
        ok != 0 && exit_code == STILL_ACTIVE
    }
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
pub(super) fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    let mut command = std::process::Command::new("taskkill");
    command
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);

    let output = openclaw_cli::run_command_with_timeout(
        &mut command,
        Duration::from_secs(5),
        "Stop OpenClaw process",
    )?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!("Failed to stop OpenClaw process {pid}"))
    }
}

#[cfg(not(target_os = "windows"))]
pub(super) fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    let mut term_command = std::process::Command::new("kill");
    term_command
        .args(["-TERM", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let term_output = openclaw_cli::run_command_with_timeout(
        &mut term_command,
        Duration::from_secs(5),
        "Stop OpenClaw process",
    )?;

    if term_output.status.success() {
        return Ok(());
    }

    let mut kill_command = std::process::Command::new("kill");
    kill_command
        .args(["-KILL", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let kill_output = openclaw_cli::run_command_with_timeout(
        &mut kill_command,
        Duration::from_secs(5),
        "Force-stop OpenClaw process",
    )?;

    if kill_output.status.success() {
        Ok(())
    } else {
        Err(format!("Failed to stop OpenClaw process {pid}"))
    }
}

pub(in crate::service) fn set_tracked_process(
    state: &ServiceState,
    tracked: Option<TrackedServiceProcess>,
) {
    let tracked_port = tracked
        .as_ref()
        .map(|process| process.port)
        .unwrap_or(DEFAULT_PORT);
    *state.tracked_process.lock().unwrap() = tracked;
    *state.port.lock().unwrap() = tracked_port;
}

fn validate_external_process(process: &TrackedServiceProcess) -> bool {
    is_process_running(process.pid) && connect_to_port(process.port)
}

fn resolve_known_process(state: &ServiceState) -> Result<Option<TrackedServiceProcess>, String> {
    let manual_stop_requested = state.manual_stop_requested.load(Ordering::SeqCst);
    let child_pid = {
        let mut child_guard = state.child.lock().unwrap();
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => Some(child.id()),
                Ok(Some(status)) => {
                    let detail = format!("exit status {status}");
                    let pid = child.id();
                    let tracked = state.tracked_process.lock().unwrap().clone();
                    let fallback_port = tracked
                        .as_ref()
                        .map(|process| process.port)
                        .unwrap_or_else(|| *state.port.lock().unwrap());
                    child_guard.take();
                    clear_known_process_tracking(state);
                    if !manual_stop_requested {
                        let process = tracked.unwrap_or(TrackedServiceProcess {
                            pid,
                            port: fallback_port,
                            started_at: now_unix_timestamp(),
                        });
                        set_runtime_issue(
                            state,
                            format!(
                                "child exited unexpectedly: pid={} port={} started_at={} detail={detail}",
                                process.pid, process.port, process.started_at
                            ),
                        );
                    }
                    None
                }
                Err(error) => {
                    let pid = child.id();
                    let tracked = state.tracked_process.lock().unwrap().clone();
                    let fallback_port = tracked
                        .as_ref()
                        .map(|process| process.port)
                        .unwrap_or_else(|| *state.port.lock().unwrap());
                    child_guard.take();
                    clear_known_process_tracking(state);
                    if !manual_stop_requested {
                        let process = tracked.unwrap_or(TrackedServiceProcess {
                            pid,
                            port: fallback_port,
                            started_at: now_unix_timestamp(),
                        });
                        set_runtime_issue(
                            state,
                            format!(
                                "child exited unexpectedly: pid={} port={} started_at={} detail=try_wait failed: {error}",
                                process.pid, process.port, process.started_at
                            ),
                        );
                    }
                    None
                }
            }
        } else {
            None
        }
    };

    if let Some(pid) = child_pid {
        let port = *state.port.lock().unwrap();
        let existing = state
            .tracked_process
            .lock()
            .unwrap()
            .clone()
            .filter(|process| process.pid == pid)
            .unwrap_or(TrackedServiceProcess {
                pid,
                port,
                started_at: now_unix_timestamp(),
            });
        set_tracked_process(state, Some(existing.clone()));
        clear_runtime_issue(state);
        return Ok(Some(existing));
    }

    if let Some(tracked) = state.tracked_process.lock().unwrap().clone() {
        if validate_external_process(&tracked) {
            *state.port.lock().unwrap() = tracked.port;
            clear_runtime_issue(state);
            return Ok(Some(tracked));
        }
        clear_known_process_tracking(state);
        if !manual_stop_requested {
            set_runtime_issue(
                state,
                format!(
                    "child exited unexpectedly: pid={} port={} started_at={} detail=tracked process missing",
                    tracked.pid, tracked.port, tracked.started_at
                ),
            );
        }
    }

    if let Some(runtime) = read_runtime_state()? {
        let tracked = to_tracked_process(runtime);
        if validate_external_process(&tracked) {
            set_tracked_process(state, Some(tracked.clone()));
            clear_runtime_issue(state);
            return Ok(Some(tracked));
        }

        clear_known_process_tracking(state);
        if !manual_stop_requested {
            set_runtime_issue(
                state,
                format!(
                    "stale runtime state cleared: pid={} port={} started_at={}",
                    tracked.pid, tracked.port, tracked.started_at
                ),
            );
        }
    }

    Ok(None)
}


pub(in crate::service) fn emit_service_port(app: &tauri::AppHandle, port: u16) {
    let _ = app.emit("service-port", serde_json::json!({ "port": port }));
}

fn open_control_ui_async(app: tauri::AppHandle, port: u16, token: String) {
    tauri::async_runtime::spawn(async move {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "success",
                "message": "Opening browser..."
            }),
        );
        if let Err(error) = crate::control_ui::open_control_ui(app.clone(), port, token).await {
            let _ = app.emit(
                "service-log",
                serde_json::json!({
                    "level": "warn",
                    "message": error
                }),
            );
        }
    });
}

fn cleanup_failed_service_start(state: &ServiceState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    clear_known_process_tracking(state);
}

async fn wait_for_service_ready(
    app: &tauri::AppHandle,
    state: &ServiceState,
    port: u16,
    token: &str,
    ready_signal: Arc<AtomicBool>,
) -> Result<(), String> {
    let started_at = Instant::now();
    let mut last_rpc_check_at =
        Instant::now() - Duration::from_millis(GATEWAY_RPC_CHECK_INTERVAL_MS);
    let mut last_rpc_error: Option<String> = None;
    loop {
        let port_accepting = connect_to_port(port);
        let ready_from_log = ready_signal.load(Ordering::SeqCst);
        let child_status = {
            let mut child_guard = state.child.lock().unwrap();
            if let Some(child) = child_guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => Some(Err(format!(
                        "OpenClaw service process exited before gateway port {port} was ready (status: {status})"
                    ))),
                    Ok(None) => None,
                    Err(error) => Some(Err(format!(
                        "Failed to inspect OpenClaw service process: {error}"
                    ))),
                }
            } else {
                Some(Err(format!(
                    "OpenClaw service process is missing and gateway port {port} is not listening"
                )))
            }
        };
        if let Some(result) = child_status {
            return result;
        }
        if ready_from_log && port_accepting {
            return Ok(());
        }
        if port_accepting
            && last_rpc_check_at.elapsed() >= Duration::from_millis(GATEWAY_RPC_CHECK_INTERVAL_MS)
        {
            let remaining_budget_ms = remaining_startup_budget_ms(started_at);
            if let Some(rpc_timeout_ms) = startup_rpc_probe_timeout_ms(remaining_budget_ms) {
                last_rpc_check_at = Instant::now();
                match verify_gateway_rpc_ready_with_command_timeout(
                    port,
                    token,
                    rpc_timeout_ms,
                    remaining_budget_ms,
                ) {
                    Ok(()) => return Ok(()),
                    Err(error) => {
                        last_rpc_error = Some(error);
                        let ready_after_probe = ready_signal.load(Ordering::SeqCst);
                        let port_accepting_after_probe = connect_to_port(port);
                        if late_ready_during_rpc_probe(
                            ready_from_log,
                            ready_after_probe,
                            port_accepting_after_probe,
                        ) {
                            emit_service_log(
                                app,
                                "info",
                                format!(
                                    "Gateway ready signal arrived during RPC probe on port {port}; continuing startup without waiting for another probe."
                                ),
                            );
                            return Ok(());
                        }
                        if ready_after_probe && port_accepting_after_probe {
                            return Ok(());
                        }
                    }
                }
            }
        }
        if started_at.elapsed() >= Duration::from_millis(SERVICE_READY_TIMEOUT_MS) {
            let port_accepting_at_timeout = connect_to_port(port);
            if ready_signal.load(Ordering::SeqCst) && port_accepting_at_timeout {
                if !ready_from_log || !port_accepting {
                    emit_service_log(
                        app,
                        "info",
                        format!(
                            "Gateway ready signal was confirmed at the startup timeout boundary on port {port}; treating startup as successful."
                        ),
                    );
                }
                return Ok(());
            }
            return Err(build_service_start_timeout_error(
                port,
                port_accepting_at_timeout,
                last_rpc_error.as_deref(),
            ));
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

fn flush_service_log_batch(app: &tauri::AppHandle, pending: &mut Vec<ServiceLogEntry>) {
    if pending.is_empty() {
        return;
    }

    let logs = std::mem::take(pending);
    let _ = app.emit("service-log-batch", serde_json::json!({ "logs": logs }));
}

pub fn resolve_known_service_port(state: &ServiceState) -> Result<u16, String> {
    if let Some(tracked) = resolve_known_process(state)? {
        return Ok(tracked.port);
    }

    Ok(*state.port.lock().unwrap())
}

pub(in crate::service) fn spawn_heartbeat_monitor(app: tauri::AppHandle, state: &ServiceState) {
    if state
        .heartbeat_started
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::spawn(move || {
        let mut last_running: Option<bool> = None;
        loop {
            let state = app.state::<ServiceState>();
            let process = resolve_known_process(state.inner()).ok().flatten();
            let running = process.is_some();
            let port = process
                .as_ref()
                .map(|tracked| tracked.port)
                .unwrap_or_else(|| *state.port.lock().unwrap());

            if running || last_running != Some(false) {
                let _ = app.emit(
                    "service-heartbeat",
                    ServiceHeartbeatPayload { running, port },
                );
            }

            if running {
                clear_runtime_issue(state.inner());
            }

            if !running && last_running.unwrap_or(true) {
                if state
                    .inner()
                    .manual_stop_requested
                    .swap(false, Ordering::SeqCst)
                {
                    clear_runtime_issue(state.inner());
                    clear_service_lifecycle(&app, state.inner());
                } else {
                    emit_pending_runtime_issue_log(&app, state.inner(), "error");
                    let detail = current_runtime_issue(state.inner())
                        .unwrap_or_else(|| "OpenClaw service exited unexpectedly".to_string());
                    let started_at = state
                        .inner()
                        .lifecycle
                        .lock()
                        .unwrap()
                        .as_ref()
                        .and_then(|snapshot| snapshot.started_at);
                    set_service_lifecycle(
                        &app,
                        state.inner(),
                        Some(lifecycle_snapshot(
                            ServiceLifecycleStatus::Failed,
                            port,
                            Some(detail.clone()),
                            started_at,
                            Some(detail),
                        )),
                    );
                }
            }

            last_running = Some(running);
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

/// Check if OpenClaw gateway port is available.
#[tauri::command]
pub fn check_port_available() -> Result<bool, String> {
    Ok(is_port_available(DEFAULT_PORT))
}

/// Check if the OpenClaw service is currently running.
#[tauri::command]
pub fn is_service_running(state: tauri::State<ServiceState>) -> bool {
    resolve_known_process(state.inner())
        .map(|process| process.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub fn get_service_lifecycle_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<ServiceState>,
) -> Result<Option<ServiceLifecycleSnapshot>, String> {
    let _ = reconcile_launcher_gateway_processes(&app, state.inner());

    if let Some(existing) = resolve_known_process(state.inner())? {
        if let Some(snapshot) = state.lifecycle.lock().unwrap().clone() {
            match snapshot.status {
                ServiceLifecycleStatus::Ready => return Ok(Some(snapshot)),
                ServiceLifecycleStatus::ServiceStarting => return Ok(Some(snapshot)),
                ServiceLifecycleStatus::Failed => {}
            }
        }

        let snapshot = lifecycle_snapshot(
            ServiceLifecycleStatus::ServiceStarting,
            existing.port,
            Some("Validating existing OpenClaw service".to_string()),
            Some(existing.started_at),
            None,
        );
        *state.lifecycle.lock().unwrap() = Some(snapshot.clone());
        emit_service_port(&app, existing.port);
        spawn_existing_process_validation(app, existing);
        return Ok(Some(snapshot));
    }

    if let Some(detail) = current_runtime_issue(state.inner()) {
        let previous_snapshot = state.lifecycle.lock().unwrap().clone();
        let port = previous_snapshot
            .as_ref()
            .map(|snapshot| snapshot.port)
            .unwrap_or_else(|| *state.port.lock().unwrap());
        let started_at = previous_snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.started_at);
        let snapshot = lifecycle_snapshot(
            ServiceLifecycleStatus::Failed,
            port,
            Some(detail.clone()),
            started_at,
            Some(detail),
        );
        *state.lifecycle.lock().unwrap() = Some(snapshot.clone());
        return Ok(Some(snapshot));
    }

    if let Some(snapshot) = state.lifecycle.lock().unwrap().clone() {
        if snapshot.status == ServiceLifecycleStatus::Failed {
            return Ok(Some(snapshot));
        }
    }

    Ok(None)
}

/// Start the OpenClaw service using sandboxed Node.js.
#[tauri::command]
pub async fn start_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServiceState>,
) -> Result<String, String> {
    start_service_impl(app, state, true).await
}

/// Start the OpenClaw service without opening the Control UI in a browser.
#[tauri::command]
pub async fn start_service_silent(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServiceState>,
) -> Result<String, String> {
    start_service_impl(app, state, false).await
}

async fn start_service_impl(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServiceState>,
    open_browser: bool,
) -> Result<String, String> {
    state
        .inner()
        .manual_stop_requested
        .store(false, Ordering::SeqCst);
    if let Err(error) = agency_agents::migrate_legacy_agency_config() {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "warn",
                "message": format!("Failed to migrate legacy digital employee config: {error}")
            }),
        );
        set_service_lifecycle(
            &app,
            state.inner(),
            Some(lifecycle_snapshot(
                ServiceLifecycleStatus::Failed,
                *state.port.lock().unwrap(),
                Some(error.clone()),
                None,
                Some(error.clone()),
            )),
        );
        return Err(error);
    }
    let _ = reconcile_launcher_gateway_processes(&app, state.inner());
    if let Some(existing) = resolve_known_process(state.inner())? {
        match validate_existing_process_for_ready_with_timeout(
            state.inner(),
            existing,
            EXISTING_PROCESS_RPC_CHECK_TIMEOUT_MS,
        ) {
            ExistingProcessValidation::Ready(existing) => {
                let token = resolve_gateway_token()?;
                spawn_heartbeat_monitor(app.clone(), state.inner());
                emit_service_port(&app, existing.port);
                clear_runtime_issue(state.inner());
                set_service_lifecycle(
                    &app,
                    state.inner(),
                    Some(lifecycle_snapshot(
                        ServiceLifecycleStatus::Ready,
                        existing.port,
                        Some("Detected an existing OpenClaw service".to_string()),
                        Some(existing.started_at),
                        None,
                    )),
                );
                let _ = launcher_state::record_launcher_launch_internal(Some(existing.port));
                let _ = app.emit(
                    "service-log",
                    serde_json::json!({
                        "level": "info",
                        "message": format!("Detected an existing OpenClaw service and reused port {}", existing.port)
                    }),
                );
                if open_browser {
                    open_control_ui_async(app.clone(), existing.port, token.clone());
                }
                return Ok("Service is already running".to_string());
            }
            ExistingProcessValidation::Invalid { process, detail } => {
                emit_pending_runtime_issue_log(&app, state.inner(), "warn");
                let owned_child_terminated =
                    terminate_owned_child_if_matching_pid(state.inner(), process.pid);
                let external_terminated = terminate_process_by_pid(process.pid).is_ok();
                if owned_child_terminated || external_terminated {
                    emit_service_log(
                        &app,
                        "warn",
                        format!(
                            "Removed invalid launcher-owned OpenClaw process pid={} port={} before restart.",
                            process.pid, process.port
                        ),
                    );
                    std::thread::sleep(Duration::from_millis(500));
                } else {
                    emit_service_log(
                        &app,
                        "warn",
                        format!(
                            "Failed to remove invalid launcher-owned OpenClaw process pid={} port={}: {}",
                            process.pid, process.port, detail
                        ),
                    );
                }
            }
        }
    }
    emit_pending_runtime_issue_log(&app, state.inner(), "warn");
    let openclaw_dir = paths::get_openclaw_dir()?;
    if !openclaw_dir.join("package.json").exists() {
        let error = "OpenClaw is not installed; complete setup first".to_string();
        set_service_lifecycle(
            &app,
            state.inner(),
            Some(lifecycle_snapshot(
                ServiceLifecycleStatus::Failed,
                *state.port.lock().unwrap(),
                Some(error.clone()),
                None,
                Some(error.clone()),
            )),
        );
        return Err(error);
    }
    let preferred_port = preferred_known_port(state.inner());
    let mut chosen_port = preferred_port;
    let mut found = is_port_available(preferred_port);
    if !found {
        for port in DEFAULT_PORT..=MAX_PORT {
            if port == preferred_port {
                continue;
            }
            if is_port_available(port) {
                chosen_port = port;
                found = true;
                break;
            }
        }
    }
    if !found {
        let error = format!(
            "Ports {}-{} are all in use; close other OpenClaw instances and try again.",
            DEFAULT_PORT, MAX_PORT
        );
        set_service_lifecycle(
            &app,
            state.inner(),
            Some(lifecycle_snapshot(
                ServiceLifecycleStatus::Failed,
                *state.port.lock().unwrap(),
                Some(error.clone()),
                None,
                Some(error.clone()),
            )),
        );
        return Err(error);
    }
    if chosen_port != DEFAULT_PORT {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "warn",
                "message": format!("Default port {} was unavailable; switched to port {}", DEFAULT_PORT, chosen_port)
            }),
        );
    }
    emit_service_port(&app, chosen_port);
    let started_at = now_unix_timestamp();
    set_service_lifecycle(
        &app,
        state.inner(),
        Some(lifecycle_snapshot(
            ServiceLifecycleStatus::ServiceStarting,
            chosen_port,
            Some("Starting OpenClaw service".to_string()),
            Some(started_at),
            None,
        )),
    );
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": "info",
            "message": format!("Starting OpenClaw service on port {}...", chosen_port)
        }),
    );
    if let Ok(plugin_summary) = summarize_plugin_config() {
        emit_service_log(&app, "info", plugin_summary);
    }
    let token = resolve_gateway_token()?;
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| format!("Failed to build OpenClaw startup command: {error}"))?;
    command
        .arg("gateway")
        .arg("--allow-unconfigured")
        .arg("--port")
        .arg(chosen_port.to_string())
        .arg("--token")
        .arg(&token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("OPENCLAW_GATEWAY_TOKEN", &token)
        .env("OPENCLAW_GATEWAY_AUTH_TOKEN", &token);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let message = format!("Failed to start OpenClaw: {error}");
            set_service_lifecycle(
                &app,
                state.inner(),
                Some(lifecycle_snapshot(
                    ServiceLifecycleStatus::Failed,
                    chosen_port,
                    Some(message.clone()),
                    Some(started_at),
                    Some(message.clone()),
                )),
            );
            return Err(message);
        }
    };
    let tracked = TrackedServiceProcess {
        pid: child.id(),
        port: chosen_port,
        started_at,
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_clone = app.clone();
    let ready_signal = Arc::new(AtomicBool::new(false));
    {
        let mut child_guard = state.child.lock().unwrap();
        *child_guard = Some(child);
    }
    set_tracked_process(state.inner(), Some(tracked.clone()));
    if let Some(stdout) = stdout {
        let app_out = app_clone.clone();
        let open_port = chosen_port;
        let open_token = token.clone();
        let stdout_ready_signal = ready_signal.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut browser_opened = false;
            let mut pending_logs = Vec::<ServiceLogEntry>::new();
            let mut last_flush = Instant::now();
            for line in reader.lines().map_while(Result::ok) {
                let level = classify_log_level(&line);
                let is_ready = is_gateway_ready_signal(&line);
                if is_ready {
                    stdout_ready_signal.store(true, Ordering::SeqCst);
                }
                if open_browser && !browser_opened && is_ready {
                    browser_opened = true;
                    let app_browser = app_out.clone();
                    let browser_token = open_token.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(2));
                        open_control_ui_async(app_browser, open_port, browser_token);
                    });
                }
                pending_logs.push(ServiceLogEntry {
                    level: level.to_string(),
                    message: line,
                });
                if is_ready
                    || pending_logs.len() >= 50
                    || last_flush.elapsed() >= Duration::from_millis(250)
                {
                    flush_service_log_batch(&app_out, &mut pending_logs);
                    last_flush = Instant::now();
                }
            }
            flush_service_log_batch(&app_out, &mut pending_logs);
        });
    }
    if let Some(stderr) = stderr {
        let app_err = app_clone;
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut pending_logs = Vec::<ServiceLogEntry>::new();
            let mut last_flush = Instant::now();
            for line in reader.lines().map_while(Result::ok) {
                pending_logs.push(ServiceLogEntry {
                    level: "error".to_string(),
                    message: line,
                });
                if pending_logs.len() >= 50 || last_flush.elapsed() >= Duration::from_millis(250) {
                    flush_service_log_batch(&app_err, &mut pending_logs);
                    last_flush = Instant::now();
                }
            }
            flush_service_log_batch(&app_err, &mut pending_logs);
        });
    }
    if let Err(error) =
        wait_for_service_ready(&app, state.inner(), chosen_port, &token, ready_signal).await
    {
        set_runtime_issue(state.inner(), error.clone());
        cleanup_failed_service_start(state.inner());
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "error",
                "message": error.clone()
            }),
        );
        set_service_lifecycle(
            &app,
            state.inner(),
            Some(lifecycle_snapshot(
                ServiceLifecycleStatus::Failed,
                chosen_port,
                Some(error.clone()),
                Some(started_at),
                Some(error.clone()),
            )),
        );
        return Err(error);
    }
    if let Err(error) = persist_tracked_process(&tracked) {
        set_runtime_issue(state.inner(), error.clone());
        cleanup_failed_service_start(state.inner());
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "error",
                "message": error.clone()
            }),
        );
        set_service_lifecycle(
            &app,
            state.inner(),
            Some(lifecycle_snapshot(
                ServiceLifecycleStatus::Failed,
                chosen_port,
                Some(error.clone()),
                Some(started_at),
                Some(error.clone()),
            )),
        );
        return Err(error);
    }
    let _ = launcher_state::record_launcher_launch_internal(Some(chosen_port));
    spawn_heartbeat_monitor(app.clone(), state.inner());
    clear_runtime_issue(state.inner());
    set_service_lifecycle(
        &app,
        state.inner(),
        Some(lifecycle_snapshot(
            ServiceLifecycleStatus::Ready,
            chosen_port,
            Some("OpenClaw service is ready".to_string()),
            Some(started_at),
            None,
        )),
    );
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": "info",
            "message": "OpenClaw service is ready and listening..."
        }),
    );
    Ok("Service started".to_string())
}

/// Stop the OpenClaw service.
#[tauri::command]
pub fn stop_service(
    app: tauri::AppHandle,
    state: tauri::State<ServiceState>,
) -> Result<String, String> {
    state
        .inner()
        .manual_stop_requested
        .store(true, Ordering::SeqCst);
    let owned_child = state.child.lock().unwrap().take();
    let tracked = {
        let current = state.tracked_process.lock().unwrap().clone();
        current.or_else(|| resolve_known_process(state.inner()).ok().flatten())
    };
    let mut stopped = false;
    if let Some(mut child) = owned_child {
        let _ = child.kill();
        let _ = child.wait();
        stopped = true;
    } else if let Some(process) = tracked {
        if terminate_process_by_pid(process.pid).is_ok() {
            stopped = true;
        }
    }
    clear_known_process_tracking(state.inner());
    clear_runtime_issue(state.inner());
    clear_service_lifecycle(&app, state.inner());
    if stopped {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "info",
                "message": "OpenClaw service stopped"
            }),
        );
        Ok("Service stopped".to_string())
    } else {
        Ok("Service was not running".to_string())
    }
}

/// Classify log line into a severity level for frontend display.
fn classify_log_level(line: &str) -> &'static str {
    let lower = line.to_lowercase();
    if lower.contains("error")
        || lower.contains("fatal")
        || lower.contains("panic")
        || lower.trim_start().starts_with("err_")
    {
        "error"
    } else if lower.contains("warn") {
        "warn"
    } else if is_service_ready_signal(line) {
        "success"
    } else {
        "info"
    }
}

/// Detect if a log line indicates that the gateway completed startup.
fn is_gateway_ready_signal(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("[gateway] ready") || lower.contains("gateway ready")
}

/// Detect if a log line indicates the service is ready or listening.
fn is_service_ready_signal(line: &str) -> bool {
    let lower = line.to_lowercase();
    is_gateway_ready_signal(line)
        || lower.contains("listening on")
        || lower.contains("listening at")
        || lower.contains("started on")
        || lower.contains("ready on")
        || lower.contains("server is running")
        || lower.contains("server started")
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;





