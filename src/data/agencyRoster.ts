import agencyAgentIndexRaw from "./agency-agent-index.json";
import type {
  AgencyAgentInfo,
  AgencyAgentTemplate,
  AgencyAgentIndexDivision,
  AgencyAgentIndexManifest,
  AgencyAgentIndexRole,
  AgencyAgentProfile,
  AgencyRosterDefinitionSection,
  AgencyRosterDivision,
  AgencyRosterRole,
  AgencyRosterRoleProfile,
} from "../types";

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

const agencyAgentIndex = agencyAgentIndexRaw as unknown as AgencyAgentIndexManifest;
const agencyTemplateModules = import.meta.glob("./agency-agent-templates/*.json") as Record<
  string,
  () => Promise<{ default: AgencyAgentTemplate }>
>;
const agencyProfileModules = import.meta.glob("./agency-agent-profiles/*.json") as Record<
  string,
  () => Promise<{ default: AgencyAgentProfile }>
>;

const DEFAULT_PERSONALITY_RADAR: Record<string, number> = {
  structure: 80,
  reliability: 80,
  empathy: 70,
  creativity: 70,
  execution: 80,
  system: 80,
};

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
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) {
        return result;
      }
      result[normalizedKey] = Math.min(100, Math.max(0, Math.round(score)));
    }
    return result;
  }, {});
}

function withDefaultPersonalityRadar(radar: Record<string, number>) {
  return Object.entries(DEFAULT_PERSONALITY_RADAR).reduce<Record<string, number>>(
    (result, [key, score]) => {
      result[key] = typeof radar[key] === "number" ? radar[key] : score;
      return result;
    },
    { ...radar },
  );
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

function buildRoleFallbackSections(role: AgencyAgentIndexRole): AgencyRosterDefinitionSection[] {
  return role.definitionPreview || role.description
    ? [{ id: "fallback", label: "定义概览", content: role.definitionPreview || role.description }]
    : [];
}

function toAgencyRosterRole(role: AgencyAgentIndexRole): AgencyRosterRole {
  return {
    ...role,
    definitionSections: buildRoleFallbackSections(role),
  };
}

function toAgencyRosterDivision(division: AgencyAgentIndexDivision): AgencyRosterDivision {
  const roles = division.roles.map(toAgencyRosterRole);
  return {
    id: division.id,
    title: division.title,
    count: division.count,
    roles,
  };
}

function resolvePreferredProfileInfo(profile: AgencyAgentProfile | undefined) {
  const zhInfo = profile?.infos.find((record) => record.locale.trim().toLowerCase().startsWith("zh"))?.info;
  const enInfo = profile?.infos.find((record) => record.locale.trim().toLowerCase().startsWith("en"))?.info;
  const normalizedZhInfo = normalizeInfo(zhInfo);
  const normalizedEnInfo = normalizeInfo(enInfo);
  if (hasMeaningfulInfo(normalizedZhInfo)) {
    return normalizedZhInfo;
  }
  return hasMeaningfulInfo(normalizedEnInfo) ? normalizedEnInfo : normalizedZhInfo;
}

async function loadAgencyProfileSections(agentId: string, fallbackDescription: string) {
  const loadProfile = agencyProfileModules[`./agency-agent-profiles/${agentId}.json`];
  if (!loadProfile) {
    return [];
  }

  const profileModule = await loadProfile();
  return buildFallbackInfoSections(resolvePreferredProfileInfo(profileModule.default), fallbackDescription);
}

function buildFallbackRoleProfile(role?: AgencyRosterRole): AgencyRosterRoleProfile {
  return {
    name: role?.name?.trim() || "",
    mission: role?.description?.trim() || "",
    identity: role?.definitionPreview?.trim() || role?.description?.trim() || "",
    capabilities: [],
    likes: [],
    dislikes: [],
    rules: [],
    workflow: [],
    tags: role?.tags ?? [],
    usageScenarios: [],
    personalityRadar: { ...DEFAULT_PERSONALITY_RADAR },
  };
}

const agencyRoster = agencyAgentIndex.divisions.map(toAgencyRosterDivision);
const agencyRoleMap = new Map<string, AgencyRosterRole>(
  agencyRoster.flatMap((division) => division.roles).map((role) => [role.agentId, role]),
);

export const MAIN_AGENT_DISPLAY_NAME = "主分身";

export function loadAgencyRoster() {
  return agencyRoster;
}

export function loadAgencyRoleMap() {
  return agencyRoleMap;
}

export function resolveAgencyRosterRoleName(agentId: string) {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) {
    return "";
  }

  if (normalizedAgentId === "main") {
    return MAIN_AGENT_DISPLAY_NAME;
  }

  return agencyRoleMap.get(normalizedAgentId)?.name?.trim() || "";
}

export function resolveWorkspaceAgentDisplayName(agentId: string, fallbackName?: string | null) {
  const normalizedAgentId = agentId.trim();
  const rosterName = resolveAgencyRosterRoleName(normalizedAgentId);
  if (rosterName) {
    return rosterName;
  }

  const normalizedFallbackName = fallbackName?.trim() || "";
  if (normalizedFallbackName) {
    return normalizedFallbackName;
  }

  return normalizedAgentId || MAIN_AGENT_DISPLAY_NAME;
}

export async function loadAgencyRoleProfile(agentId: string): Promise<AgencyRosterRoleProfile> {
  const normalizedAgentId = agentId.trim();
  const fallbackRole = agencyRoleMap.get(normalizedAgentId);
  const fallbackProfile = buildFallbackRoleProfile(fallbackRole);
  const loadProfile = agencyProfileModules[`./agency-agent-profiles/${normalizedAgentId}.json`];

  if (!loadProfile) {
    return fallbackProfile;
  }

  const profileModule = await loadProfile();
  const preferredInfo = resolvePreferredProfileInfo(profileModule.default);

  return {
    name: preferredInfo.name || fallbackProfile.name,
    mission: preferredInfo.mission || fallbackProfile.mission,
    identity: preferredInfo.identity || fallbackProfile.identity,
    capabilities: preferredInfo.capabilities,
    likes: preferredInfo.likes,
    dislikes: preferredInfo.dislikes,
    rules: preferredInfo.rules,
    workflow: preferredInfo.workflow,
    tags: preferredInfo.tags.length > 0 ? preferredInfo.tags : fallbackProfile.tags,
    usageScenarios: preferredInfo.usageScenarios,
    personalityRadar: withDefaultPersonalityRadar(preferredInfo.personalityRadar),
  };
}

export async function loadAgencyRoleDefinition(agentId: string) {
  const normalizedAgentId = agentId.trim();
  const fallbackRole = agencyRoleMap.get(normalizedAgentId);
  const loadTemplate = agencyTemplateModules[`./agency-agent-templates/${normalizedAgentId}.json`];

  const templateSections = loadTemplate
    ? await loadTemplate()
        .then((templateModule) => buildTemplateSections(templateModule.default))
        .catch(() => [])
    : [];
  if (templateSections.length > 0) {
    return templateSections;
  }

  const profileSections = await loadAgencyProfileSections(
    normalizedAgentId,
    fallbackRole?.definitionPreview || fallbackRole?.description || "",
  ).catch(() => []);
  if (profileSections.length > 0) {
    return profileSections;
  }

  return fallbackRole?.definitionSections ?? [];
}

export function loadAgencyRosterManifest() {
  return agencyAgentIndex;
}
