use super::*;
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
    let install_plan = super::weixin_plugin::resolve_weixin_plugin_install_plan()?;
    let installed_version = super::weixin_plugin::read_weixin_plugin_installed_version()?;
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
        super::qr_session::update_session_log(session_state, &reason);
        super::weixin_plugin::manually_install_weixin_plugin(&install_plan, session_state)?;
        plugin_state_changed = true;
    } else if install_plan.needs_tmpdir_patch {
        super::qr_session::update_session_log(session_state, "正在校验旧版微信插件兼容补丁...");
        super::weixin_plugin::apply_weixin_pre_2026_3_0_compat_patch(
            &resolve_weixin_plugin_dir()?,
        )?;
    }

    if !is_weixin_plugin_enabled_in_config() {
        super::qr_session::update_session_log(
            session_state,
            "微信插件已安装，正在写入 enabled 配置...",
        );
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
        super::qr_session::update_session_log(
            session_state,
            "微信插件已安装且已启用，跳过阻断式校验与重启，直接获取二维码...",
        );
        return Ok(());
    }

    super::qr_session::update_session_log(
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
        super::qr_session::update_session_log(
            session_state,
            "当前 DragonClaw 使用前台托管 Gateway，已跳过官方服务重启要求。",
        );
    }

    match super::weixin_plugin::verify_weixin_plugin_loadable(session_state) {
        Ok(()) => super::qr_session::update_session_log(
            session_state,
            "微信插件状态校验通过，准备获取二维码...",
        ),
        Err(error) => super::qr_session::update_session_log(
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
    super::qr_session::update_session_log(
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
                super::qr_session::update_qr_session_from_cli_line(&session_state_clone, &line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let session_state_clone = session_state.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                super::qr_session::update_qr_session_from_cli_line(
                    &session_state_clone,
                    &format!("[stderr] {line}"),
                );
            }
        });
    }

    let started_at_ms = current_timestamp_millis();
    let exit_status = loop {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            super::qr_session::set_session_state_message(
                session_state,
                "error",
                "已取消本次二维码绑定，请重新尝试。",
            );
            return Err(channel_error("二维码绑定已取消"));
        }

        if !super::qr_session::session_has_qr_url(session_state) {
            let elapsed_ms = current_timestamp_millis().saturating_sub(started_at_ms);
            if elapsed_ms >= WEIXIN_QR_START_EXPECT_TIMEOUT_MS {
                let _ = child.kill();
                let _ = child.wait();
                super::qr_session::set_session_state_message(
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
                return Err(channel_error(format!(
                    "等待 OpenClaw 登录进程失败: {error}"
                )));
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

pub(super) fn run_weixin_qr_binding_flow(
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
        Err(error) if !super::qr_session::session_has_qr_url(session_state) => {
            eprintln!(
                "[weixin-qr] direct flow failed without QR URL, falling back to CLI: {error}"
            );
            super::qr_session::update_session_log(
                session_state,
                &format!("微信 iLink 直连失败，准备尝试 CLI fallback: {error}"),
            );
            run_openclaw_channel_login_fallback(session_state, cancel_flag)
        }
        Err(error) => {
            eprintln!("[weixin-qr] direct flow ended after QR URL was set: {error}");
            super::qr_session::update_session_log(
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
    super::qr_session::set_session_state_message(
        session_state,
        "running",
        "正在校验微信插件状态，准备拉起二维码...",
    );
    ensure_weixin_plugin_ready(session_state)?;
    eprintln!("[weixin-qr] direct flow: plugin ready, building tokio runtime");
    super::qr_session::set_session_state_message(
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

    super::qr_session::update_session_log(session_state, "正在通过微信官方接口拉起二维码...");
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
    super::qr_session::update_session_log(
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
            super::qr_session::set_session_state_message(
                session_state,
                "error",
                "已取消本次二维码绑定，请重新尝试。",
            );
            return Err(channel_error("二维码绑定已取消"));
        }

        let elapsed_ms = current_timestamp_millis().saturating_sub(loop_started_at_ms);
        if elapsed_ms >= WEIXIN_QR_LOGIN_TIMEOUT_MS {
            super::qr_session::set_session_state_message(
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
                    super::qr_session::update_session_log(
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
                super::qr_session::set_session_state_message(
                    session_state,
                    "waiting_scan",
                    "二维码已生成，请使用微信扫码完成绑定。",
                );
            }
            "scaned" => {
                super::qr_session::set_session_state_message(
                    session_state,
                    "waiting_scan",
                    "已扫码，请在微信中确认登录。",
                );
            }
            "scaned_but_redirect" => {
                if let Some(next_base_url) = super::shared::sanitize_weixin_redirect_host(
                    status_response.redirect_host.as_deref().unwrap_or_default(),
                ) {
                    poll_base_url = next_base_url;
                    super::qr_session::update_session_log(
                        session_state,
                        "检测到微信 IDC 跳转，已切换轮询地址。",
                    );
                }
            }
            "expired" => {
                refresh_count = refresh_count.saturating_add(1);
                if refresh_count > WEIXIN_QR_REFRESH_LIMIT {
                    super::qr_session::set_session_state_message(
                        session_state,
                        "error",
                        "二维码多次过期，请重新获取后再试。",
                    );
                    return Err(channel_error("微信二维码已过期"));
                }

                super::qr_session::update_session_log(
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
                let normalized_account_id = super::shared::persist_weixin_qr_binding_result(
                    account_id,
                    bot_token,
                    base_url,
                    status_response.ilink_user_id.as_deref(),
                )?;

                super::qr_session::set_session_state_message(
                    session_state,
                    "success",
                    &format!(
                        "微信账号 {normalized_account_id} 绑定成功，请选择接待 Agent 并保存。"
                    ),
                );
                super::qr_session::update_session_log(
                    session_state,
                    &format!("微信账号 {normalized_account_id} 绑定成功。"),
                );
                return Ok(());
            }
            other => {
                super::qr_session::update_session_log(
                    session_state,
                    &format!("收到未知二维码状态: {other}"),
                );
            }
        }

        thread::sleep(Duration::from_millis(WEIXIN_QR_STATUS_POLL_INTERVAL_MS));
    }
}

