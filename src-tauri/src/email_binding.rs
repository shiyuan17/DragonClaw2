// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
mod env_safety;

use std::collections::HashMap;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use serde::{Deserialize, Serialize};

use env_safety::{
    push_env_assignment, validate_host_input, validate_multiline_safe_input,
};

use crate::paths;

const IMAP_DEFAULT_MAILBOX: &str = "INBOX";
const IMAP_DEFAULT_PORT: u16 = 993;
const SMTP_DEFAULT_PORT: u16 = 587;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImapSmtpEmailBindingSnapshot {
    pub config_path: String,
    pub provider: String,
    pub email_account: String,
    pub imap_host: String,
    pub imap_port: String,
    pub smtp_host: String,
    pub smtp_port: String,
    pub imap_tls: bool,
    pub smtp_secure: bool,
    pub has_authorization_code: bool,
    pub detail: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImapSmtpEmailBindingSaveResponse {
    pub config_path: String,
    pub detail: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImapSmtpEmailBindingCustomConfigPayload {
    pub imap_host: String,
    pub imap_port: String,
    pub smtp_host: String,
    pub smtp_port: String,
    pub imap_tls: bool,
    pub smtp_secure: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveImapSmtpEmailBindingPayload {
    pub provider: String,
    pub email_account: String,
    pub authorization_code: String,
    pub custom_config: Option<ImapSmtpEmailBindingCustomConfigPayload>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct EmailProviderTemplate {
    id: &'static str,
    imap_host: &'static str,
    imap_port: u16,
    smtp_host: &'static str,
    smtp_port: u16,
    imap_tls: bool,
    smtp_secure: bool,
}

#[derive(Debug, Clone)]
struct ParsedImapSmtpEnv {
    values: HashMap<String, String>,
    named_account_lines: Vec<String>,
    allowed_read_dirs: String,
    allowed_write_dirs: String,
}

#[derive(Debug, Clone)]
struct ResolvedImapSmtpConfig {
    provider: String,
    email_account: String,
    authorization_code: String,
    imap_host: String,
    imap_port: u16,
    smtp_host: String,
    smtp_port: u16,
    imap_tls: bool,
    smtp_secure: bool,
    imap_reject_unauthorized: bool,
    smtp_reject_unauthorized: bool,
    imap_mailbox: String,
}

fn email_provider_templates() -> [EmailProviderTemplate; 6] {
    [
        EmailProviderTemplate {
            id: "qq",
            imap_host: "imap.qq.com",
            imap_port: 993,
            smtp_host: "smtp.qq.com",
            smtp_port: 587,
            imap_tls: true,
            smtp_secure: false,
        },
        EmailProviderTemplate {
            id: "163",
            imap_host: "imap.163.com",
            imap_port: 993,
            smtp_host: "smtp.163.com",
            smtp_port: 465,
            imap_tls: true,
            smtp_secure: true,
        },
        EmailProviderTemplate {
            id: "gmail",
            imap_host: "imap.gmail.com",
            imap_port: 993,
            smtp_host: "smtp.gmail.com",
            smtp_port: 587,
            imap_tls: true,
            smtp_secure: false,
        },
        EmailProviderTemplate {
            id: "outlook",
            imap_host: "outlook.office365.com",
            imap_port: 993,
            smtp_host: "smtp.office365.com",
            smtp_port: 587,
            imap_tls: true,
            smtp_secure: false,
        },
        EmailProviderTemplate {
            id: "sina",
            imap_host: "imap.sina.com",
            imap_port: 993,
            smtp_host: "smtp.sina.com",
            smtp_port: 465,
            imap_tls: true,
            smtp_secure: true,
        },
        EmailProviderTemplate {
            id: "sohu",
            imap_host: "imap.sohu.com",
            imap_port: 993,
            smtp_host: "smtp.sohu.com",
            smtp_port: 465,
            imap_tls: true,
            smtp_secure: true,
        },
    ]
}

fn parse_bool_value(value: Option<&String>, default_value: bool) -> bool {
    let Some(raw) = value else {
        return default_value;
    };

    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => default_value,
    }
}

fn parse_u16_value(value: Option<&String>, fallback: u16) -> u16 {
    value
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(fallback)
}

fn parse_port_input(raw: &str, field_label: &str) -> Result<u16, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{field_label} 不能为空。"));
    }

    let port = trimmed
        .parse::<u16>()
        .map_err(|_| format!("{field_label} 不是有效端口号。"))?;
    if port == 0 {
        return Err(format!("{field_label} 必须在 1-65535 范围内。"));
    }

    Ok(port)
}

fn find_provider_template(provider: &str) -> Option<EmailProviderTemplate> {
    let normalized = provider.trim().to_ascii_lowercase();
    email_provider_templates()
        .into_iter()
        .find(|item| item.id == normalized)
}

fn infer_provider_from_hosts(imap_host: &str, smtp_host: &str) -> String {
    let normalized_imap = imap_host.trim().to_ascii_lowercase();
    let normalized_smtp = smtp_host.trim().to_ascii_lowercase();
    if normalized_imap.is_empty() && normalized_smtp.is_empty() {
        return String::new();
    }

    email_provider_templates()
        .into_iter()
        .find(|item| {
            item.imap_host
                .eq_ignore_ascii_case(normalized_imap.as_str())
                && item
                    .smtp_host
                    .eq_ignore_ascii_case(normalized_smtp.as_str())
        })
        .map(|item| item.id.to_string())
        .unwrap_or_else(|| "custom".to_string())
}

fn is_named_account_key(key: &str) -> bool {
    let normalized = key.trim();
    let Some((prefix, suffix)) = normalized.split_once('_') else {
        return false;
    };

    if prefix.is_empty()
        || !prefix
            .chars()
            .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
    {
        return false;
    }

    suffix.starts_with("IMAP_") || suffix.starts_with("SMTP_")
}

fn normalize_env_value(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let is_single_quoted = bytes.first() == Some(&b'\'') && bytes.last() == Some(&b'\'');
        let is_double_quoted = bytes.first() == Some(&b'"') && bytes.last() == Some(&b'"');
        if is_single_quoted || is_double_quoted {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }

    trimmed.to_string()
}

fn parse_existing_imap_smtp_env(content: &str) -> ParsedImapSmtpEnv {
    let mut values = HashMap::<String, String>::new();
    let mut named_account_lines = Vec::<String>::new();
    let mut named_account_index = HashMap::<String, usize>::new();
    let mut allowed_read_dirs = String::new();
    let mut allowed_write_dirs = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let raw = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let Some((raw_key, raw_value)) = raw.split_once('=') else {
            continue;
        };
        let key = raw_key.trim();
        if key.is_empty() {
            continue;
        }

        let value = normalize_env_value(raw_value);
        values.insert(key.to_string(), value.clone());

        if key == "ALLOWED_READ_DIRS" {
            allowed_read_dirs = value.clone();
            continue;
        }
        if key == "ALLOWED_WRITE_DIRS" {
            allowed_write_dirs = value.clone();
            continue;
        }

        if !is_named_account_key(key) {
            continue;
        }

        let line_content = format!("{key}={value}");
        if let Some(index) = named_account_index.get(key).copied() {
            named_account_lines[index] = line_content;
            continue;
        }

        named_account_index.insert(key.to_string(), named_account_lines.len());
        named_account_lines.push(line_content);
    }

    ParsedImapSmtpEnv {
        values,
        named_account_lines,
        allowed_read_dirs,
        allowed_write_dirs,
    }
}

