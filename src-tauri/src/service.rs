// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::environment;
use crate::openclaw_cli;
use crate::paths;

const DEFAULT_PORT: u16 = 18789;
const MAX_PORT: u16 = 18899;
const CONNECT_TIMEOUT_MS: u64 = 200;
const WINDOWS_HIDDEN_WINDOW_FLAG: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ServiceRuntimeState {
    pid: u32,
    port: u16,
    started_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrackedServiceProcess {
    pid: u32,
    port: u16,
    started_at: i64,
}

/// Global state to hold the running OpenClaw child process.
pub struct ServiceState {
    pub(crate) child: Mutex<Option<Child>>,
    tracked_process: Mutex<Option<TrackedServiceProcess>>,
    pub(crate) port: Mutex<u16>,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            tracked_process: Mutex::new(None),
            port: Mutex::new(DEFAULT_PORT),
        }
    }
}

fn resolve_gateway_token() -> String {
    crate::config::get_current_config()
        .ok()
        .and_then(|config| config.gateway_token)
        .filter(|token| !token.trim().is_empty())
        .unwrap_or_else(|| crate::config::DEFAULT_GATEWAY_TOKEN.to_string())
}

fn now_unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn runtime_state_path() -> Result<PathBuf, String> {
    paths::openclaw_service_state_path()
}

fn to_runtime_state(process: &TrackedServiceProcess) -> ServiceRuntimeState {
    ServiceRuntimeState {
        pid: process.pid,
        port: process.port,
        started_at: process.started_at,
    }
}

fn to_tracked_process(runtime: ServiceRuntimeState) -> TrackedServiceProcess {
    TrackedServiceProcess {
        pid: runtime.pid,
        port: runtime.port,
        started_at: runtime.started_at,
    }
}

fn read_runtime_state_from_path(path: &Path) -> Result<Option<ServiceRuntimeState>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read OpenClaw runtime state: {error}"))?;
    let parsed = serde_json::from_str::<ServiceRuntimeState>(&raw)
        .map_err(|error| format!("Failed to parse OpenClaw runtime state: {error}"))?;
    Ok(Some(parsed))
}

fn write_runtime_state_to_path(path: &Path, runtime: &ServiceRuntimeState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create OpenClaw runtime state directory: {error}"))?;
    }

    let serialized = serde_json::to_string_pretty(runtime)
        .map_err(|error| format!("Failed to serialize OpenClaw runtime state: {error}"))?;
    fs::write(path, serialized)
        .map_err(|error| format!("Failed to write OpenClaw runtime state: {error}"))
}

fn remove_runtime_state_file_at(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(path).map_err(|error| format!("Failed to remove OpenClaw runtime state: {error}"))
}

fn read_runtime_state() -> Result<Option<ServiceRuntimeState>, String> {
    read_runtime_state_from_path(&runtime_state_path()?)
}

fn persist_tracked_process(process: &TrackedServiceProcess) -> Result<(), String> {
    write_runtime_state_to_path(&runtime_state_path()?, &to_runtime_state(process))
}

fn clear_persisted_runtime_state() -> Result<(), String> {
    remove_runtime_state_file_at(&runtime_state_path()?)
}

fn connect_to_port(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(CONNECT_TIMEOUT_MS),
    )
    .is_ok()
}

