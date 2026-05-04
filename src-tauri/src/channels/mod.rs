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
    for segment in raw.split(|ch| ch == '\n' || ch == ',' || ch == '锛?) {
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
        .ok_or_else(|| channel_error("openclaw.json 鏍硅妭鐐规牸寮忛敊璇?))
}

fn ensure_channels_object<'a>(
    root: &'a mut Map<String, Value>,
) -> Result<&'a mut Map<String, Value>, String> {
    if !matches!(root.get("channels"), Some(Value::Object(_))) {
        root.insert("channels".to_string(), Value::Object(Map::new()));
    }
    root.get_mut("channels")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| channel_error("channels 閰嶇疆鏍煎紡閿欒"))
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
        .ok_or_else(|| channel_error("棰戦亾閰嶇疆鏍煎紡閿欒"))?;
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
        .ok_or_else(|| channel_error("棰戦亾 accounts 閰嶇疆鏍煎紡閿欒"))
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
        .ok_or_else(|| channel_error("鏃犳硶瑙ｆ瀽寰俊鎻掍欢鐩綍"))
}

fn openclaw_engine_command(args: &[&str]) -> Result<Output, String> {
    let mut command = openclaw_cli::create_openclaw_cli_command()
        .map_err(|error| channel_error(format!("鏋勫缓 OpenClaw 鍛戒护澶辫触: {error}")))?;
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .output()
        .map_err(|error| channel_error(format!("鎵ц OpenClaw 鍛戒护澶辫触: {error}")))
}

fn run_bundled_npm_cli_command(args: &[&str], current_dir: &Path) -> Result<Output, String> {
    let mut command = openclaw_cli::create_bundled_npm_cli_command()
        .map_err(|error| channel_error(format!("鏋勫缓 npm 鍛戒护澶辫触: {error}")))?;
    command
        .args(args)
        .current_dir(current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .output()
        .map_err(|error| channel_error(format!("鎵ц npm 鍛戒护澶辫触: {error}")))
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
    format!("閫€鍑虹爜: {:?}", output.status.code())
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
        qr_session::update_session_log(session_state, prefix);
    }

    let lines = collect_command_output_lines(output);
    if lines.is_empty() {
        qr_session::update_session_log(
            session_state,
            &format!("鍛戒护宸茬粨鏉燂紝閫€鍑虹爜: {:?}", output.status.code()),
        );
        return;
    }

    let omitted = lines.len().saturating_sub(24);
    for line in lines.iter().take(24) {
        qr_session::update_session_log(session_state, line);
    }
    if omitted > 0 {
        qr_session::update_session_log(
            session_state,
            &format!("鍏朵綑 {omitted} 琛屽懡浠よ緭鍑哄凡鐪佺暐銆?),
        );
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

#[path = "config.rs"]
mod channel_config;
mod feishu;
mod qr_session;
mod shared;
mod weixin_plugin;
mod weixin_qr;

pub use channel_config::{
    load_openclaw_channel_accounts_snapshot, load_openclaw_channel_form_values,
    remove_openclaw_channel_config, save_openclaw_channel_binding,
    save_openclaw_channel_config,
};
pub use feishu::{poll_feishu_openclaw_qr_result, request_feishu_openclaw_qr};
pub use qr_session::{
    clear_openclaw_channel_qr_binding_session, poll_openclaw_channel_qr_binding,
    start_openclaw_channel_qr_binding,
};

