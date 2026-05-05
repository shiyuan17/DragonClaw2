export type WorkspaceCloneAvatarCategoryId =
  | "career"
  | "pixel"
  | "illustration"
  | "animal"
  | "cute";

export interface WorkspaceCloneAvatarOption {
  id: string;
  label: string;
  category: WorkspaceCloneAvatarCategoryId;
  url: string;
}

export const WORKSPACE_CLONE_AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const workspaceCloneAvatarCategoryTabs: Array<{
  id: WorkspaceCloneAvatarCategoryId;
  label: string;
}> = [
  { id: "career", label: "职业" },
  { id: "pixel", label: "像素" },
  { id: "illustration", label: "插画" },
  { id: "animal", label: "动物" },
  { id: "cute", label: "可爱" },
];

const PRESET_COUNT = 14;
const avatarModules = import.meta.glob("../../assets/avatar/*.{png,jpg,jpeg,webp,avif,svg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const careerAvatarModules = import.meta.glob(
  "../../assets/avatar/bpdm/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    import: "default",
  },
) as Record<string, string>;

const illustrationPool = Object.entries(avatarModules)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, "en", { numeric: true }))
  .map(([, url]) => url)
  .filter((url) => typeof url === "string" && url.trim().length > 0);

const careerPool = Object.entries(careerAvatarModules)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, "en", { numeric: true }))
  .map(([, url]) => url)
  .filter((url) => typeof url === "string" && url.trim().length > 0);

const PIXEL_PALETTES = [
  ["#5f72ff", "#eef2ff", "#1f2448"],
  ["#31b7ff", "#eefaff", "#183243"],
  ["#4cb782", "#effff5", "#183827"],
  ["#ff8e7c", "#fff3ee", "#4d261e"],
  ["#d17dff", "#fbf0ff", "#342049"],
  ["#f3b04f", "#fff7e8", "#4b3520"],
  ["#5cc8c7", "#edffff", "#143635"],
];

const ANIMAL_PRESETS = [
  ["Fox", "#f38b5c", "#fff3ea", "#6c2f17"],
  ["Bear", "#8e6a4c", "#faf0e5", "#433024"],
  ["Cat", "#8f8bf2", "#f3f2ff", "#2f2d61"],
  ["Panda", "#1f2430", "#f5f7fb", "#0b0d12"],
  ["Tiger", "#f2a640", "#fff4e4", "#5e3314"],
  ["Bunny", "#ff8bc2", "#fff1f8", "#62233f"],
  ["Koala", "#9ea8bc", "#f4f7fb", "#3d4757"],
];

const CUTE_PRESETS = [
  ["Bubble", "#6bc8ff", "#eefaff", "#1c3f5a"],
  ["Peach", "#ff9a8f", "#fff3f1", "#5f2a24"],
  ["Mint", "#76d9b0", "#f0fff7", "#204738"],
  ["Berry", "#a986ff", "#f5f0ff", "#31205f"],
  ["Honey", "#f6c765", "#fff7e7", "#574019"],
  ["Blush", "#ff9fd4", "#fff1f8", "#5a2140"],
  ["Cloud", "#9bc2ff", "#eef4ff", "#243a65"],
];

function toDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createPixelAvatar(index: number) {
  const [bg, shirt, ink] = PIXEL_PALETTES[index % PIXEL_PALETTES.length];
  const accent = index % 2 === 0 ? "#ffd7c9" : "#d9c3ff";
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
  <rect width="96" height="96" rx="48" fill="${bg}" />
  <rect x="18" y="18" width="60" height="60" rx="14" fill="rgba(255,255,255,0.18)" />
  <rect x="30" y="24" width="36" height="26" rx="8" fill="#f7d6c2" />
  <rect x="24" y="52" width="48" height="22" rx="8" fill="${shirt}" />
  <rect x="28" y="28" width="40" height="10" rx="5" fill="${ink}" />
  <rect x="36" y="42" width="4" height="4" fill="${ink}" />
  <rect x="56" y="42" width="4" height="4" fill="${ink}" />
  <rect x="44" y="49" width="8" height="3" rx="1.5" fill="${accent}" />
</svg>`;
  return toDataUrl(svg);
}

function createAnimalAvatar(index: number) {
  const [label, base, face, ink] = ANIMAL_PRESETS[index % ANIMAL_PRESETS.length];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="48" fill="${base}" />
  <circle cx="31" cy="28" r="11" fill="${ink}" opacity="0.22" />
  <circle cx="65" cy="28" r="11" fill="${ink}" opacity="0.22" />
  <circle cx="48" cy="50" r="27" fill="${face}" />
  <circle cx="38" cy="46" r="3.2" fill="${ink}" />
  <circle cx="58" cy="46" r="3.2" fill="${ink}" />
  <ellipse cx="48" cy="55" rx="7.5" ry="5.8" fill="${ink}" opacity="0.16" />
  <path d="M42 60c2.2 2.1 4.2 3 6 3s3.8-.9 6-3" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" />
  <text x="48" y="82" text-anchor="middle" font-size="9" font-weight="700" fill="${ink}" opacity="0.7">${label}</text>
</svg>`;
  return toDataUrl(svg);
}

