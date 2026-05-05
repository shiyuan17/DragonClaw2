use super::*;
use super::support::{
    existing_process_validation_failure_detail, read_runtime_state_from_path,
    remove_runtime_state_file_at, write_runtime_state_to_path, ServiceRuntimeState,
};

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
