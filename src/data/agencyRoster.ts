import agencyAgentManifestRaw from "./agency-agents.json";
import type {
  AgencyAgentInfo,
  AgencyAgentInfoRecord,
  AgencyAgentManifest,
  AgencyAgentTemplate,
  AgencyRosterDefinitionSection,
  AgencyRosterDivision,
  AgencyRosterRole,
} from "../types";

const agencyAgentManifest = agencyAgentManifestRaw as unknown as AgencyAgentManifest;

const DIVISION_FILTER_ALL = "__all__";

interface NormalizedAgencyAgentInfo {
  name: string;
  mission: string;
  identity: string;
  capabilities: string[];
  likes: string[];
  dislikes: string[];
  rules: string[];
  workflow: string[];
  tags: string[];
  usageScenarios: string[];
  personalityRadar: Record<string, number>;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug) {
    return slug;
  }

  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `division-${hash.toString(36)}`;
}

function normalizeDivisionTitle(rawTitle: string) {
  const withoutLeadingEmoji = rawTitle.replace(/^[^A-Za-z0-9\u4e00-\u9fa5]+/u, "").trim();
  const withoutTrailingEn = withoutLeadingEmoji.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return withoutTrailingEn || "未分组";
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return null;
  }

  const cells = trimmed
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

  if (cells.length < 4) {
    return null;
  }

  if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
    return null;
  }

  if (/^agent\s*id$/i.test(cells[0]) || cells[0] === "中文名") {
    return null;
  }

  return cells;
}

