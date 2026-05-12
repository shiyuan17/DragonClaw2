use super::{
    migrate_legacy_channel_section_to_accounts, normalize_channel_identifier,
    parse_allow_from_list_from_text, parse_allow_from_list_from_value,
};
use serde_json::{json, Map, Value};

#[test]
fn normalize_channel_identifier_maps_known_aliases() {
    assert_eq!(normalize_channel_identifier("wechat"), "weixin");
    assert_eq!(normalize_channel_identifier("openclaw_weixin"), "weixin");
    assert_eq!(normalize_channel_identifier("lark"), "feishu");
    assert_eq!(normalize_channel_identifier(" custom "), "custom");
}

#[test]
fn parse_allow_from_list_deduplicates_and_normalizes_inputs() {
    assert_eq!(
        parse_allow_from_list_from_text("alice\nbob,alice，carol"),
        vec!["alice".to_string(), "bob".to_string(), "carol".to_string()]
    );

    assert_eq!(
        parse_allow_from_list_from_value(Some(&json!(["alice", "  bob  ", 42, true, "alice"]))),
        vec![
            "42".to_string(),
            "alice".to_string(),
            "bob".to_string(),
            "true".to_string()
        ]
    );

    assert!(parse_allow_from_list_from_value(Some(&Value::Null)).is_empty());
}

#[test]
fn migrate_legacy_channel_section_wraps_legacy_fields_into_default_account() {
    let mut section = Map::new();
    section.insert("enabled".to_string(), Value::Bool(true));
    section.insert(
        "baseUrl".to_string(),
        Value::String("https://wechat.example.com".to_string()),
    );
    section.insert("corpId".to_string(), Value::String("corp-1".to_string()));

    migrate_legacy_channel_section_to_accounts(&mut section);

    assert_eq!(
        section.get("defaultAccount").and_then(Value::as_str),
        Some("default")
    );
    let accounts = section
        .get("accounts")
        .and_then(Value::as_object)
        .and_then(|accounts| accounts.get("default"))
        .and_then(Value::as_object)
        .expect("default account should be created");
    assert_eq!(
        accounts.get("baseUrl").and_then(Value::as_str),
        Some("https://wechat.example.com")
    );
    assert_eq!(accounts.get("corpId").and_then(Value::as_str), Some("corp-1"));
    assert!(section.get("baseUrl").is_none());
    assert!(section.get("corpId").is_none());
}

#[test]
fn migrate_legacy_channel_section_keeps_existing_accounts_shape() {
    let mut section = Map::new();
    section.insert(
        "accounts".to_string(),
        json!({
            "default": { "baseUrl": "https://existing.example.com" }
        }),
    );
    section.insert(
        "defaultAccount".to_string(),
        Value::String("default".to_string()),
    );

    migrate_legacy_channel_section_to_accounts(&mut section);

    let accounts = section
        .get("accounts")
        .and_then(Value::as_object)
        .and_then(|accounts| accounts.get("default"))
        .and_then(Value::as_object)
        .expect("existing accounts should remain");
    assert_eq!(
        accounts.get("baseUrl").and_then(Value::as_str),
        Some("https://existing.example.com")
    );
}
