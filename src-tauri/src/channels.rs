// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{config, openclaw_cli, paths};

const WEIXIN_DEFAULT_BASE_URL: &str = "https://ilinkai.weixin.qq.com";
const WEIXIN_OFFICIAL_CHANNEL_ID: &str = "openclaw-weixin";
const WEIXIN_PLUGIN_PACKAGE_RELATIVE_PATH: &str = "extensions/openclaw-weixin/package.json";
const WEIXIN_STATE_DIR_NAME: &str = "openclaw-weixin";
const WEIXIN_ACCOUNTS_DIR_NAME: &str = "accounts";
const WEIXIN_ACCOUNTS_INDEX_FILE: &str = "accounts.json";
const WEIXIN_PLUGIN_ENABLE_ARGS: &[&str] = &[
    "config",
    "set",
    "plugins.entries.openclaw-weixin.enabled",
    "true",
];
const WEIXIN_GATEWAY_RESTART_ARGS: &[&str] = &["gateway", "restart"];
const WEIXIN_PLUGIN_PACKAGE_LATEST: &str = "@tencent-weixin/openclaw-weixin";
const WEIXIN_PLUGIN_PACKAGE_LEGACY: &str = "@tencent-weixin/openclaw-weixin@legacy";
const WEIXIN_PLUGIN_PACKAGE_PRE_2026_3_0: &str = "@tencent-weixin/openclaw-weixin@1.0.0";
const WEIXIN_QR_START_EXPECT_TIMEOUT_MS: u128 = 20_000;
const WEIXIN_QR_START_RETURN_GRACE_MS: u128 = 4_000;
const WEIXIN_QR_STATUS_POLL_INTERVAL_MS: u64 = 1_000;
const WEIXIN_QR_STATUS_LONG_POLL_TIMEOUT_MS: u64 = 35_000;
const WEIXIN_QR_LOGIN_TIMEOUT_MS: u128 = 480_000;
const WEIXIN_QR_REFRESH_LIMIT: usize = 3;
const MAX_QR_LOGS: usize = 120;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelAccountSnapshotItem {
    pub account_id: String,
    pub name: String,
    pub configured: bool,
    pub status: String,
    pub is_default: bool,
    pub agent_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelGroupSnapshotItem {
    pub channel_type: String,
    pub default_account_id: String,
    pub status: String,
    pub accounts: Vec<OpenClawChannelAccountSnapshotItem>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelAccountsSnapshotResponse {
    pub source_path: String,
    pub detail: String,
    pub channels: Vec<OpenClawChannelGroupSnapshotItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelConfigPayload {
    pub channel_type: String,
    pub account_id: Option<String>,
    #[serde(default)]
    pub config: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelBindingPayload {
    pub channel_type: String,
    pub account_id: String,
    pub agent_id: Option<String>,
    pub preferred_dm_scope: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelRemovePayload {
    pub channel_type: String,
    pub account_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChannelQrBindingSessionSnapshot {
    pub session_id: String,
    pub channel_type: String,
    pub status: String,
    pub qr_url: Option<String>,
    pub qr_ascii: Option<String>,
    pub detail: Option<String>,
    pub logs: Vec<String>,
    pub started_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeishuOnboardingQrResponse {
    pub qr_url: String,
    pub user_code: String,
    pub device_code: String,
    pub poll_interval_seconds: u64,
    pub expires_in_seconds: u64,
    pub expires_at_ms: u128,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeishuOnboardingPollResponse {
    pub status: String,
    pub message: Option<String>,
    pub app_id: Option<String>,
    pub credentials_saved: Option<bool>,
    pub tenant_brand: Option<String>,
}

#[derive(Debug, Clone)]
struct OpenClawChannelQrBindingSessionState {
    session_id: String,
    channel_type: String,
    status: String,
    qr_url: Option<String>,
    qr_ascii: Option<String>,
    detail: Option<String>,
    logs: Vec<String>,
    started_at_ms: u128,
    updated_at_ms: u128,
}

type SharedQrState = Arc<Mutex<OpenClawChannelQrBindingSessionState>>;
type SharedCancelFlag = Arc<AtomicBool>;

#[derive(Debug, Deserialize)]
struct FeishuOnboardingInitResponse {
    #[serde(default)]
    supported_auth_methods: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct FeishuOnboardingBeginResponse {
    device_code: Option<String>,
    verification_uri_complete: Option<String>,
    user_code: Option<String>,
    expire_in: Option<u64>,
    interval: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct FeishuOnboardingPollUserInfo {
    tenant_brand: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FeishuOnboardingPollRawResponse {
    client_id: Option<String>,
    client_secret: Option<String>,
    user_info: Option<FeishuOnboardingPollUserInfo>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Clone)]
struct WeixinPluginInstallPlan {
    npm_spec: &'static str,
    expected_version: Option<&'static str>,
    needs_tmpdir_patch: bool,
}

#[derive(Debug, Deserialize)]
struct WeixinQrFetchResponse {
    qrcode: Option<String>,
    qrcode_img_content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WeixinQrStatusResponse {
    status: Option<String>,
    bot_token: Option<String>,
    ilink_bot_id: Option<String>,
    baseurl: Option<String>,
    ilink_user_id: Option<String>,
    redirect_host: Option<String>,
}

#[derive(Debug, Clone)]
struct WeixinQrTicket {
    qrcode: String,
    qr_url: String,
}

static OPENCLAW_CHANNEL_QR_SESSIONS: OnceLock<Mutex<HashMap<String, SharedQrState>>> =
    OnceLock::new();
static OPENCLAW_CHANNEL_QR_CANCEL_FLAGS: OnceLock<Mutex<HashMap<String, SharedCancelFlag>>> =
    OnceLock::new();

fn qr_sessions() -> &'static Mutex<HashMap<String, SharedQrState>> {
    OPENCLAW_CHANNEL_QR_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn qr_cancel_flags() -> &'static Mutex<HashMap<String, SharedCancelFlag>> {
    OPENCLAW_CHANNEL_QR_CANCEL_FLAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn current_timestamp_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn channel_error(message: impl Into<String>) -> String {
    message.into()
}

fn trim_remote_error_detail(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.chars().count() <= 260 {
        return trimmed.to_string();
    }
    format!("{}...", trimmed.chars().take(260).collect::<String>())
}

fn normalize_channel_identifier(raw: &str) -> String {
    let normalized = raw.trim().to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "weixin"
            | "wechat"
            | "wx"
            | "wechat_official_account"
            | "wechat-official-account"
            | "openclaw-weixin"
            | "openclaw_weixin"
    ) {
        return "weixin".to_string();
    }
    if matches!(
        normalized.as_str(),
        "feishu" | "lark" | "openclaw-lark" | "openclaw_lark"
    ) {
        return "feishu".to_string();
    }
    normalized
}

fn canonical_channel_key_for_config(normalized_channel: &str) -> String {
    match normalized_channel {
        "weixin" => WEIXIN_OFFICIAL_CHANNEL_ID.to_string(),
        "feishu" => "feishu".to_string(),
        _ => normalized_channel.to_string(),
    }
}

fn channel_aliases_for_config(normalized_channel: &str) -> Vec<String> {
    match normalized_channel {
        "weixin" => vec![
            "openclaw-weixin".to_string(),
            "weixin".to_string(),
            "wechat".to_string(),
        ],
        "feishu" => vec![
            "feishu".to_string(),
            "openclaw-lark".to_string(),
            "lark".to_string(),
        ],
        _ => vec![normalized_channel.to_string()],
    }
}

fn resolve_existing_channel_key(
    channels_obj: &Map<String, Value>,
    normalized_channel: &str,
) -> Option<String> {
    let aliases = channel_aliases_for_config(normalized_channel)
        .into_iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .collect::<HashSet<_>>();

    channels_obj
        .keys()
        .find(|key| aliases.contains(&key.trim().to_ascii_lowercase()))
        .cloned()
}

fn normalize_account_identifier(raw: &str) -> String {
    let normalized = raw.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        "default".to_string()
    } else {
        normalized
    }
}

fn is_channel_section_reserved_key(key: &str) -> bool {
    matches!(key, "accounts" | "defaultAccount" | "enabled")
}

fn migrate_legacy_channel_section_to_accounts(section_obj: &mut Map<String, Value>) {
    if matches!(section_obj.get("accounts"), Some(Value::Object(_))) {
        return;
    }

    let mut legacy_account_payload = Map::<String, Value>::new();
    let mut legacy_keys = Vec::<String>::new();

    for (key, value) in section_obj.iter() {
        if is_channel_section_reserved_key(key) {
            continue;
        }
        legacy_keys.push(key.to_string());
        legacy_account_payload.insert(key.to_string(), value.clone());
    }

    if legacy_account_payload.is_empty() {
        section_obj.insert("accounts".to_string(), Value::Object(Map::new()));
        return;
    }

    for key in legacy_keys {
        section_obj.remove(&key);
    }

    let mut accounts = Map::new();
    accounts.insert("default".to_string(), Value::Object(legacy_account_payload));
    section_obj.insert("accounts".to_string(), Value::Object(accounts));
    if section_obj
        .get("defaultAccount")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        section_obj.insert(
            "defaultAccount".to_string(),
            Value::String("default".to_string()),
        );
    }
}

fn channel_payload_has_content(payload: &Map<String, Value>) -> bool {
    payload.iter().any(|(key, value)| {
        if matches!(
            key.as_str(),
            "enabled" | "name" | "linkedAt" | "channelConfigUpdatedAt"
        ) {
            return false;
        }
        match value {
            Value::Null => false,
            Value::String(text) => !text.trim().is_empty(),
            Value::Array(items) => !items.is_empty(),
            Value::Object(obj) => !obj.is_empty(),
            _ => true,
        }
    })
}

fn parse_allow_from_list_from_text(raw: &str) -> Vec<String> {
    let mut deduped = std::collections::BTreeSet::<String>::new();
    for segment in raw.split(|ch| ch == '\n' || ch == ',' || ch == '，') {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        deduped.insert(trimmed.to_string());
    }
    deduped.into_iter().collect()
}

fn parse_allow_from_list_from_value(value: Option<&Value>) -> Vec<String> {
    let Some(raw) = value else {
        return Vec::new();
    };

    match raw {
        Value::Array(items) => {
            let mut deduped = std::collections::BTreeSet::<String>::new();
            for item in items {
                let normalized = match item {
                    Value::String(text) => text.trim().to_string(),
                    Value::Number(number) => number.to_string(),
                    Value::Bool(flag) => flag.to_string(),
                    _ => String::new(),
                };
                if normalized.is_empty() {
                    continue;
                }
                deduped.insert(normalized);
            }
            deduped.into_iter().collect()
        }
        Value::String(text) => parse_allow_from_list_from_text(text),
        _ => Vec::new(),
    }
}

fn sanitize_channel_form_values_for_ui(
    normalized_channel: &str,
    mut values: HashMap<String, String>,
) -> HashMap<String, String> {
    if normalized_channel != "feishu" {
        return values;
    }

    let has_secret = values
        .get("appSecret")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    values.remove("appSecret");
    if has_secret {
        values.insert("appSecretConfigured".to_string(), "true".to_string());
    }
    values
}

fn resolve_channel_binding_maps(
    root: &Map<String, Value>,
) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut channel_to_agent = HashMap::new();
    let mut account_to_agent = HashMap::new();
    let Some(bindings) = root.get("bindings").and_then(Value::as_array) else {
        return (channel_to_agent, account_to_agent);
    };

    for item in bindings {
        let Some(binding_obj) = item.as_object() else {
            continue;
        };
        let Some(agent_id) = binding_obj
            .get("agentId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Some(channel_type) = binding_obj
            .get("match")
            .and_then(Value::as_object)
            .and_then(|match_obj| match_obj.get("channel"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        let normalized_channel = normalize_channel_identifier(channel_type);
        let account_id = binding_obj
            .get("match")
            .and_then(Value::as_object)
            .and_then(|match_obj| match_obj.get("accountId"))
            .and_then(Value::as_str)
            .map(normalize_account_identifier)
            .unwrap_or_else(|| "default".to_string());

        if account_id == "default" {
            channel_to_agent.insert(normalized_channel, agent_id.to_string());
        } else {
            account_to_agent.insert(
                format!("{normalized_channel}:{account_id}"),
                agent_id.to_string(),
            );
        }
    }

    (channel_to_agent, account_to_agent)
}

fn ensure_root_object(config_value: &mut Value) -> Result<&mut Map<String, Value>, String> {
    if !config_value.is_object() {
        *config_value = json!({});
    }
    config_value
        .as_object_mut()
        .ok_or_else(|| channel_error("openclaw.json 根节点格式错误"))
}

fn ensure_channels_object<'a>(
    root: &'a mut Map<String, Value>,
) -> Result<&'a mut Map<String, Value>, String> {
    if !matches!(root.get("channels"), Some(Value::Object(_))) {
        root.insert("channels".to_string(), Value::Object(Map::new()));
    }
    root.get_mut("channels")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| channel_error("channels 配置格式错误"))
}

fn ensure_channel_section<'a>(
    channels_obj: &'a mut Map<String, Value>,
    normalized_channel: &str,
) -> Result<(&'a mut Map<String, Value>, String), String> {
    let section_key = resolve_existing_channel_key(channels_obj, normalized_channel)
        .unwrap_or_else(|| canonical_channel_key_for_config(normalized_channel));

    if !matches!(channels_obj.get(&section_key), Some(Value::Object(_))) {
        channels_obj.insert(section_key.clone(), Value::Object(Map::new()));
    }

    let section_obj = channels_obj
        .get_mut(&section_key)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| channel_error("频道配置格式错误"))?;
    migrate_legacy_channel_section_to_accounts(section_obj);
    if !matches!(section_obj.get("accounts"), Some(Value::Object(_))) {
        section_obj.insert("accounts".to_string(), Value::Object(Map::new()));
    }

    Ok((section_obj, section_key))
}

fn ensure_accounts_object<'a>(
    section_obj: &'a mut Map<String, Value>,
) -> Result<&'a mut Map<String, Value>, String> {
    if !matches!(section_obj.get("accounts"), Some(Value::Object(_))) {
        section_obj.insert("accounts".to_string(), Value::Object(Map::new()));
    }
    section_obj
        .get_mut("accounts")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| channel_error("频道 accounts 配置格式错误"))
}

fn current_config_path_string() -> Result<String, String> {
    Ok(paths::openclaw_config_path()?.display().to_string())
}

fn resolve_state_dir() -> Result<PathBuf, String> {
    paths::user_config_dir()
}

fn resolve_weixin_state_dir() -> Result<PathBuf, String> {
    Ok(resolve_state_dir()?.join(WEIXIN_STATE_DIR_NAME))
}

fn resolve_weixin_accounts_dir() -> Result<PathBuf, String> {
    Ok(resolve_weixin_state_dir()?.join(WEIXIN_ACCOUNTS_DIR_NAME))
}

fn resolve_weixin_account_index_path() -> Result<PathBuf, String> {
    Ok(resolve_weixin_state_dir()?.join(WEIXIN_ACCOUNTS_INDEX_FILE))
}

fn resolve_weixin_account_data_path(account_id: &str) -> Result<PathBuf, String> {
    Ok(resolve_weixin_accounts_dir()?.join(format!("{account_id}.json")))
}

fn weixin_plugin_package_path() -> Result<PathBuf, String> {
    Ok(resolve_state_dir()?.join(WEIXIN_PLUGIN_PACKAGE_RELATIVE_PATH))
}

fn resolve_weixin_plugin_dir() -> Result<PathBuf, String> {
    weixin_plugin_package_path()?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| channel_error("无法解析微信插件目录"))
}

fn openclaw_engine_command(args: &[&str]) -> Result<Output, String> {
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| channel_error(format!("构建 OpenClaw 命令失败: {error}")))?;
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .output()
        .map_err(|error| channel_error(format!("执行 OpenClaw 命令失败: {error}")))
}

