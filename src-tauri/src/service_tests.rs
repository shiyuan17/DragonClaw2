use super::*;
use super::support::{
    existing_process_validation_failure_detail, is_launcher_gateway_command_line,
    parse_port_from_command_line, read_runtime_state_from_path, remove_runtime_state_file_at,
    write_runtime_state_to_path, ServiceRuntimeState,
};
use crate::launcher_state;

fn unique_temp_path(file_name: &str) -> std::path::PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "dragonclaw-service-test-{}-{}",
        std::process::id(),
        file_name
    ));
    path
}

#[test]
fn test_port_available_after_release() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    assert!(is_port_available(port));
}

#[test]
fn test_port_occupied_detection() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    assert!(!is_port_available(port));
    drop(listener);
    assert!(is_port_available(port));
}

#[test]
fn test_classify_log_level() {
    assert_eq!(classify_log_level("npm warn deprecated"), "warn");
    assert_eq!(classify_log_level("npm error code ENOENT"), "error");
    assert_eq!(classify_log_level("  ERR_PNPM something failed"), "error");
    assert_eq!(classify_log_level("added 150 packages"), "info");
    assert_eq!(classify_log_level("Server started on port 3000"), "success");
    assert_eq!(classify_log_level("some normal output"), "info");
}

#[test]
fn test_service_ready_signal() {
    assert!(is_service_ready_signal("Server started on port 3000"));
    assert!(is_service_ready_signal(
        "Listening on http://localhost:3000"
    ));
    assert!(is_service_ready_signal("Gateway ready on 0.0.0.0:3000"));
    assert!(is_service_ready_signal(
        "2026-05-03T21:14:39.270+08:00 [gateway] ready"
    ));
    assert!(is_service_ready_signal("server is running at port 3000"));
    assert!(!is_service_ready_signal(
        "2026-05-03T21:14:11.236+08:00 [gateway] http server listening"
    ));
    assert!(!is_service_ready_signal("compiling TypeScript..."));
    assert!(!is_service_ready_signal("installing dependencies"));
}

#[test]
fn test_gateway_ready_signal_excludes_listening_and_starting() {
    assert!(is_gateway_ready_signal("gateway ready"));
    assert!(is_gateway_ready_signal(
        "2026-05-03T21:14:39.270+08:00 [gateway] ready"
    ));
    assert!(!is_gateway_ready_signal(
        "2026-05-03T21:14:11.236+08:00 [gateway] http server listening"
    ));
    assert!(!is_gateway_ready_signal(
        "closed before connect code=1013 reason=gateway starting"
    ));
    assert!(!is_gateway_ready_signal(
        "{\"cause\":\"startup-sidecars-pending\"}"
    ));
}

#[test]
fn late_ready_during_rpc_probe_is_accepted() {
    assert!(late_ready_during_rpc_probe(false, true, true));
    assert!(!late_ready_during_rpc_probe(true, true, true));
    assert!(!late_ready_during_rpc_probe(false, true, false));
    assert!(!late_ready_during_rpc_probe(false, false, true));
}

#[test]
fn startup_rpc_probe_timeout_is_capped_by_remaining_budget() {
    assert_eq!(startup_rpc_probe_timeout_ms(3_500), Some(3_500));
    assert_eq!(
        startup_rpc_probe_timeout_ms(STARTUP_RPC_CHECK_TIMEOUT_MS + 5_000),
        Some(STARTUP_RPC_CHECK_TIMEOUT_MS)
    );
    assert_eq!(startup_rpc_probe_timeout_ms(0), None);
}

#[test]
fn startup_timeout_keeps_rpc_failure_detail_when_ready_never_arrives() {
    let detail = build_service_start_timeout_error(
        18789,
        true,
        Some("OpenClaw gateway RPC validation failed (ws://127.0.0.1:18789): probe failed"),
    );

    assert!(detail.contains("startup timed out and RPC validation is still failing"));
    assert!(detail.contains("probe failed"));
    assert!(detail.contains("120s"));
}

#[test]
fn runtime_state_round_trip() {
    let path = unique_temp_path("round-trip.json");
    let runtime = ServiceRuntimeState {
        pid: 1234,
        port: 18789,
        started_at: 42,
    };

    write_runtime_state_to_path(&path, &runtime).unwrap();
    let loaded = read_runtime_state_from_path(&path).unwrap();
    remove_runtime_state_file_at(&path).unwrap();

    assert_eq!(loaded, Some(runtime));
}

#[test]
fn remove_runtime_state_file_is_idempotent() {
    let path = unique_temp_path("missing.json");
    remove_runtime_state_file_at(&path).unwrap();
    remove_runtime_state_file_at(&path).unwrap();
}

#[test]
fn stale_runtime_state_detection_fails_for_dead_process() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let unused_port = listener.local_addr().unwrap().port();
    drop(listener);

    let tracked = TrackedServiceProcess {
        pid: std::process::id(),
        port: unused_port,
        started_at: 1,
    };
    assert!(!validate_external_process(&tracked));
}

#[test]
fn existing_process_rpc_failure_detail_includes_runtime_identity() {
    let tracked = TrackedServiceProcess {
        pid: 4321,
        port: 18789,
        started_at: 99,
    };

    let detail = existing_process_validation_failure_detail(&tracked, "probe failed");

    assert!(detail.contains("RPC validation failed for existing process"));
    assert!(detail.contains("pid=4321"));
    assert!(detail.contains("port=18789"));
    assert!(detail.contains("started_at=99"));
    assert!(detail.contains("probe failed"));
}

#[test]
fn preferred_port_uses_launcher_state_when_available() {
    let _guard = crate::test_env::env_lock();
    let state = ServiceState::default();
    let base = unique_temp_path("launcher-port");
    let config_dir = base.join("config");
    std::fs::create_dir_all(&config_dir).unwrap();
    std::env::set_var("DRAGONCLAW_USER_CONFIG_DIR", &config_dir);

    launcher_state::mark_launcher_setup_completed_internal(Some(18792)).unwrap();
    assert_eq!(preferred_known_port(&state), 18792);

    std::env::remove_var("DRAGONCLAW_USER_CONFIG_DIR");
    let _ = std::fs::remove_dir_all(base);
}

#[test]
fn parse_port_from_command_line_extracts_gateway_port() {
    let command = "\"C:\\\\node.exe\" C:\\\\OpenClawLauncher\\\\openclaw-engine\\\\openclaw.mjs gateway --allow-unconfigured --port 18790 --token abc";
    assert_eq!(parse_port_from_command_line(command), Some(18790));
}

#[test]
fn launcher_gateway_command_line_matches_engine_entry() {
    let entry = std::path::Path::new(
        "C:\\Users\\tester\\AppData\\Local\\OpenClawLauncher\\openclaw-engine\\openclaw.mjs",
    );
    let command = "\"C:\\\\node.exe\" C:\\Users\\tester\\AppData\\Local\\OpenClawLauncher\\openclaw-engine\\openclaw.mjs gateway --port 18789";
    assert!(is_launcher_gateway_command_line(command, entry));
    assert!(!is_launcher_gateway_command_line(
        "\"C:\\\\node.exe\" C:\\other\\service.mjs gateway --port 18789",
        entry,
    ));
}
