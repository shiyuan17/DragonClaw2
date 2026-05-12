// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use serde_json::Value;

use crate::{environment, paths};

const WINDOWS_HIDDEN_WINDOW_FLAG: u32 = 0x0800_0000;
#[cfg(target_os = "windows")]
const USER_PATH_VALUE_ENV: &str = "DRAGONCLAW_USER_PATH_VALUE";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawCliAvailabilityResult {
    pub shim_path: String,
    pub path_updated: bool,
    pub restart_recommended: bool,
}

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
    command.creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);

    if let Some(current_path) = std::env::var_os("PATH") {
        let mut path_entries = std::env::split_paths(&current_path).collect::<Vec<_>>();
        path_entries.insert(0, node_dir);
        let new_path = std::env::join_paths(path_entries)
            .map_err(|error| format!("Failed to build PATH for OpenClaw CLI: {error}"))?;
        command.env("PATH", new_path);
    }

    Ok(command)
}

pub fn run_command_with_timeout(
    command: &mut Command,
    timeout: Duration,
    context: &str,
) -> Result<Output, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("{context} 启动失败: {error}"))?;

    let stdout_handle = child.stdout.take().map(|mut stdout| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.read_to_end(&mut bytes);
            bytes
        })
    });
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.read_to_end(&mut bytes);
            bytes
        })
    });

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_handle
                    .map(|handle| handle.join().unwrap_or_default())
                    .unwrap_or_default();
                let stderr = stderr_handle
                    .map(|handle| handle.join().unwrap_or_default())
                    .unwrap_or_default();
                return Ok(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                if let Some(handle) = stdout_handle {
                    let _ = handle.join();
                }
                if let Some(handle) = stderr_handle {
                    let _ = handle.join();
                }
                return Err(format!("{context} 超时（超过 {} 秒）", timeout.as_secs()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{context} 等待失败: {error}"));
            }
        }
    }
}

fn openclaw_entry_path() -> Result<PathBuf, String> {
    Ok(paths::engine_dir()?.join("openclaw.mjs"))
}

fn openclaw_shim_path() -> Result<PathBuf, String> {
    Ok(
        paths::local_bin_dir()?.join(if cfg!(target_os = "windows") {
            "openclaw.cmd"
        } else {
            "openclaw"
        }),
    )
}

fn normalize_path_for_compare(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('/', "\\");
    raw.trim_end_matches('\\').to_ascii_lowercase()
}

fn merge_path_entries(current: Option<&OsStr>, target: &Path) -> Result<(OsString, bool), String> {
    let current_entries = current
        .map(std::env::split_paths)
        .map(|paths| paths.collect::<Vec<_>>())
        .unwrap_or_default();

    if current_entries
        .iter()
        .any(|entry| normalize_path_for_compare(entry) == normalize_path_for_compare(target))
    {
        return Ok((
            current.unwrap_or_else(|| OsStr::new("")).to_os_string(),
            false,
        ));
    }

    let mut merged_entries = current_entries;
    merged_entries.push(target.to_path_buf());
    let merged = std::env::join_paths(merged_entries)
        .map_err(|error| format!("Failed to merge user PATH: {error}"))?;
    Ok((merged, true))
}

fn build_windows_cli_shim(node_bin: &Path, entry_path: &Path) -> String {
    format!(
        "@echo off\r\nsetlocal\r\n\"{}\" \"{}\" %*\r\n",
        node_bin.display(),
        entry_path.display()
    )
}

#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command.creation_flags(WINDOWS_HIDDEN_WINDOW_FLAG);
    command
}

#[cfg(not(target_os = "windows"))]
fn hidden_command(program: &str) -> Command {
    Command::new(program)
}

#[cfg(target_os = "windows")]
fn run_powershell_script(script: &str, args: &[&str]) -> Result<Output, String> {
    let mut command = hidden_command("powershell");
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
        .stderr(Stdio::piped());

    for arg in args {
        command.arg(arg);
    }

    command
        .output()
        .map_err(|error| format!("Failed to run PowerShell helper: {error}"))
}

