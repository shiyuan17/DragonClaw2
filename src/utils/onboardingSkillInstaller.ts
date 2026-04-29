import { invoke } from "@tauri-apps/api/core";
import { WorkspaceGatewayClient, buildGatewayUrl } from "../components/workspace-clone/workspaceCloneGateway";
import type {
  CurrentConfig,
  OnboardingSkillInstallDiagnostics,
  OnboardingSkillInstallResultItem,
  OnboardingSkillInstallState,
} from "../types";

const DEFAULT_GATEWAY_TOKEN = "openclaw-launcher-local";
const MAIN_AGENT_ID = "main";
const MAIN_SESSION_KEY = "agent:main:main";
const SKILLHUB_NAME = "SkillHub";
const SKILLHUB_FALLBACK_SLUG = "skill-hub";

const TARGET_SKILLS = [
  "Summarize",
  "agent browser",
  "imap-smtp-email",
  "opencli",
  "Humanizer",
] as const;

type GatewayEventFrame = {
  event: string;
  payload?: unknown;
};

type GatewayChatPayload = {
  runId?: unknown;
  sessionKey?: unknown;
  state?: unknown;
  message?: unknown;
  errorMessage?: unknown;
};

type SkillStatusRow = {
  name?: unknown;
};

type SkillHubBootstrapSpec = {
  name: string;
  slug?: string;
  installId: string;
  resolvedFrom: "search" | "detail";
};

type ExecuteOnboardingSkillInstallOptions = {
  servicePort: number;
  addLog: (level: string, message: string) => void;
  onProgress: (message: string, percent: number) => void;
};

type GatewayClientContext = {
  client: WorkspaceGatewayClient;
  subscribe: (listener: (event: GatewayEventFrame) => void) => () => void;
};

function normalizeSkillName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function createDefaultState(): OnboardingSkillInstallState {
  return {
    required: false,
    completed: false,
    skipped: false,
    results: [],
    lastAttemptAt: null,
  };
}

function createPendingState(): OnboardingSkillInstallState {
  return {
    required: true,
    completed: false,
    skipped: false,
    results: [],
    lastAttemptAt: Date.now(),
  };
}

function buildResultState(results: OnboardingSkillInstallResultItem[]): OnboardingSkillInstallState {
  const completed = results.length > 0 && results.every((item) => item.status === "installed");
  return {
    required: !completed,
    completed,
    skipped: false,
    results,
    lastAttemptAt: Date.now(),
  };
}

function buildFailureSummary(results: OnboardingSkillInstallResultItem[]) {
  const failed = results.filter((item) => item.status !== "installed");
  if (failed.length === 0) {
    return "推荐技能安装完成，正在进入 DragonClaw...";
  }

  return `部分技能安装失败：${failed.map((item) => item.name).join("、")}，正在进入 DragonClaw...`;
}

function extractTextFromContentBlock(block: unknown): string {
  if (typeof block === "string") {
    return block;
  }

  if (!block || typeof block !== "object") {
    return "";
  }

  const candidate = block as {
    text?: unknown;
    content?: unknown;
    input?: unknown;
    output?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }
  if (typeof candidate.content === "string") {
    return candidate.content;
  }
  if (typeof candidate.input === "string") {
    return candidate.input;
  }
  if (typeof candidate.output === "string") {
    return candidate.output;
  }

  return "";
}

function extractGatewayMessageText(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (!message || typeof message !== "object") {
    return "";
  }

  const candidate = message as {
    text?: unknown;
    content?: unknown;
    message?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content.map(extractTextFromContentBlock).filter(Boolean).join("\n\n");
  }

  if (candidate.message) {
    return extractGatewayMessageText(candidate.message);
  }

  return "";
}

function buildInstallPrompt(skillName: string) {
  return [
    "Use only the installed SkillHub skill to install exactly one skill for this agent.",
    `Target skill: ${skillName}.`,
    "Do not install any other skill.",
    "Continue only with SkillHub / skillhub.cn.",
    `Reply with one short line in English: SUCCESS: ${skillName} or FAILED: ${skillName} - <reason>.`,
  ].join(" ");
}

