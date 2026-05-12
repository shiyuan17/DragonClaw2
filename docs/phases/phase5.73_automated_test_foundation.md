# Phase 5.73: Automated Test Foundation and P0 Regression Guardrails

> Status: In Progress
> Date: 2026-05-12
> Type: Test infrastructure / regression hardening

## Goal

Establish a reliable automated test foundation for DragonClaw without changing existing Tauri command signatures, frontend `invoke()` contracts, or core business behavior.

## Implementation Scope

### 1. Test Foundation

- Add a frontend unit-test stack based on `Vitest + jsdom`.
- Add stable npm entrypoints for frontend tests, Rust tests, coverage, and CI aggregation.
- Add a Windows-safe Rust test wrapper so local runs do not depend on `cargo` already being on `PATH`.
- Add a PR quality workflow that runs on `pull_request` and pushes to `main` / `v2-dev`.

### 2. P0 Frontend Coverage

- Add narrow unit tests for the highest-risk pure frontend logic:
  - `src/hooks/workspace-gateway/message-normalizers.ts`
  - `src/hooks/workspace-gateway/session-cache.ts`
  - `src/hooks/workspace-clone/workspaceChannelBindingShared.ts`
  - `src/hooks/workspace-clone/workspaceCronTaskRunHelpers.ts`
- Cover message normalization, session title fallback, cache filtering, external URL validation, and task run bridging edge cases.
- Avoid snapshot tests and large container-component tests in this phase.

### 3. P0 Rust Coverage

- Add targeted Rust tests for high-risk helper logic that currently lacks direct coverage:
  - `src-tauri/src/download.rs`
  - `src-tauri/src/setup.rs`
  - `src-tauri/src/channels/config.rs`
- Cover download host allowlist, pinned-version zip validation, extracted package validation, default model injection, legacy config migration boundaries, `node_modules` readiness checks, channel alias normalization, allow-from parsing, and legacy account-section migration.

### 4. CI Scope

- Keep the existing release workflow intact for tagged builds.
- Add a separate PR-quality workflow that runs:
  - `npm ci`
  - `npm run test:ci`
- Defer Playwright / Tauri E2E to a later phase once unit-test coverage is stable.

### 5. P1 Coverage Expansion

- Extend frontend coverage into the next-highest-risk pure logic and normalization modules:
  - `src/hooks/workspace-gateway/client.ts`
  - `src/hooks/workspace-gateway/live-steps.ts`
  - `src/services/skillsMarket.ts`
  - `src/components/workspace-clone/workspaceCloneTaskSchedule.ts`
  - `src/components/workspace-clone/workspaceCloneTaskScheduleDisplay.ts`
  - `src/components/workspace-clone/workspaceCloneChatFiles.ts`
  - `src/components/workspace-clone/workspaceCloneChatAttachments.ts`
- Cover gateway payload guards, agent/session formatting fallbacks, live-step status/kind normalization, task schedule parsing/building, skill-market envelope normalization, chat file extraction/categorying, and attachment dedupe / payload extraction boundaries.
- Keep the phase narrow: do not introduce component snapshots, browser automation, or production refactors as part of this tranche.

## Constraints

- No changes to `#[tauri::command]` signatures.
- No changes to frontend `invoke()` payload shapes.
- No opportunistic refactors of large modules.
- If a new test exposes a real bug, document the cause first and fix it minimally.

## Acceptance Criteria

- Frontend unit tests can run locally via npm scripts.
- Rust tests can run locally via a stable wrapper command.
- PR quality checks run automatically on `pull_request` plus pushes to `main` and `v2-dev`.
- P0 frontend and Rust regression tests pass together with existing encoding, file-size, and build gates.
- No production business behavior changes are introduced beyond deterministic bug fixes required by the new tests.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend`
- `npm run test:rust`
- `npm run test:ci`
- `npm run build`
