// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::PathBuf;

use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};

use super::file;
use crate::paths;

pub const DEFAULT_GATEWAY_TOKEN: &str = "openclaw-launcher-local";

pub struct ConfigRepository;

impl ConfigRepository {
    pub fn path() -> Result<PathBuf, String> {
        file::openclaw_config_path()
    }

    pub fn load_raw() -> Result<Value, String> {
        file::load_openclaw_config()
    }

    pub fn replace(config: &Value) -> Result<(), String> {
        file::save_openclaw_config(config)
    }

    pub fn update<F>(mutator: F) -> Result<Value, String>
    where
        F: FnOnce(&mut Value) -> Result<(), String>,
    {
        let mut config = Self::load_raw()?;
        mutator(&mut config)?;
        Self::replace(&config)?;
        Ok(config)
    }

    pub fn ensure_config_roots(config: &mut Value) {
        if !config.is_object() {
            *config = json!({});
        }
        if config.get("models").is_none() {
            config["models"] = json!({});
        }
        if config["models"].get("providers").is_none() {
            config["models"]["providers"] = json!({});
        }
        if config.get("agents").is_none() {
            config["agents"] = json!({});
        }
        if config["agents"].get("defaults").is_none() {
            config["agents"]["defaults"] = json!({});
        }
        if config["agents"]["defaults"].get("models").is_none() {
            config["agents"]["defaults"]["models"] = json!({});
        }
    }

    pub fn ensure_gateway_config(config: &mut Value) {
        if !config
            .get("gateway")
            .map(|value| value.is_object())
            .unwrap_or(false)
        {
            config["gateway"] = Self::default_gateway_config();
            return;
        }

        let gateway = config
            .get_mut("gateway")
            .and_then(Value::as_object_mut)
            .expect("gateway should be an object after initialization");

        gateway
            .entry("mode".to_string())
            .or_insert_with(|| json!("local"));

        let auth = gateway
            .entry("auth".to_string())
            .or_insert_with(|| json!({}));
        if !auth.is_object() {
            *auth = json!({});
        }
        if let Some(auth_obj) = auth.as_object_mut() {
            auth_obj
                .entry("mode".to_string())
                .or_insert_with(|| json!("token"));

            let should_rotate_token = auth_obj
                .get("token")
                .and_then(Value::as_str)
                .map(|token| token.trim().is_empty() || token == DEFAULT_GATEWAY_TOKEN)
                .unwrap_or(true);
            if should_rotate_token {
                auth_obj.insert("token".to_string(), json!(Self::generate_gateway_token()));
            }
        }

        let control_ui = gateway
            .entry("controlUi".to_string())
            .or_insert_with(|| json!({}));
        if !control_ui.is_object() {
            *control_ui = json!({});
        }
        if let Some(control_ui_obj) = control_ui.as_object_mut() {
            control_ui_obj
                .entry("allowInsecureAuth".to_string())
                .or_insert_with(|| json!(true));
            control_ui_obj
                .entry("dangerouslyDisableDeviceAuth".to_string())
                .or_insert_with(|| json!(true));
        }
    }

    pub fn ensure_default_workspace(config: &mut Value) {
        if config
            .get("agents")
            .and_then(|agents| agents.get("defaults"))
            .and_then(|defaults| defaults.get("workspace"))
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        {
            return;
        }

        let _ = Self::set_main_workspace(config, None);
    }

    pub fn set_main_workspace(
        config: &mut Value,
        workspace_path: Option<&str>,
    ) -> Result<PathBuf, String> {
        Self::ensure_config_roots(config);
        let workspace = Self::normalize_workspace_path(workspace_path)?;

        config["agents"]["defaults"]["workspace"] =
            Value::String(workspace.to_string_lossy().to_string());

        if config.get("sandbox").is_none() {
            config["sandbox"] = json!({});
        }
        config["sandbox"]["paths"] = json!([workspace.to_string_lossy().to_string()]);

        Ok(workspace)
    }

    fn default_gateway_config() -> Value {
        json!({
            "mode": "local",
            "auth": {
                "mode": "token",
                "token": Self::generate_gateway_token()
            },
            "controlUi": {
                "allowInsecureAuth": true,
                "dangerouslyDisableDeviceAuth": true
            }
        })
    }

    fn generate_gateway_token() -> String {
        let mut bytes = [0_u8; 24];
        OsRng.fill_bytes(&mut bytes);
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn normalize_workspace_path(workspace_path: Option<&str>) -> Result<PathBuf, String> {
        let candidate = workspace_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or(paths::default_workspace_dir()?);

        if candidate.is_relative() {
            return Err("工作区路径必须是绝对路径".to_string());
        }

        fs::create_dir_all(&candidate).map_err(|error| format!("创建工作区目录失败: {error}"))?;
        candidate
            .canonicalize()
            .map_err(|error| format!("解析工作区目录失败: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_config_roots_creates_expected_shape() {
        let mut value = json!({});
        ConfigRepository::ensure_config_roots(&mut value);

        assert!(value["models"]["providers"].is_object());
        assert!(value["agents"]["defaults"]["models"].is_object());
    }

    #[test]
    fn ensure_gateway_config_bootstraps_token_and_control_ui() {
        let mut value = json!({});
        ConfigRepository::ensure_gateway_config(&mut value);

        assert_eq!(value["gateway"]["mode"], "local");
        assert_eq!(value["gateway"]["auth"]["mode"], "token");
        assert!(value["gateway"]["auth"]["token"]
            .as_str()
            .map(|token| !token.is_empty())
            .unwrap_or(false));
        assert_eq!(value["gateway"]["controlUi"]["allowInsecureAuth"], true);
        assert_eq!(
            value["gateway"]["controlUi"]["dangerouslyDisableDeviceAuth"],
            true
        );
    }
}
