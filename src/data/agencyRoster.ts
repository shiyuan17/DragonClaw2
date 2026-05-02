import agencyAgentManifestRaw from "./agency-agents.json";
import type {
  AgencyAgentInfo,
  AgencyAgentInfoRecord,
  AgencyAgentManifest,
  AgencyRosterDivision,
  AgencyRosterRole,
} from "../types";

const agencyAgentManifest = agencyAgentManifestRaw as AgencyAgentManifest;

const DIVISION_FILTER_ALL = "__all__";

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

function normalizeInfo(info: AgencyAgentInfo | undefined) {
  const name = typeof info?.name === "string" ? info.name.trim() : "";
  const mission = typeof info?.mission === "string" ? info.mission.trim() : "";
  const workflow = Array.isArray(info?.workflow)
    ? info.workflow
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const tags = Array.isArray(info?.tags)
    ? info.tags
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return { name, mission, workflow, tags };
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

const infoIndex = buildInfoIndex(agencyAgentManifest.agentInfos);

function resolveRoleDetail(agentId: string, fallbackName: string, fallbackDescription: string) {
  const zhInfo = normalizeInfo(infoIndex.zh.get(agentId));
  const enInfo = normalizeInfo(infoIndex.en.get(agentId));
  const preferred = zhInfo.name || zhInfo.mission || zhInfo.workflow.length > 0 ? zhInfo : enInfo;

  return {
    locale: preferred === zhInfo ? "zh" : preferred === enInfo ? "en" : "zh",
    name: preferred.name || fallbackName,
    description: preferred.mission || preferred.workflow.slice(0, 2).join(" / ") || fallbackDescription,
    tags: preferred.tags,
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
