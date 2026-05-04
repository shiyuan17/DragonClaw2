use super::*;
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

pub(super) fn sanitize_weixin_redirect_host(raw: &str) -> Option<String> {
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
            .map_err(|error| channel_error(format!("鍒涘缓鐩綍澶辫触: {error}")))?;
    }

    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| channel_error(format!("搴忓垪鍖?JSON 澶辫触: {error}")))?;
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
        .map_err(|error| channel_error(format!("鍐欏叆涓存椂鏂囦欢澶辫触: {error}")))?;
    std::fs::rename(&temp_path, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp_path);
        channel_error(format!("鏇挎崲鏂囦欢澶辫触: {error}"))
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
        .map_err(|error| channel_error(format!("鍒涘缓寰俊鐘舵€佺洰褰曞け璐? {error}")))?;

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

pub(super) fn persist_weixin_qr_binding_result(
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
    super::channel_config::save_openclaw_channel_config(payload)?;

    Ok(normalized_account_id)
}

fn is_weixin_plugin_enabled_in_config() -> bool {