fn run_bundled_npm_cli_command(args: &[&str], current_dir: &Path) -> Result<Output, String> {
    let mut command = openclaw_cli::create_bundled_npm_cli_command()
        .map_err(|error| channel_error(format!("构建 npm 命令失败: {error}")))?;
    command
        .args(args)
        .current_dir(current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .output()
        .map_err(|error| channel_error(format!("执行 npm 命令失败: {error}")))
}

fn summarize_command_output(output: &Output) -> String {
    for line in String::from_utf8_lossy(&output.stderr)
        .lines()
        .chain(String::from_utf8_lossy(&output.stdout).lines())
    {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    format!("退出码: {:?}", output.status.code())
}

fn collect_command_output_lines(output: &Output) -> Vec<String> {
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn append_command_output_to_session_logs(
    session_state: &SharedQrState,
    prefix: &str,
    output: &Output,
) {
    if !prefix.trim().is_empty() {
        update_session_log(session_state, prefix);
    }

    let lines = collect_command_output_lines(output);
    if lines.is_empty() {
        update_session_log(
            session_state,
            &format!("命令已结束，退出码: {:?}", output.status.code()),
        );
        return;
    }

    let omitted = lines.len().saturating_sub(24);
    for line in lines.iter().take(24) {
        update_session_log(session_state, line);
    }
    if omitted > 0 {
        update_session_log(session_state, &format!("其余 {omitted} 行命令输出已省略。"));
    }
}

fn parse_openclaw_release_version(version: &str) -> Option<(u32, u32, u32)> {
    let normalized = version.trim().trim_start_matches('v');
    let release = normalized.split('-').next().unwrap_or(normalized);
    let mut segments = release.split('.');
    let major = segments.next()?.parse::<u32>().ok()?;
    let minor = segments.next()?.parse::<u32>().ok()?;
    let patch = segments.next()?.parse::<u32>().ok()?;
    Some((major, minor, patch))
}

fn resolve_weixin_plugin_install_plan() -> Result<WeixinPluginInstallPlan, String> {
    let engine_version = openclaw_cli::read_openclaw_engine_version()
        .map_err(|error| channel_error(format!("读取 OpenClaw 版本失败: {error}")))?;
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

fn read_weixin_plugin_installed_version() -> Result<Option<String>, String> {
    let package_path = weixin_plugin_package_path()?;
    if !package_path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&package_path)
        .map_err(|error| channel_error(format!("读取微信插件 package.json 失败: {error}")))?;
    let parsed = serde_json::from_str::<Value>(&raw)
        .map_err(|error| channel_error(format!("解析微信插件 package.json 失败: {error}")))?;

    Ok(parsed
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string))
}

fn run_tar_extract_command(archive_path: &Path, destination_dir: &Path) -> Result<Output, String> {
    std::fs::create_dir_all(destination_dir)
        .map_err(|error| channel_error(format!("创建插件解压目录失败: {error}")))?;

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
        .map_err(|error| channel_error(format!("执行 tar 解压失败: {error}")))
}

fn copy_dir_recursive(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target_dir)
        .map_err(|error| channel_error(format!("创建插件目录失败: {error}")))?;

    for entry in std::fs::read_dir(source_dir)
        .map_err(|error| channel_error(format!("读取插件目录失败: {error}")))?
    {
        let entry = entry.map_err(|error| channel_error(format!("遍历插件目录失败: {error}")))?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| channel_error(format!("读取插件文件类型失败: {error}")))?;

        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &target_path).map_err(|error| {
                channel_error(format!(
                    "复制插件文件失败 ({} -> {}): {error}",
                    source_path.display(),
                    target_path.display()
                ))
            })?;
        }
    }

    Ok(())
}

fn apply_weixin_pre_2026_3_0_compat_patch(plugin_dir: &Path) -> Result<(), String> {
    let patch_target = plugin_dir
        .join("src")
        .join("messaging")
        .join("process-message.ts");
    if !patch_target.exists() {
        return Err(channel_error(format!(
            "未找到微信兼容补丁目标文件: {}",
            patch_target.display()
        )));
    }

    let raw = std::fs::read_to_string(&patch_target)
        .map_err(|error| channel_error(format!("读取微信兼容补丁文件失败: {error}")))?;
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
        return Err(channel_error("微信兼容补丁未能完整移除旧版 tmpDir 依赖"));
    }

    let serialized = if line_ending == "\r\n" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };

    std::fs::write(&patch_target, serialized)
        .map_err(|error| channel_error(format!("写入微信兼容补丁失败: {error}")))?;
    Ok(())
}

