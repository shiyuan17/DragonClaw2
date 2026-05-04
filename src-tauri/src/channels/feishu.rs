use super::*;

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
    super::channel_config::save_openclaw_channel_config(payload)
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

