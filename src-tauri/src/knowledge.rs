// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::paths;

const KNOWLEDGE_BASE_DIR_NAME: &str = "knowledge-base";
const SKIPPED_DIRECTORY_NAMES: &[&str] = &[".git", "node_modules", "dist", "target", ".vite"];

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseRoot {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub roots: Vec<KnowledgeBaseRoot>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseRootInput {
    pub id: Option<String>,
    pub name: Option<String>,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpsertKnowledgeBasePayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub roots: Vec<KnowledgeBaseRootInput>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRootSnapshot {
    pub id: String,
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub children: Vec<KnowledgeTreeNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseTreeSnapshot {
    pub knowledge_base: KnowledgeBaseRecord,
    pub roots: Vec<KnowledgeRootSnapshot>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTreeNode {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub node_type: String,
    pub extension: Option<String>,
    pub size_bytes: Option<u64>,
    pub updated_at_ms: Option<i64>,
    pub children: Vec<KnowledgeTreeNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFileContent {
    pub knowledge_base_id: String,
    pub root_id: String,
    pub root_name: String,
    pub root_path: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub file_name: String,
    pub format: String,
    pub editable: bool,
    pub size_bytes: u64,
    pub updated_at_ms: i64,
    pub content: String,
}

#[derive(Debug, Clone)]
struct ResolvedKnowledgeRoot {
    record: KnowledgeBaseRoot,
    canonical_path: PathBuf,
}

fn current_timestamp_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .ok()
        .and_then(|millis| i64::try_from(millis).ok())
        .unwrap_or(0)
}

fn knowledge_bases_path() -> Result<PathBuf, String> {
    paths::knowledge_bases_path()
}

fn knowledge_base_root_dir() -> Result<PathBuf, String> {
    paths::knowledge_base_root_dir()
}

fn load_knowledge_base_records() -> Result<Vec<KnowledgeBaseRecord>, String> {
    let path = knowledge_bases_path()?;
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 knowledge-bases.json 失败: {error}"))?;
    serde_json::from_str::<Vec<KnowledgeBaseRecord>>(&content)
        .map_err(|error| format!("解析 knowledge-bases.json 失败: {error}"))
}

fn write_knowledge_base_records(records: &[KnowledgeBaseRecord]) -> Result<(), String> {
    let path = knowledge_bases_path()?;
    let serialized = serde_json::to_string_pretty(records)
        .map_err(|error| format!("序列化 knowledge-bases.json 失败: {error}"))?;
    atomic_write_text(&path, &serialized)
}

fn atomic_write_text(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "knowledge-bases.json 路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建知识库配置目录失败: {error}"))?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("knowledge-bases.json");
    let tmp_path = parent.join(format!(".{file_name}.{nonce}.tmp"));
    let backup_path = parent.join(format!(".{file_name}.{nonce}.bak"));

    fs::write(&tmp_path, content).map_err(|error| format!("写入临时知识库文件失败: {error}"))?;

    if !path.exists() {
        return fs::rename(&tmp_path, path)
            .map_err(|error| format!("写入 knowledge-bases.json 失败: {error}"));
    }

    fs::rename(path, &backup_path).map_err(|error| format!("备份旧知识库文件失败: {error}"))?;

    match fs::rename(&tmp_path, path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup_path);
            Ok(())
        }
        Err(write_error) => {
            let restore_result = fs::rename(&backup_path, path);
            let _ = fs::remove_file(&tmp_path);
            match restore_result {
                Ok(()) => Err(format!("写入 knowledge-bases.json 失败: {write_error}")),
                Err(restore_error) => Err(format!(
                    "写入 knowledge-bases.json 失败: {write_error}; 恢复旧知识库文件失败: {restore_error}"
                )),
            }
        }
    }
}

fn normalize_knowledge_base_name(value: &str) -> Result<String, String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err("知识库名称不能为空".to_string());
    }
    Ok(normalized.to_string())
}

