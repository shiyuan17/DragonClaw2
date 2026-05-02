import {
  loadSkillMarketByCategory,
  loadSkillMarketTop,
  type SkillMarketCategoryRequest,
} from "../api/skillMarket";

export type SkillMarketSortBy = "score" | "downloads" | "stars";
export type SkillMarketOrder = "asc" | "desc";

export type SkillMarketCategory =
  | "ai-intelligence"
  | "developer-tools"
  | "productivity"
  | "data-analysis"
  | "content-creation"
  | "security-compliance"
  | "communication-collaboration";

export interface SkillMarketSkill {
  category: string;
  description: string;
  descriptionZh: string;
  downloads: number;
  homepage: string;
  installs: number;
  name: string;
  ownerName: string;
  score: number;
  slug: string;
  stars: number;
  tags: string[];
  updatedAt: number;
  version: string;
}

export interface SkillMarketListResult {
  skills: SkillMarketSkill[];
  total: number;
}

interface SkillMarketApiSkill {
  category?: unknown;
  description?: unknown;
  description_zh?: unknown;
  downloads?: unknown;
  homepage?: unknown;
  installs?: unknown;
  name?: unknown;
  ownerName?: unknown;
  score?: unknown;
  slug?: unknown;
  stars?: unknown;
  tags?: unknown;
  updated_at?: unknown;
  version?: unknown;
}

interface SkillMarketApiEnvelope {
  code?: unknown;
  data?: {
    skills?: unknown;
    total?: unknown;
  } | null;
  message?: unknown;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeSkillMarketSkill(raw: SkillMarketApiSkill): SkillMarketSkill {
  return {
    category: toStringValue(raw.category),
    description: toStringValue(raw.description),
    descriptionZh: toStringValue(raw.description_zh),
    downloads: toNumber(raw.downloads),
    homepage: toStringValue(raw.homepage),
    installs: toNumber(raw.installs),
    name: toStringValue(raw.name, "Unknown Skill"),
    ownerName: toStringValue(raw.ownerName),
    score: toNumber(raw.score),
    slug: toStringValue(raw.slug),
    stars: toNumber(raw.stars),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === "string") : [],
    updatedAt: toNumber(raw.updated_at),
    version: toStringValue(raw.version, "v1.0.0"),
  };
}

function normalizeSkillMarketEnvelope(raw: SkillMarketApiEnvelope): SkillMarketListResult {
  const code = toNumber(raw.code, -1);
  if (code !== 0) {
    throw new Error(toStringValue(raw.message, "技能市场接口返回异常。"));
  }

  const list = Array.isArray(raw.data?.skills) ? (raw.data?.skills as SkillMarketApiSkill[]) : [];
  const skills = list.map((item) => normalizeSkillMarketSkill(item));
  const total = Math.max(toNumber(raw.data?.total, skills.length), skills.length);
  return { skills, total };
}

function normalizePage(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

async function requestSkillMarket(request: SkillMarketCategoryRequest, top = false) {
  if (top) {
    return normalizeSkillMarketEnvelope(await loadSkillMarketTop<SkillMarketApiEnvelope>());
  }
  return normalizeSkillMarketEnvelope(await loadSkillMarketByCategory<SkillMarketApiEnvelope>(request));
}

export async function fetchSkillTop50(): Promise<SkillMarketListResult> {
  return requestSkillMarket({}, true);
}

export async function fetchSkillsByCategory(
  category: SkillMarketCategory,
  options: {
    page?: number;
    pageSize?: number;
    sortBy?: SkillMarketSortBy;
    order?: SkillMarketOrder;
  } = {},
): Promise<SkillMarketListResult> {
  return requestSkillMarket({
    page: normalizePage(options.page, 1),
    pageSize: normalizePageSize(options.pageSize, 200),
    sortBy: options.sortBy ?? "score",
    order: options.order ?? "desc",
    category,
  });
}

export async function fetchSkillsByKeyword(
  keyword: string,
  options: {
    page?: number;
    pageSize?: number;
    sortBy?: SkillMarketSortBy;
    order?: SkillMarketOrder;
    category?: SkillMarketCategory;
  } = {},
): Promise<SkillMarketListResult> {
  const normalizedKeyword = keyword.trim();
  return requestSkillMarket({
    page: normalizePage(options.page, 1),
    pageSize: normalizePageSize(options.pageSize, 80),
    sortBy: options.sortBy ?? "score",
    order: options.order ?? "desc",
    category: options.category,
    keyword: normalizedKeyword,
  });
}
