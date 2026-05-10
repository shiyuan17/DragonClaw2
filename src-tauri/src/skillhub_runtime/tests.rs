use std::path::Path;

use super::{
    bootstrap::parse_skillhub_kit_url, build_skillhub_python_install_args,
    resolve_skillhub_install_mode, skillhub_wrapper_file_name_for_target, SkillHubInstallMode,
};

#[test]
fn runtime_mode_prefers_bash_on_non_windows() {
    assert_eq!(
        resolve_skillhub_install_mode(false, false, true),
        SkillHubInstallMode::BashShell
    );
}

#[test]
fn runtime_mode_uses_windows_native_when_windows_has_python_but_no_bash() {
    assert_eq!(
        resolve_skillhub_install_mode(true, false, true),
        SkillHubInstallMode::WindowsNative
    );
}

#[test]
fn runtime_mode_is_unavailable_when_windows_has_neither_bash_nor_python() {
    assert_eq!(
        resolve_skillhub_install_mode(true, false, false),
        SkillHubInstallMode::Unavailable
    );
}

#[test]
fn wrapper_file_name_uses_cmd_on_windows() {
    assert_eq!(skillhub_wrapper_file_name_for_target(true), "skillhub.cmd");
    assert_eq!(skillhub_wrapper_file_name_for_target(false), "skillhub");
}

#[test]
fn python_install_args_include_cli_dir_slug_and_force() {
    let args = build_skillhub_python_install_args(
        Path::new("C:/Users/test/.skillhub/skills_store_cli.py"),
        Path::new("D:/Work/main/skills"),
        "heyvideogen",
    );

    assert_eq!(
        args,
        vec![
            "C:/Users/test/.skillhub/skills_store_cli.py",
            "--skip-self-upgrade",
            "--dir",
            "D:/Work/main/skills",
            "install",
            "heyvideogen",
            "--force",
        ]
    );
}

#[test]
fn parses_skillhub_kit_url_from_outer_installer() {
    let script = r#"
#!/usr/bin/env bash
KIT_URL="https://example.com/install/latest.tar.gz"
"#;

    assert_eq!(
        parse_skillhub_kit_url(script).unwrap(),
        "https://example.com/install/latest.tar.gz"
    );
}
