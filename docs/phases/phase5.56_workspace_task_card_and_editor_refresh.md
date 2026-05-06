# Phase 5.56: Workspace Task Card and Editor Refresh
> Status: Planned
> Date: 2026-05-06
> Type: Frontend visual refresh

## Summary

- Rework the `workspace-clone` task drawer cards and task editor modal without changing any Tauri command, Gateway RPC, `invoke()` contract, task handler, or Rust code.
- Keep the scope limited to the frontend render layer and workspace theme tokens.
- Preserve the compact card redesign already in progress and add one closeout pass for the remaining task drawer usability issues.
- Upgrade manual task `Run now` so it still uses the real OpenClaw `cron.run` path but then opens the real result session in the chat surface instead of stopping at a local queued notice.
- Add a non-blocking per-task running indicator in the drawer so tasks that are truly running can be identified immediately from the list without squeezing the title line.
- Bridge manual `Run now` with a frontend-local optimistic running state so the list can show immediate execution feedback before `runningAtMs` or finished run records come back from OpenClaw.
- Change manual task `Run now` to open a frontend-local task-run conversation immediately, insert a system progress reply, and then keep the real task result attached to that same visible conversation instead of jumping across sessions.
- Calibrate every user-visible task label in this flow to a single display-title helper so raw internal slugs such as `openclaw-daily-update` do not leak into the UI.

## Implementation Changes

### 1. Task Drawer Card Refresh

- Keep the task drawer focused on compact fixed-height cards only. Do not restore the inline recent-runs module or the expanded footer inside the drawer.
- Keep task card click behavior as-is: selecting a task still highlights it and continues loading runs through the existing real logic, but the drawer itself stays compact.
- Show each task as a small card with:
  - left side: task icon, human-readable task title, next execution time, loop summary
  - right side: run-now icon, more-actions icon, and a running-only indicator that lives away from the title
- Keep `task.state.runningAtMs` as the real running source of truth for the running indicator, but allow a short frontend-local optimistic running bridge after manual `Run now`.
- Default task cards should not show any extra status badge.
- Only tasks that are actively running should show a visible indicator with motion treatment.
- When `Run now` returns `ran` or `enqueued`, immediately show the running indicator for that task even if `runningAtMs` has not been written back yet.
- Clear the optimistic running bridge as soon as one of the existing real signals appears:
  - `runningAtMs`
  - a newer finished run record
  - a newer `lastRunAtMs`
  - an 8s fallback timeout
- Keep the title strategy human-readable first:
  - prefer `description` when it is not a slug
  - otherwise prefer `name` when it is not a slug
  - otherwise fall back to the first non-empty payload preview line
  - only use the raw internal name/id when no better label exists
- Reuse that same display title everywhere the user sees the task:
  - task cards
  - task detail header
  - run-now and more-actions `aria-label`
  - task-run conversation title and subtitle
  - task-run system status messages

### 2. Task Filter and Dropdown Closeout

- Fix the `enabled / disabled` filter tabs so they render as stable horizontal pill tabs and can always be switched manually.
- Keep `taskFilter` as the single source of truth for the visible task bucket.
- Initialize the filter only when entering the `schedule` panel or switching to a different Agent:
  - prefer `enabled` when that Agent has enabled tasks
  - otherwise initialize to `disabled`
- After the user clicks `enabled` or `disabled`, preserve that selection across task refreshes and rerenders.
- When the current bucket has no tasks, keep the selected tab active and show the corresponding empty state instead of auto-switching back.
- Isolate the task `more` dropdown from the shared generic menu button styling.
- Render the task menu as one dark floating panel with full-width row items:
  - `Run now`
  - `Pause` or `Enable`
  - `Edit`
  - `Delete`
- Keep all actions wired to the existing real callbacks: `onRunTask`, `onToggleTaskEnabled`, `onEditTask`, `onDeleteTask`.
- Route task action feedback through the existing global feedback center instead of the task drawer inline feedback cards.

### 3. Manual Run Result Flow

- Keep manual `Run now` wired to the real OpenClaw `cron.run` request. Do not replace it with a normal `chat.send` message and do not fake assistant replies in the UI.
- Clicking `Run now` should immediately create a frontend-local task-run conversation with a synthetic key such as `task-run:<jobId>:<timestamp>`.
- The task-run conversation should be selected right away and prepend a system message like `任务「xxx」正在执行中…`.
- Keep the real OpenClaw execution path untouched:
  - call the real `cron.run`
  - refresh `cron.list` / `cron.runs`
  - poll the latest run records during the existing follow-up window
- If `cron.run` returns a `runId`, immediately hand that `runId` to the existing workspace chat live-run state so the task-run conversation can receive real-time agent/tool/chat events before a bound session is resolved.
- If a real result `sessionKey` is found, bind the task-run conversation to that real session instead of navigating away:
  - the visible conversation stays the synthetic task-run conversation
  - its message list becomes `synthetic system messages + real bound session history`
  - the raw bound Gateway session should be hidden from the history list while the synthetic task-run conversation exists, to avoid duplicates
- When the current task-run conversation is still unbound, allow matching Gateway events through by `runId` instead of dropping them only because `currentGatewaySessionKey` is empty.
- If the first matching agent/tool/chat event already carries a real `sessionKey`, bind the synthetic task-run conversation to that session immediately and load history from there; keep `cron.runs` polling as a fallback rather than the primary path.
- If the run is skipped or fails, keep the task-run conversation and replace the running system message with a final system result such as:
  - `任务「xxx」未执行：该任务已在运行中`
  - `任务「xxx」未执行：当前未到执行时机`
  - `任务「xxx」执行失败：...`
