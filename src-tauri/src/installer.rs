// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/// OpenClaw dependency installation via pnpm.
///
/// Installs pnpm via npm, then runs `pnpm install` in the OpenClaw engine directory.
/// Automatically detects and uses Taobao registry mirror when npmjs.org is slow.
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::Emitter;

use crate::download;
use crate::environment;
use crate::openclaw_cli;
use crate::paths;

pub fn has_cli_build_output(openclaw_dir: &Path) -> bool {
    openclaw_dir.join("dist").join("entry.js").exists()
        || openclaw_dir.join("dist").join("entry.mjs").exists()
}

/// On Windows, hide the CMD window when spawning child processes
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn install_openclaw_dependencies_blocking(
    app: tauri::AppHandle,
    openclaw_dir: PathBuf,
    use_mirror: bool,
) -> Result<String, String> {
    let node_modules = openclaw_dir.join("node_modules");
    let install_marker = node_modules.join(".install_complete");

    if node_modules.exists() {
        let looks_complete = node_modules.join(".pnpm").exists()
            && install_marker.exists()
            && has_cli_build_output(&openclaw_dir);
        if !looks_complete {
            let _ = app.emit(
                "setup-progress",
                serde_json::json!({
                    "stage": "npm_install",
                    "message": "检测到不完整的依赖或缺失的构建产物，正在自动清理后重新安装...",
                    "percent": 86
                }),
            );
            let _ = std::fs::remove_dir_all(&node_modules);
        }
    }

    let node_bin = environment::get_node_binary()?;
    let npm_bin = environment::get_npm_binary()?;
    let node_dir = node_bin.parent().unwrap().to_path_buf();

    // Build PATH that includes sandboxed node directory
    let sandbox_path = if let Some(current_path) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&current_path).collect::<Vec<_>>();
        paths.insert(0, node_dir.clone());
        std::env::join_paths(paths).unwrap_or_default()
    } else {
        std::ffi::OsString::from(&node_dir)
    };

    // ===== Step 1: Install pnpm globally via npm =====
    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "npm_install",
            "message": "正在安装 pnpm 包管理器...",
            "percent": 87
        }),
    );

    let mut pnpm_cmd = std::process::Command::new(&node_bin);
    pnpm_cmd
        .arg(&npm_bin)
        .arg("install")
        .arg("-g")
        .arg("pnpm")
        .current_dir(&openclaw_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", &sandbox_path);

    #[cfg(target_os = "windows")]
    pnpm_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    if use_mirror {
        pnpm_cmd.arg("--registry=https://registry.npmmirror.com");
    }

    let pnpm_output = openclaw_cli::run_command_with_timeout(
        &mut pnpm_cmd,
        Duration::from_secs(20 * 60),
        "安装 pnpm",
    )?;

    if !pnpm_output.status.success() {
        let stderr = String::from_utf8_lossy(&pnpm_output.stderr);
        return Err(format!("安装 pnpm 失败:\n{}", stderr));
    }

    // ===== Step 2: Run pnpm install =====
    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "npm_install",
            "message": "正在安装 OpenClaw 依赖包 (这可能需要几分钟)...",
            "percent": 90
        }),
    );

    // Find pnpm binary — first try `npm root -g`, then fall back to static paths
    let mut pnpm_cli: Option<PathBuf> = None;

    // Phase 1: Dynamic discovery via `npm root -g`
    {
        let mut root_cmd = std::process::Command::new(&node_bin);
        root_cmd
            .arg(&npm_bin)
            .arg("root")
            .arg("-g")
            .env("PATH", &sandbox_path);
        #[cfg(target_os = "windows")]
        root_cmd.creation_flags(0x08000000);

        if let Ok(output) = root_cmd.output() {
            if output.status.success() {
                let global_root = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let root_path = PathBuf::from(&global_root);
                let candidates = vec![
                    root_path.join("pnpm").join("bin").join("pnpm.cjs"),
                    root_path.join("pnpm").join("dist").join("pnpm.cjs"),
                ];
                pnpm_cli = candidates.into_iter().find(|p| p.exists());
            }
        }
    }

    // Phase 2: Static fallback paths
    if pnpm_cli.is_none() {
        let pnpm_candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                node_dir
                    .join("node_modules")
                    .join("pnpm")
                    .join("bin")
                    .join("pnpm.cjs"),
                node_dir
                    .join("node_modules")
                    .join("pnpm")
                    .join("dist")
                    .join("pnpm.cjs"),
                node_dir
                    .join("lib")
                    .join("node_modules")
                    .join("pnpm")
                    .join("bin")
                    .join("pnpm.cjs"),
                node_dir
                    .join("lib")
                    .join("node_modules")
                    .join("pnpm")
                    .join("dist")
                    .join("pnpm.cjs"),
                node_dir.join("pnpm.cmd"),
                node_dir.join("pnpm"),
            ]
        } else {
            vec![
                node_dir
                    .join("..")
                    .join("lib")
                    .join("node_modules")
                    .join("pnpm")
                    .join("bin")
                    .join("pnpm.cjs"),
                node_dir
                    .join("..")
                    .join("lib")
                    .join("node_modules")
                    .join("pnpm")
                    .join("dist")
                    .join("pnpm.cjs"),
                node_dir.join("pnpm"),
            ]
        };

        pnpm_cli = pnpm_candidates.iter().find(|p| p.exists()).cloned();
        if pnpm_cli.is_none() {
            let searched = pnpm_candidates
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("\n  ");
            return Err(format!(
                "pnpm 安装成功但找不到 pnpm.cjs，已搜索:\n  {}",
                searched
            ));
        }
    }

    let pnpm_cli = pnpm_cli.unwrap();

    let mut install_cmd = std::process::Command::new(&node_bin);
    install_cmd
        .arg(&pnpm_cli)
        .arg("install")
        .current_dir(&openclaw_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", &sandbox_path);

    #[cfg(target_os = "windows")]
    install_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    if use_mirror {
        let _ = app.emit(
            "setup-progress",
            serde_json::json!({
                "stage": "npm_install",
                "message": "NPM 官方源连接慢，已切换淘宝镜像加速...",
                "percent": 91
            }),
        );
        install_cmd.env("npm_config_registry", "https://registry.npmmirror.com");
    }

    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "npm_install",
            "message": "正在执行 pnpm install (请耐心等待)...",
            "percent": 92
        }),
    );

    let output = openclaw_cli::run_command_with_timeout(
        &mut install_cmd,
        Duration::from_secs(20 * 60),
        "执行 pnpm install",
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let combined = format!("{}\n{}", stdout, stderr);

        // Detect node-llama-cpp postinstall failure (multiple possible causes):
        // - ELIFECYCLE: generic postinstall script failure
        // - 3221225477 (0xC0000005): ACCESS_VIOLATION (CPU without AVX2)
        // - ERR_DLOPEN_FAILED: prebuilt .node binary can't load (missing VC++ runtime)
        // - spawn git ENOENT: git not installed, can't clone source to build
        let is_llama_crash = combined.contains("node-llama-cpp")
            && (combined.contains("ELIFECYCLE")
                || combined.contains("3221225477")
                || combined.contains("ERR_DLOPEN_FAILED")
                || combined.contains("spawn git ENOENT"));

        if is_llama_crash {
            // ===== Smart retry: skip node-llama-cpp binary download =====
            let _ = app.emit(
                "setup-progress",
                serde_json::json!({
                    "stage": "npm_install",
                    "message": "检测到本地推理组件不兼容，正在兼容性适配...",
                    "percent": 93
                }),
            );

            let node_modules_retry = openclaw_dir.join("node_modules");
            let _ = std::fs::remove_dir_all(&node_modules_retry);

            let mut retry_cmd = std::process::Command::new(&node_bin);
            retry_cmd
                .arg(&pnpm_cli)
                .arg("install")
                .current_dir(&openclaw_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .env("PATH", &sandbox_path)
                .env("NODE_LLAMA_CPP_SKIP_DOWNLOAD", "true")
                .env("NODE_LLAMA_CPP_SKIP_BUILD", "true");

            #[cfg(target_os = "windows")]
            retry_cmd.creation_flags(0x08000000);

            if use_mirror {
                retry_cmd.env("npm_config_registry", "https://registry.npmmirror.com");
            }

            let retry_output = openclaw_cli::run_command_with_timeout(
                &mut retry_cmd,
                Duration::from_secs(20 * 60),
                "重试 pnpm install",
            )?;

            if !retry_output.status.success() {
                let retry_stderr = String::from_utf8_lossy(&retry_output.stderr);
                return Err(format!(
                    "pnpm install 失败 (已跳过本地推理组件重试):\nstdout: {}\nstderr: {}\n\n重试 stderr: {}",
                    stdout, stderr, retry_stderr
                ));
            }
        } else {
            // ===== Generic retry: clean node_modules and try once more =====
            let _ = app.emit(
                "setup-progress",
                serde_json::json!({
                    "stage": "npm_install",
                    "message": "安装遇到问题，正在清理环境并重试...",
                    "percent": 93
                }),
            );

            let node_modules_retry = openclaw_dir.join("node_modules");
            let _ = std::fs::remove_dir_all(&node_modules_retry);

            let mut retry_cmd = std::process::Command::new(&node_bin);
            retry_cmd
                .arg(&pnpm_cli)
                .arg("install")
                .current_dir(&openclaw_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .env("PATH", &sandbox_path);

            #[cfg(target_os = "windows")]
            retry_cmd.creation_flags(0x08000000);

            if use_mirror {
                retry_cmd.env("npm_config_registry", "https://registry.npmmirror.com");
            }

            let retry_output = openclaw_cli::run_command_with_timeout(
                &mut retry_cmd,
                Duration::from_secs(20 * 60),
                "重试 pnpm install",
            )?;

            if !retry_output.status.success() {
                let retry_stderr = String::from_utf8_lossy(&retry_output.stderr);
                return Err(format!(
                    "pnpm install 失败 (已重试一次):\nstdout: {}\nstderr: {}\n\n重试 stderr: {}",
                    stdout, stderr, retry_stderr
                ));
            }
        }
    }

    // Verify node_modules was created
    if !openclaw_dir.join("node_modules").exists() {
        return Err("pnpm install 执行完毕但 node_modules 目录未创建".to_string());
    }

    if !has_cli_build_output(&openclaw_dir) {
        let _ = app.emit(
            "setup-progress",
            serde_json::json!({
                "stage": "npm_build",
                "message": "检测到新版 OpenClaw 缺少 CLI 构建产物，正在执行 pnpm build...",
                "percent": 96
            }),
        );

        let mut build_cmd = std::process::Command::new(&node_bin);
        build_cmd
            .arg(&pnpm_cli)
            .arg("build")
            .current_dir(&openclaw_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PATH", &sandbox_path);

        #[cfg(target_os = "windows")]
        build_cmd.creation_flags(0x08000000);

        if use_mirror {
            build_cmd.env("npm_config_registry", "https://registry.npmmirror.com");
        }

        let build_output = openclaw_cli::run_command_with_timeout(
            &mut build_cmd,
            Duration::from_secs(20 * 60),
            "执行 pnpm build",
        )?;

        if !build_output.status.success() {
            let stderr = String::from_utf8_lossy(&build_output.stderr);
            let stdout = String::from_utf8_lossy(&build_output.stdout);
            return Err(format!(
                "pnpm build 失败:\nstdout: {}\nstderr: {}",
                stdout, stderr
            ));
        }
    }

    if !has_cli_build_output(&openclaw_dir) {
        return Err("pnpm build 执行完毕但仍未找到 OpenClaw CLI 构建产物".to_string());
    }

    // Write .install_complete marker
    let marker_path = openclaw_dir.join("node_modules").join(".install_complete");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let _ = std::fs::write(
        &marker_path,
        format!("installed_at={}\npnpm=true\n", timestamp),
    );

    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "npm_done",
            "message": "✅ 所有依赖与构建产物已就绪！",
            "percent": 98
        }),
    );

    Ok("npm install completed successfully".to_string())
}

