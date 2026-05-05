// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::process::Stdio;
use std::time::Duration;

use tauri::Emitter;

use crate::environment;
use crate::openclaw_cli;
use crate::paths;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const WINDOWS_HIDDEN_WINDOW_FLAG: u32 = 0x0800_0000;

pub async fn ensure_control_ui_built_nonblocking(app: tauri::AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ensure_control_ui_built(&app);
    })
    .await
    .map_err(|error| format!("Control UI 预构建任务调度失败: {error}"))
}

pub fn schedule_control_ui_prepare(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = ensure_control_ui_built_nonblocking(app).await;
    });
}

pub async fn open_control_ui(
    app: tauri::AppHandle,
    port: u16,
    token: String,
) -> Result<(), String> {
    ensure_control_ui_built_nonblocking(app).await?;
    let normalized_token = token.trim();
    if normalized_token.is_empty() {
        return Err("Control UI is missing a gateway token.".to_string());
    }
    open::that(format!("http://127.0.0.1:{port}#token={normalized_token}"))
        .map_err(|error| format!("打开 Control UI 失败: {error}"))?;
    Ok(())
}

fn emit_service_log(app: &tauri::AppHandle, level: &str, message: impl Into<String>) {
    let _ = app.emit(
        "service-log",
        serde_json::json!({
            "level": level,
            "message": message.into()
        }),
    );
}

fn ensure_control_ui_built(app: &tauri::AppHandle) {
    let openclaw_dir = match paths::get_openclaw_dir() {
        Ok(directory) => directory,
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
        Ok(binary) => binary,
        Err(_) => return,
    };

    emit_service_log(app, "info", "Control UI 缺失，正在预构建...");

    let node_dir = match node_bin.parent() {
        Some(parent) => parent.to_path_buf(),
        None => return,
    };
    let sandbox_path = if let Some(current_path) = std::env::var_os("PATH") {
        let mut paths_vec = std::env::split_paths(&current_path).collect::<Vec<_>>();
        paths_vec.insert(0, node_dir.clone());
        std::env::join_paths(paths_vec).unwrap_or_default()
    } else {
        std::ffi::OsString::from(&node_dir)
    };

    let ui_node_modules = ui_dir.join("node_modules");
    if !ui_node_modules.join("vite").exists() {
        let Ok(npm_bin) = environment::get_npm_binary() else {
            return;
        };
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

        match openclaw_cli::run_command_with_timeout(
            &mut npm_cmd,
            Duration::from_secs(10 * 60),
            "Control UI 依赖安装",
        ) {
            Ok(output) if output.status.success() => {
                emit_service_log(app, "info", "Control UI 依赖安装完成");
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                emit_service_log(
                    app,
                    "warn",
                    format!(
                        "Control UI 依赖安装失败: {}",
                        stderr.chars().take(200).collect::<String>()
                    ),
                );
                return;
            }
            Err(error) => {
                emit_service_log(app, "warn", format!("Control UI 依赖安装异常: {error}"));
                return;
            }
        }
    }

    let vite_js = ui_dir
        .join("node_modules")
        .join("vite")
        .join("bin")
        .join("vite.js");
    if !vite_js.exists() {
        emit_service_log(app, "warn", "vite.js 未找到，跳过 Control UI 构建");
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

    match openclaw_cli::run_command_with_timeout(
        &mut build_cmd,
        Duration::from_secs(10 * 60),
        "Control UI 构建",
    ) {
        Ok(output) if output.status.success() => {
            emit_service_log(app, "success", "[OK] Control UI 预构建完成");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            emit_service_log(
                app,
                "warn",
                format!(
                    "Control UI 构建失败: {}",
                    stderr.chars().take(200).collect::<String>()
                ),
            );
        }
        Err(error) => {
            emit_service_log(app, "warn", format!("Control UI 构建异常: {error}"));
        }
    }
}
