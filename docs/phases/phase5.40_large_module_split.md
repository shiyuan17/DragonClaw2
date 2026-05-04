# Phase 5.40: Large Module Split

> Status: Implementing
> Date: 2026-05-04
> Type: Architecture refactor / module boundary cleanup

## Goal

Refactor the current homepage chat, ready-workspace page, and channel backend into smaller internal modules without changing product behavior, Tauri command signatures, or frontend `invoke()` contracts.

## Implementation Scope

### 1. Workspace Gateway Chat Split

- Keep [`src/hooks/useWorkspaceGatewayChat.ts`](../../src/hooks/useWorkspaceGatewayChat.ts) as the public hook entry.
- Move internal non-React logic into `src/hooks/workspace-gateway/`.
- Split responsibilities into:
  - `client.ts`: WebSocket client, request lifecycle, gateway type guards, session key helpers.
  - `message-normalizers.ts`: gateway message normalization, title derivation, last-message summaries.
  - `live-steps.ts`: live timeline normalization, dedupe, and post-tool-thinking bridge helpers.
  - `session-cache.ts`: SQLite cache parsing, agent cache mapping, history backfill helpers.
  - `time-formatters.ts`: session time labels and history subtitle formatting.
- Remove the hook's dependency on `src/components/workspace-clone/` for non-UI logic.

### 2. Workspace Ready Page Split

- Keep [`src/components/workspace-clone/WorkspaceClonePage.tsx`](../../src/components/workspace-clone/WorkspaceClonePage.tsx) as the page shell.
- Extract the page-local resource controller logic into `src/hooks/workspace-clone/`:
  - `useWorkspaceMemoryAdmin.ts`
  - `useWorkspaceSkillsAdmin.ts`
  - `useWorkspaceToolsAdmin.ts`
  - `useWorkspaceCommandsAdmin.ts`
- Move existing workspace-specific hooks from `src/components/workspace-clone/` to `src/hooks/workspace-clone/`:
  - `useWorkspaceChannels.ts`
  - `useWorkspaceEmailBinding.ts`
  - `useWorkspaceServiceStartupStatus.ts`
- Preserve existing props, modal behavior, and ready-page layout.

### 3. Channel Backend Split

- Replace the monolithic [`src-tauri/src/channels.rs`](../../src-tauri/src/channels.rs) implementation with a `src-tauri/src/channels/` module tree.
- Keep `mod.rs` as the Tauri command boundary and existing payload type home.
- Split internals into:
  - `config.rs`: channel identifiers, legacy config migration, form values, binding persistence.
  - `qr_session.rs`: session registry, cancel flags, snapshot/log helpers, cleanup.
  - `weixin_plugin.rs`: plugin install plan, version checks, manual install, compatibility patch, plugin readiness.
  - `weixin_qr.rs`: QR fetch/status flow, fallback login, direct flow, result persistence.
  - `feishu.rs`: Feishu onboarding request/poll/result persistence.
- Shared helpers should stay near their primary domain; only cross-cutting helpers go into `shared.rs`.

## Constraints

- Do not change any existing Tauri command name, parameter list, or return type.
- Do not change any frontend `invoke()` payload shape.
- Do not bundle unrelated security, UX, or release fixes into this phase.
- Keep file moves and edits scoped to the three refactor targets.

## Acceptance Criteria

- `npm run build` passes after each subtask.
- Ready workspace opens without import/runtime errors.
- Homepage chat behavior remains unchanged for load, history, agent switch, live timeline, reconnect, and title backfill.
- Memory / skills / tools / commands panels still open, refresh, save, and surface errors correctly.
- Channel list, config form loading/saving, and Weixin / Feishu QR flows still resolve through the same Tauri commands.
- Existing command signatures in [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) remain unchanged.

## Validation

- Frontend:
  - `npm run build`
  - `npm run tauri dev`
  - Manual flow: start service -> open gateway -> chat works
- Rust:
  - Preserve and migrate existing tests around channel key normalization, allow-from parsing, QR session cleanup, and Weixin plugin install planning.
- Regression focus:
  - `prune_workspace_chat_session_cache`
  - `replace_workspace_agent_cache`
  - workspace resource modal save flows
  - channel QR binding entry points
