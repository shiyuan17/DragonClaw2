// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use serde_json::Value;

pub(crate) struct CachedMessagePreview {
    pub id: Option<String>,
    pub role: String,
    pub text_preview: String,
    pub timestamp: Option<i64>,
    pub text_hash: Option<String>,
    pub render_kind: String,
    pub full_text_length: i64,
}

fn normalize_preview_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(extract_text)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n\n"),
        Value::Object(map) => {
            for key in ["text", "value", "content", "message", "output", "input", "title", "prompt"] {
                if let Some(candidate) = map.get(key) {
                    let text = extract_text(candidate);
                    if !text.trim().is_empty() {
                        return text;
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

fn detect_render_kind(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return "json".to_string();
    }
    if trimmed.contains("```")
        || trimmed.contains('\n')
        || trimmed.contains("**")
        || trimmed.starts_with('#')
        || trimmed.starts_with("- ")
    {
        return "markdown".to_string();
    }
    "plain".to_string()
}

fn hash_text(text: &str) -> Option<String> {
    if text.is_empty() {
        return None;
    }
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    Some(format!("{:016x}", hasher.finish()))
}

pub(crate) fn build_cached_message_preview(message: &Value) -> CachedMessagePreview {
    let role = message
        .get("role")
        .and_then(Value::as_str)
        .filter(|role| matches!(*role, "assistant" | "user" | "system" | "tool"))
        .unwrap_or("assistant")
        .to_string();
    let text = extract_text(message);
    let normalized_preview = normalize_preview_text(&text);
    let full_text_length = i64::try_from(text.chars().count()).unwrap_or(0);
    let text_preview = normalized_preview.chars().take(1200).collect::<String>();

    CachedMessagePreview {
        id: message.get("id").and_then(Value::as_str).map(ToString::to_string),
        role,
        text_preview,
        timestamp: message
            .get("timestamp")
            .or_else(|| message.get("ts"))
            .and_then(Value::as_i64),
        text_hash: hash_text(&text),
        render_kind: detect_render_kind(&text),
        full_text_length,
    }
}