/// Pre-build Control UI assets if missing.
///
/// On Windows, usernames with spaces (e.g., "C:\Users\Alice Smith\...") cause
/// the engine's internal `pnpm ui:build` to fail because Node.js `spawn()` with
/// `shell: true` mishandles the CWD path. By running the build ourselves via
/// Rust's `Command` (which doesn't use shell), we bypass this issue.
fn ensure_control_ui_built(app: &tauri::AppHandle) {
    let openclaw_dir = match paths::get_openclaw_dir() {
        Ok(d) => d,
        Err(_) => return,
    };

    let ui_index = openclaw_dir
        .join("dist")
        .join("control-ui")
        .join("index.html");
    if ui_index.exists() {
        return;
    }

    let ui_dir = openclaw_dir.join("ui");
    if !ui_dir.join("package.json").exists() {
        return;
    }

    let node_bin = match environment::get_node_binary() {
        Ok(b) => b,
        Err(_) => return,
    };

    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": "info",
            "message": "Control UI 缺失，正在预构建..."
        }),
    );

    let node_dir = node_bin.parent().unwrap().to_path_buf();
    let sandbox_path = if let Some(current_path) = std::env::var_os("PATH") {
        let mut paths_vec = std::env::split_paths(&current_path).collect::<Vec<_>>();
        paths_vec.insert(0, node_dir.clone());
        std::env::join_paths(paths_vec).unwrap_or_default()
    } else {
        std::ffi::OsString::from(&node_dir)
    };

    let ui_node_modules = ui_dir.join("node_modules");
    if !ui_node_modules.join("vite").exists() {
        if let Ok(npm_bin) = environment::get_npm_binary() {
            let mut npm_cmd = std::process::Command::new(&node_bin);
            npm_cmd
                .arg(&npm_bin)
                .arg("install")
                .arg("--prefix")
                .arg(&ui_dir)
                .env("PATH", &sandbox_path)
                .stdout(Stdio::null())
                .stderr(Stdio::piped());

            #[cfg(target_os = "windows")]
            npm_cmd.creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);

            match npm_cmd.output() {
                Ok(output) if output.status.success() => {
                    let _ = app.emit(
                        "service-log",
                        serde_json::json!({
                            "level": "info",
                            "message": "Control UI 依赖安装完成"
                        }),
                    );
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let _ = app.emit("service-log", serde_json::json!({
                        "level": "warn",
                        "message": format!("Control UI 依赖安装失败: {}", stderr.chars().take(200).collect::<String>())
                    }));
                    return;
                }
                Err(error) => {
                    let _ = app.emit(
                        "service-log",
                        serde_json::json!({
                            "level": "warn",
                            "message": format!("Control UI 依赖安装异常: {error}")
                        }),
                    );
                    return;
                }
            }
        } else {
            return;
        }
    }

    let vite_js = ui_dir
        .join("node_modules")
        .join("vite")
        .join("bin")
        .join("vite.js");
    if !vite_js.exists() {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "warn",
                "message": "vite.js 未找到，跳过 Control UI 构建"
            }),
        );
        return;
    }

    let mut build_cmd = std::process::Command::new(&node_bin);
    build_cmd
        .arg(&vite_js)
        .arg("build")
        .current_dir(&ui_dir)
        .env("PATH", &sandbox_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    build_cmd.creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);

    match build_cmd.output() {
        Ok(output) if output.status.success() => {
            let _ = app.emit(
                "service-log",
                serde_json::json!({
                    "level": "success",
                    "message": "[OK] Control UI 预构建完成"
                }),
            );
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = app.emit("service-log", serde_json::json!({
                "level": "warn",
                "message": format!("Control UI 构建失败: {}", stderr.chars().take(200).collect::<String>())
            }));
        }
        Err(error) => {
            let _ = app.emit(
                "service-log",
                serde_json::json!({
                    "level": "warn",
                    "message": format!("Control UI 构建异常: {error}")
                }),
            );
        }
    }
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
    let script = "if (Get-Process -Id $args[0] -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }";
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
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);
    command.status().map(|status| status.success()).unwrap_or(false)
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
fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    let status = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG)
        .status()
        .map_err(|error| format!("Failed to stop OpenClaw process {pid}: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to stop OpenClaw process {pid}"))
    }
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    let term_status = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| format!("Failed to stop OpenClaw process {pid}: {error}"))?;

    if term_status.success() {
        return Ok(());
    }

    let kill_status = std::process::Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| format!("Failed to force-stop OpenClaw process {pid}: {error}"))?;

    if kill_status.success() {
        Ok(())
    } else {
        Err(format!("Failed to stop OpenClaw process {pid}"))
    }
}