fn manually_install_weixin_plugin(
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
        .map_err(|error| channel_error(format!("创建临时安装目录失败: {error}")))?;

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&temp_root);
    };

    update_session_log(
        session_state,
        &format!("正在下载微信插件包: {}", install_plan.npm_spec),
    );
    let pack_output =
        match run_bundled_npm_cli_command(&["pack", install_plan.npm_spec], &temp_root) {
            Ok(output) => output,
            Err(error) => {
                cleanup();
                return Err(error);
            }
        };
    append_command_output_to_session_logs(session_state, "npm pack 输出：", &pack_output);
    if !pack_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "下载微信插件包失败: {}",
            summarize_command_output(&pack_output)
        )));
    }

    let tarball_name = collect_command_output_lines(&pack_output)
        .into_iter()
        .rev()
        .find(|line| line.ends_with(".tgz"))
        .ok_or_else(|| channel_error("未从 npm pack 输出中解析到插件压缩包名称"))?;
    let tarball_path = temp_root.join(&tarball_name);
    if !tarball_path.exists() {
        cleanup();
        return Err(channel_error(format!(
            "微信插件压缩包不存在: {}",
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
    append_command_output_to_session_logs(session_state, "tar 解压输出：", &extract_output);
    if !extract_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "解压微信插件包失败: {}",
            summarize_command_output(&extract_output)
        )));
    }

    let package_dir = extract_dir.join("package");
    if !package_dir.exists() {
        cleanup();
        return Err(channel_error(format!(
            "解压后的微信插件目录不存在: {}",
            package_dir.display()
        )));
    }

    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir)
            .map_err(|error| channel_error(format!("清理旧微信插件目录失败: {error}")))?;
    }
    if let Some(parent) = target_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| channel_error(format!("创建微信插件父目录失败: {error}")))?;
    }
    copy_dir_recursive(&package_dir, &target_dir)?;

    if install_plan.needs_tmpdir_patch {
        update_session_log(session_state, "正在应用旧版 OpenClaw 微信插件兼容补丁...");
        apply_weixin_pre_2026_3_0_compat_patch(&target_dir)?;
    }

    update_session_log(session_state, "正在安装微信插件运行依赖...");
    let install_output =
        match run_bundled_npm_cli_command(&["install", "--omit=dev", "--silent"], &target_dir) {
            Ok(output) => output,
            Err(error) => {
                cleanup();
                return Err(error);
            }
        };
    append_command_output_to_session_logs(session_state, "npm install 输出：", &install_output);
    if !install_output.status.success() {
        cleanup();
        return Err(channel_error(format!(
            "安装微信插件依赖失败: {}",
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

fn verify_weixin_plugin_loadable(session_state: &SharedQrState) -> Result<(), String> {
    let output = openclaw_engine_command(&["plugins", "list"])?;
    append_command_output_to_session_logs(session_state, "plugins list 输出：", &output);
    if !output.status.success() {
        return Err(channel_error(format!(
            "校验微信插件加载状态失败: {}",
            summarize_command_output(&output)
        )));
    }

    match parse_weixin_plugin_list_status(&collect_command_output_lines(&output).join("\n")) {
        WeixinPluginListStatus::Enabled => Ok(()),
        WeixinPluginListStatus::Disabled => Err(channel_error("微信插件仍处于 disabled 状态")),
        WeixinPluginListStatus::FailedToLoad => Err(channel_error(
            "微信插件已安装，但 OpenClaw 仍报告 failed to load",
        )),
        WeixinPluginListStatus::Missing => {
            Err(channel_error("未在 OpenClaw 插件列表中检测到微信插件"))
        }
        WeixinPluginListStatus::Unknown => {
            Err(channel_error("已找到微信插件，但暂时无法确认当前加载状态"))
        }
    }
}

fn normalize_weixin_account_id(raw: &str) -> String {
    let normalized = raw
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    let compact = normalized
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        "default".to_string()
    } else {
        compact
    }
}

fn sanitize_weixin_redirect_host(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let parsed = reqwest::Url::parse(&candidate).ok()?;
    let host = parsed.host_str()?.trim().to_ascii_lowercase();
    let trusted = host == "liteapp.weixin.qq.com"
        || host == "ilinkai.weixin.qq.com"
        || host.ends_with(".weixin.qq.com")
        || host == "qq.com"
        || host.ends_with(".qq.com");
    if !trusted {
        return None;
    }

    Some(format!("{}://{}", parsed.scheme(), host))
}

fn append_session_log(state: &mut OpenClawChannelQrBindingSessionState, line: String) {
    if line.trim().is_empty() {
        return;
    }
    if state.logs.len() >= MAX_QR_LOGS {
        let overflow = state.logs.len().saturating_sub(MAX_QR_LOGS - 1);
        state.logs.drain(0..overflow);
    }
    state.logs.push(line);
    state.updated_at_ms = current_timestamp_millis();
}

fn update_session_log(session_state: &SharedQrState, line: &str) {
    if let Ok(mut state) = session_state.lock() {
        append_session_log(&mut state, line.trim().to_string());
    }
}

fn set_session_state_message(session_state: &SharedQrState, status: &str, detail: &str) {
    if let Ok(mut state) = session_state.lock() {
        state.status = status.to_string();
        state.detail = Some(detail.to_string());
        state.updated_at_ms = current_timestamp_millis();
    }
}

fn session_has_qr_url(session_state: &SharedQrState) -> bool {
    session_state
        .lock()
        .ok()
        .and_then(|state| state.qr_url.clone())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn strip_ansi_escape_sequences(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            output.push(ch);
            continue;
        }

        if chars.peek() == Some(&'[') {
            let _ = chars.next();
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        }
    }
    output
}

fn extract_http_url_from_text(raw: &str) -> Option<String> {
    let cleaned = strip_ansi_escape_sequences(raw);
    let start = cleaned
        .find("https://")
        .or_else(|| cleaned.find("http://"))?;
    let candidate = cleaned[start..]
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_matches(|ch: char| {
            matches!(
                ch,
                '"' | '\''
                    | '<'
                    | '>'
                    | '('
                    | ')'
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | ','
                    | '.'
                    | ';'
                    | ':'
                    | '。'
                    | '，'
                    | '；'
                    | '：'
                    | '、'
                    | '）'
                    | '】'
                    | '》'
            )
        });
    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

fn update_qr_session_from_cli_line(session_state: &SharedQrState, raw_line: &str) {
    let cleaned = strip_ansi_escape_sequences(raw_line)
        .replace('\r', "")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        return;
    }

    if let Ok(mut state) = session_state.lock() {
        append_session_log(&mut state, cleaned.clone());

        if state
            .qr_url
            .as_ref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
        {
            if let Some(url) = extract_http_url_from_text(&cleaned) {
                state.qr_url = Some(url);
                if state.status.trim().eq_ignore_ascii_case("running") {
                    state.status = "waiting_scan".to_string();
                }
                if state.detail.as_deref().map(str::trim).unwrap_or_default().is_empty()
                    || state.detail.as_deref().unwrap_or_default().contains("已启动微信绑定流程")
                {
                    state.detail =
                        Some("二维码已生成，请使用手机微信扫码完成绑定。".to_string());
                }
            }
        }

        let cleaned_lower = cleaned.to_ascii_lowercase();
        if (cleaned.contains("等待扫码")
            || cleaned.contains("请使用微信扫码")
            || cleaned_lower.contains("scan the qr")
            || cleaned_lower.contains("waiting for scan")
            || cleaned_lower.contains("waiting for qr"))
            && state.status.trim().eq_ignore_ascii_case("running")
        {
            state.status = "waiting_scan".to_string();
            state.detail = Some("二维码已生成，请使用手机微信扫码完成绑定。".to_string());
        }

        if cleaned.contains("扫码成功")
            || cleaned.contains("连接成功")
            || cleaned_lower.contains("login successful")
            || cleaned_lower.contains("logged in")
        {
            state.status = "success".to_string();
            state.detail = Some("微信二维码绑定成功，请选择接待 Agent 并保存。".to_string());
            state.updated_at_ms = current_timestamp_millis();
            return;
        }

        if cleaned_lower.contains("unsupported channel: openclaw-weixin")
            || cleaned_lower.contains("unsupported channel: weixin")
        {
            state.status = "error".to_string();
            state.detail =
                Some("未检测到微信插件 openclaw-weixin，请先安装并启用插件后再重试。".to_string());
            state.updated_at_ms = current_timestamp_millis();
            return;
        }

        if cleaned.contains("失败")
            || cleaned_lower.contains("error")
            || cleaned_lower.contains("failed")
        {
            state.detail = Some(cleaned);
        }

        state.updated_at_ms = current_timestamp_millis();
    }
}

fn build_qr_binding_snapshot(
    state: &OpenClawChannelQrBindingSessionState,
) -> OpenClawChannelQrBindingSessionSnapshot {
    OpenClawChannelQrBindingSessionSnapshot {
        session_id: state.session_id.clone(),
        channel_type: state.channel_type.clone(),
        status: state.status.clone(),
        qr_url: state.qr_url.clone(),
        qr_ascii: state.qr_ascii.clone(),
        detail: state.detail.clone(),
        logs: state.logs.clone(),
        started_at_ms: state.started_at_ms,
        updated_at_ms: state.updated_at_ms,
    }
}

fn register_qr_session(
    session_id: &str,
    session_state: SharedQrState,
    cancel_flag: SharedCancelFlag,
) -> Result<(), String> {
    qr_sessions()
        .lock()
        .map_err(|_| channel_error("无法写入二维码会话状态"))?
        .insert(session_id.to_string(), session_state);
    qr_cancel_flags()
        .lock()
        .map_err(|_| channel_error("无法写入二维码取消状态"))?
        .insert(session_id.to_string(), cancel_flag);
    Ok(())
}

fn prune_qr_sessions() {
    let cutoff = current_timestamp_millis().saturating_sub(30 * 60 * 1000);
    let stale_ids = qr_sessions()
        .lock()
        .ok()
        .map(|sessions| {
            sessions
                .iter()
                .filter_map(|(session_id, state)| {
                    state
                        .lock()
                        .ok()
                        .filter(|snapshot| snapshot.updated_at_ms < cutoff)
                        .map(|_| session_id.clone())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if stale_ids.is_empty() {
        return;
    }

    if let Ok(mut sessions) = qr_sessions().lock() {
        for session_id in &stale_ids {
            sessions.remove(session_id);
        }
    }
    if let Ok(mut flags) = qr_cancel_flags().lock() {
        for session_id in &stale_ids {
            flags.remove(session_id);
        }
    }
}

fn clear_qr_session_internal(session_id: &str) {
    if let Ok(mut sessions) = qr_sessions().lock() {
        sessions.remove(session_id);
    }
    if let Ok(mut flags) = qr_cancel_flags().lock() {
        if let Some(flag) = flags.remove(session_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

fn read_weixin_account_index() -> Vec<String> {
    let Ok(index_path) = resolve_weixin_account_index_path() else {
        return Vec::new();
    };
    let Ok(raw) = std::fs::read_to_string(index_path) else {
        return Vec::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };

    parsed
        .as_array()
        .into_iter()
        .flat_map(|items| items.iter())
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn write_json_atomically(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| channel_error(format!("创建目录失败: {error}")))?;
    }

    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| channel_error(format!("序列化 JSON 失败: {error}")))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("data.json");
    let temp_path = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!(
            ".{file_name}.tmp-{}-{}",
            std::process::id(),
            current_timestamp_millis()
        ));

    std::fs::write(&temp_path, serialized)
        .map_err(|error| channel_error(format!("写入临时文件失败: {error}")))?;
    std::fs::rename(&temp_path, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp_path);
        channel_error(format!("替换文件失败: {error}"))
    })
}

fn save_weixin_account_state(
    account_id: &str,
    bot_token: &str,
    base_url: &str,
    user_id: Option<&str>,
) -> Result<(), String> {
    let accounts_dir = resolve_weixin_accounts_dir()?;
    std::fs::create_dir_all(&accounts_dir)
        .map_err(|error| channel_error(format!("创建微信状态目录失败: {error}")))?;

    let mut payload = Map::<String, Value>::new();
    payload.insert(
        "token".to_string(),
        Value::String(bot_token.trim().to_string()),
    );
    payload.insert(
        "savedAt".to_string(),
        Value::String(current_timestamp_millis().to_string()),
    );
    payload.insert(
        "baseUrl".to_string(),
        Value::String(base_url.trim().to_string()),
    );
    if let Some(value) = user_id.map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("userId".to_string(), Value::String(value.to_string()));
    }

    let account_path = resolve_weixin_account_data_path(account_id)?;
    write_json_atomically(&account_path, &Value::Object(payload))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&account_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn register_weixin_account_index(account_id: &str) -> Result<(), String> {
    let mut accounts = read_weixin_account_index();
    if accounts.iter().all(|existing| existing != account_id) {
        accounts.push(account_id.to_string());
    }
    let index_path = resolve_weixin_account_index_path()?;
    let payload = Value::Array(accounts.into_iter().map(Value::String).collect());
    write_json_atomically(&index_path, &payload)
}

fn clear_stale_weixin_accounts_for_user_id(current_account_id: &str, user_id: Option<&str>) {
    let Some(target_user_id) = user_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    let mut accounts = read_weixin_account_index();
    let stale_accounts = accounts
        .iter()
        .filter(|account_id| account_id.as_str() != current_account_id)
        .filter_map(|account_id| {
            let account_path = resolve_weixin_account_data_path(account_id).ok()?;
            let raw = std::fs::read_to_string(account_path).ok()?;
            let parsed = serde_json::from_str::<Value>(&raw).ok()?;
            let saved_user_id = parsed
                .get("userId")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            if saved_user_id == target_user_id {
                Some(account_id.clone())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    if stale_accounts.is_empty() {
        return;
    }

    for stale_account_id in &stale_accounts {
        if let Ok(path) = resolve_weixin_account_data_path(stale_account_id) {
            let _ = std::fs::remove_file(path);
        }
    }

    accounts.retain(|account_id| !stale_accounts.contains(account_id));
    if let Ok(index_path) = resolve_weixin_account_index_path() {
        let payload = Value::Array(accounts.into_iter().map(Value::String).collect());
        let _ = write_json_atomically(&index_path, &payload);
    }
}

fn persist_weixin_qr_binding_result(
    account_id_raw: &str,
    bot_token: &str,
    base_url: &str,
    user_id: Option<&str>,
) -> Result<String, String> {
    let normalized_account_id = normalize_weixin_account_id(account_id_raw);
    let normalized_user_id = user_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    clear_stale_weixin_accounts_for_user_id(&normalized_account_id, normalized_user_id.as_deref());
    save_weixin_account_state(
        &normalized_account_id,
        bot_token,
        base_url,
        normalized_user_id.as_deref(),
    )?;
    register_weixin_account_index(&normalized_account_id)?;

    let mut payload = OpenClawChannelConfigPayload {
        channel_type: "weixin".to_string(),
        account_id: Some(normalized_account_id.clone()),
        config: HashMap::new(),
    };
    payload
        .config
        .insert("baseUrl".to_string(), base_url.trim().to_string());
    payload
        .config
        .insert("botToken".to_string(), bot_token.trim().to_string());
    payload.config.insert(
        "linkedAt".to_string(),
        current_timestamp_millis().to_string(),
    );
    if let Some(user_id) = normalized_user_id {
        payload.config.insert("ilinkUserId".to_string(), user_id);
    }
    save_openclaw_channel_config(payload)?;

    Ok(normalized_account_id)
}

fn is_weixin_plugin_enabled_in_config() -> bool {
    let Ok(config) = config::read_openclaw_config() else {
        return false;
    };

    config
        .get("plugins")
        .and_then(|plugins| plugins.get("entries"))
        .and_then(|entries| entries.get("openclaw-weixin"))
        .and_then(|plugin| plugin.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn ensure_weixin_plugin_ready(session_state: &SharedQrState) -> Result<(), String> {
    let install_plan = resolve_weixin_plugin_install_plan()?;
    let installed_version = read_weixin_plugin_installed_version()?;
    let mut plugin_state_changed = false;
    let needs_reinstall = match (&installed_version, install_plan.expected_version) {
        (None, _) => true,
        (Some(current), Some(expected)) => current.trim() != expected,
        (Some(_), None) => false,
    };

    if needs_reinstall {
        let reason = match (installed_version.as_deref(), install_plan.expected_version) {
            (None, _) => "未检测到微信插件，准备安装官方兼容版本。".to_string(),
            (Some(current), Some(expected)) => {
                format!("检测到微信插件版本为 {current}，当前宿主要求 {expected}，准备重新安装。")
            }
            (Some(current), None) => format!("检测到微信插件版本为 {current}，准备刷新安装。"),
        };
        update_session_log(session_state, &reason);
        manually_install_weixin_plugin(&install_plan, session_state)?;
        plugin_state_changed = true;
    } else if install_plan.needs_tmpdir_patch {
        update_session_log(session_state, "正在校验旧版微信插件兼容补丁...");
        apply_weixin_pre_2026_3_0_compat_patch(&resolve_weixin_plugin_dir()?)?;
    }

    if !is_weixin_plugin_enabled_in_config() {
        update_session_log(session_state, "微信插件已安装，正在写入 enabled 配置...");
        let enable_output = openclaw_engine_command(WEIXIN_PLUGIN_ENABLE_ARGS)?;
        append_command_output_to_session_logs(session_state, "config set 输出：", &enable_output);
        if !enable_output.status.success() {
            return Err(channel_error(format!(
                "启用微信插件失败: {}",
                summarize_command_output(&enable_output)
            )));
        }
        plugin_state_changed = true;
    }

    if !plugin_state_changed {
        update_session_log(
            session_state,
            "微信插件已安装且已启用，跳过阻断式校验与重启，直接获取二维码...",
        );
        return Ok(());
    }

    update_session_log(
        session_state,
        "微信插件状态已更新，正在重启 Gateway 以应用配置...",
    );
    let restart_output = openclaw_engine_command(WEIXIN_GATEWAY_RESTART_ARGS)?;
    append_command_output_to_session_logs(session_state, "gateway restart 输出：", &restart_output);
    if !restart_output.status.success() {
        return Err(channel_error(format!(
            "重启 OpenClaw Gateway 失败: {}",
            summarize_command_output(&restart_output)
        )));
    }

    let restart_text = collect_command_output_lines(&restart_output)
        .join(" ")
        .to_ascii_lowercase();
    if restart_text.contains("gateway service missing") {
        update_session_log(
            session_state,
            "当前 DragonClaw 使用前台托管 Gateway，已跳过官方服务重启要求。",
        );
    }

    match verify_weixin_plugin_loadable(session_state) {
        Ok(()) => update_session_log(session_state, "微信插件状态校验通过，准备获取二维码..."),
        Err(error) => update_session_log(
            session_state,
            &format!("微信插件状态校验未通过，将继续尝试获取二维码: {error}"),
        ),
    }

    Ok(())
}

fn read_weixin_route_tag_from_config() -> Option<String> {
    let parsed = config::read_openclaw_config().ok()?;
    let channels = parsed.get("channels")?.as_object()?;
    let section_key = resolve_existing_channel_key(channels, "weixin")?;
    let section = channels.get(&section_key)?.as_object()?;

    if let Some(tag) = section.get("routeTag").and_then(Value::as_str) {
        let trimmed = tag.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    section
        .get("routeTag")
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
}

fn build_weixin_qr_fetch_headers() -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    if let Some(route_tag) = read_weixin_route_tag_from_config() {
        headers.insert(
            "SKRouteTag",
            HeaderValue::from_str(&route_tag)
                .map_err(|error| channel_error(format!("构建微信请求头失败: {error}")))?,
        );
    }

    Ok(headers)
}

fn build_weixin_qr_status_headers() -> Result<HeaderMap, String> {
    let mut headers = build_weixin_qr_fetch_headers()?;
    headers.insert("iLink-App-ClientVersion", HeaderValue::from_static("1"));
    Ok(headers)
}

async fn fetch_weixin_qr_ticket(client: &reqwest::Client) -> Result<WeixinQrTicket, String> {
    let url = format!("{WEIXIN_DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3");
    let response = client
        .get(url)
        .headers(build_weixin_qr_fetch_headers()?)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| channel_error(format!("请求微信二维码失败: {error}")))?;
    let status = response.status();
    let raw_body = response
        .text()
        .await
        .map_err(|error| channel_error(format!("读取微信二维码响应失败: {error}")))?;

    if !status.is_success() {
        return Err(channel_error(format!(
            "请求微信二维码失败 (HTTP {status}): {}",
            trim_remote_error_detail(&raw_body)
        )));
    }

    let payload = serde_json::from_str::<WeixinQrFetchResponse>(&raw_body)
        .map_err(|error| channel_error(format!("解析微信二维码响应失败: {error}")))?;
    let qrcode = payload
        .qrcode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| channel_error("微信二维码票据为空"))?;
    let qr_url = payload
        .qrcode_img_content
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| channel_error("微信二维码链接为空"))?;

    Ok(WeixinQrTicket { qrcode, qr_url })
}

async fn fetch_weixin_qr_status(
    client: &reqwest::Client,
    base_url: &str,
    qrcode: &str,
) -> Result<WeixinQrStatusResponse, String> {
    let base = base_url.trim().trim_end_matches('/');
    let url = format!("{base}/ilink/bot/get_qrcode_status?qrcode={qrcode}");
    let response = client
        .get(url)
        .headers(build_weixin_qr_status_headers()?)
        .timeout(Duration::from_millis(WEIXIN_QR_STATUS_LONG_POLL_TIMEOUT_MS))
        .send()
        .await
        .map_err(|error| channel_error(format!("轮询微信二维码状态失败: {error}")))?;
    let status = response.status();
    let raw_body = response
        .text()
        .await
        .map_err(|error| channel_error(format!("读取微信二维码状态响应失败: {error}")))?;

    if !status.is_success() {
        return Err(channel_error(format!(
            "微信二维码状态查询失败 (HTTP {status}): {}",
            trim_remote_error_detail(&raw_body)
        )));
    }

    serde_json::from_str::<WeixinQrStatusResponse>(&raw_body)
        .map_err(|error| channel_error(format!("解析微信二维码状态响应失败: {error}")))
}

fn run_openclaw_channel_login_fallback(
    session_state: &SharedQrState,
    cancel_flag: &SharedCancelFlag,
) -> Result<(), String> {
    update_session_log(
        session_state,
        "微信 iLink 直连未生成二维码，回退到 OpenClaw CLI 登录流程...",
    );
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| channel_error(format!("构建 OpenClaw 登录命令失败: {error}")))?;
    command
        .args(["channels", "login", "--channel", WEIXIN_OFFICIAL_CHANNEL_ID])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| channel_error(format!("启动 OpenClaw 微信登录失败: {error}")))?;

    if let Some(stdout) = child.stdout.take() {
        let session_state_clone = session_state.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                update_qr_session_from_cli_line(&session_state_clone, &line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let session_state_clone = session_state.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                update_qr_session_from_cli_line(&session_state_clone, &format!("[stderr] {line}"));
            }
        });
    }

    let started_at_ms = current_timestamp_millis();
    let exit_status = loop {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            set_session_state_message(
                session_state,
                "error",
                "已取消本次二维码绑定，请重新尝试。",
            );
            return Err(channel_error("二维码绑定已取消"));
        }

        if !session_has_qr_url(session_state) {
            let elapsed_ms = current_timestamp_millis().saturating_sub(started_at_ms);
            if elapsed_ms >= WEIXIN_QR_START_EXPECT_TIMEOUT_MS {
                let _ = child.kill();
                let _ = child.wait();
                set_session_state_message(
                    session_state,
                    "error",
                    &format!(
                        "二维码生成超时（{} 秒），请检查微信插件、网络与网关状态后重试。",
                        WEIXIN_QR_START_EXPECT_TIMEOUT_MS / 1000
                    ),
                );
                return Err(channel_error("二维码生成超时"));
            }
        }

        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                thread::sleep(Duration::from_millis(180));
            }
            Err(error) => {
                return Err(channel_error(format!("等待 OpenClaw 登录进程失败: {error}")));
            }
        }
    };

    if exit_status.success() {
        if let Ok(mut state) = session_state.lock() {
            if state.status.trim().eq_ignore_ascii_case("running")
                || state.status.trim().eq_ignore_ascii_case("waiting_scan")
            {
                state.status = "success".to_string();
                state.detail = Some("微信二维码绑定成功，请选择接待 Agent 并保存。".to_string());
                state.updated_at_ms = current_timestamp_millis();
            }
        }
        Ok(())
    } else {
        Err(channel_error(format!(
            "OpenClaw 微信登录失败，退出码: {:?}",
            exit_status.code()
        )))
    }
}

