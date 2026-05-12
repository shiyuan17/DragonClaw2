// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::fs;
use std::path::PathBuf;

use uuid::Uuid;

use crate::knowledge::{
    KnowledgeBaseRootInput, UpsertKnowledgeBasePayload, list_knowledge_bases, load_knowledge_base_tree,
    load_knowledge_file, save_knowledge_file, upsert_knowledge_base,
};
use crate::paths;
use crate::test_env;

const USER_CONFIG_OVERRIDE_ENV: &str = "DRAGONCLAW_USER_CONFIG_DIR";
const SANDBOX_OVERRIDE_ENV: &str = "DRAGONCLAW_SANDBOX_DIR";
#[cfg(target_os = "windows")]
const LOCAL_DATA_OVERRIDE_ENV: &str = "LOCALAPPDATA";
#[cfg(not(target_os = "windows"))]
const LOCAL_DATA_OVERRIDE_ENV: &str = "XDG_DATA_HOME";

fn unique_test_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("dragonclaw-knowledge-{name}-{}", Uuid::new_v4()))
}

fn with_test_user_config_dir<T>(name: &str, action: impl FnOnce(PathBuf) -> T) -> T {
    let _env_guard = test_env::env_lock();
    let test_dir = unique_test_dir(name);
    let previous = std::env::var(USER_CONFIG_OVERRIDE_ENV).ok();
    let previous_sandbox_dir = std::env::var(SANDBOX_OVERRIDE_ENV).ok();
    let previous_local_data = std::env::var(LOCAL_DATA_OVERRIDE_ENV).ok();
    let local_data_dir = test_dir.join("local-data");
    let sandbox_dir = test_dir.join("sandbox");

    std::env::set_var(USER_CONFIG_OVERRIDE_ENV, &test_dir);
    std::env::set_var(SANDBOX_OVERRIDE_ENV, &sandbox_dir);
    std::env::set_var(LOCAL_DATA_OVERRIDE_ENV, &local_data_dir);
    let result = action(test_dir.clone());
    if let Some(previous) = previous {
        std::env::set_var(USER_CONFIG_OVERRIDE_ENV, previous);
    } else {
        std::env::remove_var(USER_CONFIG_OVERRIDE_ENV);
    }
    if let Some(previous) = previous_sandbox_dir {
        std::env::set_var(SANDBOX_OVERRIDE_ENV, previous);
    } else {
        std::env::remove_var(SANDBOX_OVERRIDE_ENV);
    }
    if let Some(previous) = previous_local_data {
        std::env::set_var(LOCAL_DATA_OVERRIDE_ENV, previous);
    } else {
        std::env::remove_var(LOCAL_DATA_OVERRIDE_ENV);
    }
    let _ = fs::remove_dir_all(test_dir);
    result
}

#[test]
fn knowledge_list_returns_empty_when_file_missing() {
    with_test_user_config_dir("missing", |_test_dir| {
        let records = list_knowledge_bases().expect("missing file should return empty");
        assert!(records.is_empty());
    });
}

#[test]
fn knowledge_upsert_deduplicates_roots_by_canonical_path() {
    with_test_user_config_dir("dedupe", |test_dir| {
        let docs_dir = test_dir.join("docs");
        fs::create_dir_all(&docs_dir).expect("create docs dir");

        let record = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge".to_string(),
            description: None,
            roots: vec![
                KnowledgeBaseRootInput {
                    id: None,
                    name: Some("Docs A".to_string()),
                    path: docs_dir.to_string_lossy().to_string(),
                },
                KnowledgeBaseRootInput {
                    id: None,
                    name: Some("Docs B".to_string()),
                    path: docs_dir.join(".").to_string_lossy().to_string(),
                },
            ],
        })
        .expect("upsert knowledge base");

        assert_eq!(record.roots.len(), 1);
        let records = list_knowledge_bases().expect("list records");
        assert_eq!(records.len(), 1);
    });
}

#[test]
fn knowledge_save_rejects_relative_path_outside_root() {
    with_test_user_config_dir("outside-root", |test_dir| {
        let docs_dir = test_dir.join("docs");
        fs::create_dir_all(&docs_dir).expect("create docs dir");

        let record = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge".to_string(),
            description: None,
            roots: vec![KnowledgeBaseRootInput {
                id: None,
                name: None,
                path: docs_dir.to_string_lossy().to_string(),
            }],
        })
        .expect("upsert knowledge base");

        let error = save_knowledge_file(
            record.id.clone(),
            record.roots[0].id.clone(),
            "../escape.md".to_string(),
            "bad".to_string(),
            "markdown".to_string(),
        )
        .expect_err("save outside root should fail");

        assert!(error.contains("上级目录"));
    });
}