function resolveSearchItems(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as {
    items?: unknown;
    skills?: unknown;
    results?: unknown;
  };

  if (Array.isArray(candidate.items)) {
    return candidate.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (Array.isArray(candidate.skills)) {
    return candidate.skills.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (Array.isArray(candidate.results)) {
    return candidate.results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  return [];
}

function extractInstallIdFromValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const next = extractInstallIdFromValue(item);
      if (next) {
        return next;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    installId?: unknown;
    install?: unknown;
    installs?: unknown;
  };

  if (typeof candidate.installId === "string" && candidate.installId.trim()) {
    return candidate.installId.trim();
  }
  if (typeof candidate.id === "string" && candidate.id.trim()) {
    return candidate.id.trim();
  }

  return extractInstallIdFromValue(candidate.install ?? candidate.installs);
}

function resolveSkillHubSearchMatch(items: Array<Record<string, unknown>>) {
  return items.find((item) => {
    const values = [item.slug, item.name, item.id, item.title]
      .filter((value): value is string => typeof value === "string");

    return values.some((value) => {
      const normalized = normalizeSkillName(value);
      return normalized === normalizeSkillName(SKILLHUB_NAME) || normalized === normalizeSkillName(SKILLHUB_FALLBACK_SLUG);
    });
  });
}

function resolveSkillHubName(item: Record<string, unknown>) {
  const values = [item.name, item.title, item.slug, item.id]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return values[0]?.trim() || SKILLHUB_NAME;
}

function resolveSkillHubSlug(item: Record<string, unknown>) {
  const values = [item.slug, item.id]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return values[0]?.trim();
}

function isSkillInstalled(installedNames: string[], expectedName: string) {
  const normalizedInstalled = installedNames.map(normalizeSkillName);
  const expected = normalizeSkillName(expectedName);

  if (normalizedInstalled.includes(expected)) {
    return true;
  }

  if (expectedName === "agent browser") {
    return normalizedInstalled.some((name) => name.includes("agentbrowser"));
  }

  return normalizedInstalled.some((name) => name.includes(expected) || expected.includes(name));
}

async function getOnboardingSkillInstallState() {
  try {
    return await invoke<OnboardingSkillInstallState>("get_onboarding_skill_install_state");
  } catch {
    return createDefaultState();
  }
}

export async function getOnboardingSkillInstallDiagnostics() {
  return invoke<OnboardingSkillInstallDiagnostics>("get_onboarding_skill_install_diagnostics");
}

async function saveOnboardingSkillInstallState(state: OnboardingSkillInstallState) {
  return invoke<OnboardingSkillInstallState>("save_onboarding_skill_install_state", { state });
}

async function getGatewayToken() {
  const currentConfig = await invoke<CurrentConfig>("get_current_config");
  return currentConfig.gateway_token?.trim() || DEFAULT_GATEWAY_TOKEN;
}

async function connectGatewayClient(servicePort: number, token: string) {
  const listeners = new Set<(event: GatewayEventFrame) => void>();

  return new Promise<GatewayClientContext>((resolve, reject) => {
    let settled = false;
    let clientRef: WorkspaceGatewayClient | null = null;

    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clientRef?.stop();
      reject(new Error("连接本地 gateway 超时"));
    }, 15000);

    const client = new WorkspaceGatewayClient({
      url: buildGatewayUrl(servicePort),
      token,
      onConnected: () => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({
          client,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        });
      },
      onEvent: (event) => {
        for (const listener of listeners) {
          listener(event as GatewayEventFrame);
        }
      },
      onDisconnected: (message) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        reject(new Error(message || "本地 gateway 连接已断开"));
      },
    });

    clientRef = client;
    client.start();
  });
}