fn run_weixin_qr_binding_flow(
    session_state: &SharedQrState,
    cancel_flag: &SharedCancelFlag,
) -> Result<(), String> {
    eprintln!("[weixin-qr] entering binding flow dispatcher");
    let direct_result = run_weixin_qr_binding_direct_flow(session_state, cancel_flag);
    match direct_result {
        Ok(()) => {
            eprintln!("[weixin-qr] direct flow completed successfully");
            Ok(())
        }
        Err(error) if !session_has_qr_url(session_state) => {
            eprintln!("[weixin-qr] direct flow failed without QR URL, falling back to CLI: {error}");
            update_session_log(
                session_state,
                &format!("微信 iLink 直连失败，准备尝试 CLI fallback: {error}"),
            );
            run_openclaw_channel_login_fallback(session_state, cancel_flag)
        }
        Err(error) => {
            eprintln!("[weixin-qr] direct flow ended after QR URL was set: {error}");
            update_session_log(
                session_state,
                &format!("微信 iLink 流程结束，已保留当前二维码会话状态: {error}"),
            );
            Ok(())
        }
    }
}

fn run_weixin_qr_binding_direct_flow(
    session_state: &SharedQrState,
    cancel_flag: &SharedCancelFlag,
) -> Result<(), String> {
    eprintln!("[weixin-qr] direct flow: ensuring plugin readiness");
    set_session_state_message(
        session_state,
        "running",
        "正在校验微信插件状态，准备拉起二维码...",
    );
    ensure_weixin_plugin_ready(session_state)?;
    eprintln!("[weixin-qr] direct flow: plugin ready, building tokio runtime");
    set_session_state_message(
        session_state,
        "running",
        "微信插件就绪，正在通过微信官方接口拉起二维码...",
    );

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .thread_name("weixin-qr-net")
        .build()
        .map_err(|error| {
            eprintln!("[weixin-qr] failed to build tokio runtime: {error}");
            channel_error(format!("创建微信网络运行时失败: {error}"))
        })?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| {
            eprintln!("[weixin-qr] failed to build reqwest client: {error}");
            channel_error(format!("创建微信网络客户端失败: {error}"))
        })?;

    update_session_log(session_state, "正在通过微信官方接口拉起二维码...");
    eprintln!("[weixin-qr] direct flow: requesting iLink QR ticket");
    let fetch_started_at_ms = current_timestamp_millis();
    let mut qr_ticket = match runtime.block_on(fetch_weixin_qr_ticket(&client)) {
        Ok(ticket) => {
            eprintln!(
                "[weixin-qr] direct flow: received QR ticket in {}ms",
                current_timestamp_millis().saturating_sub(fetch_started_at_ms)
            );
            ticket
        }
        Err(error) => {
            eprintln!("[weixin-qr] direct flow: QR ticket request failed: {error}");
            return Err(error);
        }
    };
    {
        if let Ok(mut state) = session_state.lock() {
            state.qr_url = Some(qr_ticket.qr_url.clone());
            state.status = "waiting_scan".to_string();
            state.detail = Some("二维码已生成，请使用微信扫码完成绑定。".to_string());
            state.updated_at_ms = current_timestamp_millis();
        }
    }
    update_session_log(
        session_state,
        &format!(
            "二维码已就绪 ({}ms)",
            current_timestamp_millis().saturating_sub(fetch_started_at_ms)
        ),
    );

    let loop_started_at_ms = current_timestamp_millis();
    let mut poll_base_url = WEIXIN_DEFAULT_BASE_URL.to_string();
    let mut refresh_count = 1usize;
    let mut last_poll_error = String::new();

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            set_session_state_message(session_state, "error", "已取消本次二维码绑定，请重新尝试。");
            return Err(channel_error("二维码绑定已取消"));
        }

        let elapsed_ms = current_timestamp_millis().saturating_sub(loop_started_at_ms);
        if elapsed_ms >= WEIXIN_QR_LOGIN_TIMEOUT_MS {
            set_session_state_message(
                session_state,
                "error",
                "等待微信扫码结果超时，请重新获取二维码。",
            );
            return Err(channel_error("等待微信扫码结果超时"));
        }

        let status_response = match runtime.block_on(fetch_weixin_qr_status(
            &client,
            &poll_base_url,
            &qr_ticket.qrcode,
        )) {
            Ok(payload) => {
                last_poll_error.clear();
                payload
            }
            Err(error) => {
                if last_poll_error != error {
                    update_session_log(
                        session_state,
                        &format!("二维码状态轮询异常，稍后重试: {error}"),
                    );
                    last_poll_error = error;
                }
                thread::sleep(Duration::from_millis(WEIXIN_QR_STATUS_POLL_INTERVAL_MS));
                continue;
            }
        };

        let status = status_response
            .status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("wait")
            .to_ascii_lowercase();

        match status.as_str() {
            "wait" => {
                set_session_state_message(
                    session_state,
                    "waiting_scan",
                    "二维码已生成，请使用微信扫码完成绑定。",
                );
            }
            "scaned" => {
                set_session_state_message(
                    session_state,
                    "waiting_scan",
                    "已扫码，请在微信中确认登录。",
                );
            }
            "scaned_but_redirect" => {
                if let Some(next_base_url) = sanitize_weixin_redirect_host(
                    status_response.redirect_host.as_deref().unwrap_or_default(),
                ) {
                    poll_base_url = next_base_url;
                    update_session_log(session_state, "检测到微信 IDC 跳转，已切换轮询地址。");
                }
            }
            "expired" => {
                refresh_count = refresh_count.saturating_add(1);
                if refresh_count > WEIXIN_QR_REFRESH_LIMIT {
                    set_session_state_message(
                        session_state,
                        "error",
                        "二维码多次过期，请重新获取后再试。",
                    );
                    return Err(channel_error("微信二维码已过期"));
                }

                update_session_log(
                    session_state,
                    &format!("二维码已过期，正在刷新 ({refresh_count}/{WEIXIN_QR_REFRESH_LIMIT})"),
                );
                qr_ticket = runtime.block_on(fetch_weixin_qr_ticket(&client))?;
                poll_base_url = WEIXIN_DEFAULT_BASE_URL.to_string();
                if let Ok(mut state) = session_state.lock() {
                    state.qr_url = Some(qr_ticket.qr_url.clone());
                    state.status = "waiting_scan".to_string();
                    state.detail = Some("二维码已刷新，请重新扫码完成绑定。".to_string());
                    state.updated_at_ms = current_timestamp_millis();
                }
            }
            "confirmed" => {
                let bot_token = status_response
                    .bot_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| channel_error("微信已确认登录，但未返回 bot_token"))?;
                let account_id = status_response
                    .ilink_bot_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| channel_error("微信已确认登录，但未返回账号标识"))?;
                let base_url = status_response
                    .baseurl
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(WEIXIN_DEFAULT_BASE_URL);
                let normalized_account_id = persist_weixin_qr_binding_result(
                    account_id,
                    bot_token,
                    base_url,
                    status_response.ilink_user_id.as_deref(),
                )?;

                set_session_state_message(
                    session_state,
                    "success",
                    &format!(
                        "微信账号 {normalized_account_id} 绑定成功，请选择接待 Agent 并保存。"
                    ),
                );
                update_session_log(
                    session_state,
                    &format!("微信账号 {normalized_account_id} 绑定成功。"),
                );
                return Ok(());
            }
            other => {
                update_session_log(session_state, &format!("收到未知二维码状态: {other}"));
            }
        }

        thread::sleep(Duration::from_millis(WEIXIN_QR_STATUS_POLL_INTERVAL_MS));
    }
}