- Manual `Run now` always uses this independent task-run conversation experience, regardless of whether the task itself targets `main`, `current`, `isolated`, or `session:<id>`.
- If the follow-up window finds a newer finished run record but still no bindable `sessionKey` / `sessionId`, close the synthetic conversation out with a final status message instead of leaving it in a fake forever-pending state:
  - `ok` -> prefer the returned run `summary`
  - `error` -> show the returned failure text
  - `skipped` -> show the skip reason

### 4. Schedule Display and Editor Rules

- Keep the editor mapping limited to four editable modes:
  - `Once`
  - `Daily`
  - `Weekly`
  - `Monthly`
- Keep the existing rule that advanced cron expressions remain read-only in the editor modal and are not auto-converted.
- Split schedule editability from task card schedule display:
  - the editor still uses schedule parsing only to decide whether a rule is editable
  - the task card must always show a readable trigger summary
- Task card display rules:
  - `at` -> `Once · MM/DD HH:mm`
  - simple cron -> `Daily HH:mm`, `Weekly Wed HH:mm`, `Monthly 15 HH:mm`
  - `every` -> interval wording such as `Every 30 minutes`, `Every 2 hours`
  - common complex cron -> readable expanded summary when possible
  - unsupported complex cron -> `Cron · <expr>` instead of a generic advanced-cron placeholder
- Keep `nextRunAtMs` as the source of truth for the separate `next run` line on the card.

## Public Interfaces / Type Notes

- Do not change any `WorkspaceCron*` public type, Gateway RPC name, request parameter, response shape, or Tauri command signature.
- Only add frontend-local helpers and formatters for:
  - task display-title reuse across drawer/detail/task-run surfaces
  - task filter fallback behavior
  - human-readable task schedule card summaries
  - task run result orchestration and feedback mapping
  - optimistic running-state reconciliation for manual task runs
  - existing modal draft state
- Frontend-local task-run helpers may extend their own session state and lifecycle callbacks to carry:
  - display title
  - accepted `runId`
  - terminal no-session fallback status

## Test Plan

- Documentation flow:
  - update this phase document first
  - update `docs/TODO.md`
  - commit documentation separately from code
- Static checks:
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run build`
- Startup verification:
  - `npm run tauri dev`
- Manual task drawer verification:
  - `enabled / disabled` tabs switch normally
  - clicking `disabled` always switches to the disabled bucket immediately
  - while `disabled` is selected, refreshing the task list does not force the UI back to `enabled`
  - when an Agent has no disabled tasks, the `disabled` tab still stays selected and shows an empty state
  - no inline recent-runs block appears in the drawer
- task cards stay fixed-height and compact
- non-running task cards do not show any extra status badge in the title area
- tasks with `state.runningAtMs` show a running indicator immediately in the list
- tasks accepted by manual `Run now` also show the running indicator immediately, even before `runningAtMs` arrives
- the more-actions menu opens correctly and keeps the real task actions working
- Manual task run verification:
- clicking `Run now` still calls the real `cron.run` path
- the task card, task detail panel, run-now system message, and task-run history row all show the same human-readable title instead of the raw internal slug
- clicking `Run now` immediately opens a new task-run conversation and shows a system `正在执行中` message there
- `ran` and `enqueued` results show a global feedback toast rather than a drawer-local notice card
- `ran` and `enqueued` results also light up the list item with the running indicator immediately
- when `cron.run` returns a `runId`, the task-run conversation starts receiving live timeline/tool/chat updates without waiting for `cron.runs` to backfill a session
- `already-running` / `not-due` / `invalid-spec` results do not leave any stale running indicator behind
- when the latest run exposes a real `sessionKey`, the task-run conversation binds to that session and continues showing the real OpenClaw history inline
- when the first matching live event already exposes a real `sessionKey`, the bind happens immediately and the chat keeps progressing in the same synthetic task-run row
- the chat area shows the prepended synthetic system progress message plus the real OpenClaw session history; it does not switch away into a different history row
- the history list does not show both the synthetic task-run conversation and its bound real session as duplicate entries
- when no real result session can be resolved, the task-run conversation remains visible with a final skipped/error system message
- when a finished run record arrives without a bindable session, the task-run conversation still exits `pending` and shows a final terminal summary
- task detail status stays aligned with the drawer status while the optimistic running bridge is active
- Manual schedule verification:
  - `once / daily / weekly / monthly` tasks show readable trigger timing
  - `every` rules show interval-based wording
  - complex cron rules do not show a generic advanced-cron placeholder; they show a readable summary or `Cron · <expr>`
  - the separate next-run line still shows the real next execution time
- Regression verification:
  - `systemEvent` tasks remain editable in the new modal
  - `agentTurn` tasks remain non-editable
  - history, memory, skills, tools, channel, related-resource panels, and real task run/toggle/delete flows do not regress

## Assumptions

- Removing the recent-runs module only applies to the task drawer surface; it does not remove runs data or other task detail sources.
- Monthly rules that target `29`, `30`, or `31` continue to follow native cron behavior and simply skip months without that date.
- For extremely complex cron expressions that cannot be converted safely, `Cron · <expr>` is an acceptable final fallback for task card display.
- Manual `Run now` keeps OpenClaw as the source of truth for execution and results; frontend orchestration only helps the user open the correct real session after the task has been accepted.
- The new task-run conversation is a frontend-local proxy surface only; it does not change any saved task `sessionTarget`, `sessionKey`, Gateway RPC shape, or Rust command.
