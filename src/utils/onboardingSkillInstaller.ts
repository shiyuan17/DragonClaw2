import { invoke } from "@tauri-apps/api/core";
import type {
  OnboardingSkillInstallDiagnostics,
  OnboardingSkillInstallResultItem,
  OnboardingSkillInstallState,
  SkillHubCommandResult,
  SkillHubInstallRuntimeInfo,
  SkillInfo,
} from "../types";

type OnboardingTargetSkillSource = "skillhub" | "github";

type OnboardingTargetSkill = {
  displayName: string;
  aliases: readonly string[];
  source: OnboardingTargetSkillSource;
  skillhubSlugCandidates?: readonly string[];
  githubRepoUrl?: string;
  githubSkillName?: string;
};

const TARGET_SKILLS = [
  {
    displayName: "Summarize",
    aliases: ["Summarize"],
    source: "skillhub",
    skillhubSlugCandidates: ["summarize"],
  },
  {
    displayName: "agent browser",
    aliases: ["agent browser", "agent-browser"],
    source: "skillhub",
    skillhubSlugCandidates: ["agent-browser"],
  },
  {
    displayName: "imap-smtp-email",
    aliases: ["imap-smtp-email"],
    source: "skillhub",
    skillhubSlugCandidates: ["imap-smtp-email"],
  },
  {
    displayName: "Humanizer",
    aliases: ["Humanizer", "humanizer"],
    source: "skillhub",
    skillhubSlugCandidates: ["humanizer"],
  },
  {
    displayName: "opencli-agent",
    aliases: ["opencli-agent", "opencli-adapter-author", "opencli"],
    source: "github",
    githubRepoUrl: "jackwener/opencli",
    githubSkillName: "opencli-adapter-author",
  },
  {
    displayName: "html-ppt-skill",
    aliases: ["html-ppt-skill", "html-ppt"],
    source: "github",
    githubRepoUrl: "https://github.com/lewislulu/html-ppt-skill",
  },
] as const satisfies readonly OnboardingTargetSkill[];

type ExecuteOnboardingSkillInstallOptions = {
  servicePort: number;
  addLog: (level: string, message: string) => void;
  onProgress: (message: string, percent: number) => void;
};

function normalizeSkillName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isInstalledSkill(installedNames: string[], aliases: readonly string[]) {
  const normalizedInstalled = installedNames.map(normalizeSkillName);
  const normalizedAliases = aliases.map(normalizeSkillName).filter(Boolean);

  return normalizedAliases.some((expected) =>
    normalizedInstalled.some((name) => name === expected || name.includes(expected) || expected.includes(name)),
  );
}

function getPreferredSkillHubSlug(skill: OnboardingTargetSkill) {
  const slug = skill.skillhubSlugCandidates?.find((candidate) => candidate.trim().length > 0);
  if (!slug) {
    throw new Error(`${skill.displayName} 缺少 SkillHub slug 配置`);
  }
  return slug;
}

function getGithubRepoUrl(skill: OnboardingTargetSkill) {
  const repoUrl = skill.githubRepoUrl?.trim();
  if (!repoUrl) {
    throw new Error(`${skill.displayName} 缺少 GitHub 仓库配置`);
  }
  return repoUrl;
}