fn normalize_knowledge_base_description(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

fn normalize_root_name(value: Option<&str>, canonical_path: &Path) -> String {
    let candidate = value.map(str::trim).unwrap_or_default();
    if !candidate.is_empty() {
        return candidate.to_string();
    }

    if let Some(file_name) = canonical_path
        .file_name()
        .and_then(|part| part.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return file_name.to_string();
    }

    canonical_path.to_string_lossy().to_string()
}

fn normalize_root_id(value: Option<&str>) -> String {
    let trimmed = value.map(str::trim).unwrap_or_default();
    if trimmed.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        trimmed.to_string()
    }
}

fn resolve_root_input(root: KnowledgeBaseRootInput) -> Result<ResolvedKnowledgeRoot, String> {
    let trimmed_path = root.path.trim();
    if trimmed_path.is_empty() {
        return Err("知识库目录路径不能为空".to_string());
    }

    let raw_path = PathBuf::from(trimmed_path);
    if raw_path.is_relative() {
        return Err("知识库目录必须是绝对路径".to_string());
    }
    if !raw_path.is_dir() {
        return Err(format!("知识库目录不存在或不是文件夹: {trimmed_path}"));
    }

    let canonical_path = raw_path
        .canonicalize()
        .map_err(|error| format!("解析知识库目录失败: {error}"))?;
    let root_name = normalize_root_name(root.name.as_deref(), &canonical_path);

    Ok(ResolvedKnowledgeRoot {
        record: KnowledgeBaseRoot {
            id: normalize_root_id(root.id.as_deref()),
            name: root_name,
            path: canonical_path.to_string_lossy().to_string(),
        },
        canonical_path,
    })
}

fn dedupe_roots(roots: Vec<ResolvedKnowledgeRoot>) -> Vec<KnowledgeBaseRoot> {
    let mut seen_paths = HashSet::new();
    let mut normalized = Vec::new();

    for root in roots {
        let key = root.canonical_path.to_string_lossy().to_string();
        if seen_paths.insert(key) {
            normalized.push(root.record);
        }
    }

    normalized
}

fn normalize_roots(roots: Vec<KnowledgeBaseRootInput>) -> Result<Vec<KnowledgeBaseRoot>, String> {
    if roots.is_empty() {
        return Ok(Vec::new());
    }

    let mut resolved = Vec::new();
    for root in roots {
        resolved.push(resolve_root_input(root)?);
    }

    let normalized = dedupe_roots(resolved);
    Ok(normalized)
}

fn slugify_knowledge_base_name(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for character in value.trim().chars() {
        if character.is_alphanumeric() {
            for lowered in character.to_lowercase() {
                slug.push(lowered);
            }
            previous_was_dash = false;
            continue;
        }

        let is_separator = character.is_whitespace() || matches!(character, '-' | '_' | '.');
        let is_invalid_path_char = matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*');

        if (is_separator || is_invalid_path_char) && !previous_was_dash && !slug.is_empty() {
            slug.push('-');
            previous_was_dash = true;
        }
    }

    let normalized = slug.trim_matches('-').to_string();
    if normalized.is_empty() {
        "knowledge-base".to_string()
    } else {
        normalized
    }
}

fn is_managed_root_path_in_use(
    records: &[KnowledgeBaseRecord],
    candidate: &Path,
    excluded_record_id: Option<&str>,
) -> bool {
    records
        .iter()
        .filter(|record| excluded_record_id.map(|id| record.id != id).unwrap_or(true))
        .flat_map(|record| record.roots.iter())
        .any(|root| PathBuf::from(root.path.trim()) == candidate)
}

