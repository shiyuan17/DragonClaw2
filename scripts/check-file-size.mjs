import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const softLimits = {
  tsx: 500,
  ts: 300,
  rs: 500,
};

const hardLimits = {
  tsx: 800,
  ts: 500,
  rs: 800,
};

// Existing oversized files are tracked as file-health review items.
// Lines are only a signal: these files may shrink, but they must not grow
// beyond the recorded baseline without an explicit phase exception.
const legacyFileHealthAllowlist = {
  "src/components/workspace-clone/WorkspaceClonePage.tsx": {
    baselineLines: 2021,
    ownerArea: "workspace-clone shell",
    reason: "Main workspace composition surface; currently coordinates several extracted child views.",
    expectedRefactorDirection: "Continue moving self-contained panels, drawers, and pure helpers out of the shell.",
  },
  "src/hooks/useSetup.ts": {
    baselineLines: 573,
    ownerArea: "setup flow",
    reason: "Setup orchestration state machine with tightly coupled user-visible phases.",
    expectedRefactorDirection: "Extract pure step helpers only when behavior is covered by focused tests.",
  },
  "src/hooks/useWorkspaceGatewayChat.ts": {
    baselineLines: 1293,
    ownerArea: "workspace gateway chat",
    reason: "High-touch chat session coordinator with live gateway state and UI bridge behavior.",
    expectedRefactorDirection: "Move session actions, live state, failure handling, and pure message helpers behind stable hooks.",
  },
  "src/hooks/workspace-clone/useWorkspaceChannels.ts": {
    baselineLines: 836,
    ownerArea: "workspace channel bindings",
    reason: "Channel binding hook that coordinates multiple provider-specific UI flows.",
    expectedRefactorDirection: "Extract provider-specific actions and shared normalization helpers.",
  },
  "src-tauri/src/agency_agents.rs": {
    baselineLines: 839,
    ownerArea: "agency agents backend",
    reason: "Agent install/uninstall domain with persistence and migration compatibility in one module.",
    expectedRefactorDirection: "Split storage/migration helpers from command-facing behavior when touched.",
  },
  "src-tauri/src/channels.rs": {
    baselineLines: 2962,
    ownerArea: "legacy channel backend",
    reason: "Legacy channel command surface retained for compatibility.",
    expectedRefactorDirection: "Prefer adding new channel work under src-tauri/src/channels/ modules instead of growing this file.",
  },
  "src-tauri/src/onboarding.rs": {
    baselineLines: 1242,
    ownerArea: "onboarding skill install",
    reason: "Onboarding install orchestration spans SkillHub, GitHub install, diagnostics, and persisted state.",
    expectedRefactorDirection: "Move installer-specific helpers and diagnostics into dedicated modules.",
  },
  "src-tauri/src/service.rs": {
    baselineLines: 1213,
    ownerArea: "OpenClaw service lifecycle",
    reason: "Service lifecycle coordinator with startup, readiness, runtime state, and process management.",
    expectedRefactorDirection: "Extract readiness probing and recovery helpers without changing command contracts.",
  },
};

const scanTargets = [
  { dir: "src", extensions: new Set([".ts", ".tsx"]) },
  { dir: path.join("src-tauri", "src"), extensions: new Set([".rs"]) },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function toRepoPath(fullPath) {
  return path.relative(repoRoot, fullPath).split(path.sep).join("/");
}

function getFileKind(repoPath) {
  if (repoPath.endsWith(".tsx")) {
    return "tsx";
  }
  if (repoPath.endsWith(".ts")) {
    return "ts";
  }
  if (repoPath.endsWith(".rs")) {
    return "rs";
  }
  return null;
}

function countLines(text) {
  if (!text) {
    return 0;
  }
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}

function formatLimitLabel(kind) {
  if (kind === "tsx") {
    return "React page/container";
  }
  if (kind === "ts") {
    return "Hook/service";
  }
  return "Rust module";
}

function classifyFileHealth(check, softLimit, hardLimit, metadata) {
  if (metadata) {
    if (check.lines > metadata.baselineLines) {
      return "legacy baseline exceeded";
    }
    return check.lines > hardLimit ? "legacy baseline" : "review";
  }

  if (check.lines > hardLimit) {
    return "new oversized";
  }

  if (check.lines >= Math.floor(hardLimit * 0.9)) {
    return "near hard limit";
  }

  if (check.lines > softLimit) {
    return "review";
  }

  return "pass";
}

function formatHealthWarning(check, softLimit, hardLimit, metadata) {
  const category = classifyFileHealth(check, softLimit, hardLimit, metadata);
  const base = `${check.repoPath} (${check.label}) is ${check.lines} lines; soft ${softLimit}, hard ${hardLimit}; category: ${category}.`;

  if (!metadata) {
    return `${base} Review whether the file still has one clear responsibility before splitting.`;
  }

  return [
    base,
    `owner: ${metadata.ownerArea}; baseline: ${metadata.baselineLines}; reason: ${metadata.reason}`,
    `direction: ${metadata.expectedRefactorDirection}`,
  ].join(" ");
}

async function collectChecks() {
  const checks = [];
  for (const target of scanTargets) {
    const rootDir = path.join(repoRoot, target.dir);
    const files = await walk(rootDir);
    for (const fullPath of files) {
      const ext = path.extname(fullPath);
      if (!target.extensions.has(ext)) {
        continue;
      }
      const repoPath = toRepoPath(fullPath);
      const kind = getFileKind(repoPath);
      if (!kind) {
        continue;
      }
      const content = await readFile(fullPath, "utf8");
      checks.push({
        kind,
        label: formatLimitLabel(kind),
        lines: countLines(content),
        repoPath,
      });
    }
  }
  return checks.sort((a, b) => b.lines - a.lines || a.repoPath.localeCompare(b.repoPath));
}

function mainStatusMessage(title, items) {
  if (items.length === 0) {
    return null;
  }
  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

const checks = await collectChecks();
const warnings = [];
const failures = [];

for (const check of checks) {
  const softLimit = softLimits[check.kind];
  const hardLimit = hardLimits[check.kind];
  const metadata = legacyFileHealthAllowlist[check.repoPath];

  if (check.lines > softLimit) {
    warnings.push(formatHealthWarning(check, softLimit, hardLimit, metadata));
  }

  if (metadata && check.lines > metadata.baselineLines) {
    failures.push(
      `${check.repoPath} grew from legacy baseline ${metadata.baselineLines} to ${check.lines}; hard limit ${hardLimit}; owner: ${metadata.ownerArea}.`,
    );
    continue;
  }

  if (check.lines <= hardLimit) {
    continue;
  }

  if (metadata == null) {
    failures.push(
      `${check.repoPath} (${check.label}) is ${check.lines} lines; hard limit ${hardLimit}; category: new oversized; status: over hard limit.`,
    );
  }
}

const warningBlock = mainStatusMessage("File health review warnings:", warnings);
if (warningBlock) {
  console.warn(warningBlock);
}

const failureBlock = mainStatusMessage("File health check failed:", failures);
if (failureBlock) {
  console.error(failureBlock);
  process.exit(1);
}

console.log("File health check passed.");