fn decode_command_output(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(value) => value.trim().to_string(),
        Err(_) => String::from_utf8_lossy(bytes).trim().to_string(),
    }
}

#[cfg(target_os = "windows")]
fn decode_windows_command_output(bytes: &[u8]) -> String {
    let utf8 = decode_command_output(bytes);
    if !utf8.contains('\u{FFFD}') {
        return utf8;
    }

    decode_windows_code_page(bytes, 1)
        .or_else(|| decode_windows_code_page(bytes, 0))
        .unwrap_or(utf8)
}

#[cfg(target_os = "windows")]
fn decode_windows_code_page(bytes: &[u8], code_page: u32) -> Option<String> {
    use std::ffi::c_char;

    #[link(name = "kernel32")]
    extern "system" {
        fn MultiByteToWideChar(
            CodePage: u32,
            dwFlags: u32,
            lpMultiByteStr: *const c_char,
            cbMultiByte: i32,
            lpWideCharStr: *mut u16,
            cchWideChar: i32,
        ) -> i32;
    }

    if bytes.is_empty() || bytes.len() > i32::MAX as usize {
        return None;
    }

    let byte_count = bytes.len() as i32;
    let required = unsafe {
        MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr() as *const c_char,
            byte_count,
            std::ptr::null_mut(),
            0,
        )
    };
    if required <= 0 {
        return None;
    }

    let mut wide = vec![0u16; required as usize];
    let written = unsafe {
        MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr() as *const c_char,
            byte_count,
            wide.as_mut_ptr(),
            required,
        )
    };
    if written <= 0 {
        return None;
    }

    Some(
        String::from_utf16_lossy(&wide[..written as usize])
            .trim()
            .to_string(),
    )
}

#[cfg(not(target_os = "windows"))]
fn decode_windows_command_output(bytes: &[u8]) -> String {
    decode_command_output(bytes)
}