fn set_tracked_process(state: &ServiceState, tracked: Option<TrackedServiceProcess>) {
    let tracked_port = tracked.as_ref().map(|process| process.port).unwrap_or(DEFAULT_PORT);
    *state.tracked_process.lock().unwrap() = tracked;
    *state.port.lock().unwrap() = tracked_port;
}

fn validate_external_process(process: &TrackedServiceProcess) -> bool {
    is_process_running(process.pid) && connect_to_port(process.port)
}

fn resolve_known_process(state: &ServiceState) -> Result<Option<TrackedServiceProcess>, String> {
    let child_pid = {
        let mut child_guard = state.child.lock().unwrap();
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => Some(child.id()),
                Ok(Some(_)) | Err(_) => {
                    child_guard.take();
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
        return Ok(Some(existing));
    }

    if let Some(tracked) = state.tracked_process.lock().unwrap().clone() {
        if validate_external_process(&tracked) {
            *state.port.lock().unwrap() = tracked.port;
            return Ok(Some(tracked));
        }
        set_tracked_process(state, None);
    }

    if let Some(runtime) = read_runtime_state()? {
        let tracked = to_tracked_process(runtime);
        if validate_external_process(&tracked) {
            set_tracked_process(state, Some(tracked.clone()));
            return Ok(Some(tracked));
        }

        let _ = clear_persisted_runtime_state();
    }

    Ok(None)
}

fn emit_service_port(app: &tauri::AppHandle, port: u16) {
    let _ = app.emit("service-port", serde_json::json!({ "port": port }));
}

pub fn resolve_known_service_port(state: &ServiceState) -> Result<u16, String> {
    if let Some(tracked) = resolve_known_process(state)? {
        return Ok(tracked.port);
    }

    Ok(*state.port.lock().unwrap())
}

fn spawn_heartbeat_monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(3));
        let _ = app.emit("service-heartbeat", serde_json::json!({}));
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
    ensure_control_ui_built(&app);

    if let Some(existing) = resolve_known_process(state.inner())? {
        emit_service_port(&app, existing.port);
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "info",
                "message": format!("检测到已在后台运行的 OpenClaw，复用端口 {}", existing.port)
            }),
        );
        if open_browser {
            let token = resolve_gateway_token();
            let _ = open::that(format!(
                "http://localhost:{}?token={}",
                existing.port, token
            ));
        }
        return Ok("Service is already running".to_string());
    }

    let openclaw_dir = paths::get_openclaw_dir()?;
    if !openclaw_dir.join("package.json").exists() {
        return Err("OpenClaw 未安装，请先完成初始化".to_string());
    }

    let mut chosen_port = DEFAULT_PORT;
    let mut found = false;
    for port in DEFAULT_PORT..=MAX_PORT {
        if is_port_available(port) {
            chosen_port = port;
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!(
            "端口 {}-{} 全部被占用，请关闭其他 OpenClaw 实例后重试。",
            DEFAULT_PORT, MAX_PORT
        ));
    }

    if chosen_port != DEFAULT_PORT {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "warn",
                "message": format!("默认端口 {} 已被占用，自动切换到端口 {}", DEFAULT_PORT, chosen_port)
            }),
        );
    }

    emit_service_port(&app, chosen_port);
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": "info",
            "message": format!("正在启动 OpenClaw 服务 (端口 {})...", chosen_port)
        }),
    );

    let token = resolve_gateway_token();
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| format!("构建 OpenClaw 启动命令失败: {error}"))?;
    command
        .arg("gateway")
        .arg("--allow-unconfigured")
        .arg("--port")
        .arg(chosen_port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("OPENCLAW_GATEWAY_AUTH_TOKEN", &token);

    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 OpenClaw 失败: {error}"))?;

    let tracked = TrackedServiceProcess {
        pid: child.id(),
        port: chosen_port,
        started_at: now_unix_timestamp(),
    };

    if let Err(error) = persist_tracked_process(&tracked) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_clone = app.clone();

    {
        let mut child_guard = state.child.lock().unwrap();
        *child_guard = Some(child);
    }
    set_tracked_process(state.inner(), Some(tracked.clone()));

    if let Some(stdout) = stdout {
        let app_out = app_clone.clone();
        let open_port = chosen_port;
        let open_token = token.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut browser_opened = false;
            for line in reader.lines().map_while(Result::ok) {
                let level = classify_log_level(&line);

                if open_browser && !browser_opened && is_service_ready_signal(&line) {
                    browser_opened = true;
                    let app_browser = app_out.clone();
                    let browser_token = open_token.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(2));
                        let _ = app_browser.emit(
                            "service-log",
                            serde_json::json!({
                                "level": "success",
                                "message": "正在打开浏览器..."
                            }),
                        );
                        let _ = open::that(format!(
                            "http://localhost:{}?token={}",
                            open_port, browser_token
                        ));
                    });
                }

                let _ = app_out.emit(
                    "service-log",
                    serde_json::json!({
                        "level": level,
                        "message": line
                    }),
                );
            }
        });
    }

    if let Some(stderr) = stderr {
        let app_err = app_clone;
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_err.emit(
                    "service-log",
                    serde_json::json!({
                        "level": "error",
                        "message": line
                    }),
                );
            }
        });
    }

    spawn_heartbeat_monitor(app.clone());

    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": "info",
            "message": "OpenClaw 服务已启动，正在监听端口..."
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

    set_tracked_process(state.inner(), None);
    let _ = clear_persisted_runtime_state();

    if stopped {
        let _ = app.emit(
            "service-log",
            serde_json::json!({
                "level": "info",
                "message": "OpenClaw 服务已停止"
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

/// Detect if a log line indicates the service is ready to accept connections.
fn is_service_ready_signal(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("listening")
        || lower.contains("started on")
        || lower.contains("ready on")
        || lower.contains("server is running")
        || lower.contains("server started")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_path(file_name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "dragonclaw-service-test-{}-{}",
            std::process::id(),
            file_name
        ));
        path
    }

    #[test]
    fn test_port_available_after_release() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(is_port_available(port));
    }

    #[test]
    fn test_port_occupied_detection() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(!is_port_available(port));
        drop(listener);
        assert!(is_port_available(port));
    }

    #[test]
    fn test_classify_log_level() {
        assert_eq!(classify_log_level("npm warn deprecated"), "warn");
        assert_eq!(classify_log_level("npm error code ENOENT"), "error");
        assert_eq!(classify_log_level("  ERR_PNPM something failed"), "error");
        assert_eq!(classify_log_level("added 150 packages"), "info");
        assert_eq!(classify_log_level("Server started on port 3000"), "success");
        assert_eq!(classify_log_level("some normal output"), "info");
    }

    #[test]
    fn test_service_ready_signal() {
        assert!(is_service_ready_signal("Server started on port 3000"));
        assert!(is_service_ready_signal(
            "Listening on http://localhost:3000"
        ));
        assert!(is_service_ready_signal("Gateway ready on 0.0.0.0:3000"));
        assert!(is_service_ready_signal("server is running at port 3000"));
        assert!(!is_service_ready_signal("compiling TypeScript..."));
        assert!(!is_service_ready_signal("installing dependencies"));
    }

    #[test]
    fn runtime_state_round_trip() {
        let path = unique_temp_path("round-trip.json");
        let runtime = ServiceRuntimeState {
            pid: 1234,
            port: 18789,
            started_at: 42,
        };

        write_runtime_state_to_path(&path, &runtime).unwrap();
        let loaded = read_runtime_state_from_path(&path).unwrap();
        remove_runtime_state_file_at(&path).unwrap();

        assert_eq!(loaded, Some(runtime));
    }

    #[test]
    fn remove_runtime_state_file_is_idempotent() {
        let path = unique_temp_path("missing.json");
        remove_runtime_state_file_at(&path).unwrap();
        remove_runtime_state_file_at(&path).unwrap();
    }

    #[test]
    fn stale_runtime_state_detection_fails_for_dead_process() {
        let tracked = TrackedServiceProcess {
            pid: u32::MAX,
            port: 18789,
            started_at: 1,
        };
        assert!(!validate_external_process(&tracked));
    }
}
