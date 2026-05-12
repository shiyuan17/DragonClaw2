import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const isWindows = process.platform === "win32";

function getPathKey(env) {
  if (!isWindows) {
    return "PATH";
  }

  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
}

function normalizePathEntry(entry) {
  if (!entry) {
    return "";
  }

  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }

  if (!isWindows) {
    return trimmed.replace(/\/+$/, "");
  }

  return trimmed.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

function splitPathEntries(pathValue) {
  return (pathValue ?? "").split(delimiter).filter(Boolean);
}

function pathContainsDirectory(pathValue, targetDir) {
  const normalizedTarget = normalizePathEntry(targetDir);
  if (!normalizedTarget) {
    return false;
  }

  return splitPathEntries(pathValue).some(
    (entry) => normalizePathEntry(entry) === normalizedTarget,
  );
}

function executableExists(filePath) {
  return Boolean(filePath) && existsSync(filePath);
}

function cargoAvailableInPath(pathValue) {
  return splitPathEntries(pathValue).some((entry) =>
    executableExists(join(entry, isWindows ? "cargo.exe" : "cargo")),
  );
}

function findCargoBinDir() {
  const candidates = [];

  if (process.env.CARGO_HOME?.trim()) {
    candidates.push(join(process.env.CARGO_HOME.trim(), "bin"));
  }

  const home = homedir();
  if (home) {
    candidates.push(join(home, ".cargo", "bin"));
  }

  for (const candidate of candidates) {
    if (executableExists(join(candidate, "cargo.exe"))) {
      return candidate;
    }
  }

  return null;
}

function buildTauriEnv() {
  const env = { ...process.env };
  const pathKey = getPathKey(env);
  const currentPath = env[pathKey] ?? "";

  if (!isWindows) {
    return { env, cargoBootstrapped: false, cargoAvailable: true };
  }

  if (cargoAvailableInPath(currentPath)) {
    return { env, cargoBootstrapped: false, cargoAvailable: true };
  }

  const cargoDir = findCargoBinDir();
  if (!cargoDir) {
    return { env, cargoBootstrapped: false, cargoAvailable: false };
  }

  if (pathContainsDirectory(currentPath, cargoDir)) {
    return { env, cargoBootstrapped: false, cargoAvailable: true };
  }

  env[pathKey] = currentPath ? `${cargoDir}${delimiter}${currentPath}` : cargoDir;
  return { env, cargoBootstrapped: true, cargoDir, cargoAvailable: true };
}

function resolveTauriCliScript() {
  return resolve(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
}

const tauriCliScript = resolveTauriCliScript();

if (!executableExists(tauriCliScript)) {
  console.error(
    "[dragonclaw] Could not find @tauri-apps/cli. Run `npm install` before `npm run tauri`.",
  );
  process.exit(1);
}

const { env, cargoBootstrapped, cargoDir, cargoAvailable } = buildTauriEnv();

if (isWindows && cargoBootstrapped) {
  console.log(`[dragonclaw] Added Cargo to PATH for this Tauri run: ${cargoDir}`);
}

if (isWindows && !cargoAvailable) {
  console.error(
    "[dragonclaw] Rust/Cargo was not found. Install rustup from https://rustup.rs/ and reopen the terminal.",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [tauriCliScript, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[dragonclaw] Failed to start Tauri CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