fn build_managed_root(
    knowledge_base_name: &str,
    records: &[KnowledgeBaseRecord],
    excluded_record_id: Option<&str>,
) -> Result<KnowledgeBaseRoot, String> {
    let managed_root_dir = knowledge_base_root_dir()?;
    let base_slug = slugify_knowledge_base_name(knowledge_base_name);
    let mut index = 1usize;

    loop {
        let slug = if index == 1 {
            base_slug.clone()
        } else {
            format!("{base_slug}-{index}")
        };
        let candidate = managed_root_dir.join(&slug);

        if candidate.exists() || is_managed_root_path_in_use(records, &candidate, excluded_record_id) {
            index += 1;
            continue;
        }

        fs::create_dir_all(&candidate).map_err(|error| format!("创建知识库目录失败: {error}"))?;
        let canonical_path = candidate
            .canonicalize()
            .map_err(|error| format!("解析知识库目录失败: {error}"))?;

        return Ok(KnowledgeBaseRoot {
            id: Uuid::new_v4().to_string(),
            name: KNOWLEDGE_BASE_DIR_NAME.to_string(),
            path: canonical_path.to_string_lossy().to_string(),
        });
    }
}

fn find_knowledge_base(records: &[KnowledgeBaseRecord], id: &str) -> Result<KnowledgeBaseRecord, String> {
    let target_id = id.trim();
    records
        .iter()
        .find(|record| record.id == target_id)
        .cloned()
        .ok_or_else(|| format!("未找到知识库: {target_id}"))
}

fn resolve_record_root(record: &KnowledgeBaseRecord, root_id: &str) -> Result<ResolvedKnowledgeRoot, String> {
    let target_id = root_id.trim();
    let root = record
        .roots
        .iter()
        .find(|item| item.id == target_id)
        .cloned()
        .ok_or_else(|| format!("未找到知识库目录: {target_id}"))?;
    let canonical_path = PathBuf::from(root.path.trim())
        .canonicalize()
        .map_err(|error| format!("知识库目录不存在或无法访问: {error}"))?;

    Ok(ResolvedKnowledgeRoot {
        record: root,
        canonical_path,
    })
}

fn normalize_relative_path(value: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("文件相对路径不能为空".to_string());
    }

    let candidate = PathBuf::from(trimmed.replace('\\', "/"));
    if candidate.is_absolute() {
        return Err("文件路径必须是相对路径".to_string());
    }

    let mut normalized = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::ParentDir => return Err("文件路径不能包含上级目录跳转".to_string()),
            Component::Prefix(_) | Component::RootDir => {
                return Err("文件路径必须是相对路径".to_string())
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("文件相对路径不能为空".to_string());
    }

    Ok(normalized)
}

fn ensure_path_within_root(root: &Path, candidate: &Path) -> Result<(), String> {
    let parent = candidate.parent().ok_or("文件路径无效".to_string())?;
    let parent_canonical = parent
        .canonicalize()
        .map_err(|error| format!("解析文件父目录失败: {error}"))?;
    if !parent_canonical.starts_with(root) {
        return Err("文件路径越界".to_string());
    }

    if candidate.exists() {
        let candidate_canonical = candidate
            .canonicalize()
            .map_err(|error| format!("解析目标文件失败: {error}"))?;
        if !candidate_canonical.starts_with(root) {
            return Err("文件路径越界".to_string());
        }
    }

    Ok(())
}

fn resolve_file_path(root: &ResolvedKnowledgeRoot, relative_path: &str) -> Result<PathBuf, String> {
    let normalized_relative = normalize_relative_path(relative_path)?;
    let candidate = root.canonical_path.join(normalized_relative);
    ensure_path_within_root(&root.canonical_path, &candidate)?;
    Ok(candidate)
}

fn extension_from_path(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
}

fn classify_text_format(path: &Path) -> (String, bool) {
    match extension_from_path(path).as_deref() {
        Some("md") | Some("markdown") => ("markdown".to_string(), true),
        Some("txt") => ("text".to_string(), true),
        Some("html") | Some("htm") => ("html".to_string(), true),
        _ => ("unsupported".to_string(), false),
    }
}

fn metadata_timestamp_ms(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .and_then(|millis| i64::try_from(millis).ok())
        .unwrap_or_else(current_timestamp_millis)
}

fn should_skip_directory(name: &str) -> bool {
    SKIPPED_DIRECTORY_NAMES.iter().any(|item| item == &name)
}