fn normalize_dm_scope(raw: &str) -> Option<String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer" => {
            Some(raw.trim().to_ascii_lowercase())
        }
        _ => None,
    }
}

fn upsert_binding_entry(
    bindings: &mut Vec<Value>,
    channel_type: &str,
    account_id: &str,
    agent_id: Option<&str>,
    preferred_dm_scope: Option<&str>,
) {
    bindings.retain(|entry| {
        let Some(binding_obj) = entry.as_object() else {
            return true;
        };
        let existing_channel = binding_obj
            .get("match")
            .and_then(Value::as_object)
            .and_then(|match_obj| match_obj.get("channel"))
            .and_then(Value::as_str)
            .map(normalize_channel_identifier)
            .unwrap_or_default();
        let existing_account_id = binding_obj
            .get("match")
            .and_then(Value::as_object)
            .and_then(|match_obj| match_obj.get("accountId"))
            .and_then(Value::as_str)
            .map(normalize_account_identifier)
            .unwrap_or_else(|| "default".to_string());

        !(existing_channel == channel_type && existing_account_id == account_id)
    });

    if let Some(agent_id) = agent_id.map(str::trim).filter(|value| !value.is_empty()) {
        let mut entry = json!({
            "agentId": agent_id,
            "match": {
                "channel": canonical_channel_key_for_config(channel_type),
                "accountId": account_id
            }
        });
        if let Some(scope) = preferred_dm_scope.and_then(normalize_dm_scope) {
            entry["session"] = json!({ "dmScope": scope });
        }
        bindings.push(entry);
    }
}