#[test]
fn knowledge_tree_groups_multiple_roots_and_marks_missing_root() {
    with_test_user_config_dir("tree", |test_dir| {
        let docs_dir = test_dir.join("docs");
        let notes_dir = test_dir.join("notes");
        fs::create_dir_all(docs_dir.join("guides")).expect("create guides dir");
        fs::create_dir_all(&notes_dir).expect("create notes dir");
        fs::write(docs_dir.join("guides").join("intro.md"), "# Intro").expect("write intro");
        fs::write(notes_dir.join("todo.txt"), "todo").expect("write todo");

        let record = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge".to_string(),
            description: None,
            roots: vec![
                KnowledgeBaseRootInput {
                    id: None,
                    name: Some("Docs".to_string()),
                    path: docs_dir.to_string_lossy().to_string(),
                },
                KnowledgeBaseRootInput {
                    id: None,
                    name: Some("Notes".to_string()),
                    path: notes_dir.to_string_lossy().to_string(),
                },
            ],
        })
        .expect("upsert knowledge base");

        fs::remove_dir_all(&notes_dir).expect("remove notes dir");

        let snapshot = load_knowledge_base_tree(record.id).expect("load tree");
        assert_eq!(snapshot.roots.len(), 2);
        assert!(snapshot.roots.iter().any(|root| root.exists && !root.children.is_empty()));
        assert!(snapshot.roots.iter().any(|root| !root.exists));
    });
}

#[test]
fn knowledge_load_and_save_text_file_round_trip() {
    with_test_user_config_dir("round-trip", |test_dir| {
        let docs_dir = test_dir.join("docs");
        fs::create_dir_all(&docs_dir).expect("create docs dir");
        fs::write(docs_dir.join("guide.md"), "# Before").expect("write markdown file");

        let record = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge".to_string(),
            description: None,
            roots: vec![KnowledgeBaseRootInput {
                id: None,
                name: None,
                path: docs_dir.to_string_lossy().to_string(),
            }],
        })
        .expect("upsert knowledge base");

        let file = load_knowledge_file(
            record.id.clone(),
            record.roots[0].id.clone(),
            "guide.md".to_string(),
        )
        .expect("load knowledge file");
        assert_eq!(file.format, "markdown");
        assert!(file.editable);
        assert_eq!(file.content, "# Before");

        save_knowledge_file(
            record.id,
            record.roots[0].id.clone(),
            "guide.md".to_string(),
            "# After".to_string(),
            "markdown".to_string(),
        )
        .expect("save knowledge file");

        let saved = fs::read_to_string(docs_dir.join("guide.md")).expect("read saved file");
        assert_eq!(saved, "# After");
    });
}

#[test]
fn knowledge_create_managed_root_under_engine_dir_and_persist_description() {
    with_test_user_config_dir("managed-root", |_test_dir| {
        let record = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "产品知识库".to_string(),
            description: Some("用于沉淀产品规范".to_string()),
            roots: Vec::new(),
        })
        .expect("create managed knowledge base");

        assert_eq!(record.description.as_deref(), Some("用于沉淀产品规范"));
        assert_eq!(record.roots.len(), 1);

        let managed_root = PathBuf::from(&record.roots[0].path);
        let expected_root_dir = paths::knowledge_base_root_dir()
            .expect("knowledge-base root dir")
            .canonicalize()
            .expect("canonical knowledge-base root dir");
        assert!(managed_root.starts_with(&expected_root_dir));
        assert!(managed_root.is_dir());
    });
}

#[test]
fn knowledge_managed_root_slug_conflict_uses_increment_suffix() {
    with_test_user_config_dir("managed-root-conflict", |_test_dir| {
        let first = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge Library".to_string(),
            description: None,
            roots: Vec::new(),
        })
        .expect("create first managed root");

        let second = upsert_knowledge_base(UpsertKnowledgeBasePayload {
            id: None,
            name: "Knowledge Library".to_string(),
            description: None,
            roots: Vec::new(),
        })
        .expect("create second managed root");

        assert_ne!(first.roots[0].path, second.roots[0].path);
        assert!(second.roots[0].path.ends_with("knowledge-library-2"));
    });
}

#[test]
fn knowledge_list_supports_legacy_records_without_description() {
    with_test_user_config_dir("legacy-description", |test_dir| {
        let config_path = test_dir.join("knowledge-bases.json");
        fs::create_dir_all(&test_dir).expect("create test dir");
        fs::write(
            &config_path,
            r#"[
  {
    "id": "legacy-kb",
    "name": "Legacy KB",
    "roots": [],
    "createdAtMs": 1,
    "updatedAtMs": 2
  }
]"#,
        )
        .expect("write legacy config");

        let records = list_knowledge_bases().expect("list legacy records");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].description, None);
    });
}