fn build_relative_path_display(relative_path: &Path) -> String {
    relative_path
        .to_string_lossy()
        .replace('\\', "/")
}

fn scan_tree(root: &Path, current: &Path) -> Result<Vec<KnowledgeTreeNode>, String> {
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let entries = fs::read_dir(current)
        .map_err(|error| format!("读取知识库目录失败: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("读取知识库目录项失败: {error}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取知识库目录项类型失败: {error}"))?;

        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_dir() && should_skip_directory(&name) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .map_err(|error| format!("构建知识库相对路径失败: {error}"))?
            .to_path_buf();
        let relative_display = build_relative_path_display(&relative_path);
        let metadata = entry
            .metadata()
            .map_err(|error| format!("读取知识库文件元数据失败: {error}"))?;

        if file_type.is_dir() {
            directories.push(KnowledgeTreeNode {
                id: format!("dir:{relative_display}"),
                name,
                relative_path: relative_display,
                node_type: "directory".to_string(),
                extension: None,
                size_bytes: None,
                updated_at_ms: Some(metadata_timestamp_ms(&metadata)),
                children: scan_tree(root, &path)?,
            });
        } else if file_type.is_file() {
            files.push(KnowledgeTreeNode {
                id: format!("file:{relative_display}"),
                name,
                relative_path: relative_display,
                node_type: "file".to_string(),
                extension: extension_from_path(&path),
                size_bytes: Some(metadata.len()),
                updated_at_ms: Some(metadata_timestamp_ms(&metadata)),
                children: Vec::new(),
            });
        }
    }

    directories.sort_by(|left, right| left.name.cmp(&right.name));
    files.sort_by(|left, right| left.name.cmp(&right.name));
    directories.extend(files);
    Ok(directories)
}

#[tauri::command]
pub fn list_knowledge_bases() -> Result<Vec<KnowledgeBaseRecord>, String> {
    load_knowledge_base_records()
}

#[tauri::command]
pub fn upsert_knowledge_base(payload: UpsertKnowledgeBasePayload) -> Result<KnowledgeBaseRecord, String> {
    let mut records = load_knowledge_base_records()?;
    let now = current_timestamp_millis();
    let normalized_name = normalize_knowledge_base_name(&payload.name)?;
    let normalized_description = normalize_knowledge_base_description(payload.description.as_deref());
    let next_id = payload
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing_record = records.iter().find(|record| record.id == next_id).cloned();
    let normalized_roots = if payload.roots.is_empty() {
        if let Some(record) = existing_record.as_ref() {
            if record.roots.is_empty() {
                vec![build_managed_root(&normalized_name, &records, Some(&next_id))?]
            } else {
                record.roots.clone()
            }
        } else {
            vec![build_managed_root(&normalized_name, &records, None)?]
        }
    } else {
        let explicit_roots = normalize_roots(payload.roots)?;
        if explicit_roots.is_empty() {
            return Err("至少需要一个知识库目录".to_string());
        }
        explicit_roots
    };

    let mut created_at_ms = now;
    let mut replaced = false;

    for record in &mut records {
        if record.id != next_id {
            continue;
        }

        created_at_ms = record.created_at_ms;
        record.name = normalized_name.clone();
        record.description = normalized_description.clone();
        record.roots = normalized_roots.clone();
        record.updated_at_ms = now;
        replaced = true;
        break;
    }

    let next_record = if replaced {
        records
            .iter()
            .find(|record| record.id == next_id)
            .cloned()
            .ok_or("更新知识库失败".to_string())?
    } else {
        let record = KnowledgeBaseRecord {
            id: next_id.clone(),
            name: normalized_name,
            description: normalized_description,
            roots: normalized_roots,
            created_at_ms,
            updated_at_ms: now,
        };
        records.push(record.clone());
        record
    };

    records.sort_by(|left, right| left.name.cmp(&right.name));
    write_knowledge_base_records(&records)?;
    Ok(next_record)
}

#[tauri::command]
pub fn delete_knowledge_base(id: String) -> Result<String, String> {
    let mut records = load_knowledge_base_records()?;
    let original_len = records.len();
    let trimmed_id = id.trim().to_string();
    records.retain(|record| record.id != trimmed_id);

    if records.len() == original_len {
        return Err(format!("未找到知识库: {trimmed_id}"));
    }

    write_knowledge_base_records(&records)?;
    Ok(trimmed_id)
}

#[tauri::command]
pub fn load_knowledge_base_tree(id: String) -> Result<KnowledgeBaseTreeSnapshot, String> {
    let records = load_knowledge_base_records()?;
    let record = find_knowledge_base(&records, &id)?;
    let mut roots = Vec::new();

    for root in &record.roots {
        let path = PathBuf::from(root.path.trim());
        if path.is_dir() {
            roots.push(KnowledgeRootSnapshot {
                id: root.id.clone(),
                name: root.name.clone(),
                path: root.path.clone(),
                exists: true,
                children: scan_tree(&path, &path)?,
            });
        } else {
            roots.push(KnowledgeRootSnapshot {
                id: root.id.clone(),
                name: root.name.clone(),
                path: root.path.clone(),
                exists: false,
                children: Vec::new(),
            });
        }
    }

    Ok(KnowledgeBaseTreeSnapshot {
        knowledge_base: record,
        roots,
    })
}

#[tauri::command]
pub fn load_knowledge_file(
    id: String,
    root_id: String,
    relative_path: String,
) -> Result<KnowledgeFileContent, String> {
    let records = load_knowledge_base_records()?;
    let record = find_knowledge_base(&records, &id)?;
    let resolved_root = resolve_record_root(&record, &root_id)?;
    let file_path = resolve_file_path(&resolved_root, &relative_path)?;

    if !file_path.is_file() {
        return Err(format!("知识库文件不存在: {}", file_path.to_string_lossy()));
    }

    let metadata = fs::metadata(&file_path)
        .map_err(|error| format!("读取知识库文件元数据失败: {error}"))?;
    let (format, editable) = classify_text_format(&file_path);
    let content = if editable {
        fs::read_to_string(&file_path)
            .map_err(|error| format!("读取知识库文件失败: {error}"))?
    } else {
        String::new()
    };

    Ok(KnowledgeFileContent {
        knowledge_base_id: record.id,
        root_id: resolved_root.record.id.clone(),
        root_name: resolved_root.record.name.clone(),
        root_path: resolved_root.record.path.clone(),
        relative_path: build_relative_path_display(
            &file_path
                .strip_prefix(&resolved_root.canonical_path)
                .map_err(|error| format!("构建知识库文件相对路径失败: {error}"))?
                .to_path_buf(),
        ),
        absolute_path: file_path.to_string_lossy().to_string(),
        file_name: file_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string(),
        format,
        editable,
        size_bytes: metadata.len(),
        updated_at_ms: metadata_timestamp_ms(&metadata),
        content,
    })
}

#[tauri::command]
pub fn save_knowledge_file(
    id: String,
    root_id: String,
    relative_path: String,
    content: String,
    format: String,
) -> Result<String, String> {
    let records = load_knowledge_base_records()?;
    let record = find_knowledge_base(&records, &id)?;
    let resolved_root = resolve_record_root(&record, &root_id)?;
    let file_path = resolve_file_path(&resolved_root, &relative_path)?;
    let (expected_format, editable) = classify_text_format(&file_path);

    if !editable {
        return Err("当前文件类型不支持内嵌编辑".to_string());
    }

    let requested_format = format.trim().to_ascii_lowercase();
    if requested_format.is_empty() || requested_format != expected_format {
        return Err(format!("文件格式不匹配，期望 {expected_format}，收到 {requested_format}"));
    }

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建知识库文件目录失败: {error}"))?;
    }

    ensure_path_within_root(&resolved_root.canonical_path, &file_path)?;
    atomic_write_text(&file_path, &content)?;
    Ok(file_path.to_string_lossy().to_string())
}
