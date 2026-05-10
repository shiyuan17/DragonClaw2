// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
mod agency_agents;
mod agent_resource_settings;
mod agents;
mod channels;
mod chat_cache;
mod config;
mod config_store;
mod control_ui;
mod diagnostics;
mod download;
mod email_binding;
mod environment;
mod installer;
mod launcher_state;
mod memory;
mod onboarding;
mod openclaw_cli;
mod paths;
mod provider_mgr;
mod providers;
mod service;
mod setup;
mod skillhub_runtime;
mod skill_market;
mod slash_commands;

#[cfg(test)]
pub(crate) mod test_env {
    use std::sync::{Mutex, MutexGuard, OnceLock};

    pub(crate) fn env_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
fn apply_windows_runtime_icons<R: tauri::Runtime>(app: &mut tauri::App<R>) {
    let Some(default_icon) = app.default_window_icon().cloned() else {
        eprintln!(
            "DragonClaw could not apply a Windows runtime icon because no default window icon was available."
        );
        return;
    };

    let webview_windows = app.webview_windows();
    if webview_windows.is_empty() {
        eprintln!(
            "DragonClaw could not apply a Windows runtime icon because no webview windows were available during setup."
        );
        return;
    }

    for (label, window) in webview_windows {
        if let Err(error) = window.set_icon(default_icon.clone()) {
            eprintln!(
                "DragonClaw failed to apply the Windows runtime icon to window '{label}': {error}"
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(service::ServiceState::default())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            apply_windows_runtime_icons(app);

            // ===== System Tray =====
            let show_i = MenuItem::with_id(app, "show", "打开面板", true, None::<&str>)?;
            let browser_i = MenuItem::with_id(app, "browser", "打开浏览器", true, None::<&str>)?;
            let separator1 = PredefinedMenuItem::separator(app)?;
            let restart_i = MenuItem::with_id(app, "restart", "重启服务", true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_i,
                    &browser_i,
                    &separator1,
                    &restart_i,
                    &separator2,
                    &quit_i,
                ],
            )?;

            let default_window_icon = app.default_window_icon().cloned();
            if default_window_icon.is_none() {
                eprintln!(
                    "DragonClaw could not resolve the default window icon for the system tray; the tray will fall back to the platform default icon."
                );
            }

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("DragonClaw")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "browser" => {
                            // Open the gateway in default browser using actual service port
                            let state = app.state::<service::ServiceState>();
                            let port = service::resolve_known_service_port(state.inner())
                                .unwrap_or_else(|_| *state.port.lock().unwrap());
                            let token = config::get_current_config()
                                .ok()
                                .and_then(|current| current.gateway_token)
                                .filter(|value| !value.trim().is_empty())
                                .unwrap_or_else(|| config::DEFAULT_GATEWAY_TOKEN.to_string());
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = control_ui::open_control_ui(app_handle, port, token).await;
                            });
                        }
                        "restart" => {
                            // Show the window first so user sees the restart progress
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            // Emit restart event to frontend — it has the hooks to stop+start
                            let _ = app.emit("tray-restart-service", ());
                        }
                        "quit" => {
                            // Keep OpenClaw alive for the next DragonClaw launch; users can stop
                            // it explicitly from the service controls or the restart action.
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click opens the panel
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = default_window_icon {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept close → hide to tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Environment
            environment::check_node_exists,
            environment::download_and_install_node,
            environment::get_environment_info,
            // Download
            download::download_openclaw_source,
            // Installer
            installer::run_npm_install,
            // Setup orchestration
            setup::check_openclaw_exists,
            setup::check_node_modules_exists,
            setup::check_config_exists,
            setup::inject_default_config,
            setup::inject_default_models,
            setup::install_preset_skills,
            setup::setup_openclaw,
            setup::reinstall_environment,
            launcher_state::get_launcher_state,
            launcher_state::mark_launcher_setup_completed,
            // Service lifecycle
            service::check_port_available,
            service::is_service_running,
            service::get_service_lifecycle_snapshot,
            service::start_service,
            service::start_service_silent,
            service::stop_service,
            // Provider catalog & URL
            providers::get_providers,
            providers::open_provider_register,
            providers::open_url,
            // Config & API Key management
            config::get_current_config,
            config::migrate_gateway_config,
            config::save_api_config,
            config::set_default_model,
            config::reset_config,
            email_binding::load_imap_smtp_email_binding,
            email_binding::save_imap_smtp_email_binding,
            channels::channel_config::load_openclaw_channel_accounts_snapshot,
            channels::channel_config::load_openclaw_channel_form_values,
            channels::channel_config::save_openclaw_channel_config,
            channels::channel_config::save_openclaw_channel_binding,
            channels::channel_config::remove_openclaw_channel_config,
            channels::qr_session::start_openclaw_channel_qr_binding,
            channels::qr_session::poll_openclaw_channel_qr_binding,
            channels::qr_session::clear_openclaw_channel_qr_binding_session,
            channels::feishu::request_feishu_openclaw_qr,
            channels::feishu::poll_feishu_openclaw_qr_result,
            chat_cache::load_workspace_chat_session_cache,
            chat_cache::upsert_workspace_chat_session_cache,
            chat_cache::list_workspace_chat_session_cache,
            chat_cache::prune_workspace_chat_session_cache,
            chat_cache::list_workspace_agent_cache,
            chat_cache::replace_workspace_agent_cache,
            chat_cache::clear_workspace_agent_cache,
            memory::load_memory_file_snapshot,
            memory::save_source_file,
            onboarding::get_skillhub_install_runtime_info,
            onboarding::install_official_skillhub,
            onboarding::install_skillhub_recommended_skill,
            onboarding::install_github_skill_from_url,
            onboarding::get_onboarding_skill_install_state,
            onboarding::get_onboarding_skill_install_diagnostics,
            onboarding::save_onboarding_skill_install_state,
            onboarding::start_onboarding_skill_install_background,
            skill_market::load_skill_market_top,
            skill_market::load_skill_market_by_category,
            skill_market::load_installed_skill_market_slugs,
            skill_market::load_installed_skills_snapshot,
            skill_market::install_skill_market_skill,
            // Diagnostics
            diagnostics::export_diagnostics_zip,
            // Agent management
            agency_agents::install_agency_agent,
            agency_agents::uninstall_agency_agent,
            agency_agents::load_installed_agency_agent_ids,
            agents::list_agents,
            agents::get_agent_detail,
            agents::create_agent,
            agents::update_agent,
            agents::delete_agent,
            agents::list_skills,
            // Provider management
            provider_mgr::list_saved_providers,
            provider_mgr::list_all_models,
            agent_resource_settings::get_agent_skill_config,
            agent_resource_settings::save_agent_skill_config,
            agent_resource_settings::get_agent_tool_config,
            agent_resource_settings::save_agent_tool_config,
            slash_commands::load_custom_slash_commands,
            slash_commands::save_custom_slash_commands,
            provider_mgr::delete_provider,
            provider_mgr::remove_model_from_provider,
            provider_mgr::add_model_to_provider,
            provider_mgr::upsert_saved_provider_config,
            provider_mgr::delete_saved_provider_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