function createCuteAvatar(index: number) {
  const [label, base, face, ink] = CUTE_PRESETS[index % CUTE_PRESETS.length];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="cute-bg-${index}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${base}" />
      <stop offset="100%" stop-color="${face}" />
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="48" fill="url(#cute-bg-${index})" />
  <circle cx="48" cy="46" r="24" fill="rgba(255,255,255,0.92)" />
  <circle cx="39" cy="43" r="3.3" fill="${ink}" />
  <circle cx="57" cy="43" r="3.3" fill="${ink}" />
  <circle cx="33" cy="52" r="3.1" fill="#ffb1c8" opacity="0.7" />
  <circle cx="63" cy="52" r="3.1" fill="#ffb1c8" opacity="0.7" />
  <path d="M43 56c1.9 1.8 3.6 2.6 5 2.6s3.1-.8 5-2.6" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" />
  <text x="48" y="81" text-anchor="middle" font-size="9" font-weight="700" fill="${ink}" opacity="0.7">${label}</text>
</svg>`;
  return toDataUrl(svg);
}

function createAssetOptions(
  category: WorkspaceCloneAvatarCategoryId,
  urls: string[],
  labelPrefix: string,
) {
  return urls.slice(0, PRESET_COUNT).map<WorkspaceCloneAvatarOption>((url, index) => ({
    id: `${category}-${index + 1}`,
    label: `${labelPrefix} ${index + 1}`,
    category,
    url,
  }));
}

function createGeneratedOptions(
  category: WorkspaceCloneAvatarCategoryId,
  labelPrefix: string,
  createUrl: (index: number) => string,
) {
  return Array.from({ length: PRESET_COUNT }, (_, index) => ({
    id: `${category}-${index + 1}`,
    label: `${labelPrefix} ${index + 1}`,
    category,
    url: createUrl(index),
  }));
}

const PRESET_CACHE: Record<WorkspaceCloneAvatarCategoryId, WorkspaceCloneAvatarOption[]> = {
  career: createAssetOptions("career", careerPool, "职业"),
  pixel: createGeneratedOptions("pixel", "像素", createPixelAvatar),
  illustration: createAssetOptions("illustration", illustrationPool, "插画"),
  animal: createGeneratedOptions("animal", "动物", createAnimalAvatar),
  cute: createGeneratedOptions("cute", "可爱", createCuteAvatar),
};

const DEFAULT_ILLUSTRATION_URLS = PRESET_CACHE.illustration
  .map((option) => option.url)
  .filter((url) => typeof url === "string" && url.trim().length > 0);

function hashStringToUint32(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash >>> 0;
}

export function buildWorkspaceCloneAvatarPresetOptions() {
  return {
    career: PRESET_CACHE.career.map((option) => ({ ...option })),
    pixel: PRESET_CACHE.pixel.map((option) => ({ ...option })),
    illustration: PRESET_CACHE.illustration.map((option) => ({ ...option })),
    animal: PRESET_CACHE.animal.map((option) => ({ ...option })),
    cute: PRESET_CACHE.cute.map((option) => ({ ...option })),
  };
}

export function pickWorkspaceCloneDefaultIllustrationAvatar(agentId?: string | null) {
  if (DEFAULT_ILLUSTRATION_URLS.length === 0) {
    return "";
  }

  const normalizedAgentId = (agentId ?? "").trim().toLowerCase();
  if (!normalizedAgentId || normalizedAgentId === "main") {
    return "";
  }

  const hash = hashStringToUint32(normalizedAgentId);
  return DEFAULT_ILLUSTRATION_URLS[hash % DEFAULT_ILLUSTRATION_URLS.length] ?? "";
}