#[tauri::command]
pub fn load_openclaw_channel_accounts_snapshot(
) -> Result<OpenClawChannelAccountsSnapshotResponse, String> {
    let source_path = current_config_path_string()?;
    let mut parsed = config::read_openclaw_config()?;
    let root = ensure_root_object(&mut parsed)?;
    let (channel_to_agent, account_to_agent) = resolve_channel_binding_maps(root);

    let mut group_map = HashMap::<String, OpenClawChannelGroupSnapshotItem>::new();
    if let Some(channels_obj) = root.get("channels").and_then(Value::as_object) {
        for (raw_channel_type, section_value) in channels_obj {
            let Some(section_obj) = section_value.as_object() else {
                continue;
            };
            if section_obj.get("enabled").and_then(Value::as_bool) == Some(false) {
                continue;
            }

            let normalized_channel = normalize_channel_identifier(raw_channel_type);
            if normalized_channel.is_empty() {
                continue;
            }

            let mut section_clone = section_obj.clone();
            migrate_legacy_channel_section_to_accounts(&mut section_clone);
            let default_account_id = section_clone
                .get("defaultAccount")
                .and_then(Value::as_str)
                .map(normalize_account_identifier)
                .unwrap_or_else(|| "default".to_string());

            let mut accounts = Vec::<OpenClawChannelAccountSnapshotItem>::new();
            if let Some(accounts_obj) = section_clone.get("accounts").and_then(Value::as_object) {
                for (account_id_raw, account_value) in accounts_obj {
                    let Some(account_obj) = account_value.as_object() else {
                        continue;
                    };

                    let account_id = normalize_account_identifier(account_id_raw);
                    let enabled = account_obj
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(true);
                    let configured = enabled && channel_payload_has_content(account_obj);
                    let status = if configured { "connected" } else { "offline" }.to_string();
                    let agent_id = account_to_agent
                        .get(&format!("{normalized_channel}:{account_id}"))
                        .cloned()
                        .or_else(|| channel_to_agent.get(&normalized_channel).cloned());
                    let display_name = account_obj
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|text| !text.is_empty())
                        .map(str::to_string)
                        .unwrap_or_else(|| {
                            if account_id == "default" {
                                "主账号".to_string()
                            } else {
                                account_id.clone()
                            }
                        });

                    accounts.push(OpenClawChannelAccountSnapshotItem {
                        account_id: account_id.clone(),
                        name: display_name,
                        configured,
                        status,
                        is_default: account_id == default_account_id,
                        agent_id,
                    });
                }
            }

            if accounts.is_empty() {
                continue;
            }

            accounts.sort_by(|left, right| {
                if left.is_default {
                    return std::cmp::Ordering::Less;
                }
                if right.is_default {
                    return std::cmp::Ordering::Greater;
                }
                left.account_id.cmp(&right.account_id)
            });

            let status = if accounts.iter().any(|item| item.configured) {
                "connected".to_string()
            } else {
                "offline".to_string()
            };

            group_map.insert(
                normalized_channel.clone(),
                OpenClawChannelGroupSnapshotItem {
                    channel_type: normalized_channel,
                    default_account_id,
                    status,
                    accounts,
                },
            );
        }
    }

    let mut channels = group_map.into_values().collect::<Vec<_>>();
    channels.sort_by(|left, right| left.channel_type.cmp(&right.channel_type));

    Ok(OpenClawChannelAccountsSnapshotResponse {
        source_path,
        detail: format!("已读取 {} 个已配置频道。", channels.len()),
        channels,
    })
}

#[tauri::command]
pub fn load_openclaw_channel_form_values(
    channel_type: String,
    account_id: Option<String>,
) -> Result<HashMap<String, String>, String> {
    let normalized_channel = normalize_channel_identifier(&channel_type);
    if normalized_channel.is_empty() {
        return Ok(HashMap::new());
    }

    let parsed = config::read_openclaw_config()?;
    let Some(root) = parsed.as_object() else {
        return Ok(HashMap::new());
    };

    let Some(channels_obj) = root.get("channels").and_then(Value::as_object) else {
        return Ok(HashMap::new());
    };
    let section_key = match resolve_existing_channel_key(channels_obj, &normalized_channel) {
        Some(key) => key,
        None => return Ok(HashMap::new()),
    };
    let Some(section_obj) = channels_obj.get(&section_key).and_then(Value::as_object) else {
        return Ok(HashMap::new());
    };

    let mut section_clone = section_obj.clone();
    migrate_legacy_channel_section_to_accounts(&mut section_clone);
    let resolved_account_id = account_id
        .as_deref()
        .map(normalize_account_identifier)
        .unwrap_or_else(|| {
            section_clone
                .get("defaultAccount")
                .and_then(Value::as_str)
                .map(normalize_account_identifier)
                .unwrap_or_else(|| "default".to_string())
        });

    let Some(accounts_obj) = section_clone.get("accounts").and_then(Value::as_object) else {
        return Ok(HashMap::new());
    };
    let Some(account_obj) = accounts_obj
        .get(&resolved_account_id)
        .and_then(Value::as_object)
        .or_else(|| accounts_obj.get("default").and_then(Value::as_object))
    else {
        return Ok(HashMap::new());
    };

    let mut values = HashMap::<String, String>::new();
    for (key, value) in account_obj {
        if key == "enabled" || key == "name" {
            continue;
        }
        let normalized = match value {
            Value::String(text) => text.trim().to_string(),
            Value::Number(number) => number.to_string(),
            Value::Bool(flag) => flag.to_string(),
            Value::Array(_) if key == "allowFrom" => {
                parse_allow_from_list_from_value(Some(value)).join("\n")
            }
            _ => String::new(),
        };
        if normalized.is_empty() {
            continue;
        }
        values.insert(key.to_string(), normalized);
    }

    Ok(sanitize_channel_form_values_for_ui(
        &normalized_channel,
        values,
    ))
}

