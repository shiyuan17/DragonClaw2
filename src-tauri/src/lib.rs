// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
mod agency_agents;
mod agent_resource_settings;
mod agents;
mod channels;
mod config;
mod diagnostics;
mod download;
mod environment;
mod installer;
mod memory;
mod onboarding;
mod openclaw_cli;
mod paths;
mod provider_mgr;
mod providers;
mod service;
mod setup;
mod skill_market;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(service::ServiceState::default())
        .setup(|app| {
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

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
                            let _ =
                                open::that(format!("http://localhost:{}?token={}", port, token));
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
                })
                .build(app)?;

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
            // Service lifecycle
            service::check_port_available,
            service::is_service_running,
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
            channels::load_openclaw_channel_accounts_snapshot,
            channels::load_openclaw_channel_form_values,
            channels::save_openclaw_channel_config,
            channels::save_openclaw_channel_binding,
            channels::remove_openclaw_channel_config,
            channels::start_openclaw_channel_qr_binding,
            channels::poll_openclaw_channel_qr_binding,
            channels::clear_openclaw_channel_qr_binding_session,
            channels::request_feishu_openclaw_qr,
            channels::poll_feishu_openclaw_qr_result,
            memory::load_memory_file_snapshot,
            memory::save_source_file,
            onboarding::get_skillhub_install_runtime_info,
            onboarding::install_official_skillhub,
            onboarding::install_skillhub_recommended_skill,
            onboarding::install_github_skill_from_url,
            onboarding::get_onboarding_skill_install_state,
            onboarding::get_onboarding_skill_install_diagnostics,
            onboarding::save_onboarding_skill_install_state,
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
            provider_mgr::delete_provider,
            provider_mgr::remove_model_from_provider,
            provider_mgr::add_model_to_provider,
            provider_mgr::upsert_saved_provider_config,
            provider_mgr::delete_saved_provider_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
