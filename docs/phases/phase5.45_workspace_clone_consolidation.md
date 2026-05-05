# Phase 5.45: Workspace Clone Consolidation

> Status: Planned
> Date: 2026-05-05
> Type: Frontend module split / orchestrator convergence

## Goal

Continue shrinking the workspace-clone orchestration surface, fix the stale snapshot bug in channel binding, and enforce the large-file guardrails during the split.

## Implementation Scope

### 1. Channel Binding Fact Flow

- Fix `useWorkspaceChannels.openBindingModal` so refresh-dependent decisions use the fresh snapshot returned by `refreshChannels()`.
- Do not keep using stale `snapshot` / `channelGroupMap` values from the old render closure in the same async flow.
- Preserve existing binding modal behavior and command contracts.

### 2. Chat / Workspace Split Follow-through

- Continue splitting `useWorkspaceGatewayChat` into narrower internal modules for:
  - connection/session
  - history/cache
  - compose/stream
  - title/summary / live-step helpers
- Keep `WorkspaceClonePage` as a container/layout assembler and move more controller logic down into hooks/domain helpers.

### 3. Dependency Direction Cleanup

- Remove non-UI imports from `src/components/workspace-clone/` into `src/hooks/`.
- Move workspace pure types / pure helpers into hook- or domain-owned locations.

### 4. Large-File Guardrail Follow-through

- New files created in this phase must remain below hard limits.
- Existing debt files touched in this phase must shrink materially; do not let them grow.
- Update file-size baselines downward where the split reduces current debt.

## Constraints

- No Tauri command signature changes.
- No frontend `invoke()` payload/return shape changes.
- No unrelated visual redesign bundled into the split.

## Acceptance Criteria

- `openBindingModal` no longer auto-starts QR binding from stale config facts.
- Workspace chat and page orchestration files shrink versus current baselines.
- Hook/domain code no longer imports non-UI helpers from the workspace component layer.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - workspace home load;
  - session history switch;
  - live timeline and reconnect;
  - first-open channel binding modal;
  - QR success -> binding save.
