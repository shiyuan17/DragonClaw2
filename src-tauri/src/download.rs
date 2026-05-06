// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use futures_util::StreamExt;
/// OpenClaw source code download and extraction.
///
/// Downloads the latest OpenClaw source from GitHub (with mirror fallback)
/// and extracts it to the sandbox directory.
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::environment;
use crate::paths;

const OPENCLAW_REPO: &str = "openclaw/openclaw";
const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &["github.com", "ghfast.top", "mirror.ghproxy.com"];

/// Pinned OpenClaw version validated against DragonClaw's local gateway/chat flow.
/// See: https://github.com/openclaw/openclaw/releases/tag/v2026.5.4
const PINNED_VERSION: &str = "v2026.5.4";

/// Quick URL reachability test (3 second timeout)
pub async fn test_url_reachable(url: &str) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    client.head(url).send().await.is_ok()
}

fn validate_download_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|error| format!("下载地址格式无效: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "下载地址缺少主机名".to_string())?;
    if !ALLOWED_DOWNLOAD_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
    {
        return Err(format!("下载地址主机未在允许列表中: {host}"));
    }

    let url_text = parsed.as_str().to_ascii_lowercase();
    let expected_suffix = format!(
        "/{}/archive/refs/tags/{}.zip",
        OPENCLAW_REPO,
        PINNED_VERSION.to_ascii_lowercase()
    );
    if !url_text.contains(expected_suffix.as_str()) {
        return Err("下载地址未指向当前锁定的 OpenClaw tag zip。".to_string());
    }

    Ok(())
}

fn validate_extracted_openclaw_dir(openclaw_dir: &std::path::Path) -> Result<(), String> {
    let package_path = openclaw_dir.join("package.json");
    if !package_path.exists() {
        return Err("解压结果缺少 package.json".to_string());
    }

    let raw = std::fs::read_to_string(&package_path)
        .map_err(|error| format!("读取 OpenClaw package.json 失败: {error}"))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("解析 OpenClaw package.json 失败: {error}"))?;
    let package_name = parsed
        .get("name")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if !package_name.eq_ignore_ascii_case("openclaw") {
        return Err(format!("下载内容校验失败：package.json name={package_name}"));
    }

    Ok(())
}

/// Extract a ZIP file (shared utility)
pub fn extract_zip(archive_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目 {} 失败: {}", i, e))?;

        let out_path = dest.join(file.mangled_name());

        if file.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
            }
            let mut outfile =
                std::fs::File::create(&out_path).map_err(|e| format!("创建文件失败: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("解压文件失败: {}", e))?;
        }
    }

    Ok(())
}

/// Check if OpenClaw needs to be (re)downloaded.
/// Returns true if: source is missing, or installed version doesn't match PINNED_VERSION.
pub fn needs_download() -> Result<bool, String> {
    let openclaw_dir = paths::get_openclaw_dir()?;
    if !openclaw_dir.join("package.json").exists() {
        return Ok(true);
    }
    validate_extracted_openclaw_dir(&openclaw_dir)?;

    let version_file = openclaw_dir.join(".openclaw_version");
    if !version_file.exists() {
        return Ok(true); // Old installation without version marker
    }
    let installed = std::fs::read_to_string(&version_file).unwrap_or_default();
    Ok(installed.trim() != PINNED_VERSION)
}

fn materialize_openclaw_from_downloaded_zip(
    zip_path: PathBuf,
    sandbox: PathBuf,
    openclaw_dir: PathBuf,
    pinned_version: &'static str,
) -> Result<(), String> {
    let temp_extract = sandbox.join("_openclaw_temp");
    if temp_extract.exists() {
        let _ = std::fs::remove_dir_all(&temp_extract);
    }
    std::fs::create_dir_all(&temp_extract).map_err(|e| format!("创建临时目录失败: {}", e))?;

    extract_zip(&zip_path, &temp_extract)?;

    // GitHub ZIPs extract to repo-name-branch/ (e.g., openclaw-main/)
    if openclaw_dir.exists() {
        let _ = std::fs::remove_dir_all(&openclaw_dir);
    }

    let mut found = false;
    if let Ok(entries) = std::fs::read_dir(&temp_extract) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                std::fs::rename(&path, &openclaw_dir)
                    .map_err(|e| format!("移动源码目录失败: {}", e))?;
                found = true;
                break;
            }
        }
    }

    if !found {
        return Err("解压后未找到源码目录".to_string());
    }

    let _ = std::fs::remove_file(&zip_path);
    let _ = std::fs::remove_dir_all(&temp_extract);

    if !openclaw_dir.join("package.json").exists() {
        return Err("解压成功但未找到 package.json，源码可能不完整".to_string());
    }
    validate_extracted_openclaw_dir(&openclaw_dir)?;

    let version_file = openclaw_dir.join(".openclaw_version");
    let _ = std::fs::write(&version_file, pinned_version);

    Ok(())
}

