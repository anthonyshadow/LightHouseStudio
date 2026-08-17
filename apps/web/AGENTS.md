# Web application guide

This file adds browser-specific guidance to the repository-wide `AGENTS.md`.
Use `docs/ARCHITECTURE.md` and the affected user story for detailed behavior.

## Composition and ownership

- `src/app/AppRouter.tsx` is the route boundary.
  `src/app/shell/AuthenticatedShell.tsx` is the persistent authenticated
  composition boundary; `src/studio/StudioApp.tsx` is the live-media runtime
  inside it, and belongs only to routes that own live media
  (`isStudioRuntimePath`).
- One `MediaStage`, owned by the runtime and mounted for as long as the runtime
  is. Do not create a second product shell, media session, saved-character
  store, provider client, or modal system, and do not add a second copy of a
  runtime concern to a surface that outlives the runtime — report work up
  through `StudioRuntimeRegistry` and receive selections through the shell's
  handoff channel instead.
- Use the shared `OverlayPanel`; it owns focus trap, inert background, Escape,
  scroll lock, topmost dismissal, and return focus. It never owns media.
- Components present state. Controllers and `src/orchestration` own async
  sequencing, cross-component lifecycles, and resource handoff. Browser APIs,
  same-origin calls, SDKs, and media processing stay in `src/adapters`.
- Do not duplicate stateful controls solely for layout. Reflow or progressively
  disclose the existing controller and control instance.

## Media and asynchronous work

- Guard late generation and other async results with abort or generation checks.
  Commit a healthy replacement before releasing the previous resource.
- Recording borrows source tracks; it does not own or stop them. Preserve the
  established recording, artifact, and stage ownership described in the
  architecture document.
- Do not initiate camera acquisition, SDK loading, or provider sessions on mount
  or route entry; use the documented user action for each journey.
- Namespace validated browser storage by authenticated user and clear or hand
  off runtime state safely when authentication changes.

## UI quality and validation

- Preserve accessible names, visible focus, semantic status, focus trapping,
  inert background, Escape and return-focus behavior, reduced motion, and
  practical touch targets.
- Support the canonical `1440x960`, `1280x720`, `834x1112`, `390x844`, and
  `320x568` viewports, including safe areas, short heights, touch, and 200% text.
- When the repository guide requires focused UI tests, cover state, races,
  cleanup, focus, and destructive actions at the owning component or controller
  boundary.
