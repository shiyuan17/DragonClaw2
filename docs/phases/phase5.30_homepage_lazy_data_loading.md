# Phase 5.30: Homepage Lazy Data Loading
> Status: Planned
> Date: 2026-05-03
> Type: Frontend performance / lazy loading

## Background

After Phase 5.29, employee and SkillHub startup costs were reduced, but the ready homepage still eagerly loads several non-first-screen data sources:

- channel account snapshots and agent list for channel binding
- memory file snapshots
- agent skill configuration, SkillHub status, installed skill list
- agent tool permission configuration
- saved provider configs for the model settings modal
- historical session title backfill via repeated `chat.history`
- derived runtime log list for a drawer that may never be opened

The homepage should only load data needed for the visible chat surface. Menu-specific and modal-specific data should be loaded after the user opens that menu, drawer, or modal.

## Goals

- Keep homepage ready loading limited to gateway connection, `agents.list`, `sessions.list`, and the current session `chat.history`.
- Move logs, memory, skills, tools, channel, model config, and modal data work behind user actions.
- Lazy load heavy drawer and modal components with lightweight skeleton or loading states.
- Preserve all existing Tauri command names, signatures, and frontend invoke payloads.

## Implementation Scope

### 1. Homepage Data Boundary

- Keep `useWorkspaceGatewayChat` as the only eager homepage data source.
- Remove automatic memory, skill, and tool refresh effects from `WorkspaceClonePage`; trigger them only from their modals or related resource actions.
- Add an `enabled` gate to `useWorkspaceChannels`; only enable it when channel UI is selected or the channel management/binding entry is opened.
- Remove eager historical title backfill; load missing history titles when the history drawer is opened.

### 2. Logs And Drawers

- Keep global `service-log` listening and the in-memory log buffer unchanged.
- Stop deriving workspace log rows during default homepage render.
- Lazy load the utility drawer only when a utility panel is open.
- Derive logs, history, schedules, workbench, memory, skills, and tools only for the currently open drawer panel.

### 3. Modal And Non-First-Screen Chunks

- Lazy load overlay/modal stacks and modal-heavy dependencies only when a modal is open.
- Load saved providers only when the model config modal opens.
- Keep employee and SkillHub market lazy loading from Phase 5.29.
- Use skeletons or compact loading panels for slow lazy chunks and data loads.

## Acceptance Criteria

- `npm run build` passes.
- Default ready chunks do not include employee profile/template data, SkillHub market page, memory/skill/tool modal code, QRCode code, or model config modal code.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib` passes.
- Manual check: ready homepage is interactive within 3 seconds.
- Manual check: logs, memory, skills, tools, channels, model config, employees, and SkillHub market load only after their entry is opened.
- `docs/TODO.md` remains unchecked until manual UI acceptance.
