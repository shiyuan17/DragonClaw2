# Phase 5.46: Channel Flow Unification

> Status: Planned
> Date: 2026-05-05
> Type: Integration flow convergence

## Goal

Unify channel / email / QR onboarding flows around typed payloads, a shared status model, and a consistent completion state without breaking existing commands.

## Implementation Scope

### 1. Shared Completion Model

- Introduce one internal flow model for:
  - config loaded
  - waiting for input
  - binding in progress
  - bound / ready
  - failed / recoverable
- Use the shared model in workspace channel/email binding UIs instead of ad hoc notice/error combinations alone.

### 2. Typed Payload Convergence

- Replace internal stringly-typed maps where feasible with explicit TS/Rust structs/interfaces for:
  - Weixin binding state
  - Feishu config values
  - email provider / custom SMTP values
- Keep public command names and top-level payload shapes compatible.

### 3. Completion-State Consistency

- Standardize “connected successfully”, “needs QR retry”, and “saved but not yet bound to agent” semantics.
- Keep Control UI / browser opening and QR-specific flows consuming the same structured result categories.

## Constraints

- Existing Tauri command signatures stay unchanged.
- This phase focuses on internal flow/state shape and completion semantics, not IA redesign.

## Acceptance Criteria

- Weixin / Feishu / email flows expose consistent completion and retry states.
- Frontend binding flows are less dependent on raw string parsing and one-off flags.
- No existing integration entry point loses functionality.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - open each binding flow;
  - complete happy path where supported;
  - verify failure / retry messaging remains actionable and consistent.