fn resolve_imap_smtp_config_from_payload(
    payload: &SaveImapSmtpEmailBindingPayload,
    existing_values: &HashMap<String, String>,
) -> Result<ResolvedImapSmtpConfig, String> {
    let provider = payload.provider.trim().to_ascii_lowercase();
    if provider.is_empty() {
        return Err("请选择邮箱类型。".to_string());
    }

    let email_account =
        validate_multiline_safe_input(payload.email_account.as_str(), "email account")?;

    let authorization_code = validate_multiline_safe_input(
        payload.authorization_code.as_str(),
        "authorization code",
    )?;

    let imap_reject_unauthorized =
        parse_bool_value(existing_values.get("IMAP_REJECT_UNAUTHORIZED"), true);
    let smtp_reject_unauthorized =
        parse_bool_value(existing_values.get("SMTP_REJECT_UNAUTHORIZED"), true);
    let imap_mailbox = existing_values
        .get("IMAP_MAILBOX")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| IMAP_DEFAULT_MAILBOX.to_string());

    if provider == "custom" {
        let custom_config = payload
            .custom_config
            .as_ref()
            .ok_or_else(|| "其他邮箱需要填写 IMAP/SMTP 服务配置。".to_string())?;
        let imap_host = validate_host_input(custom_config.imap_host.as_str(), "IMAP host")?;
        let smtp_host = validate_host_input(custom_config.smtp_host.as_str(), "SMTP host")?;
        let imap_port = parse_port_input(custom_config.imap_port.as_str(), "IMAP 端口")?;
        let smtp_port = parse_port_input(custom_config.smtp_port.as_str(), "SMTP 端口")?;

        return Ok(ResolvedImapSmtpConfig {
            provider,
            email_account,
            authorization_code,
            imap_host,
            imap_port,
            smtp_host,
            smtp_port,
            imap_tls: custom_config.imap_tls,
            smtp_secure: custom_config.smtp_secure,
            imap_reject_unauthorized,
            smtp_reject_unauthorized,
            imap_mailbox,
        });
    }

    let template = find_provider_template(provider.as_str())
        .ok_or_else(|| "当前邮箱类型暂不支持，请选择其他邮箱并手动填写服务器参数。".to_string())?;

    Ok(ResolvedImapSmtpConfig {
        provider: template.id.to_string(),
        email_account,
        authorization_code,
        imap_host: template.imap_host.to_string(),
        imap_port: template.imap_port,
        smtp_host: template.smtp_host.to_string(),
        smtp_port: template.smtp_port,
        imap_tls: template.imap_tls,
        smtp_secure: template.smtp_secure,
        imap_reject_unauthorized,
        smtp_reject_unauthorized,
        imap_mailbox,
    })
}