/// Run `pnpm install` using sandboxed Node.js
/// First installs pnpm via npm, then uses pnpm for proper workspace dependency resolution
/// Automatically sets Taobao registry mirror when npmjs.org is slow
#[tauri::command]
pub async fn run_npm_install(app: tauri::AppHandle) -> Result<String, String> {
    let openclaw_dir = paths::get_openclaw_dir()?;
    if !openclaw_dir.join("package.json").exists() {
        return Err("OpenClaw 源码未找到，请先下载源码".to_string());
    }

    let node_modules = openclaw_dir.join("node_modules");
    let install_marker = node_modules.join(".install_complete");

    if node_modules.exists()
        && node_modules.join(".pnpm").exists()
        && install_marker.exists()
        && has_cli_build_output(&openclaw_dir)
    {
        return Ok("node_modules already installed (pnpm)".to_string());
    }

    let use_mirror = !download::test_url_reachable("https://registry.npmjs.org/").await;

    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        install_openclaw_dependencies_blocking(app_clone, openclaw_dir, use_mirror)
    })
    .await
    .map_err(|error| format!("依赖安装任务调度失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::has_cli_build_output;

    fn make_temp_dir(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "dragonclaw-installer-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn detect_cli_build_output_from_entry_js() {
        let dir = make_temp_dir("entry-js");
        std::fs::create_dir_all(dir.join("dist")).unwrap();
        std::fs::write(dir.join("dist").join("entry.js"), "").unwrap();
        assert!(has_cli_build_output(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn detect_cli_build_output_from_entry_mjs() {
        let dir = make_temp_dir("entry-mjs");
        std::fs::create_dir_all(dir.join("dist")).unwrap();
        std::fs::write(dir.join("dist").join("entry.mjs"), "").unwrap();
        assert!(has_cli_build_output(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_cli_build_output_returns_false() {
        let dir = make_temp_dir("missing-entry");
        assert!(!has_cli_build_output(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