#[tauri::command]
pub fn save_openclaw_channel_config(payload: OpenClawChannelConfigPayload) -> Result<(), String> {
    let normalized_channel = normalize_channel_identifier(&payload.channel_type);
    if normalized_channel.is_empty() {
        return Err(channel_error("channelType 不能为空"));
    }
    let normalized_account_id = payload
        .account_id
        .as_deref()
        .map(normalize_account_identifier)
        .unwrap_or_else(|| "default".to_string());

    let mut config_value = config::read_openclaw_config()?;
    let root = ensure_root_object(&mut config_value)?;
    let channels_obj = ensure_channels_object(root)?;
    let (section_obj, _section_key) = ensure_channel_section(channels_obj, &normalized_channel)?;
    let accounts_obj = ensure_accounts_object(section_obj)?;

    let mut account_obj = accounts_obj
        .get(&normalized_account_id)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for (key, raw_value) in payload.config {
        let trimmed_key = key.trim();
        if trimmed_key.is_empty() || trimmed_key == "accounts" {
            continue;
        }
        let trimmed_value = raw_value.trim();
        if trimmed_key == "allowFrom" {
            if trimmed_value.is_empty() {
                account_obj.remove(trimmed_key);
            } else {
                let values = parse_allow_from_list_from_text(trimmed_value)
                    .into_iter()
                    .map(Value::String)
                    .collect::<Vec<_>>();
                account_obj.insert(trimmed_key.to_string(), Value::Array(values));
            }
            continue;
        }

        if trimmed_value.is_empty() {
            account_obj.remove(trimmed_key);
        } else {
            account_obj.insert(
                trimmed_key.to_string(),
                Value::String(trimmed_value.to_string()),
            );
        }
    }

    account_obj.insert("enabled".to_string(), Value::Bool(true));
    if !account_obj.contains_key("name") {
        let display_name = if normalized_account_id == "default" {
            match normalized_channel.as_str() {
                "weixin" => "微信主账号",
                "feishu" => "飞书主账号",
                _ => "主账号",
            }
        } else {
            normalized_account_id.as_str()
        };
        account_obj.insert("name".to_string(), Value::String(display_name.to_string()));
    }

    accounts_obj.insert(normalized_account_id.clone(), Value::Object(account_obj));
    section_obj.insert("enabled".to_string(), Value::Bool(true));
    section_obj.insert(
        "channelConfigUpdatedAt".to_string(),
        Value::String(current_timestamp_millis().to_string()),
    );

    let should_update_default = section_obj
        .get("defaultAccount")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|existing| existing.eq_ignore_ascii_case("default"))
        .unwrap_or(true);
    if should_update_default || normalized_channel == "feishu" {
        section_obj.insert(
            "defaultAccount".to_string(),
            Value::String(normalized_account_id),
        );
    }

    config::write_openclaw_config(&config_value)
}

#[tauri::command]
pub fn save_openclaw_channel_binding(payload: OpenClawChannelBindingPayload) -> Result<(), String> {
    let normalized_channel = normalize_channel_identifier(&payload.channel_type);
    if normalized_channel.is_empty() {
        return Err(channel_error("channelType 不能为空"));
    }
    let normalized_account_id = normalize_account_identifier(&payload.account_id);

    let mut config_value = config::read_openclaw_config()?;
    let root = ensure_root_object(&mut config_value)?;

    if !matches!(root.get("bindings"), Some(Value::Array(_))) {
        root.insert("bindings".to_string(), Value::Array(Vec::new()));
    }
    let bindings = root
        .get_mut("bindings")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| channel_error("bindings 配置格式错误"))?;

    upsert_binding_entry(
        bindings,
        &normalized_channel,
        &normalized_account_id,
        payload.agent_id.as_deref(),
        payload.preferred_dm_scope.as_deref(),
    );

    config::write_openclaw_config(&config_value)
}