/// Download OpenClaw source code as ZIP and extract.
/// Downloads a pinned release version for stability.
/// Uses GitHub mirror fallback for China users.
#[tauri::command]
pub async fn download_openclaw_source(app: tauri::AppHandle) -> Result<String, String> {
    let openclaw_dir = paths::get_openclaw_dir()?;

    // Check if we need to download (missing or version mismatch)
    if openclaw_dir.join("package.json").exists() && !needs_download()? {
        return Ok("OpenClaw source already exists (version matched)".to_string());
    }

    // If version mismatch, remove old source to force clean install
    if openclaw_dir.exists() && openclaw_dir.join("package.json").exists() {
        let _ = app.emit(
            "setup-progress",
            serde_json::json!({
                "stage": "download_openclaw",
                "message": format!("检测到版本不匹配，正在更新到 {}...", PINNED_VERSION),
                "percent": 60
            }),
        );
        let dir_to_remove = openclaw_dir.clone();
        tokio::task::spawn_blocking(move || {
            let _ = std::fs::remove_dir_all(&dir_to_remove);
        })
        .await
        .map_err(|error| format!("清理旧版 OpenClaw 源码任务调度失败: {error}"))?;
    }

    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "download_openclaw",
            "message": format!("正在获取 OpenClaw {} 版本...", PINNED_VERSION),
            "percent": 62
        }),
    );

    // Primary: GitHub tagged release, Fallback: mirror services
    let primary_url = format!(
        "https://github.com/{}/archive/refs/tags/{}.zip",
        OPENCLAW_REPO, PINNED_VERSION
    );
    let fallback_urls = vec![
        format!(
            "https://ghfast.top/https://github.com/{}/archive/refs/tags/{}.zip",
            OPENCLAW_REPO, PINNED_VERSION
        ),
        format!(
            "https://mirror.ghproxy.com/https://github.com/{}/archive/refs/tags/{}.zip",
            OPENCLAW_REPO, PINNED_VERSION
        ),
    ];

    // Try primary first
    let download_url = if test_url_reachable(&primary_url).await {
        primary_url.clone()
    } else {
        let _ = app.emit(
            "setup-progress",
            serde_json::json!({
                "stage": "download_openclaw",
                "message": "GitHub 连接缓慢，切换加速镜像...",
                "percent": 63
            }),
        );
        let mut found_url = None;
        for fallback in &fallback_urls {
            if test_url_reachable(fallback).await {
                found_url = Some(fallback.clone());
                break;
            }
        }
        found_url.unwrap_or(primary_url)
    };

    // Download ZIP
    validate_download_url(&download_url)?;

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| environment::humanize_network_error(&e.to_string()))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    let sandbox = environment::get_sandbox_dir()?;
    let zip_path = sandbox.join("openclaw-source.zip");
    let mut file = tokio::fs::File::create(&zip_path)
        .await
        .map_err(|e| format!("创建临时文件失败: {}", e))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| environment::humanize_network_error(&e.to_string()))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入错误: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percent = 65 + (downloaded as f64 / total_size as f64 * 15.0) as u32;
            let _ = app.emit(
                "setup-progress",
                serde_json::json!({
                    "stage": "download_openclaw",
                    "message": format!("正在下载 OpenClaw 源码... {:.1}MB / {:.1}MB",
                        downloaded as f64 / 1_048_576.0,
                        total_size as f64 / 1_048_576.0),
                    "percent": percent.min(80)
                }),
            );
        }
    }
    drop(file);

    // Extract ZIP (heavy disk work — avoid blocking the async runtime)
    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "extract_openclaw",
            "message": "正在解压 OpenClaw 源码...",
            "percent": 82
        }),
    );

    let zip_path_move = zip_path.clone();
    let sandbox_move = sandbox.clone();
    let openclaw_dir_move = openclaw_dir.clone();
    tokio::task::spawn_blocking(move || {
        materialize_openclaw_from_downloaded_zip(
            zip_path_move,
            sandbox_move,
            openclaw_dir_move,
            PINNED_VERSION,
        )
    })
    .await
    .map_err(|error| format!("解压 OpenClaw 源码任务调度失败: {error}"))??;

    let _ = app.emit(
        "setup-progress",
        serde_json::json!({
            "stage": "openclaw_ready",
            "message": format!("✅ OpenClaw {} 源码获取完成！", PINNED_VERSION),
            "percent": 85
        }),
    );

    Ok(format!(
        "OpenClaw {} source at: {}",
        PINNED_VERSION,
        openclaw_dir.display()
    ))
}
