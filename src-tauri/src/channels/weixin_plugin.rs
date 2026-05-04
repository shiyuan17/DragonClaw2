use super::*;
pub(super) fn resolve_weixin_plugin_install_plan() -> Result<WeixinPluginInstallPlan, String> {
    let engine_version = openclaw_cli::read_openclaw_engine_version()
        .map_err(|error| channel_error(format!("璇诲彇 OpenClaw 鐗堟湰澶辫触: {error}")))?;
    let parsed = parse_openclaw_release_version(&engine_version);

    Ok(match parsed {
        Some(version) if version >= (2026, 3, 22) => WeixinPluginInstallPlan {
            npm_spec: WEIXIN_PLUGIN_PACKAGE_LATEST,
            expected_version: None,
            needs_tmpdir_patch: false,
        },
        Some(version) if version >= (2026, 3, 0) => WeixinPluginInstallPlan {
            npm_spec: WEIXIN_PLUGIN_PACKAGE_LEGACY,
            expected_version: Some("1.0.3"),
            needs_tmpdir_patch: false,
        },
        Some(version) if version >= (2026, 1, 0) => WeixinPluginInstallPlan {
            npm_spec: WEIXIN_PLUGIN_PACKAGE_PRE_2026_3_0,
            expected_version: Some("1.0.0"),
            needs_tmpdir_patch: true,
        },
        _ => WeixinPluginInstallPlan {
            npm_spec: WEIXIN_PLUGIN_PACKAGE_LATEST,
            expected_version: None,
            needs_tmpdir_patch: false,
        },
    })
}

pub(super) fn read_weixin_plugin_installed_version() -> Result<Option<String>, String> {
    let package_path = weixin_plugin_package_path()?;
    if !package_path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&package_path)
        .map_err(|error| channel_error(format!("璇诲彇寰俊鎻掍欢 package.json 澶辫触: {error}")))?;
    let parsed = serde_json::from_str::<Value>(&raw)
        .map_err(|error| channel_error(format!("瑙ｆ瀽寰俊鎻掍欢 package.json 澶辫触: {error}")))?;

    Ok(parsed
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string))
}

fn run_tar_extract_command(archive_path: &Path, destination_dir: &Path) -> Result<Output, String> {
    std::fs::create_dir_all(destination_dir)
        .map_err(|error| channel_error(format!("鍒涘缓鎻掍欢瑙ｅ帇鐩綍澶辫触: {error}")))?;

    let mut command = Command::new("tar");
    command
        .arg("-xf")
        .arg(archive_path)
        .arg("-C")
        .arg(destination_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    command
        .output()
        .map_err(|error| channel_error(format!("鎵ц tar 瑙ｅ帇澶辫触: {error}")))
}

fn copy_dir_recursive(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target_dir)
        .map_err(|error| channel_error(format!("鍒涘缓鎻掍欢鐩綍澶辫触: {error}")))?;

    for entry in std::fs::read_dir(source_dir)
        .map_err(|error| channel_error(format!("璇诲彇鎻掍欢鐩綍澶辫触: {error}")))?
    {
        let entry = entry.map_err(|error| channel_error(format!("閬嶅巻鎻掍欢鐩綍澶辫触: {error}")))?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| channel_error(format!("璇诲彇鎻掍欢鏂囦欢绫诲瀷澶辫触: {error}")))?;

        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &target_path).map_err(|error| {
                channel_error(format!(
                    "澶嶅埗鎻掍欢鏂囦欢澶辫触 ({} -> {}): {error}",
                    source_path.display(),
                    target_path.display()
                ))
            })?;
        }
    }

    Ok(())
}

