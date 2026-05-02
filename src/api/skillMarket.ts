import { invoke } from "@tauri-apps/api/core";

export interface SkillMarketCategoryRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  order?: string;
  category?: string;
  keyword?: string;
}

export interface InstalledSkillsSnapshotItem {
  id: string;
  name: string;
  category: string;
  description: string;
  relativePath: string;
}

export interface InstalledSkillsSnapshotResponse {
  sourcePath: string;
  installed: InstalledSkillsSnapshotItem[];
}

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export async function loadSkillMarketTop<T = unknown>() {
  try {
    return await invoke<T>("load_skill_market_top");
  } catch (error) {
    throw new Error(toMessage(error, "技能市场加载失败。"));
  }
}

export async function loadSkillMarketByCategory<T = unknown>(request: SkillMarketCategoryRequest) {
  try {
    return await invoke<T>("load_skill_market_by_category", { request });
  } catch (error) {
    throw new Error(toMessage(error, "技能市场加载失败。"));
  }
}

export async function loadInstalledSkillMarketSlugs() {
  try {
    return await invoke<string[]>("load_installed_skill_market_slugs");
  } catch (error) {
    throw new Error(toMessage(error, "读取已安装技能失败。"));
  }
}

export async function loadInstalledSkillsSnapshot(agentId?: string | null) {
  try {
    return await invoke<InstalledSkillsSnapshotResponse>("load_installed_skills_snapshot", {
      agentId: agentId?.trim() || null,
    });
  } catch (error) {
    throw new Error(toMessage(error, "读取已安装技能列表失败。"));
  }
}

export async function installSkillMarketSkill(skillSlug: string, targetAgentIds?: string[]) {
  try {
    return await invoke<string>("install_skill_market_skill", {
      skillSlug: skillSlug.trim(),
      targetAgentIds: targetAgentIds?.map((value) => value.trim()).filter(Boolean),
    });
  } catch (error) {
    throw new Error(toMessage(error, "技能安装失败。"));
  }
}
