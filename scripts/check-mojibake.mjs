import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ignoredRepoPaths = new Set([
  "scripts/check-mojibake.mjs",
  "src/utils/text-mojibake.ts",
]);

const ignoredDirs = new Set([
  ".git",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".cjs",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const suspiciousChecks = [
  { label: "replacement character", regex: /\uFFFD/u },
  { label: "private-use character", regex: /[\uE000-\uF8FF]/u },
  {
    label: "mojibake token",
    regex:
      /锛\?|銆\?|鏍硅妭鐐|閰嶇疆鏍煎紡|棰戦亾|宸插惎鍔ㄥ井淇＄粦瀹氭祦绋|浜岀淮鐮佸凡鐢熸垚|鍒涘缓鐩綍澶辫触|鍐欏叆涓存椂鏂囦欢澶辫触|鏇挎崲鏂囦欢澶辫触|璇诲彇寰俊鎻掍欢|瑙ｆ瀽寰俊鎻掍欢|寰俊鎻掍欢|鏈壘鍒颁簩缁寸爜浼氳瘽|璁板繂|鎶€鑳藉簱|宸ュ叿鏉冮檺|鎺ㄨ崘鎶€鑳芥湭鍑虹幇鍦ㄤ富宸ヤ綔鍖烘妧鑳藉垪琛ㄤ腑|GitHub 鎶€鑳戒粨搴撲笌棰勬湡涓嶄竴鑷|SkillHub 鎶€鑳藉畨瑁呬换鍔¤皟搴﹀け璐|GitHub 鎶€鑳藉畨瑁呬换鍔¤皟搴﹀け璐|鏋勫缓 npm 鍛戒护澶辫触/u,
  },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRepoPath(fullPath) {
  return path.relative(repoRoot, fullPath).split(path.sep).join("/");
}

function collectMatches(repoPath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const check of suspiciousChecks) {
      const match = line.match(check.regex);
      if (!match) {
        continue;
      }

      findings.push({
        repoPath,
        lineNumber: index + 1,
        label: check.label,
        snippet: line.trim(),
      });
    }
  });

  return findings;
}

const files = await walk(repoRoot);
const findings = [];

for (const fullPath of files) {
  const repoPath = toRepoPath(fullPath);
  if (ignoredRepoPaths.has(repoPath)) {
    continue;
  }

  const content = await readFile(fullPath, "utf8");
  findings.push(...collectMatches(repoPath, content));
}

if (findings.length > 0) {
  console.error("Encoding check failed:");
  for (const finding of findings) {
    console.error(
      `- ${finding.repoPath}:${finding.lineNumber} [${finding.label}] ${finding.snippet}`,
    );
  }
  process.exit(1);
}

console.log("Encoding check passed.");
