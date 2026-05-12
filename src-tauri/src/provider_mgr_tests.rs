use super::*;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
const DEFAULT_WORKSPACE_OVERRIDE_ENV: &str = "DRAGONCLAW_DEFAULT_WORKSPACE_DIR";

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        "dragonclaw2-{prefix}-{}-{nonce}",
        std::process::id()
    ))
}

fn with_mock_env<T>(config_root: &Path, default_workspace: &Path, run: impl FnOnce() -> T) -> T {
    let _lock = crate::test_env::env_lock();
    let previous_config_root = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();
    let previous_workspace = std::env::var(DEFAULT_WORKSPACE_OVERRIDE_ENV).ok();

    unsafe {
        std::env::set_var(USER_CONFIG_OVERRIDE_ENV, config_root);
        std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, default_workspace);
    }

    let result = run();

    unsafe {
        if let Some(value) = previous_config_root {
            std::env::set_var(USER_CONFIG_OVERRIDE_ENV, value);
        } else {
            std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
        }

        if let Some(value) = previous_workspace {
            std::env::set_var(DEFAULT_WORKSPACE_OVERRIDE_ENV, value);
        } else {
            std::env::remove_var(DEFAULT_WORKSPACE_OVERRIDE_ENV);
        }
    }

    result
}

#[test]
fn test_provider_name_format() {
    let model_id = format!("{}/{}", "bailian", "glm-5");
    assert_eq!(model_id, "bailian/glm-5");
}

#[test]
fn provider_save_preserves_secret_ref_api_key_and_unknown_fields() {
    let temp_root = unique_temp_dir("provider-secret-ref");
    let config_root = temp_root.join(".openclaw");
    let default_workspace = temp_root.join("workspace-main");
    fs::create_dir_all(&config_root).expect("create config root");
    fs::write(
        config_root.join("openclaw.json"),
        serde_json::to_string_pretty(&json!({
            "models": {
                "providers": {
                    "custom": {
                        "baseUrl": "https://old.example.com/v1",
                        "apiKey": {
                            "$secret": "custom-api-key"
                        },
                        "api": "openai-completions",
                        "customProviderField": {
                            "keep": true
                        },
                        "models": [
                            {
                                "id": "old-model",
                                "name": "old-model"
                            }
                        ]
                    }
                }
            },
            "agents": {
                "defaults": {
                    "workspace": default_workspace.to_string_lossy().to_string(),
                    "models": {}
                }
            }
        }))
        .expect("serialize config"),
    )
    .expect("write config");

    with_mock_env(&config_root, &default_workspace, || {
        let request = ProviderSaveRequest::from_inputs(
            "custom".to_string(),
            None,
            "https://new.example.com/v1".to_string(),
            "openai-responses".to_string(),
            "".to_string(),
            "new-model".to_string(),
            Some(vec!["new-model".to_string(), "backup-model".to_string()]),
        )
        .expect("build request");

        let outcome = persist_saved_provider_config(&request, true).expect("persist provider");
        assert!(outcome.has_api_key);

        let config = read_config().expect("read config");
        let provider = &config["models"]["providers"]["custom"];
        assert_eq!(provider["baseUrl"], "https://new.example.com/v1");
        assert_eq!(provider["api"], "openai-responses");
        assert_eq!(provider["apiKey"]["$secret"], "custom-api-key");
        assert_eq!(provider["customProviderField"]["keep"], true);

        let models_path = config_root
            .join("agents")
            .join("main")
            .join("agent")
            .join("models.json");
        let agent_models = serde_json::from_str::<serde_json::Value>(
            &fs::read_to_string(models_path).expect("read synced models"),
        )
        .expect("parse synced models");
        assert_eq!(
            agent_models["providers"]["custom"]["apiKey"]["$secret"],
            "custom-api-key"
        );
    });

    let _ = fs::remove_dir_all(temp_root);
}
