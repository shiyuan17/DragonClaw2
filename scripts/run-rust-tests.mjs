import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const isWindows = process.platform === "win32";

function getPathKey(env) {
  if (!isWindows) {
    return "PATH";
  }

  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
}

function splitPathEntries(pathValue) {
  return (pathValue ?? "").split(delimiter).filter(Boolean);
}

function executableExists(filePath) {
  return Boolean(filePath) && existsSync(filePath);
}

function cargoExecutableName() {
  return isWindows ? "cargo.exe" : "cargo";
}

function cargoAvailableInPath(pathValue) {
  return splitPathEntries(pathValue).some((entry) =>
    executableExists(join(entry, cargoExecutableName())),
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

  return candidates.find((candidate) => executableExists(join(candidate, cargoExecutableName()))) ?? null;
}

function buildEnv() {
  const env = { ...process.env };
  const pathKey = getPathKey(env);
  const currentPath = env[pathKey] ?? "";

  if (!cargoAvailableInPath(currentPath)) {
    const cargoDir = findCargoBinDir();
    if (!cargoDir) {
      return { env, cargoAvailable: false, cargoDir: null };
    }

    env[pathKey] = currentPath ? `${cargoDir}${delimiter}${currentPath}` : cargoDir;
    return { env, cargoAvailable: true, cargoDir };
  }

  return { env, cargoAvailable: true, cargoDir: null };
}

const { env, cargoAvailable, cargoDir } = buildEnv();

if (!cargoAvailable) {
  console.error(
    "[dragonclaw] Rust/Cargo was not found. Install rustup from https://rustup.rs/ and reopen the terminal.",
  );
  process.exit(1);
}

if (cargoDir) {
  console.log(`[dragonclaw] Added Cargo to PATH for this test run: ${cargoDir}`);
}

const child = spawn(
  cargoExecutableName(),
  ["test", "--manifest-path", "src-tauri/Cargo.toml", "--lib"],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`[dragonclaw] Failed to start cargo test: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