function extractAgentId(cell: string) {
  const codeMatch = cell.match(/`([^`]+)`/);
  if (codeMatch?.[1]) {
    return codeMatch[1].trim();
  }
  return cell.trim();
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizePersonalityRadar(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((result, [key, score]) => {
    if (typeof score === "number" && Number.isFinite(score)) {
      result[key] = score;
    }
    return result;
  }, {});
}

function normalizeInfo(info: AgencyAgentInfo | undefined): NormalizedAgencyAgentInfo {
  return {
    name: typeof info?.name === "string" ? info.name.trim() : "",
    mission: typeof info?.mission === "string" ? info.mission.trim() : "",
    identity: typeof info?.identity === "string" ? info.identity.trim() : "",
    capabilities: normalizeStringList(info?.capabilities),
    likes: normalizeStringList(info?.likes),
    dislikes: normalizeStringList(info?.dislikes),
    rules: normalizeStringList(info?.rules),
    workflow: normalizeStringList(info?.workflow),
    tags: normalizeStringList(info?.tags),
    usageScenarios: normalizeStringList(info?.usage_scenarios),
    personalityRadar: normalizePersonalityRadar(info?.personality_radar),
  };
}

function hasMeaningfulInfo(info: NormalizedAgencyAgentInfo) {
  return Boolean(
    info.name ||
      info.mission ||
      info.identity ||
      info.workflow.length > 0 ||
      info.capabilities.length > 0 ||
      info.rules.length > 0 ||
      info.usageScenarios.length > 0,
  );
}

function buildInfoIndex(records: AgencyAgentInfoRecord[]) {
  const zh = new Map<string, AgencyAgentInfo>();
  const en = new Map<string, AgencyAgentInfo>();

  for (const record of records) {
    const agentId = record.agentId.trim();
    if (!agentId) {
      continue;
    }

    const normalizedLocale = record.locale.trim().toLowerCase();
    if (normalizedLocale.startsWith("zh")) {
      zh.set(agentId, record.info);
    } else if (normalizedLocale.startsWith("en")) {
      en.set(agentId, record.info);
    }
  }

  return { zh, en };
}

function buildTemplateSections(template: AgencyAgentTemplate | undefined): AgencyRosterDefinitionSection[] {
  if (!template) {
    return [];
  }

  return [
    { id: "agents", label: "AGENTS.md", content: template.AGENTS_MD.trim() },
    { id: "identity", label: "IDENTITY.md", content: template.IDENTITY_MD.trim() },
    { id: "soul", label: "SOUL.md", content: template.SOUL_MD.trim() },
  ].filter((section) => section.content);
}

function buildFallbackInfoSections(
  info: NormalizedAgencyAgentInfo,
  fallbackDescription: string,
): AgencyRosterDefinitionSection[] {
  const overview = [
    info.mission ? `使命\n${info.mission}` : "",
    info.identity ? `身份\n${info.identity}` : "",
    info.workflow.length > 0 ? `工作流\n${info.workflow.map((item) => `- ${item}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const sections: AgencyRosterDefinitionSection[] = [];

  if (overview) {
    sections.push({ id: "overview", label: "定义概览", content: overview });
  }

  const listSections: Array<{ id: string; label: string; items: string[] }> = [
    { id: "capabilities", label: "能力", items: info.capabilities },
    { id: "rules", label: "规则", items: info.rules },
    { id: "usage", label: "适用场景", items: info.usageScenarios },
    { id: "likes", label: "偏好", items: info.likes },
    { id: "dislikes", label: "避讳", items: info.dislikes },
  ];

  for (const section of listSections) {
    if (section.items.length > 0) {
      sections.push({
        id: section.id,
        label: section.label,
        content: section.items.map((item) => `- ${item}`).join("\n"),
      });
    }
  }

  if (Object.keys(info.personalityRadar).length > 0) {
    const radarLines = Object.entries(info.personalityRadar)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, score]) => `- ${key}: ${score}`);

    sections.push({
      id: "personality",
      label: "人格雷达",
      content: radarLines.join("\n"),
    });
  }

  if (sections.length === 0 && fallbackDescription) {
    sections.push({
      id: "fallback",
      label: "定义概览",
      content: fallbackDescription,
    });
  }

  return sections;
}

function toPreviewText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_\-\[\]`]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDefinitionPreview(
  sections: AgencyRosterDefinitionSection[],
  fallbackDescription: string,
) {
  const previewSource = sections.map((section) => section.content).join("\n\n") || fallbackDescription;
  const normalized = toPreviewText(previewSource);
  if (!normalized) {
    return fallbackDescription;
  }
  return normalized.length > 180 ? `${normalized.slice(0, 180).trim()}...` : normalized;
}

const infoIndex = buildInfoIndex(agencyAgentManifest.agentInfos);

function resolveRoleDetail(agentId: string, fallbackName: string, fallbackDescription: string) {
  const zhInfo = normalizeInfo(infoIndex.zh.get(agentId));
  const enInfo = normalizeInfo(infoIndex.en.get(agentId));
  const hasZh = hasMeaningfulInfo(zhInfo);
  const hasEn = hasMeaningfulInfo(enInfo);
  const preferred = hasZh ? zhInfo : hasEn ? enInfo : zhInfo;
  const definitionSections =
    buildTemplateSections(agencyAgentManifest.templates[agentId]) ||
    buildFallbackInfoSections(preferred, fallbackDescription);

  return {
    locale: hasZh ? "zh" : hasEn ? "en" : "zh",
    name: preferred.name || fallbackName,
    description: preferred.mission || preferred.workflow.slice(0, 2).join(" / ") || fallbackDescription,
    tags: preferred.tags,
    definitionSections: definitionSections.length > 0
      ? definitionSections
      : buildFallbackInfoSections(preferred, fallbackDescription),
    definitionPreview: buildDefinitionPreview(definitionSections, fallbackDescription),
  };
}

function parseAgencyRoster(raw: string): AgencyRosterDivision[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const divisionOrder: string[] = [];
  const roleBuckets = new Map<string, AgencyRosterRole[]>();

  let currentDivisionId = DIVISION_FILTER_ALL;
  let currentDivisionTitle = "全部";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch?.[1]) {
      const title = normalizeDivisionTitle(headingMatch[1]);
      const divisionId = `division-${slugify(title)}`;
      currentDivisionId = divisionId;
      currentDivisionTitle = title;
      if (!roleBuckets.has(divisionId)) {
        roleBuckets.set(divisionId, []);
        divisionOrder.push(divisionId);
      }
      continue;
    }

    const cells = parseMarkdownTableRow(line);
    if (!cells || currentDivisionId === DIVISION_FILTER_ALL) {
      continue;
    }

    const agentId = extractAgentId(cells[0]);
    const fallbackName = cells[1]?.trim() ?? "";
    const fallbackDescription = cells[2]?.trim() ?? "";
    const source = cells[3]?.trim() ?? "";
    const isLikelyAgentId = /^[a-z0-9][a-z0-9-]{1,127}$/i.test(agentId);

    if (!agentId || !isLikelyAgentId) {
      continue;
    }

    const detail = resolveRoleDetail(agentId, fallbackName, fallbackDescription);
    if (!detail.name || !detail.description) {
      continue;
    }

    const role: AgencyRosterRole = {
      id: agentId,
      agentId,
      divisionId: currentDivisionId,
      divisionTitle: currentDivisionTitle,
      source,
      locale: detail.locale,
      name: detail.name,
      description: detail.description,
      tags: detail.tags,
      definitionPreview: detail.definitionPreview,
      definitionSections: detail.definitionSections,
    };

    const list = roleBuckets.get(currentDivisionId) ?? [];
    list.push(role);
    roleBuckets.set(currentDivisionId, list);
  }

  return divisionOrder
    .map((divisionId) => {
      const roles = roleBuckets.get(divisionId) ?? [];
      if (roles.length === 0) {
        return null;
      }

      return {
        id: divisionId,
        title: roles[0]?.divisionTitle || "未分组",
        count: roles.length,
        roles,
      } satisfies AgencyRosterDivision;
    })
    .filter((division): division is AgencyRosterDivision => Boolean(division));
}

const agencyRoster = parseAgencyRoster(agencyAgentManifest.rosterZhRaw);
const agencyRoleMap = new Map<string, AgencyRosterRole>(
  agencyRoster.flatMap((division) => division.roles).map((role) => [role.agentId, role]),
);

export function loadAgencyRoster() {
  return agencyRoster;
}

export function loadAgencyRoleMap() {
  return agencyRoleMap;
}

export function loadAgencyRosterManifest() {
  return agencyAgentManifest;
}
