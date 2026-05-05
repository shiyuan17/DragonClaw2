# Phase 5.47: IA, Test, and Governance Follow-through

> Status: Planned
> Date: 2026-05-05
> Type: UX governance / test hardening

## Goal

Tighten information architecture, add regression guardrails around the highest-risk startup/config/channel/chat flows, and keep large-file / encoding governance active after the structural refactors.

## Implementation Scope

### 1. Information Architecture

- Reduce top-level exposure of placeholder or not-yet-closed-loop surfaces.
- Add one trustworthy service / connection / config status center in the ready workspace.
- Preserve existing reachable functionality while clarifying what is actually usable now.

### 2. Regression Coverage

- Add focused automated coverage for:
  - startup state transitions
  - config save / restart chain
  - channel binding first-open and completion handling
  - chat session/history switching
- Prefer narrow tests around orchestration helpers and hooks instead of broad snapshot tests.

### 3. Guardrail Maintenance

- Lower `check-file-size` baselines when current debt files shrink.
- Keep `check:encoding`, `check:file-size`, and `build` as mandatory gates for all follow-up phases.

## Constraints

- No breaking API changes.
- Keep IA changes bounded to navigation / exposure / status communication, not a full visual redesign.

## Acceptance Criteria

- Ready workspace exposes a clearer “system truth” for service/config/connection state.
- Key orchestration paths gain automated regression checks.
- Large-file guardrails get stricter as split work lands.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Any new automated tests added in this phase
- Manual smoke test: start service -> open gateway -> chat works.
