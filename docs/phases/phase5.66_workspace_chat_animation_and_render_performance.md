# Phase 5.66: Workspace 聊天动画与渲染性能优化

> Status: Planned
> Date: 2026-05-10
> Type: Workspace chat performance polish

## Goal

Reduce the `workspace-clone` chat surface's perceived lag during first-open, drawer/modal pop, and streaming replies by simplifying motion, avoiding redundant re-render work, and preloading the most visible chat-side async surfaces.

## Background

The current chat experience combines several expensive behaviors during high-frequency updates:

- streaming replies repeatedly update the message tree while the chat area also manages auto-stick scrolling;
- the live timeline keeps multiple infinite visual effects active at once;
- the first Markdown reply may flash a plain-text fallback before the lazy renderer arrives;
- the right utility drawer and workspace model modal rely on lazy mount timing, so first open can feel one beat late;
- several chat-related overlays still use heavier blur values than needed for this surface.

This phase keeps all existing Tauri, Gateway, and `invoke()` contracts unchanged. The work is limited to the frontend render layer, motion tuning, and chat-side prefetch behavior.

## Implementation Scope

### 1. Chat Scroll and Render Stability

- Keep automatic stick-to-bottom behavior, but use `auto` scrolling for streaming updates and reserve `smooth` only for explicit user-originated jumps.
- Throttle scroll-position state updates with `requestAnimationFrame` and only update `showScrollToBottom` when the visible state actually changes.
- Memoize chat-heavy subtrees so streaming deltas do not force unnecessary redraws of settled message rows.

### 2. Live Timeline Motion Simplification

- Keep the existing 12-step frontend limit.
- Remove the running sheen/veil layer and blur-based pseudo-element animation from live-step rows.
- Reduce running-state motion to a lightweight pulse on the status indicator while preserving success/error end states.

### 3. First-Open Responsiveness

- Replace lazy Markdown preview loading with a direct import so the first rich assistant message renders in its final form immediately.
- Keep large chat-side code splitting, but preload the utility drawer and workspace model modal shortly after the chat page stabilizes.
- Avoid the visible drawer skeleton swap on first open by preferring preload + empty fallback over delayed replacement.

### 4. Motion Token and Overlay Cleanup

- Add chat-specific motion/backdrop tokens in `src/styles/tokens.css` for chat enter timing, overlay timing, live pulse timing, and chat overlay blur.
- Tune page/modal/drawer transitions toward a shorter `120ms-180ms` band and rely on `opacity + transform` only.
- Lower chat-related overlay blur usage to the new token value instead of `10px-18px` hard-coded blur.
- Expand `prefers-reduced-motion` coverage so the chat surface disables shimmer, live pulses, popover entry animation, modal/page motion, and JS smooth-scroll fallbacks.

## Constraints

- Do not change any Tauri command names, parameter shapes, return types, or chat send/reset/session contracts.
- Do not change the semantic behavior of the existing utility drawer panels, model picker, or timeline data source.
- Work only within the frontend render/motion layer for `workspace-clone`.

## Acceptance Criteria

- First-open drawer and model-config modal no longer feel delayed by visible lazy fallback replacement.
- Streaming replies stay pinned smoothly without repeated smooth-scroll lag or obvious scroll drag.
- Live timeline rows remain readable while consuming less animation work during active runs.
- First Markdown assistant replies render directly as Markdown instead of flashing a plain-text fallback.
- With reduced motion enabled at the OS level, the chat surface disables non-essential motion and avoids smooth scrolling.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - open chat from a cold app state, then open the drawer and model modal once each;
  - send several short messages and one long streaming prompt;
  - open/close chat-side modals during a live run;
  - verify plain text, JSON, and Markdown previews all still render correctly;
  - verify reduced-motion behavior via system settings.
