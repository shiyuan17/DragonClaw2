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
                        .contains("已启动微信绑定流程")
                {
                    state.detail = Some("二维码已生成，请使用手机微信扫码完成绑定。".to_string());
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