fn build_default_allowed_dirs(home_dir: &Path) -> (String, String) {
    let downloads = home_dir.join("Downloads").to_string_lossy().to_string();
    let documents = home_dir.join("Documents").to_string_lossy().to_string();
    let read_dirs = format!("{downloads},{documents}");
    let write_dirs = downloads;
    (read_dirs, write_dirs)
}

fn build_imap_smtp_env_content(
    config: &ResolvedImapSmtpConfig,
    parsed_existing: &ParsedImapSmtpEnv,
    home_dir: &Path,
) -> Result<String, String> {
    let (default_allowed_read_dirs, default_allowed_write_dirs) =
        build_default_allowed_dirs(home_dir);
    let allowed_read_dirs = if parsed_existing.allowed_read_dirs.trim().is_empty() {
        default_allowed_read_dirs
    } else {
        parsed_existing.allowed_read_dirs.trim().to_string()
    };
    let allowed_write_dirs = if parsed_existing.allowed_write_dirs.trim().is_empty() {
        default_allowed_write_dirs
    } else {
        parsed_existing.allowed_write_dirs.trim().to_string()
    };

    let mut content = String::new();
    content.push_str("# Default account\n");
    push_env_assignment(&mut content, "IMAP_HOST", &config.imap_host, "IMAP host")?;
    push_env_assignment(
        &mut content,
        "IMAP_PORT",
        config.imap_port.to_string().as_str(),
        "IMAP port",
    )?;
    push_env_assignment(&mut content, "IMAP_USER", &config.email_account, "email account")?;
    push_env_assignment(
        &mut content,
        "IMAP_PASS",
        &config.authorization_code,
        "authorization code",
    )?;
    push_env_assignment(
        &mut content,
        "IMAP_TLS",
        config.imap_tls.to_string().as_str(),
        "IMAP TLS",
    )?;
    push_env_assignment(
        &mut content,
        "IMAP_REJECT_UNAUTHORIZED",
        config.imap_reject_unauthorized.to_string().as_str(),
        "IMAP TLS validation",
    )?;
    push_env_assignment(
        &mut content,
        "IMAP_MAILBOX",
        &config.imap_mailbox,
        "IMAP mailbox",
    )?;
    push_env_assignment(&mut content, "SMTP_HOST", &config.smtp_host, "SMTP host")?;
    push_env_assignment(
        &mut content,
        "SMTP_PORT",
        config.smtp_port.to_string().as_str(),
        "SMTP port",
    )?;
    push_env_assignment(
        &mut content,
        "SMTP_SECURE",
        config.smtp_secure.to_string().as_str(),
        "SMTP secure",
    )?;
    push_env_assignment(&mut content, "SMTP_USER", &config.email_account, "email account")?;
    push_env_assignment(
        &mut content,
        "SMTP_PASS",
        &config.authorization_code,
        "authorization code",
    )?;
    push_env_assignment(&mut content, "SMTP_FROM", &config.email_account, "email account")?;
    push_env_assignment(
        &mut content,
        "SMTP_REJECT_UNAUTHORIZED",
        config.smtp_reject_unauthorized.to_string().as_str(),
        "SMTP TLS validation",
    )?;
    content.push('\n');
    content.push_str("# File access whitelist (security)\n");
    push_env_assignment(
        &mut content,
        "ALLOWED_READ_DIRS",
        &allowed_read_dirs,
        "allowed read dirs",
    )?;
    push_env_assignment(
        &mut content,
        "ALLOWED_WRITE_DIRS",
        &allowed_write_dirs,
        "allowed write dirs",
    )?;

    if !parsed_existing.named_account_lines.is_empty() {
        content.push('\n');
        content.push_str("# Named accounts\n");
        for line in &parsed_existing.named_account_lines {
            content.push_str(line);
            content.push('\n');
        }
    }

    Ok(content)
}

