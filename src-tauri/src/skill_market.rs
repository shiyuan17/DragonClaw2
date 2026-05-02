// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{agents, onboarding, paths};

const SKILL_MARKET_BASE_URL: &str = "https://lightmake.site/api";
const SKILL_MARKET_SEARCH_BASE_URL: &str = "https://api.skillhub.cn/api";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketCategoryRequest {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
    pub category: Option<String>,
    pub keyword: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsSnapshotItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsSnapshotResponse {
    pub source_path: String,
    pub installed: Vec<InstalledSkillsSnapshotItem>,
}

async fn fetch_skill_market(url: &str) -> Result<Value, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|error| format!("技能市场请求失败: {error}"))?;
    let status = response.status();

    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(if detail.trim().is_empty() {
            format!("技能市场请求失败 ({status})")
        } else {
            format!("技能市场请求失败 ({status}): {}", detail.trim())
        });
    }

    let text = response
        .text()
        .await
        .map_err(|error| format!("技能市场响应读取失败: {error}"))?;
    serde_json::from_str::<Value>(&text)
        .map_err(|error| format!("技能市场响应解析失败: {error}"))
}

fn normalize_skill_market_slug(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn is_valid_skill_market_slug(slug: &str) -> bool {
    if slug.is_empty() || slug.len() > 128 {
        return false;
    }

    if slug.contains("..")
        || slug.starts_with('/')
        || slug.starts_with('-')
        || slug.ends_with('/')
        || slug.ends_with('-')
        || slug.contains('\\')
    {
        return false;
    }

    slug.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn normalize_install_target_agent_ids(
    target_agent_ids: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let mut normalized_targets = Vec::new();
    let mut seen = BTreeSet::new();

    if let Some(candidates) = target_agent_ids {
        for candidate in candidates {
            let normalized = agents::normalize_agent_id(&candidate)?;
            if seen.insert(normalized.clone()) {
                normalized_targets.push(normalized);
            }
        }
    }

    if normalized_targets.is_empty() {
        normalized_targets.push("main".to_string());
    }

    Ok(normalized_targets)
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();

    for path in paths {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            result.push(path);
        }
    }

    result
}

fn shared_skill_roots() -> Result<Vec<PathBuf>, String> {
    Ok(vec![
        paths::main_workspace_dir()?.join("skills"),
        paths::user_config_dir()?.join("skills"),
        paths::skillhub_workspace_skills_dir()?,
    ])
}

fn agent_skill_install_root(agent_id: &str) -> Result<PathBuf, String> {
    let normalized = agents::normalize_agent_id(agent_id)?;
    Ok(paths::workspace_root_for_agent(Some(&normalized))?.join("skills"))
}

fn visible_skill_roots_for_agent(agent_id: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();

    if let Some(target) = agent_id.map(str::trim).filter(|value| !value.is_empty()) {
        let normalized = agents::normalize_agent_id(target)?;
        if normalized != "main" {
            roots.push(agent_skill_install_root(&normalized)?);
        }
    }

    roots.extend(shared_skill_roots()?);
    Ok(dedupe_paths(roots))
}

fn all_skill_roots() -> Result<Vec<PathBuf>, String> {
    let mut roots = shared_skill_roots()?;

    if let Ok(agent_entries) = agents::list_agents() {
        for agent in agent_entries {
            if agent.name == "main" {
                continue;
            }

            if let Ok(root) = agent_skill_install_root(&agent.name) {
                roots.push(root);
            }
        }
    }

    Ok(dedupe_paths(roots))
}

fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None, None);
    }

    let mut name = None;
    let mut description = None;
    let mut category = None;

    for raw_line in lines {
        let line = raw_line.trim();
        if line == "---" {
            break;
        }

        if let Some(value) = line.strip_prefix("name:") {
            name = Some(value.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(value) = line.strip_prefix("description:") {
            description = Some(value.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(value) = line.strip_prefix("category:") {
            category = Some(value.trim().trim_matches('"').trim_matches('\'').to_string());
        }
    }

    (name, description, category)
}

fn build_installed_skill_snapshot_item(
    root: &Path,
    skill_dir: &Path,
) -> Option<InstalledSkillsSnapshotItem> {
    let skill_md = skill_dir.join("SKILL.md");
    if !skill_md.is_file() {
        return None;
    }

    let content = fs::read_to_string(&skill_md).ok()?;
    let directory_name = skill_dir.file_name()?.to_string_lossy().to_string();
    let slug = normalize_skill_market_slug(&directory_name);
    if slug.is_empty() {
        return None;
    }

    let (name, description, category) = parse_skill_frontmatter(&content);
    let relative_path = skill_dir
        .strip_prefix(root)
        .unwrap_or(skill_dir)
        .to_string_lossy()
        .to_string();

    Some(InstalledSkillsSnapshotItem {
        id: slug,
        name: name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(directory_name),
        category: category.unwrap_or_default(),
        description: description.unwrap_or_default(),
        relative_path,
    })
}

fn collect_installed_skill_items_from_root(
    root: &Path,
    items: &mut BTreeMap<String, InstalledSkillsSnapshotItem>,
) {
    if !root.is_dir() {
        return;
    }

    let mut stack = vec![root.to_path_buf()];
    while let Some(current_dir) = stack.pop() {
        let entries = match fs::read_dir(&current_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        let mut child_dirs = Vec::new();
        let mut has_skill_md = false;

        for entry in entries.flatten() {
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };

            if file_type.is_file()
                && entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("SKILL.md")
            {
                has_skill_md = true;
            }

            if file_type.is_dir() {
                child_dirs.push(path);
            }
        }

        if has_skill_md {
            if let Some(item) = build_installed_skill_snapshot_item(root, &current_dir) {
                items.entry(item.id.clone()).or_insert(item);
            }
            continue;
        }

        stack.extend(child_dirs);
    }
}

fn build_installed_skills_snapshot(
    agent_id: Option<&str>,
) -> Result<InstalledSkillsSnapshotResponse, String> {
    let roots = visible_skill_roots_for_agent(agent_id)?;
    let source_path = roots
        .first()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut installed = BTreeMap::new();

    for root in &roots {
        collect_installed_skill_items_from_root(root, &mut installed);
    }

    Ok(InstalledSkillsSnapshotResponse {
        source_path,
        installed: installed.into_values().collect(),
    })
}

#[tauri::command]
pub fn load_installed_skills_snapshot(
    agent_id: Option<String>,
) -> Result<InstalledSkillsSnapshotResponse, String> {
    build_installed_skills_snapshot(agent_id.as_deref())
}

#[tauri::command]
pub fn load_installed_skill_market_slugs() -> Result<Vec<String>, String> {
    let roots = all_skill_roots()?;
    let mut installed = BTreeMap::new();

    for root in &roots {
        collect_installed_skill_items_from_root(root, &mut installed);
    }

    Ok(installed.into_keys().collect())
}

#[tauri::command]
pub fn install_skill_market_skill(
    skill_slug: String,
    target_agent_ids: Option<Vec<String>>,
) -> Result<String, String> {
    let slug = normalize_skill_market_slug(&skill_slug);
    if !is_valid_skill_market_slug(&slug) {
        return Err("技能标识无效，请检查后重试。".to_string());
    }

    let targets = normalize_install_target_agent_ids(target_agent_ids)?;
    let mut installed_targets = Vec::new();
    let mut failed_targets = Vec::new();

    for target in targets {
        let install_root = agent_skill_install_root(&target)?;
        match onboarding::install_skillhub_skill_to_dir(&slug, &install_root) {
            Ok(result) if result.success => installed_targets.push(target),
            Ok(result) => failed_targets.push((
                target,
                format!(
                    "stdout:\n{}\n\nstderr:\n{}",
                    result.stdout.trim(),
                    result.stderr.trim()
                ),
            )),
            Err(error) => failed_targets.push((target, error)),
        }
    }

    if failed_targets.is_empty() {
        return Ok(format!(
            "技能 `{}` 已安装到：{}",
            slug,
            installed_targets.join(", ")
        ));
    }

    let failed_summary = failed_targets
        .iter()
        .map(|(target, error)| format!("{target}: {error}"))
        .collect::<Vec<_>>()
        .join(" | ");

    Err(format!(
        "技能 `{}` 安装失败。成功目标：{}。失败详情：{}",
        slug,
        if installed_targets.is_empty() {
            "无".to_string()
        } else {
            installed_targets.join(", ")
        },
        failed_summary
    ))
}

#[tauri::command]
pub async fn load_skill_market_top() -> Result<Value, String> {
    fetch_skill_market(&format!("{SKILL_MARKET_BASE_URL}/skills/top")).await
}

#[tauri::command]
pub async fn load_skill_market_by_category(
    request: SkillMarketCategoryRequest,
) -> Result<Value, String> {
    let page = request.page.unwrap_or(1).max(1);
    let page_size = request.page_size.unwrap_or(24).clamp(1, 100);
    let sort_by = request
        .sort_by
        .unwrap_or_else(|| "score".to_string())
        .trim()
        .to_ascii_lowercase();
    let order = request
        .order
        .unwrap_or_else(|| "desc".to_string())
        .trim()
        .to_ascii_lowercase();
    let category = request.category.unwrap_or_default().trim().to_string();
    let keyword = request.keyword.unwrap_or_default().trim().to_string();

    let base_url = if keyword.is_empty() {
        SKILL_MARKET_BASE_URL
    } else {
        SKILL_MARKET_SEARCH_BASE_URL
    };

    let mut url = reqwest::Url::parse(&format!("{base_url}/skills"))
        .map_err(|error| format!("技能市场地址无效: {error}"))?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("page", &page.to_string());
        query.append_pair("pageSize", &page_size.to_string());
        query.append_pair(
            "sortBy",
            match sort_by.as_str() {
                "downloads" => "downloads",
                "stars" => "stars",
                _ => "score",
            },
        );
        query.append_pair("order", if order == "asc" { "asc" } else { "desc" });

        if !category.is_empty() {
            query.append_pair("category", &category);
        }

        if !keyword.is_empty() {
            query.append_pair("keyword", &keyword);
        }
    }

    fetch_skill_market(url.as_str()).await
}
