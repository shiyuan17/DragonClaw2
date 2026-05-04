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

// Existing oversized files are tracked here as active debt targets.
// They may shrink, but they must not grow without an explicit phase exception.
const legacyOversizedBaselines = {
  "src/components/workspace-clone/WorkspaceClonePage.tsx": 2021,
  "src/hooks/useSetup.ts": 593,
  "src/hooks/useWorkspaceGatewayChat.ts": 1293,
  "src/hooks/workspace-clone/useWorkspaceChannels.ts": 1150,
  "src-tauri/src/agency_agents.rs": 839,
  "src-tauri/src/channels.rs": 2962,
  "src-tauri/src/onboarding.rs": 1242,
  "src-tauri/src/service.rs": 1213,
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
  const baseline = legacyOversizedBaselines[check.repoPath];

  if (check.lines > softLimit) {
    warnings.push(
      `${check.repoPath} (${check.label}) is ${check.lines} lines; soft limit ${softLimit}.`,
    );
  }

  if (check.lines <= hardLimit) {
    continue;
  }

  if (baseline == null) {
    failures.push(
      `${check.repoPath} (${check.label}) is ${check.lines} lines; hard limit ${hardLimit}.`,
    );
    continue;
  }

  if (check.lines > baseline) {
    failures.push(
      `${check.repoPath} grew from legacy baseline ${baseline} to ${check.lines}; hard limit ${hardLimit}.`,
    );
  }
}

const warningBlock = mainStatusMessage("Large-file warnings:", warnings);
if (warningBlock) {
  console.warn(warningBlock);
}

const failureBlock = mainStatusMessage("Large-file check failed:", failures);
if (failureBlock) {
  console.error(failureBlock);
  process.exit(1);
}

console.log("Large-file check passed.");