async function loadSkillHubBootstrapSpec(client: WorkspaceGatewayClient): Promise<SkillHubBootstrapSpec> {
  const payload = await client.request<unknown>("skills.search", {
    query: SKILLHUB_NAME,
  });
  const items = resolveSearchItems(payload);
  const exactMatch = resolveSkillHubSearchMatch(items);

  if (!exactMatch) {
    throw new Error("skills.search 未找到 SkillHub");
  }

  const name = resolveSkillHubName(exactMatch);
  const slug = resolveSkillHubSlug(exactMatch);
  const searchInstallId = extractInstallIdFromValue(exactMatch);

  if (searchInstallId) {
    return {
      name,
      slug,
      installId: searchInstallId,
      resolvedFrom: "search",
    };
  }

  if (!slug) {
    throw new Error("SkillHub 搜索结果缺少 slug，无法继续解析 installId");
  }

  const detailPayload = await client.request<unknown>("skills.detail", { slug });
  const detailRecord = detailPayload && typeof detailPayload === "object"
    ? detailPayload as Record<string, unknown>
    : {};
  const installId = extractInstallIdFromValue(detailRecord.skill) ?? extractInstallIdFromValue(detailRecord);

  if (!installId) {
    throw new Error("SkillHub 详情中未找到 installId");
  }

  return {
    name,
    slug,
    installId,
    resolvedFrom: "detail",
  };
}

async function installMarketplaceSkill(client: WorkspaceGatewayClient, spec: SkillHubBootstrapSpec) {
  return client.request<unknown>("skills.install", {
    name: spec.name,
    installId: spec.installId,
  });
}

async function getInstalledSkillNames(client: WorkspaceGatewayClient) {
  const payload = await client.request<{ skills?: SkillStatusRow[] }>("skills.status", {});
  const skills = payload && typeof payload === "object" && Array.isArray(payload.skills)
    ? payload.skills
    : [];

  return skills
    .map((item) => (typeof item.name === "string" ? item.name : ""))
    .filter(Boolean);
}

function resolveInstalledSkillName(installedNames: string[], expectedName: string) {
  return installedNames.find((name) => isSkillInstalled([name], expectedName)) || expectedName;
}

async function enableSkillForMain(skillName: string) {
  const currentConfig = await invoke<{ selectedSkillNames: string[] }>("get_agent_skill_config", {
    agentId: MAIN_AGENT_ID,
  });
  const nextSkillNames = [...new Set([...(currentConfig.selectedSkillNames || []), skillName])];

  await invoke("save_agent_skill_config", {
    agentId: MAIN_AGENT_ID,
    skillNames: nextSkillNames,
  });
}

async function resetMainSession(client: WorkspaceGatewayClient) {
  await client.request("sessions.reset", { key: MAIN_SESSION_KEY });
}

