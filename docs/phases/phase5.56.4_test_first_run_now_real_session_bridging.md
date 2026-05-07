# Phase 5.56.4: Test-First Run-Now Real-Session Bridging
> Status: Planned
> Date: 2026-05-07
> Type: Frontend behavior alignment

## Summary

- Satisfy the user's `test first, then fix` requirement by restoring the local Rust/Tauri runtime before changing the run-now flow.
- Reproduce one real task run from the current task list and capture its actual `sessionTarget`, `payload.kind`, `job.sessionKey`, `cron.run` result, and first matching gateway events.
- Fix manual `Run now` so it bridges directly into real sessions and starts local live-run handling as soon as `runId` is accepted.
- Stop relying on synthetic task-run conversations for manual task execution.

## Implementation Changes

### 1. Test-first runtime preparation

- Restore local Rust/Tauri prerequisites so `npm run tauri dev` can start successfully on this machine.
- Before code changes, reproduce one real task execution and record:
  - `sessionTarget`
  - `payload.kind`
  - `job.sessionKey`
  - whether `cron.run` returns `enqueued + runId`, `ran: true`, skip, or error
  - whether the first related gateway event includes `runId` and/or `sessionKey`
  - whether `cron.runs` later fills `sessionKey` / `sessionId`

### 2. Run-now routes by real target session

- In `workspace-clone`, resolve manual run behavior from existing upstream fields instead of inferring only from payload kind.
- Target session rules:
  - `main`: bridge into the agent's real main session
  - `current`: prefer the persisted `job.sessionKey`; fail explicitly if missing or unavailable
  - `session:*`: prefer the persisted `job.sessionKey`; fail explicitly if missing or unavailable
  - `isolated`: start with accepted `runId`, then switch into the resolved isolated real session as soon as it appears
- Manual `Run now` must:
  - switch immediately when the real target session is already knowable
  - otherwise start a live pending run from `runId` and switch on first real-session signal
  - never pre-open a synthetic task-run chat

### 3. Accepted `runId` immediately starts live-run capture

- Extend `useWorkspaceGatewayChat` with a frontend-local accepted-run bridge start helper.
- As soon as `cron.run` returns `runId`, initialize:
  - `activeRunId`
  - thinking / live timeline state
  - event alias tracking
- Event filtering must accept matching `agent`, `session.tool`, and `chat` events by `runId` even before `currentGatewaySessionKey` is known.
- When the first matching event carries `sessionKey`, bind/switch to that real session and continue streaming there.
- Keep `cron.runs` polling as a fallback for session binding and terminal closeout, but not as the only bridge path.

### 4. Manual run behavior by session target

- `main` tasks stay on the official main-session path and keep `main + systemEvent => force wake now`.
- `current` and `session:*` tasks switch into the bound real target session and reuse the accepted `runId` for live-run handling.
- If a target session is missing from `sessions.list`, refresh sessions once; if still missing, show a clear `target session unavailable` failure state.
- `isolated` tasks must no longer get stuck on a static notice card; they should enter live running state immediately and auto-switch once the isolated session materializes.

### 5. Closeout and legacy task-session recovery

- Any skipped, error, terminal no-session, or fallback closeout must clear:
  - `activeRunId`
  - `pendingUserMessage`
  - `streamText`
  - `liveSteps`
  - transient thinking bridge state
- Preserve the existing legacy synthetic task-session recovery path:
  - send / reset / new-chat first bind a real fallback session
  - no return to an unbound-but-editable synthetic conversation state

## Public Interfaces / Type Notes

- Do not change any Tauri command name, parameter, or return shape.
- Do not change any Gateway RPC name, parameter, or return shape.
- Frontend-local changes only:
  - accepted run context carries target-session bridge metadata plus `runId`
  - `useWorkspaceGatewayChat` adds an accepted-run bridge starter
  - target-session resolution uses existing `sessionTarget` and `job.sessionKey`
- No new user-visible task mode concept is introduced in this phase.

## Test Plan

- Pre-fix reproduction:
  - install Rust/Tauri prerequisites
  - run `npm run tauri dev`
  - click the current task's `Run now`
  - capture the actual run/session/event chain
- Post-fix validation:
  - `main` manual runs enter the real main session and show follow-up execution state
  - `current` manual runs enter their bound real session and stream there
  - `session:*` manual runs enter the specified real session and stream there
  - `isolated` manual runs enter running state immediately and auto-switch when the isolated session appears
  - first session-bearing event only binds once and does not create duplicate history rows
  - terminal no-session runs clear all thinking/live-run residue and show explicit final feedback
  - skip/error paths do not leave `isGenerating` or live timeline residue
  - legacy unbound task sessions still recover through real-session binding before send/reset/new-chat
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm exec tsc -- --noEmit --pretty false`
  - `npm run build`
  - `npm run tauri dev`

## Assumptions

- If the real target session is knowable, the frontend should switch into it immediately; if already selected, only the live-run state should update.
- `current` and `session:*` bridge targets come from persisted task metadata, not from whichever session is open when the user clicks.
- `isolated` may expose its real session later than `cron.run` acceptance, so `runId` must drive the early bridge.
- If runtime observation shows upstream event shapes differ from current frontend assumptions, implementation should adapt to observed reality without changing official RPC contracts.
