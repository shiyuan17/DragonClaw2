use super::*;
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

pub(super) fn update_session_log(session_state: &SharedQrState, line: &str) {
    if let Ok(mut state) = session_state.lock() {
        append_session_log(&mut state, line.trim().to_string());
    }
}

pub(super) fn set_session_state_message(session_state: &SharedQrState, status: &str, detail: &str) {
    if let Ok(mut state) = session_state.lock() {
        state.status = status.to_string();
        state.detail = Some(detail.to_string());
        state.updated_at_ms = current_timestamp_millis();
    }
}

pub(super) fn session_has_qr_url(session_state: &SharedQrState) -> bool {
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
                    | '銆?
                    | '锛?
                    | '锛?
                    | '锛?
                    | '銆?
                    | '锛?
                    | '銆?
                    | '銆?
            )
        });
    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

pub(super) fn update_qr_session_from_cli_line(session_state: &SharedQrState, raw_line: &str) {
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
                if state
                    .detail
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or_default()
                    .is_empty()
                    || state
                        .detail
                        .as_deref()
                        .unwrap_or_default()
                        .contains("宸插惎鍔ㄥ井淇＄粦瀹氭祦绋?)
                {
                    state.detail = Some("浜岀淮鐮佸凡鐢熸垚锛岃浣跨敤鎵嬫満寰俊鎵爜瀹屾垚缁戝畾銆?.to_string());
                }
            }
        }

        let cleaned_lower = cleaned.to_ascii_lowercase();
        if (cleaned.contains("绛夊緟鎵爜")
            || cleaned.contains("璇蜂娇鐢ㄥ井淇℃壂鐮?)
            || cleaned_lower.contains("scan the qr")
            || cleaned_lower.contains("waiting for scan")
            || cleaned_lower.contains("waiting for qr"))
            && state.status.trim().eq_ignore_ascii_case("running")
        {
            state.status = "waiting_scan".to_string();
            state.detail = Some("浜岀淮鐮佸凡鐢熸垚锛岃浣跨敤鎵嬫満寰俊鎵爜瀹屾垚缁戝畾銆?.to_string());
        }

        if cleaned.contains("鎵爜鎴愬姛")
            || cleaned.contains("杩炴帴鎴愬姛")
            || cleaned_lower.contains("login successful")
            || cleaned_lower.contains("logged in")
        {
            state.status = "success".to_string();
            state.detail = Some("寰俊浜岀淮鐮佺粦瀹氭垚鍔燂紝璇烽€夋嫨鎺ュ緟 Agent 骞朵繚瀛樸€?.to_string());
            state.updated_at_ms = current_timestamp_millis();
            return;
        }

        if cleaned_lower.contains("unsupported channel: openclaw-weixin")
            || cleaned_lower.contains("unsupported channel: weixin")
        {
            state.status = "error".to_string();
            state.detail =
                Some("鏈娴嬪埌寰俊鎻掍欢 openclaw-weixin锛岃鍏堝畨瑁呭苟鍚敤鎻掍欢鍚庡啀閲嶈瘯銆?.to_string());
            state.updated_at_ms = current_timestamp_millis();
            return;
        }

        if cleaned.contains("澶辫触")
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
        .map_err(|_| channel_error("鏃犳硶鍐欏叆浜岀淮鐮佷細璇濈姸鎬?))?
        .insert(session_id.to_string(), session_state);
    qr_cancel_flags()
        .lock()
        .map_err(|_| channel_error("鏃犳硶鍐欏叆浜岀淮鐮佸彇娑堢姸鎬?))?
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

pub fn start_openclaw_channel_qr_binding(
    channel_type: String,
) -> Result<OpenClawChannelQrBindingSessionSnapshot, String> {
    let normalized_channel = normalize_channel_identifier(&channel_type);
    if normalized_channel != "weixin" {
        return Err(channel_error("褰撳墠浠呮敮鎸佸井淇?(weixin) 浜岀淮鐮佺粦瀹?));
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
        detail: Some("宸插惎鍔ㄥ井淇＄粦瀹氭祦绋嬶紝姝ｅ湪鑾峰彇浜岀淮鐮?..".to_string()),
        logs: vec!["鍚姩寰俊缁戝畾娴佺▼銆?.to_string()],
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
            super::weixin_qr::run_weixin_qr_binding_flow(&session_state_for_thread, &cancel_flag)
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
                    "鏈煡 panic".to_string()
                };
                let detail = format!(
                    "寰俊浜岀淮鐮佺粦瀹氭祦绋嬪彂鐢熸剰澶栭敊璇紝璇风◢鍚庨噸璇?(panic: {})",
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
                .map_err(|_| channel_error("鏃犳硶璇诲彇浜岀淮鐮佷細璇濈姸鎬?))?;
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
        .map_err(|_| channel_error("鏃犳硶璇诲彇浜岀淮鐮佷細璇濈姸鎬?))?;
    Ok(build_qr_binding_snapshot(&state))
}

#[tauri::command]
pub fn poll_openclaw_channel_qr_binding(
    session_id: String,
) -> Result<OpenClawChannelQrBindingSessionSnapshot, String> {
    let normalized = session_id.trim();
    if normalized.is_empty() {
        return Err(channel_error("sessionId 涓嶈兘涓虹┖"));
    }
    let parsed = uuid::Uuid::parse_str(normalized)
        .map_err(|_| channel_error("sessionId 鏍煎紡鏃犳晥锛屽簲涓?UUID"))?;
    let normalized_id = parsed.to_string();

    let sessions = qr_sessions()
        .lock()
        .map_err(|_| channel_error("鏃犳硶璇诲彇浜岀淮鐮佷細璇濆垪琛?))?;
    let session_state = sessions
        .get(&normalized_id)
        .cloned()
        .ok_or_else(|| channel_error("鏈壘鍒颁簩缁寸爜浼氳瘽"))?;
    drop(sessions);

    let state = session_state
        .lock()
        .map_err(|_| channel_error("鏃犳硶璇诲彇浜岀淮鐮佷細璇濈姸鎬?))?;
    Ok(build_qr_binding_snapshot(&state))
}

#[tauri::command]
pub fn clear_openclaw_channel_qr_binding_session(session_id: String) -> Result<(), String> {