pub(super) fn apply_weixin_pre_2026_3_0_compat_patch(plugin_dir: &Path) -> Result<(), String> {
    let patch_target = plugin_dir
        .join("src")
        .join("messaging")
        .join("process-message.ts");
    if !patch_target.exists() {
        return Err(channel_error(format!(
            "鏈壘鍒板井淇″吋瀹硅ˉ涓佺洰鏍囨枃浠? {}",
            patch_target.display()
        )));
    }

    let raw = std::fs::read_to_string(&patch_target)
        .map_err(|error| channel_error(format!("璇诲彇寰俊鍏煎琛ヤ竵鏂囦欢澶辫触: {error}")))?;
    let line_ending = if raw.contains("\r\n") { "\r\n" } else { "\n" };
    let mut normalized = raw.replace("\r\n", "\n");

    if !normalized.contains("import os from \"node:os\";") {
        if let Some(index) = normalized.find("import path from \"node:path\";") {
            normalized.insert_str(index, "import os from \"node:os\";\n");
        } else {
            normalized = format!("import os from \"node:os\";\n{normalized}");
        }
    }

    for pattern in [
        "  resolvePreferredOpenClawTmpDir,\n",
        "resolvePreferredOpenClawTmpDir,\n",
        ", resolvePreferredOpenClawTmpDir",
        "resolvePreferredOpenClawTmpDir, ",
    ] {
        normalized = normalized.replace(pattern, "");
    }
    normalized = normalized.replace("resolvePreferredOpenClawTmpDir()", "os.tmpdir()");

    if normalized.contains("resolvePreferredOpenClawTmpDir") {
        return Err(channel_error("寰俊鍏煎琛ヤ竵鏈兘瀹屾暣绉婚櫎鏃х増 tmpDir 渚濊禆"));
    }

    let serialized = if line_ending == "\r\n" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };

    std::fs::write(&patch_target, serialized)
        .map_err(|error| channel_error(format!("鍐欏叆寰俊鍏煎琛ヤ竵澶辫触: {error}")))?;
    Ok(())
}

pub(super) fn manually_install_weixin_plugin(
    install_plan: &WeixinPluginInstallPlan,
    session_state: &SharedQrState,
) -> Result<(), String> {
    let target_dir = resolve_weixin_plugin_dir()?;
    let temp_root = std::env::temp_dir().join(format!(
        "dragonclaw-weixin-install-{}-{}",
        std::process::id(),
        current_timestamp_millis()
    ));
    let extract_dir = temp_root.join("extract");
    std::fs::create_dir_all(&temp_root)
        .map_err(|error| channel_error(format!("鍒涘缓涓存椂瀹夎鐩綍澶辫触: {error}")))?;

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&temp_root);
    };

    update_session_log(
        session_state,
        &format!("姝ｅ湪涓嬭浇寰俊鎻掍欢鍖? {}", install_plan.npm_spec),
    );
    let pack_output =
        match run_bundled_npm_cli_command(&["pack", install_plan.npm_spec], &temp_root) {
            Ok(output) => output,
            Err(error) => {
                cleanup();
                return Err(error);
            }
        };
    append_command_output_to_session_logs(session_state, "npm pack 杈撳嚭锛?, &pack_output);
    if !pack_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "涓嬭浇寰俊鎻掍欢鍖呭け璐? {}",
            summarize_command_output(&pack_output)
        )));
    }

    let tarball_name = collect_command_output_lines(&pack_output)
        .into_iter()
        .rev()
        .find(|line| line.ends_with(".tgz"))
        .ok_or_else(|| channel_error("鏈粠 npm pack 杈撳嚭涓В鏋愬埌鎻掍欢鍘嬬缉鍖呭悕绉?))?;
    let tarball_path = temp_root.join(&tarball_name);
    if !tarball_path.exists() {
        cleanup();
        return Err(channel_error(format!(
            "寰俊鎻掍欢鍘嬬缉鍖呬笉瀛樺湪: {}",
            tarball_path.display()
        )));
    }

    let extract_output = match run_tar_extract_command(&tarball_path, &extract_dir) {
        Ok(output) => output,
        Err(error) => {
            cleanup();
            return Err(error);
        }
    };
    append_command_output_to_session_logs(session_state, "tar 瑙ｅ帇杈撳嚭锛?, &extract_output);
    if !extract_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "瑙ｅ帇寰俊鎻掍欢鍖呭け璐? {}",
            summarize_command_output(&extract_output)
        )));
    }

    let package_dir = extract_dir.join("package");
    if !package_dir.exists() {
        cleanup();
        return Err(channel_error(format!(
            "瑙ｅ帇鍚庣殑寰俊鎻掍欢鐩綍涓嶅瓨鍦? {}",
            package_dir.display()
        )));
    }

    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir)
            .map_err(|error| channel_error(format!("娓呯悊鏃у井淇℃彃浠剁洰褰曞け璐? {error}")))?;
    }
    if let Some(parent) = target_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| channel_error(format!("鍒涘缓寰俊鎻掍欢鐖剁洰褰曞け璐? {error}")))?;
    }
    copy_dir_recursive(&package_dir, &target_dir)?;

    if install_plan.needs_tmpdir_patch {
        update_session_log(session_state, "姝ｅ湪搴旂敤鏃х増 OpenClaw 寰俊鎻掍欢鍏煎琛ヤ竵...");
        apply_weixin_pre_2026_3_0_compat_patch(&target_dir)?;
    }

    update_session_log(session_state, "姝ｅ湪瀹夎寰俊鎻掍欢杩愯渚濊禆...");
    let install_output =
        match run_bundled_npm_cli_command(&["install", "--omit=dev", "--silent"], &target_dir) {
            Ok(output) => output,
            Err(error) => {
                cleanup();
                return Err(error);
            }
        };
    append_command_output_to_session_logs(session_state, "npm install 杈撳嚭锛?, &install_output);
    if !install_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "瀹夎寰俊鎻掍欢渚濊禆澶辫触: {}",
            summarize_command_output(&install_output)
        )));
    }

    cleanup();
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WeixinPluginListStatus {
    Enabled,
    Disabled,
    FailedToLoad,
    Missing,
    Unknown,
}

