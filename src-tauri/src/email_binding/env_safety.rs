pub(super) fn validate_multiline_safe_input(
    raw: &str,
    field_label: &str,
) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{field_label} cannot be empty."));
    }

    if trimmed.chars().any(|character| {
        character == '\n'
            || character == '\r'
            || character == '\0'
            || (character.is_control() && character != '\t')
    }) {
        return Err(format!("{field_label} contains unsafe characters."));
    }

    Ok(trimmed.to_string())
}

pub(super) fn validate_host_input(raw: &str, field_label: &str) -> Result<String, String> {
    let trimmed = validate_multiline_safe_input(raw, field_label)?;
    if trimmed.contains(char::is_whitespace) {
        return Err(format!("{field_label} cannot contain whitespace."));
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '.' || character == '-')
    {
        return Err(format!(
            "{field_label} may only contain letters, numbers, dots, and hyphens."
        ));
    }

    Ok(trimmed)
}

fn encode_env_value(raw: &str, field_label: &str) -> Result<String, String> {
    let sanitized = validate_multiline_safe_input(raw, field_label)?;
    let escaped = sanitized.replace('\\', "\\\\").replace('"', "\\\"");
    Ok(format!("\"{escaped}\""))
}

pub(super) fn push_env_assignment(
    content: &mut String,
    key: &str,
    value: &str,
    field_label: &str,
) -> Result<(), String> {
    let encoded = encode_env_value(value, field_label)?;
    content.push_str(key);
    content.push('=');
    content.push_str(encoded.as_str());
    content.push('\n');
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::Path;

    use super::super::{
        build_imap_smtp_env_content, resolve_imap_smtp_config_from_payload,
        ImapSmtpEmailBindingCustomConfigPayload, ParsedImapSmtpEnv,
        SaveImapSmtpEmailBindingPayload,
    };

    #[test]
    fn env_build_quotes_sensitive_values_and_keeps_equals_safe() {
        let payload = SaveImapSmtpEmailBindingPayload {
            provider: "gmail".to_string(),
            email_account: "member@example.com".to_string(),
            authorization_code: "token=abc123".to_string(),
            custom_config: None,
        };
        let resolved = resolve_imap_smtp_config_from_payload(&payload, &HashMap::new())
            .expect("gmail payload should resolve");
        let content = build_imap_smtp_env_content(
            &resolved,
            &ParsedImapSmtpEnv {
                values: HashMap::new(),
                named_account_lines: Vec::new(),
                allowed_read_dirs: String::new(),
                allowed_write_dirs: String::new(),
            },
            Path::new("/tmp"),
        )
        .expect("env content should build");

        assert!(content.contains("IMAP_PASS=\"token=abc123\""));
        assert!(content.contains("SMTP_PASS=\"token=abc123\""));
    }

    #[test]
    fn validation_rejects_newline_injection_inputs() {
        let payload = SaveImapSmtpEmailBindingPayload {
            provider: "custom".to_string(),
            email_account: "member@example.com\nALLOWED_READ_DIRS=/".to_string(),
            authorization_code: "secret".to_string(),
            custom_config: Some(ImapSmtpEmailBindingCustomConfigPayload {
                imap_host: "imap.example.com".to_string(),
                imap_port: "993".to_string(),
                smtp_host: "smtp.example.com".to_string(),
                smtp_port: "587".to_string(),
                imap_tls: true,
                smtp_secure: false,
            }),
        };

        assert!(resolve_imap_smtp_config_from_payload(&payload, &HashMap::new()).is_err());
    }
}