fn build_snapshot_from_content(
    config_path: &Path,
    raw_content: &str,
    file_exists: bool,
) -> ImapSmtpEmailBindingSnapshot {
    let parsed = parse_existing_imap_smtp_env(raw_content);
    let imap_host = parsed.values.get("IMAP_HOST").cloned().unwrap_or_default();
    let smtp_host = parsed.values.get("SMTP_HOST").cloned().unwrap_or_default();
    let inferred_provider = infer_provider_from_hosts(imap_host.as_str(), smtp_host.as_str());

    let default_template = find_provider_template(inferred_provider.as_str());
    let imap_port = parse_u16_value(
        parsed.values.get("IMAP_PORT"),
        default_template
            .map(|item| item.imap_port)
            .unwrap_or(IMAP_DEFAULT_PORT),
    );
    let smtp_port = parse_u16_value(
        parsed.values.get("SMTP_PORT"),
        default_template
            .map(|item| item.smtp_port)
            .unwrap_or(SMTP_DEFAULT_PORT),
    );
    let imap_tls = parse_bool_value(
        parsed.values.get("IMAP_TLS"),
        default_template.map(|item| item.imap_tls).unwrap_or(true),
    );
    let smtp_secure = parse_bool_value(
        parsed.values.get("SMTP_SECURE"),
        default_template
            .map(|item| item.smtp_secure)
            .unwrap_or(false),
    );
    let email_account = parsed
        .values
        .get("IMAP_USER")
        .or_else(|| parsed.values.get("SMTP_USER"))
        .or_else(|| parsed.values.get("SMTP_FROM"))
        .cloned()
        .unwrap_or_default();
    let has_authorization_code = parsed
        .values
        .get("IMAP_PASS")
        .or_else(|| parsed.values.get("SMTP_PASS"))
        .map(|item| !item.trim().is_empty())
        .unwrap_or(false);
    let detail = if file_exists {
        "已读取邮箱绑定配置。".to_string()
    } else {
        "尚未找到邮箱绑定配置，请先完成绑定。".to_string()
    };

    ImapSmtpEmailBindingSnapshot {
        config_path: config_path.to_string_lossy().to_string(),
        provider: inferred_provider,
        email_account,
        imap_host,
        imap_port: imap_port.to_string(),
        smtp_host,
        smtp_port: smtp_port.to_string(),
        imap_tls,
        smtp_secure,
        has_authorization_code,
        detail,
    }
}