function summarizeCommandResult(result: SkillHubCommandResult) {
  const parts = [result.stdout.trim(), result.stderr.trim()].filter(Boolean);
  return parts.join("\n\n").trim() || "安装完成";
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

function toErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

async function getInstalledSkillNames() {
  const installedSkills = await invoke<SkillInfo[]>("list_skills").catch(() => []);
  return installedSkills.map((skill) => skill.name);
}

async function getSkillHubRuntimeInfo() {
  return invoke<SkillHubInstallRuntimeInfo>("get_skillhub_install_runtime_info");
}

function formatSkillHubRuntimeLabel(runtimeInfo: SkillHubInstallRuntimeInfo) {
  switch (runtimeInfo.installMode) {
    case "bash-shell":
      return `bash ${runtimeInfo.bashVersion || "available"}${runtimeInfo.isWslBash ? " (WSL)" : ""}`;
    case "windows-native":
      return `windows-native via ${runtimeInfo.pythonVersion || "python"}`;
    default:
      return runtimeInfo.pythonAvailable ? "unavailable (missing bash)" : "unavailable (missing bash and python)";
  }
}

export async function markOnboardingSkillInstallRequired() {
  await saveOnboardingSkillInstallState(createPendingState());
}

export async function shouldRunOnboardingSkillInstall() {
  const state = await getOnboardingSkillInstallState();
  return state.required && !state.completed && !state.skipped;
}

export async function startOnboardingSkillInstallBackground() {
  return invoke<OnboardingSkillInstallState>("start_onboarding_skill_install_background");
}

export async function runOnboardingSkillInstall({
  servicePort,
  addLog,
  onProgress,
}: ExecuteOnboardingSkillInstallOptions) {
  void servicePort;

  const results: OnboardingSkillInstallResultItem[] = [];
  await saveOnboardingSkillInstallState(createPendingState());

  try {
    onProgress("正在检查 SkillHub 安装环境...", 98);
    const runtimeInfo = await getSkillHubRuntimeInfo();
    const runtimeLabel = formatSkillHubRuntimeLabel(runtimeInfo);
    addLog("info", `SkillHub installer runtime: ${runtimeLabel}`);

    onProgress("正在安装 SkillHub...", 98);
    addLog("info", "开始运行 SkillHub 官方安装器");

    try {
      const skillHubResult = await invoke<SkillHubCommandResult>("install_official_skillhub");
      results.push({
        name: "SkillHub",
        status: "installed",
        detail: summarizeCommandResult(skillHubResult),
      });
      addLog("success", "SkillHub 官方安装完成");
    } catch (error) {
      const detail = toErrorDetail(error);
      results.push({ name: "SkillHub", status: "failed", detail });
      addLog("error", `SkillHub 官方安装失败: ${detail}`);

      for (const skill of TARGET_SKILLS) {
        results.push({
          name: skill.displayName,
          status: "failed",
          detail: "SkillHub 官方安装未完成，后续技能未执行",
        });
      }

      await saveOnboardingSkillInstallState(buildResultState(results));
      return {
        results,
        summaryMessage: buildFailureSummary(results),
      };
    }

    onProgress("正在校验 SkillHub 官方安装结果...", 98);
    const diagnostics = await getOnboardingSkillInstallDiagnostics().catch(() => null);
    if (diagnostics && !diagnostics.skillHubInstalled) {
      addLog("warn", "SkillHub 安装命令已返回成功，但诊断未确认官方安装产物。");
    }

    let installedNames = await getInstalledSkillNames();

    for (let index = 0; index < TARGET_SKILLS.length; index += 1) {
      const skill = TARGET_SKILLS[index];
      const progress = 98 + Math.min(1, (index + 1) / TARGET_SKILLS.length);
      const installerLabel = skill.source === "github" ? "GitHub" : "SkillHub";

      if (isInstalledSkill(installedNames, skill.aliases)) {
        results.push({
          name: skill.displayName,
          status: "installed",
          detail: "已在本地技能目录中检测到该技能",
        });
        addLog("info", `${skill.displayName} 已存在，跳过重复安装`);
        continue;
      }

      onProgress(`${installerLabel} 正在安装 ${skill.displayName}...`, progress);
      addLog("info", `开始通过 ${installerLabel} 安装 ${skill.displayName}`);

      try {
        const installResult =
          skill.source === "github"
            ? await invoke<SkillHubCommandResult>("install_github_skill_from_url", {
                repoUrl: getGithubRepoUrl(skill),
                displayName: skill.displayName,
                skillName: "githubSkillName" in skill ? skill.githubSkillName ?? null : null,
              })
            : await invoke<SkillHubCommandResult>("install_skillhub_recommended_skill", {
                slug: getPreferredSkillHubSlug(skill),
                displayName: skill.displayName,
              });
        results.push({
          name: skill.displayName,
          status: "installed",
          detail: summarizeCommandResult(installResult),
        });
        addLog("success", `${skill.displayName} 安装完成`);
      } catch (error) {
        const detail = toErrorDetail(error);
        results.push({
          name: skill.displayName,
          status: "failed",
          detail,
        });
        addLog("error", `${skill.displayName} 安装失败: ${detail}`);
      }

      installedNames = await getInstalledSkillNames();
    }
  } catch (error) {
    const detail = toErrorDetail(error);
    addLog("error", `首次技能安装流程异常: ${detail}`);

    const pendingNames = ["SkillHub", ...TARGET_SKILLS.map((item) => item.displayName)].filter(
      (name) => !results.some((item) => item.name === name),
    );
    for (const name of pendingNames) {
      results.push({
        name,
        status: "failed",
        detail,
      });
    }
  }

  await saveOnboardingSkillInstallState(buildResultState(results));

  return {
    results,
    summaryMessage: buildFailureSummary(results),
  };
}
