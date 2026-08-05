# Project audit completed work

This is a durable summary of implemented audit outcomes. Live, physical, accessibility, and
exact-candidate validation remains in the
[active plan](project-audit-implementation-plan.md).

## 2026-07-28 — Audit baseline

- Audited architecture, product, UI/UX, provider boundaries, documentation, and tests.
- Rebuilt the curated visual suite around meaningful current states, semantic readiness, five
  canonical viewports, deterministic fixtures, and Darwin/Linux baselines.
- Removed obsolete Guided visuals and stale provider/current-state documentation.

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

## 2026-07-28 to 2026-07-29 — Provider trust and validation infrastructure

- Builder, VTO, image-provider, and ElevenLabs decision points disclose retention, possible usage,
  provider/model context, and applicable limitations.
- Provider availability follows startup configuration; there is no runtime access-mode layer.
- Reference actions use truthful Detach/retention language.
- Release coverage now includes deterministic provider-free and provider-lifecycle journeys,
  accessibility/reflow checks, Storybook, curated visuals, production smoke, and full/production
  dependency-audit jobs.

## 2026-07-29 — Remote handoff design

The [remote backend handoff](REMOTE_BACKEND_HANDOFF.md) maps current loopback identity,
filesystem/browser persistence, provider operations, idempotency, media, retention, portability,
spend safety, observability, rollback, and tests to proposed remote boundaries.

This completed a design artifact only. It is unapproved, unimplemented, and does not authorize
accounts, remote exposure, cloud persistence, billing, or public data handling.

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
validation remain in the active plan. Local cleanup is not provider cancellation or deletion.

## 2026-08-05 — Whole-project hardening and simplification

- Removed the retired program documents, qualification/evidence hierarchy, workflow step, and all
  product-program terminology without rewriting Git history or removing the two unrelated creative
  fiction fixtures.
- Unified authenticated provider transport around redirect rejection, deadlines, bounded reads,
  body cancellation, and safe adapter-owned errors. Realtime sessions now use one 300-second cap.
- Made paid Existing Video submission recovery durable and same-ID: ambiguous acceptance performs
  status reads only, and a new billable UUID requires confirmed not-found plus explicit resubmission.
- Reworked video-job scheduling around owner/job indexes, atomic reservation, generation-token
  deadlines, cached server polling cadence, duplicate coalescing, leases, and retryable cleanup.
- Added bounded browser streaming, private ElevenLabs spooling, O(1) reference-image mappings,
  streamed image delivery, CPU admission, stable WebGL reuse, and copy-reduced video accumulation.
- Simplified Studio and Existing Video presentation at ownership boundaries; introduced pure
  recording and Recipe Shelf reducers, explicit creative-store migrations, shared provider/media/UI
  helpers, and selector/batched creative-store subscriptions.
- Removed confirmed obsolete aliases, capability fields, constructor compatibility, unused provider
  surfaces, direct reference-field wrapper, redundant E2E guards, and the unscheduled visual case.
- Corrected narrow-screen actions and upload selection, inspected intentional Darwin differences,
  completed both 29-case platform baseline inventories, and removed two obsolete Darwin files only
  after inventory verification.
- Added command-reference, documentation-link, retired-term, visual-matrix, build-closure, bounded
  streaming, recovery, cleanup, migration, renderer, worker, and CLI-parser checks. JSDOM is 30.0.1,
  Esbuild is pinned to patched 0.28.1, and dependency audits report no known vulnerabilities.

The automated release gates pass. Physical device/assistive-technology checks and authorized live
provider smoke remain environment-dependent and are not claimed here.
