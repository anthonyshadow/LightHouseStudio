# Project audit completed work

This is a durable summary of implemented audit outcomes. It does not qualify the current release
candidate; live, physical, accessibility, and exact-candidate gates remain in the
[active plan](project-audit-implementation-plan.md).

## 2026-07-28 — Release contract and audit baseline

- Approved the moderated, loopback-only cohort, device/browser targets, independent 270/300-second
  recording and Decart behavior, participant isolation/retirement, provider settings, content
  policy, generic owners, operator limits, metrics, and escalation path.
- Established the then-current Character-first hierarchy, Workshop as advanced, and touch/mobile
  as required.
- Audited architecture, product, UI/UX, provider boundaries, documentation, and tests.
- Rebuilt the curated visual suite around meaningful current states, semantic readiness, five
  canonical viewports, deterministic fixtures, and Darwin/Linux baselines.
- Removed obsolete Guided visuals and stale provider/current-state documentation.

Authority: [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md).

## 2026-07-28 to 2026-07-29 — Journey and UI corrections

- Stage-owned pointer, touch, focus, and keyboard activity restores hidden live/playback controls.
  Recording always exposes one dominant Stop action.
- Both saved-character entries open Characters and complete Use through Start.
- Camera permission denial routes to Capture Settings without provider work.
- Direct Character/VTO/Dock Starts share Decart transfer, usage, maximum, and Stop disclosure.
- Capability copy distinguishes configured/limited availability from live health.
- Character was visually primary, Workshop was advanced, and the first-take sequence became
  dismissible session state.
- Narrow Character Builder layouts use one Review & Generate target; reflow, viewport containment,
  focus, axe, and synthetic WebKit/touch journeys cover the canonical risks.
- Take cleanup language is explicit: Download enables Release or Close and release; confirmed
  Discard remains separate.

## 2026-07-28 to 2026-07-29 — Media and provider hardening

- Decart constraints survive the API/browser boundary. An app-owned monotonic clock, warning,
  expected-end handling, fallback, and recording-finalization ordering have deterministic tests.
- Recording owns its independent 270-second warning and 300-second coalesced Stop/finalize path for
  Local, Character, and VTO sources.
- Main video remains authoritative when the optional sidecar fails; immutable originals survive
  every voice failure/cancel path.
- Decart SDK failures use an allowlisted app-owned taxonomy; raw provider data remains private.
- ElevenLabs previews and conversion outputs are byte-bounded with declared/cumulative overflow,
  cancellation, MP3 validation, browser defense, and exact-boundary tests.
- Saved-voice functional coverage includes explicit listing/preview intent, immutable-sidecar
  Apply, remux, Download, Restore Original, and object-URL cleanup with external-network denial.

## 2026-07-28 to 2026-07-29 — Pilot trust and evidence infrastructure

- Builder, VTO, image-provider, and ElevenLabs decision points disclose retention, possible usage,
  provider/model context, and applicable limitations.
- Participant mode disables Wiro even when configured; operator-qualification mode is explicit.
- Reference actions use truthful Detach/retention language.
- The retirement checklist and disposable exact-leaf drill protect shared roots and siblings.
- The initial strict qualification matrix and validator required ten provider/local rows,
  including the then-approved ordered-chain checkpoint, and 45 physical browser/device rows for
  one exact commit. Evidence rejects extra or content-bearing fields.
- Release coverage now includes deterministic provider-free and provider-lifecycle journeys,
  accessibility/reflow checks, Storybook, curated visuals, production smoke, and full/production
  dependency-audit jobs.

## 2026-07-29 — Remote handoff design

The [remote backend handoff](REMOTE_BACKEND_HANDOFF.md) maps current loopback identity,
filesystem/browser persistence, provider operations, idempotency, media, retention, portability,
spend safety, observability, rollback, and tests to proposed remote boundaries.

This completed a design artifact only. It is unapproved, unimplemented, and does not authorize
accounts, remote exposure, cloud persistence, billing, or public data handling.

## Current qualification boundary

The 2026-07-30 single-processing decision retired the ordered-chain checkpoint, so the current
matrix has eleven provider/local rows. No completed qualification records are checked in. At this
documentation audit the validator reports **0/11 provider/local** and **0/45 physical** passes.
Historical test runs and implemented automation do not replace the exact-candidate work in the
active plan.

## 2026-07-31 — Primary post-recording workflow

- Made **Record New Video** and **Upload Video** the first-run entry and idle-stage actions.
- Kept Studio in neutral Local Camera mode with camera, microphone, AI, and provider work off until
  an explicit control-bar, upload-panel, or advanced Dock action.
- Routed primary local recordings into the existing-video editor after safe finalization while
  preserving Dock-started local and live AI recordings in their existing Latest Take flow.
- Presented Character Swap, Virtual Try On, and Voice as post-recording edits and removed the old
  VTO feature-status qualifier while retaining rights, consent, input, provider, and accuracy limits.

## 2026-08-02 — Temporary video-job deadline

- Fixed one immutable accepted-at-plus-60-minute deadline across active and ready video-job states;
  polling, retrieval, retry, and readiness never extend it.
- Added a service-owned nearest-deadline timer, request-time checks, expired tombstones, guarded
  late work, idempotent shutdown, and credential-independent startup/shutdown temp-root cleanup.
- Added delivery leases so content admitted before expiry may finish safely while no new content is
  admitted at or after the deadline; successful delivery and explicit release still clean earlier.
- Made expired or missing accepted jobs terminal in the browser without automatic provider
  resubmission, while preserving the original or latest healthy video.
- Added deterministic service, route, and workflow coverage for active/ready expiry, exact-boundary
  races, delivery, release, owner isolation, late provider results, shutdown, and retry semantics.

This closes `SEC-008` as an implementation finding. Exact-model live output/retention and physical
qualification remain in the active plan. Local cleanup is not provider cancellation or deletion.