fn parse_weixin_plugin_list_status(raw: &str) -> WeixinPluginListStatus {
    let squashed = raw
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();

    if let Some(index) = squashed.find("openclaw-weixin") {
        let window_end = (index + 160).min(squashed.len());
        let window = &squashed[index..window_end];
        if window.contains("failedtoload") {
            return WeixinPluginListStatus::FailedToLoad;
        }
        if window.contains("disabled") {
            return WeixinPluginListStatus::Disabled;
        }
        if window.contains("enabled") || window.contains("loaded") {
            return WeixinPluginListStatus::Enabled;
        }

        return WeixinPluginListStatus::Unknown;
    }

    WeixinPluginListStatus::Missing
}

pub(super) fn verify_weixin_plugin_loadable(session_state: &SharedQrState) -> Result<(), String> {
    let output = openclaw_engine_command(&["plugins", "list"])?;
    append_command_output_to_session_logs(session_state, "plugins list 杈撳嚭锛?, &output);
    if !output.status.success() {
        return Err(channel_error(format!(
            "鏍￠獙寰俊鎻掍欢鍔犺浇鐘舵€佸け璐? {}",
            summarize_command_output(&output)
        )));
    }

    match parse_weixin_plugin_list_status(&collect_command_output_lines(&output).join("\n")) {
        WeixinPluginListStatus::Enabled => Ok(()),
        WeixinPluginListStatus::Disabled => Err(channel_error("寰俊鎻掍欢浠嶅浜?disabled 鐘舵€?)),
        WeixinPluginListStatus::FailedToLoad => Err(channel_error(
            "寰俊鎻掍欢宸插畨瑁咃紝浣?OpenClaw 浠嶆姤鍛?failed to load",
        )),
        WeixinPluginListStatus::Missing => {
            Err(channel_error("鏈湪 OpenClaw 鎻掍欢鍒楄〃涓娴嬪埌寰俊鎻掍欢"))
        }
        WeixinPluginListStatus::Unknown => {
            Err(channel_error("宸叉壘鍒板井淇℃彃浠讹紝浣嗘殏鏃舵棤娉曠‘璁ゅ綋鍓嶅姞杞界姸鎬?))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_weixin_plugin_list_status, WeixinPluginListStatus};

    #[test]
    fn parses_enabled_weixin_plugin_from_current_cli_table_output() {
        let output = r#"
| @tencent-weixin/openclaw-weixin   | openclaw-      | openclaw | enabled  | global:openclaw-weixin/index. | 1.0.0     |
|                                   | weixin         |          |          | ts                            |           |
"#;

        assert_eq!(
            parse_weixin_plugin_list_status(output),
            WeixinPluginListStatus::Enabled
        );
    }

    #[test]
    fn parses_disabled_weixin_plugin_status() {
        assert_eq!(
            parse_weixin_plugin_list_status("openclaw-weixin disabled"),
            WeixinPluginListStatus::Disabled
        );
    }

    #[test]
    fn parses_failed_to_load_weixin_plugin_status() {
        assert_eq!(
            parse_weixin_plugin_list_status("openclaw-weixin failed to load"),
            WeixinPluginListStatus::FailedToLoad
        );
    }
}

