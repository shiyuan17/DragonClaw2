# Phase 5.52: Workspace 真实任务管理接入
> Status: Planned
> Date: 2026-05-06
> Type: Frontend + gateway integration

## Background

The current `workspace-clone` right drawer still renders static mock schedule cards. OpenClaw already exposes real cron task management through Gateway RPC methods such as `cron.list`, `cron.update`, `cron.remove`, `cron.run`, and `cron.runs`, so DragonClaw can switch from placeholder data to live task management without introducing new Tauri commands.

## Goal

- Replace the mock task drawer with real OpenClaw cron data.
- Scope the drawer to the currently selected agent.
- Keep the drawer focused on management instead of creation.
- Preserve existing workspace chat, session, and gateway contracts.

## Scope

1. Replace mock task data with Gateway RPC
- Add a dedicated workspace hook to load and manage cron jobs through `useWorkspaceGatewayChat().request()`.
- Normalize `cron.list`, `cron.status`, `cron.update`, `cron.remove`, `cron.run`, and `cron.runs` payloads into frontend task models.
- Filter tasks to the currently selected agent. Jobs without an explicit `agentId` are treated as `main`.

2. Refresh the right drawer task UX
- Keep the existing internal panel key as `schedule` to avoid broader state churn.
- Change visible task copy from `定时任务` to `任务` across the `workspace-clone` surface touched by this flow.
- Keep the dual-tab layout, but use real cron semantics: `启用中` and `已停用`.
- Show real task fields: name, description, schedule summary, next run time, latest run status, and recent run metadata.
- Add per-task actions for enable/disable, edit, run now, and delete.

3. Add task editing without creation
- Reuse the existing modal system for editing.
- Only allow full editing for `systemEvent` cron jobs.
- Keep `agentTurn` tasks visible and manageable for enable/disable, run now, and delete, but do not expose unsupported editing fields.
- Do not add a new-task button or any alternate creation entry in this phase.

4. Replace the related-resource placeholder
- Make the task-related overlay show real task details and recent runs instead of static placeholder tags.
- Keep task details read-only in the related-resource view; editing happens through the dedicated modal.

## Acceptance

- When the Gateway is connected, the right drawer loads real cron jobs for the selected agent.
- The task tabs correctly separate enabled and disabled jobs.
- Toggling enable/disable updates the real cron job and refreshes the drawer state.
- Editing a `systemEvent` task persists through `cron.update` and is visible after reload.
- `立即运行` calls `cron.run` and recent run information is refreshed from `cron.runs`.
- Deleting a task removes it from the live list and it does not reappear after refresh.
- When the Gateway is unavailable, the drawer shows a real unavailable state and does not fall back to mock tasks.
- No Tauri command signature or existing `invoke()` contract changes are introduced.