async function sendSkillInstallMessage(context: GatewayClientContext, skillName: string) {
  const runId = crypto.randomUUID();
  let latestText = "";

  return new Promise<{ ok: boolean; message: string }>((resolve) => {
    let settled = false;
    let timeoutId = 0;
    let unsubscribe = () => {};

    const finish = (value: { ok: boolean; message: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
      resolve(value);
    };

    unsubscribe = context.subscribe((event) => {
      if (event.event !== "chat" || !event.payload || typeof event.payload !== "object") {
        return;
      }

      const payload = event.payload as GatewayChatPayload;
      if (payload.sessionKey !== MAIN_SESSION_KEY || payload.runId !== runId) {
        return;
      }

      if (payload.state === "delta") {
        const nextText = extractGatewayMessageText(payload.message).trim();
        if (nextText) {
          latestText = nextText;
        }
        return;
      }

      if (payload.state === "error") {
        finish({
          ok: false,
          message: typeof payload.errorMessage === "string" ? payload.errorMessage : `SkillHub 安装 ${skillName} 失败`,
        });
        return;
      }

      if (payload.state === "final") {
        finish({
          ok: true,
          message: extractGatewayMessageText(payload.message).trim() || latestText || `SkillHub 已完成 ${skillName} 安装请求`,
        });
      }
    });

    timeoutId = window.setTimeout(() => {
      finish({
        ok: false,
        message: `SkillHub 安装 ${skillName} 超时`,
      });
    }, 120000);

    void context.client.request("chat.send", {
      sessionKey: MAIN_SESSION_KEY,
      message: buildInstallPrompt(skillName),
      deliver: false,
      idempotencyKey: runId,
    }).catch((error) => {
      finish({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export async function markOnboardingSkillInstallRequired() {
  await saveOnboardingSkillInstallState(createPendingState());
}

export async function shouldRunOnboardingSkillInstall() {
  const state = await getOnboardingSkillInstallState();
  return state.required && !state.completed && !state.skipped;
}

export async function runOnboardingSkillInstall({
  servicePort,
  addLog,
  onProgress,
}: ExecuteOnboardingSkillInstallOptions) {
  const results: OnboardingSkillInstallResultItem[] = [];
  await saveOnboardingSkillInstallState(createPendingState());

  let context: GatewayClientContext | null = null;

  try {
    onProgress("正在连接本地网关，准备安装推荐技能...", 98);
    const token = await getGatewayToken();
    context = await connectGatewayClient(servicePort, token);

    onProgress("正在安装 SkillHub...", 98);
    addLog("info", "开始安装 SkillHub");

    try {
      const skillHubSpec = await loadSkillHubBootstrapSpec(context.client);
      addLog(
        "info",
        `SkillHub search 命中: ${skillHubSpec.name}${skillHubSpec.slug ? ` (${skillHubSpec.slug})` : ""}`,
      );
      addLog("info", `SkillHub installId 已通过${skillHubSpec.resolvedFrom === "search" ? "搜索结果" : "详情接口"}解析`);
      await installMarketplaceSkill(context.client, skillHubSpec);
      const installedNames = await getInstalledSkillNames(context.client).catch(() => []);
      if (!isSkillInstalled(installedNames, SKILLHUB_NAME)) {
        throw new Error("SkillHub 安装请求返回成功，但 skills.status 中未看到 SkillHub");
      }
      const resolvedSkillHubName = resolveInstalledSkillName(installedNames, SKILLHUB_NAME);
      await enableSkillForMain(resolvedSkillHubName);
      await resetMainSession(context.client).catch(() => undefined);
      results.push({ name: SKILLHUB_NAME, status: "installed" });
      addLog("success", "SkillHub 安装并启用完成");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ name: SKILLHUB_NAME, status: "failed", detail });
      addLog("error", `SkillHub 安装失败: ${detail}`);

      for (const skillName of TARGET_SKILLS) {
        results.push({
          name: skillName,
          status: "failed",
          detail: "SkillHub 未安装成功，后续技能未执行",
        });
      }

      await saveOnboardingSkillInstallState(buildResultState(results));

      return {
        results,
        summaryMessage: buildFailureSummary(results),
      };
    }

    for (let index = 0; index < TARGET_SKILLS.length; index += 1) {
      const skillName = TARGET_SKILLS[index];
      const progress = 98 + Math.min(1, (index + 1) / TARGET_SKILLS.length);
      onProgress(`SkillHub 正在安装 ${skillName}...`, progress);
      addLog("info", `开始通过 SkillHub 安装 ${skillName}`);

      const chatResult = await sendSkillInstallMessage(context, skillName);
      const installedNames = await getInstalledSkillNames(context.client).catch(() => []);

      if (isSkillInstalled(installedNames, skillName)) {
        results.push({
          name: skillName,
          status: "installed",
          detail: chatResult.message,
        });
        addLog("success", `${skillName} 安装完成`);
      } else {
        results.push({
          name: skillName,
          status: "failed",
          detail: chatResult.message || `${skillName} 未出现在已安装技能列表中`,
        });
        addLog("error", `${skillName} 安装失败: ${chatResult.message || "未通过 skills.status 校验"}`);
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    addLog("error", `首次技能安装流程异常: ${detail}`);

    const pendingNames = [SKILLHUB_NAME, ...TARGET_SKILLS].filter(
      (name) => !results.some((item) => item.name === name),
    );
    for (const name of pendingNames) {
      results.push({
        name,
        status: "failed",
        detail,
      });
    }
  } finally {
    if (context) {
      await resetMainSession(context.client).catch(() => undefined);
      context.client.stop();
    }
  }

  await saveOnboardingSkillInstallState(buildResultState(results));

  return {
    results,
    summaryMessage: buildFailureSummary(results),
  };
}