#[tauri::command]
pub fn remove_openclaw_channel_config(payload: OpenClawChannelRemovePayload) -> Result<(), String> {
    let normalized_channel = normalize_channel_identifier(&payload.channel_type);
    if normalized_channel.is_empty() {
        return Err(channel_error("channelType 不能为空"));
    }

    let mut config_value = config::read_openclaw_config()?;
    let root = ensure_root_object(&mut config_value)?;
    if let Some(channels_obj) = root.get_mut("channels").and_then(Value::as_object_mut) {
        if let Some(section_key) = resolve_existing_channel_key(channels_obj, &normalized_channel) {
            if payload
                .account_id
                .as_ref()
                .map(|value| value.trim().is_empty())
                .unwrap_or(true)
            {
                channels_obj.remove(&section_key);
            } else if let Some(section_obj) = channels_obj
                .get_mut(&section_key)
                .and_then(Value::as_object_mut)
            {
                migrate_legacy_channel_section_to_accounts(section_obj);
                let default_account_id_before_remove = section_obj
                    .get("defaultAccount")
                    .and_then(Value::as_str)
                    .map(normalize_account_identifier)
                    .unwrap_or_else(|| "default".to_string());
                if let Some(accounts_obj) = section_obj
                    .get_mut("accounts")
                    .and_then(Value::as_object_mut)
                {
                    let normalized_account_id = normalize_account_identifier(
                        payload.account_id.as_deref().unwrap_or("default"),
                    );
                    accounts_obj.remove(&normalized_account_id);
                    if accounts_obj.is_empty() {
                        channels_obj.remove(&section_key);
                    } else {
                        if default_account_id_before_remove == normalized_account_id {
                            if let Some(next_default) = accounts_obj.keys().next().cloned() {
                                section_obj.insert(
                                    "defaultAccount".to_string(),
                                    Value::String(next_default),
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(bindings) = root.get_mut("bindings").and_then(Value::as_array_mut) {
        let target_account = payload
            .account_id
            .as_deref()
            .map(normalize_account_identifier);
        bindings.retain(|entry| {
            let Some(binding_obj) = entry.as_object() else {
                return true;
            };
            let binding_channel = binding_obj
                .get("match")
                .and_then(Value::as_object)
                .and_then(|match_obj| match_obj.get("channel"))
                .and_then(Value::as_str)
                .map(normalize_channel_identifier)
                .unwrap_or_default();
            if binding_channel != normalized_channel {
                return true;
            }
            if let Some(target_account) = target_account.as_ref() {
                let binding_account = binding_obj
                    .get("match")
                    .and_then(Value::as_object)
                    .and_then(|match_obj| match_obj.get("accountId"))
                    .and_then(Value::as_str)
                    .map(normalize_account_identifier)
                    .unwrap_or_else(|| "default".to_string());
                binding_account != *target_account
            } else {
                false
            }
        });
    }

    config::write_openclaw_config(&config_value)
}

#[tauri::command]
pub fn start_openclaw_channel_qr_binding(
    channel_type: String,
) -> Result<OpenClawChannelQrBindingSessionSnapshot, String> {
    let normalized_channel = normalize_channel_identifier(&channel_type);
    if normalized_channel != "weixin" {
        return Err(channel_error("当前仅支持微信 (weixin) 二维码绑定"));
    }

    prune_qr_sessions();

    let session_id = uuid::Uuid::new_v4().to_string();
    let now = current_timestamp_millis();
    let cancel_flag: SharedCancelFlag = Arc::new(AtomicBool::new(false));
    let session_state = Arc::new(Mutex::new(OpenClawChannelQrBindingSessionState {
        session_id: session_id.clone(),
        channel_type: normalized_channel.clone(),
        status: "running".to_string(),
        qr_url: None,
        qr_ascii: None,
        detail: Some("已启动微信绑定流程，正在获取二维码...".to_string()),
        logs: vec!["启动微信绑定流程。".to_string()],
        started_at_ms: now,
        updated_at_ms: now,
    }));

    register_qr_session(&session_id, session_state.clone(), cancel_flag.clone())?;

    let session_state_for_thread = session_state.clone();
    let session_id_for_thread = session_id.clone();
    eprintln!(
        "[weixin-qr] spawning binding worker (session_id={})",
        session_id_for_thread
    );
    thread::spawn(move || {
        let session_state_for_panic = session_state_for_thread.clone();
        let session_id_for_panic = session_id_for_thread.clone();
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_weixin_qr_binding_flow(&session_state_for_thread, &cancel_flag)
        }));

        match outcome {
            Ok(Ok(())) => {
                eprintln!(
                    "[weixin-qr] worker finished cleanly (session_id={})",
                    session_id_for_panic
                );
            }
            Ok(Err(error)) => {
                eprintln!(
                    "[weixin-qr] worker returned error (session_id={}): {}",
                    session_id_for_panic, error
                );
                set_session_state_message(&session_state_for_panic, "error", &error);
                update_session_log(&session_state_for_panic, &error);
            }
            Err(payload) => {
                let panic_message = if let Some(message) = payload.downcast_ref::<String>() {
                    message.clone()
                } else if let Some(message) = payload.downcast_ref::<&'static str>() {
                    (*message).to_string()
                } else {
                    "未知 panic".to_string()
                };
                let detail = format!(
                    "微信二维码绑定流程发生意外错误，请稍后重试 (panic: {})",
                    panic_message
                );
                eprintln!(
                    "[weixin-qr] worker panicked (session_id={}): {}",
                    session_id_for_panic, panic_message
                );
                set_session_state_message(&session_state_for_panic, "error", &detail);
                update_session_log(&session_state_for_panic, &detail);
            }
        }

        if let Ok(mut flags) = qr_cancel_flags().lock() {
            flags.remove(&session_id_for_panic);
        }
    });

    let wait_start = current_timestamp_millis();
    loop {
        {
            let state = session_state
                .lock()
                .map_err(|_| channel_error("无法读取二维码会话状态"))?;
            let has_qr_url = state
                .qr_url
                .as_ref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let is_terminal = matches!(state.status.as_str(), "success" | "error");
            if has_qr_url || is_terminal {
                return Ok(build_qr_binding_snapshot(&state));
            }
        }

        if current_timestamp_millis().saturating_sub(wait_start) >= WEIXIN_QR_START_RETURN_GRACE_MS
        {
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }

    let state = session_state
        .lock()
        .map_err(|_| channel_error("无法读取二维码会话状态"))?;
    Ok(build_qr_binding_snapshot(&state))
}

#[tauri::command]
pub fn poll_openclaw_channel_qr_binding(
    session_id: String,
) -> Result<OpenClawChannelQrBindingSessionSnapshot, String> {
    let normalized = session_id.trim();
    if normalized.is_empty() {
        return Err(channel_error("sessionId 不能为空"));
    }
    let parsed = uuid::Uuid::parse_str(normalized)
        .map_err(|_| channel_error("sessionId 格式无效，应为 UUID"))?;
    let normalized_id = parsed.to_string();

    let sessions = qr_sessions()
        .lock()
        .map_err(|_| channel_error("无法读取二维码会话列表"))?;
    let session_state = sessions
        .get(&normalized_id)
        .cloned()
        .ok_or_else(|| channel_error("未找到二维码会话"))?;
    drop(sessions);

    let state = session_state
        .lock()
        .map_err(|_| channel_error("无法读取二维码会话状态"))?;
    Ok(build_qr_binding_snapshot(&state))
}

#[tauri::command]
pub fn clear_openclaw_channel_qr_binding_session(session_id: String) -> Result<(), String> {
    let normalized = session_id.trim();
    if normalized.is_empty() {
        return Ok(());
    }
    let parsed = uuid::Uuid::parse_str(normalized)
        .map_err(|_| channel_error("sessionId 格式无效，应为 UUID"))?;
    clear_qr_session_internal(&parsed.to_string());
    Ok(())
}

#[tauri::command]
pub async fn request_feishu_openclaw_qr() -> Result<FeishuOnboardingQrResponse, String> {
    let endpoint = "https://accounts.feishu.cn/oauth/v1/app/registration";
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| channel_error(format!("创建飞书连接客户端失败: {error}")))?;

    let init_response = client
        .post(endpoint)
        .form(&[("action", "init")])
        .send()
        .await
        .map_err(|error| channel_error(format!("请求飞书创建会话失败 (init): {error}")))?;
    let init_status = init_response.status();
    let init_body = init_response
        .text()
        .await
        .map_err(|error| channel_error(format!("读取飞书创建会话响应失败 (init): {error}")))?;
    if !init_status.is_success() {
        let detail = trim_remote_error_detail(&init_body);
        return Err(channel_error(format!(
            "请求飞书创建会话失败 (init, HTTP {init_status}): {detail}"
        )));
    }

    let init_payload = serde_json::from_str::<FeishuOnboardingInitResponse>(&init_body)
        .map_err(|error| channel_error(format!("解析飞书创建会话响应失败 (init): {error}")))?;
    let supports_client_secret = init_payload
        .supported_auth_methods
        .iter()
        .any(|item| item.trim().eq_ignore_ascii_case("client_secret"));
    if !supports_client_secret {
        return Err(channel_error(
            "当前飞书环境暂不支持 client_secret 授权，请稍后重试。",
        ));
    }

    let begin_response = client
        .post(endpoint)
        .form(&[
            ("action", "begin"),
            ("archetype", "PersonalAgent"),
            ("auth_method", "client_secret"),
            ("request_user_info", "open_id"),
        ])
        .send()
        .await
        .map_err(|error| channel_error(format!("请求飞书创建码失败 (begin): {error}")))?;
    let begin_status = begin_response.status();
    let begin_body = begin_response
        .text()
        .await
        .map_err(|error| channel_error(format!("读取飞书创建码响应失败 (begin): {error}")))?;
    if !begin_status.is_success() {
        let detail = trim_remote_error_detail(&begin_body);
        return Err(channel_error(format!(
            "请求飞书创建码失败 (begin, HTTP {begin_status}): {detail}"
        )));
    }

    let begin_payload = serde_json::from_str::<FeishuOnboardingBeginResponse>(&begin_body)
        .map_err(|error| channel_error(format!("解析飞书创建码响应失败 (begin): {error}")))?;
    let raw_qr_url = begin_payload
        .verification_uri_complete
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| channel_error("飞书返回的二维码链接为空"))?;
    let user_code = begin_payload
        .user_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| channel_error("飞书返回的创建码为空"))?;
    let device_code = begin_payload
        .device_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| channel_error("飞书返回的设备码为空"))?;

    let expires_in_seconds = begin_payload.expire_in.unwrap_or(600).clamp(60, 3600);
    let poll_interval_seconds = begin_payload.interval.unwrap_or(5).clamp(1, 30);
    let expires_at_ms =
        current_timestamp_millis() + u128::from(expires_in_seconds).saturating_mul(1000);

    let qr_url = if let Ok(mut parsed) = reqwest::Url::parse(&raw_qr_url) {
        parsed.query_pairs_mut().append_pair("from", "onboard");
        parsed.to_string()
    } else {
        raw_qr_url
    };

    Ok(FeishuOnboardingQrResponse {
        qr_url,
        user_code,
        device_code,
        poll_interval_seconds,
        expires_in_seconds,
        expires_at_ms,
    })
}

fn map_feishu_poll_error_to_response(
    error_code_raw: &str,
    error_description: Option<String>,
    tenant_brand: Option<String>,
) -> FeishuOnboardingPollResponse {
    let normalized = error_code_raw.trim().to_ascii_lowercase();
    let message = error_description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let (status, fallback_message) = match normalized.as_str() {
        "authorization_pending" => ("pending", "飞书侧尚未完成授权，请扫码后再检查。"),
        "slow_down" => ("pending", "请求过于频繁，请稍后几秒再检查。"),
        "access_denied" => ("denied", "你已拒绝授权，请重新获取创建码并扫码。"),
        "expired_token" | "invalid_grant" => ("expired", "创建码已过期，请重新获取。"),
        _ => ("error", "飞书返回了异常状态，请稍后重试。"),
    };

    FeishuOnboardingPollResponse {
        status: status.to_string(),
        message: Some(message.unwrap_or_else(|| fallback_message.to_string())),
        app_id: None,
        credentials_saved: None,
        tenant_brand,
    }
}

async fn poll_feishu_registration_once(
    client: &reqwest::Client,
    endpoint: &str,
    device_code: &str,
) -> Result<FeishuOnboardingPollRawResponse, String> {
    let response = client
        .post(endpoint)
        .form(&[("action", "poll"), ("device_code", device_code)])
        .send()
        .await
        .map_err(|error| channel_error(format!("请求飞书创建结果失败 (poll): {error}")))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| channel_error(format!("读取飞书创建结果失败 (poll): {error}")))?;
    if !status.is_success() {
        let detail = trim_remote_error_detail(&body);
        return Err(channel_error(format!(
            "请求飞书创建结果失败 (poll, HTTP {status}): {detail}"
        )));
    }
    serde_json::from_str::<FeishuOnboardingPollRawResponse>(&body)
        .map_err(|error| channel_error(format!("解析飞书创建结果失败 (poll): {error}")))
}

fn persist_feishu_credentials_from_onboarding(
    app_id: &str,
    app_secret: &str,
    tenant_brand: Option<&str>,
) -> Result<(), String> {
    let domain = match tenant_brand
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("feishu")
        .to_ascii_lowercase()
        .as_str()
    {
        "lark" => "lark",
        _ => "feishu",
    };

    let mut payload = OpenClawChannelConfigPayload {
        channel_type: "feishu".to_string(),
        account_id: Some(app_id.trim().to_string()),
        config: HashMap::new(),
    };
    payload
        .config
        .insert("appId".to_string(), app_id.trim().to_string());
    payload
        .config
        .insert("appSecret".to_string(), app_secret.trim().to_string());
    payload
        .config
        .insert("domain".to_string(), domain.to_string());
    payload
        .config
        .insert("name".to_string(), app_id.trim().to_string());
    save_openclaw_channel_config(payload)
}

#[tauri::command]
pub async fn poll_feishu_openclaw_qr_result(
    device_code: String,
) -> Result<FeishuOnboardingPollResponse, String> {
    let normalized_device_code = device_code.trim().to_string();
    if normalized_device_code.is_empty() {
        return Err(channel_error("设备码为空，请重新获取创建码。"));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| channel_error(format!("创建飞书查询客户端失败: {error}")))?;

    let mut poll_payload = poll_feishu_registration_once(
        &client,
        "https://accounts.feishu.cn/oauth/v1/app/registration",
        &normalized_device_code,
    )
    .await?;

    let tenant_brand = poll_payload
        .user_info
        .as_ref()
        .and_then(|info| info.tenant_brand.as_ref())
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    if tenant_brand.as_deref() == Some("lark")
        && poll_payload
            .error
            .as_deref()
            .map(str::trim)
            .map(|value| value.eq_ignore_ascii_case("authorization_pending"))
            .unwrap_or(false)
    {
        poll_payload = poll_feishu_registration_once(
            &client,
            "https://accounts.larksuite.com/oauth/v1/app/registration",
            &normalized_device_code,
        )
        .await?;
    }

    let app_id = poll_payload
        .client_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let app_secret = poll_payload
        .client_secret
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let (Some(app_id), Some(app_secret)) = (app_id, app_secret) {
        persist_feishu_credentials_from_onboarding(&app_id, &app_secret, tenant_brand.as_deref())?;
        return Ok(FeishuOnboardingPollResponse {
            status: "success".to_string(),
            message: Some("已获取并保存飞书凭证。".to_string()),
            app_id: Some(app_id),
            credentials_saved: Some(true),
            tenant_brand,
        });
    }

    if let Some(error_code) = poll_payload.error {
        return Ok(map_feishu_poll_error_to_response(
            &error_code,
            poll_payload
                .error_description
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            tenant_brand,
        ));
    }

    Ok(FeishuOnboardingPollResponse {
        status: "pending".to_string(),
        message: Some("飞书侧尚未完成授权，请扫码后再检查。".to_string()),
        app_id: None,
        credentials_saved: None,
        tenant_brand,
    })
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
