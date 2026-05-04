use super::*;
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