#[cfg(target_os = "windows")]
fn read_user_path_value() -> Result<Option<String>, String> {
    let output =
        run_powershell_script("[Environment]::GetEnvironmentVariable('Path', 'User')", &[])?;

    if !output.status.success() {
        let stderr = decode_windows_command_output(&output.stderr);
        return Err(if stderr.is_empty() {
            "Failed to read user PATH".to_string()
        } else {
            format!("Failed to read user PATH: {stderr}")
        });
    }

    let value = decode_windows_command_output(&output.stdout);
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

#[cfg(target_os = "windows")]
fn write_user_path_value(path_value: &str) -> Result<(), String> {
    let script = r#"
$pathValue = [Environment]::GetEnvironmentVariable('DRAGONCLAW_USER_PATH_VALUE', 'Process')
if ($null -eq $pathValue) {
    throw 'Missing DRAGONCLAW_USER_PATH_VALUE'
}
[Environment]::SetEnvironmentVariable('Path', $pathValue, 'User')
try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
"@ -ErrorAction Stop | Out-Null
    $result = [UIntPtr]::Zero
    [void][NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
} catch {
    # Best effort only.
}
"#;

    let mut command = hidden_command("powershell");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env(USER_PATH_VALUE_ENV, path_value)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = command
        .output()
        .map_err(|error| format!("Failed to run PowerShell helper: {error}"))?;
    if !output.status.success() {
        let stderr = decode_windows_command_output(&output.stderr);
        return Err(if stderr.is_empty() {
            "Failed to write user PATH".to_string()
        } else {
            format!("Failed to write user PATH: {stderr}")
        });
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_windows_user_path_contains(target_dir: &Path) -> Result<bool, String> {
    let current_path = read_user_path_value()?;
    let (merged, updated) =
        merge_path_entries(current_path.as_deref().map(OsStr::new), target_dir)?;
    if updated {
        write_user_path_value(&merged.to_string_lossy())?;
    }
    Ok(updated)
}

#[cfg(not(target_os = "windows"))]
fn ensure_windows_user_path_contains(_target_dir: &Path) -> Result<bool, String> {
    Ok(false)
}

pub fn create_openclaw_cli_command() -> Result<Command, String> {
    let entry_path = openclaw_entry_path()?;
    let mut command = create_bundled_node_script_command(&entry_path)?;
    command.current_dir(paths::engine_dir()?);
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

pub fn ensure_openclaw_cli_available() -> Result<OpenClawCliAvailabilityResult, String> {
    let shim_path = openclaw_shim_path()?;

    #[cfg(not(target_os = "windows"))]
    {
        return Ok(OpenClawCliAvailabilityResult {
            shim_path: shim_path.to_string_lossy().to_string(),
            path_updated: false,
            restart_recommended: false,
        });
    }

    let shim_dir = shim_path
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve OpenClaw shim directory".to_string())?;

    fs::create_dir_all(&shim_dir)
        .map_err(|error| format!("Failed to create OpenClaw shim directory: {error}"))?;

    let node_bin = environment::get_node_binary()?;
    let entry_path = openclaw_entry_path()?;
    let shim_content = build_windows_cli_shim(&node_bin, &entry_path);

    let existing = fs::read_to_string(&shim_path).ok();
    if existing.as_deref() != Some(shim_content.as_str()) {
        fs::write(&shim_path, shim_content)
            .map_err(|error| format!("Failed to write OpenClaw CLI shim: {error}"))?;
    }

    let path_updated = ensure_windows_user_path_contains(&shim_dir)?;
    Ok(OpenClawCliAvailabilityResult {
        shim_path: shim_path.to_string_lossy().to_string(),
        path_updated,
        restart_recommended: path_updated,
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn merge_path_entries_appends_target_once() {
        let target = PathBuf::from(r"C:\Users\Alice\.local\bin");
        let current = Some(OsStr::new(r"C:\Windows\System32;C:\Tools"));
        let (merged, updated) = merge_path_entries(current, &target).unwrap();
        assert!(updated);
        let merged = merged.to_string_lossy();
        assert!(merged.contains(r"C:\Users\Alice\.local\bin"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn merge_path_entries_preserves_complex_windows_path_entries() {
        let target = PathBuf::from(r"C:\Users\cobalt-47\.local\bin");
        let current = Some(OsStr::new(
            r"C:\Users\cobalt-47\.cargo\bin;D:\Program Files (x86)\cursor\resources\app\bin;C:\Program Files\Microsoft VS Code\bin",
        ));
        let (merged, updated) = merge_path_entries(current, &target).unwrap();
        let merged = merged.to_string_lossy();

        assert!(updated);
        assert!(merged.contains(r"C:\Users\cobalt-47\.cargo\bin"));
        assert!(merged.contains(r"D:\Program Files (x86)\cursor\resources\app\bin"));
        assert!(merged.contains(r"C:\Program Files\Microsoft VS Code\bin"));
        assert!(merged.ends_with(r"C:\Users\cobalt-47\.local\bin"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn merge_path_entries_is_idempotent() {
        let target = PathBuf::from(r"C:\Users\Alice\.local\bin");
        let current = Some(OsStr::new(r"C:\Windows\System32;C:\Users\Alice\.local\bin"));
        let (merged, updated) = merge_path_entries(current, &target).unwrap();
        assert!(!updated);
        assert_eq!(
            merged.to_string_lossy(),
            r"C:\Windows\System32;C:\Users\Alice\.local\bin"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn builds_expected_windows_shim() {
        let shim = build_windows_cli_shim(
            Path::new(r"C:\Program Files\DragonClaw\node.exe"),
            Path::new(r"C:\Users\Alice\AppData\Local\DragonClaw\openclaw-engine\openclaw.mjs"),
        );
        assert!(shim.contains(r#""C:\Program Files\DragonClaw\node.exe""#));
        assert!(shim
            .contains(r#""C:\Users\Alice\AppData\Local\DragonClaw\openclaw-engine\openclaw.mjs""#));
        assert!(shim.ends_with("%*\r\n"));
    }
}