#[tauri::command]
pub fn load_imap_smtp_email_binding() -> Result<ImapSmtpEmailBindingSnapshot, String> {
    let config_path = paths::imap_smtp_email_env_path()?;
    let file_exists = config_path.exists();
    let raw_content = if file_exists {
        fs::read_to_string(&config_path)
            .map_err(|error| format!("读取邮箱绑定配置失败: {error}"))?
    } else {
        String::new()
    };

    Ok(build_snapshot_from_content(
        &config_path,
        raw_content.as_str(),
        file_exists,
    ))
}

#[tauri::command]
pub fn save_imap_smtp_email_binding(
    payload: SaveImapSmtpEmailBindingPayload,
) -> Result<ImapSmtpEmailBindingSaveResponse, String> {
    let config_path = paths::imap_smtp_email_env_path()?;
    let home_dir = paths::user_home_dir()?;
    let existing_content = if config_path.exists() {
        fs::read_to_string(&config_path)
            .map_err(|error| format!("读取邮箱绑定配置失败: {error}"))?
    } else {
        String::new()
    };

    let parsed = parse_existing_imap_smtp_env(existing_content.as_str());
    let resolved = resolve_imap_smtp_config_from_payload(&payload, &parsed.values)?;
    let next_content = build_imap_smtp_env_content(&resolved, &parsed, home_dir.as_path())?;

    let config_dir = config_path
        .parent()
        .ok_or_else(|| "邮箱配置目录无效，无法保存绑定信息。".to_string())?;
    fs::create_dir_all(config_dir).map_err(|error| format!("创建邮箱配置目录失败: {error}"))?;
    fs::write(&config_path, next_content)
        .map_err(|error| format!("保存邮箱绑定配置失败: {error}"))?;

    #[cfg(unix)]
    {
        fs::set_permissions(config_dir, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("设置邮箱配置目录权限失败: {error}"))?;
        fs::set_permissions(&config_path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("设置邮箱配置文件权限失败: {error}"))?;
    }

    Ok(ImapSmtpEmailBindingSaveResponse {
        config_path: config_path.to_string_lossy().to_string(),
        detail: format!(
            "邮箱绑定已保存（{}），并保留已有命名账号配置。",
            resolved.provider
        ),
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn provider_template_mapping_matches_expected_hosts() {
        let gmail = find_provider_template("gmail").expect("gmail template should exist");
        assert_eq!(gmail.imap_host, "imap.gmail.com");
        assert_eq!(gmail.smtp_host, "smtp.gmail.com");
        assert_eq!(gmail.smtp_port, 587);

        let outlook = find_provider_template("outlook").expect("outlook template should exist");
        assert_eq!(outlook.imap_host, "outlook.office365.com");
        assert_eq!(outlook.smtp_host, "smtp.office365.com");
    }

    #[test]
    fn custom_provider_validation_requires_hosts_and_valid_ports() {
        let missing_custom = SaveImapSmtpEmailBindingPayload {
            provider: "custom".to_string(),
            email_account: "custom@example.com".to_string(),
            authorization_code: "secret".to_string(),
            custom_config: None,
        };
        assert!(resolve_imap_smtp_config_from_payload(&missing_custom, &HashMap::new()).is_err());

        let valid_custom = SaveImapSmtpEmailBindingPayload {
            provider: "custom".to_string(),
            email_account: "custom@example.com".to_string(),
            authorization_code: "secret".to_string(),
            custom_config: Some(ImapSmtpEmailBindingCustomConfigPayload {
                imap_host: "imap.custom.mail".to_string(),
                imap_port: "993".to_string(),
                smtp_host: "smtp.custom.mail".to_string(),
                smtp_port: "465".to_string(),
                imap_tls: true,
                smtp_secure: true,
            }),
        };

        let resolved = resolve_imap_smtp_config_from_payload(&valid_custom, &HashMap::new())
            .expect("valid custom provider should succeed");
        assert_eq!(resolved.imap_host, "imap.custom.mail");
        assert_eq!(resolved.smtp_host, "smtp.custom.mail");
        assert_eq!(resolved.imap_port, 993);
        assert_eq!(resolved.smtp_port, 465);
    }

    #[test]
    fn port_range_validation_rejects_invalid_values() {
        assert!(parse_port_input("", "IMAP 端口").is_err());
        assert!(parse_port_input("abc", "IMAP 端口").is_err());
        assert!(parse_port_input("0", "IMAP 端口").is_err());
        assert!(parse_port_input("65536", "IMAP 端口").is_err());
        assert_eq!(
            parse_port_input("65535", "IMAP 端口").expect("65535 should be valid"),
            65535
        );
    }

    #[test]
    fn env_build_keeps_named_accounts_and_uses_default_allowlists_when_missing() {
        let existing = parse_existing_imap_smtp_env(
            r#"
WORK_IMAP_HOST=imap.company.com
WORK_SMTP_HOST=smtp.company.com
"#,
        );
        let payload = SaveImapSmtpEmailBindingPayload {
            provider: "gmail".to_string(),
            email_account: "member@example.com".to_string(),
            authorization_code: "token-123".to_string(),
            custom_config: None,
        };
        let resolved = resolve_imap_smtp_config_from_payload(&payload, &existing.values)
            .expect("gmail template payload should resolve");
        let home_dir = PathBuf::from("/Users/dev");
        let content = build_imap_smtp_env_content(&resolved, &existing, &home_dir)
            .expect("env content should build");
        let expected_read_dirs = format!(
            "{},{}",
            home_dir.join("Downloads").to_string_lossy(),
            home_dir.join("Documents").to_string_lossy()
        );
        let expected_write_dirs = home_dir.join("Downloads").to_string_lossy().to_string();
        let escaped_read_dirs = expected_read_dirs.replace('\\', "\\\\");
        let escaped_write_dirs = expected_write_dirs.replace('\\', "\\\\");

        assert!(content.contains("# Default account"));
        assert!(content.contains("IMAP_HOST=\"imap.gmail.com\""));
        assert!(content.contains("SMTP_HOST=\"smtp.gmail.com\""));
        assert!(content.contains(format!("ALLOWED_READ_DIRS=\"{escaped_read_dirs}\"").as_str()));
        assert!(content.contains(format!("ALLOWED_WRITE_DIRS=\"{escaped_write_dirs}\"").as_str()));
        assert!(content.contains("WORK_IMAP_HOST=imap.company.com"));
        assert!(content.contains("WORK_SMTP_HOST=smtp.company.com"));
    }

    #[test]
    fn load_snapshot_infers_provider_and_authorization_code_from_existing_env() {
        let snapshot = build_snapshot_from_content(
            Path::new("/tmp/.env"),
            r#"
IMAP_HOST=imap.qq.com
IMAP_PORT=993
IMAP_USER=person@example.com
IMAP_PASS=token
IMAP_TLS=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=person@example.com
SMTP_PASS=token
"#,
            true,
        );

        assert_eq!(snapshot.provider, "qq");
        assert_eq!(snapshot.email_account, "person@example.com");
        assert_eq!(snapshot.imap_port, "993");
        assert_eq!(snapshot.smtp_port, "587");
        assert!(snapshot.has_authorization_code);
    }
}
