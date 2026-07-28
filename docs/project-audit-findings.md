# Project audit findings

Audit date: 2026-07-28  
Scope: current repository, current reachable product, deterministic tests, reviewed visual baselines, and current official Decart and ElevenLabs documentation.

This is the canonical cross-specialist findings register. Detailed evidence lives in
[architecture audit](architecture-audit.md), [product state](product-state.md), and
[UI/UX current state](ui-ux-current-state.md). Incomplete phase status lives in the
[active plan](project-audit-implementation-plan.md); the consolidated dependency-safe order through
the remote-MVP handoff lives in the
[immediate pre-remote plan](imediate-implementation-plan.md). Current behavior remains defined by
the owning code, [architecture](ARCHITECTURE.md), and [user stories](userStories/README.md).

## Unified assessment

Lightframe Studio is a coherent, well-factored local-first creator tool, not a loose provider
demo. Its strongest loop is:

> Local preview → create or reuse a character → explicitly start Lucy 2.5 → record → optionally
> treat voice → download.

The code is healthy enough for a **moderated, touch/mobile-inclusive, loopback-only
design-partner pilot after the controlled-pilot gates below are closed**. It is not ready for
unmoderated self-service or remote/public hosting.

The specialists agreed to preserve the single route, persistent `MediaStage`, shared
`OverlayPanel`, provider isolation, and explicit resource ownership. They rejected a broad
pre-MVP rewrite, automatic provider fallback, arbitrary file-size refactors, premature cloud
storage, and a silent switch from pinned `lucy-vton-3` to a moving alias.

## Product-owner decisions recorded 2026-07-28

- Touch/mobile creation is required for the pilot. `UX-001`, narrow-screen usability, physical
  touch/media checks, and a named device/browser matrix are therefore unconditional release gates.
- The pilot includes Character, VTO, local Voice, ElevenLabs, and reference generation through
  OpenAI, BFL, and Wiro. The reference broker still selects exactly one image provider at startup;
  all three configurations require separate qualification and there is no automatic fallback.
- The supported maximum take is 300 seconds. The current recorder does not yet enforce that limit,
  so a warning plus safe automatic Stop/finalize behavior and physical-target evidence remain
  required.
- Retention/deletion, external-participant provider/content policy, live-smoke credential and
  evidence ownership, monetization, and future cloud ownership/portability remain undecided.
  Retention, provider policy, and smoke ownership are still controlled-pilot blockers; the
  monetization and cloud decisions remain deliberately deferred.

## Severity summary

| Severity/timing                    | Findings                                                                                                      | Meaning                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Critical public blocker            | `SEC-001`                                                                                                     | Blocks remote/public exposure; not a defect in the supported loopback deployment.                                                 |
| High controlled-pilot gates        | `PROD-003`, `ARCH-001`, `PERF-001`, `SEC-004`, `SEC-005`, `UX-001`, `UX-002`, `UX-011`, `DOC-001`, `TEST-007` | Trust, touch/mobile support, bounded recording/session behavior, participant-data operations, and all included-provider evidence. |
| High self-service/public hardening | `SEC-002`, `PERF-002`                                                                                         | Operationally contain for a moderated pilot; enforce in a wider product.                                                          |
| Medium product/UX/tooling work     | `PROD-001`, `PROD-002`, `PROD-013`, `UX-003`–`UX-007`, `ARCH-002`, `SEC-007`                                  | Improves activation, clarity, accessibility, recovery, and contributor-toolchain safety without changing the core architecture.   |
| Completed in this audit            | `TEST-003`, `DOC-002`                                                                                         | Visual-regression truth and documentation cleanup/structure.                                                                      |
| Deferred                           | `ARCH-003`, `SEC-003`, `SEC-006`, `PERF-003`, account/cloud items                                             | Required only when the deployment or product model changes.                                                                       |

## Controlled-pilot findings

### PROD-001 — Freeze one pilot promise

- **Severity/timing:** High; required before pilot recruitment.
- **Evidence:** `CreativeWorkspace.tsx` exposes four creative tools; `AIExperienceChooser.tsx`
  gives Character and VTO similar weight; no account/cloud product exists.
- **Impact:** Mixed expectations make onboarding, metrics, and support incoherent.
- **Resolution:** Position the pilot as short-form solo character performance creation.
  Character is primary; VTO is a named secondary/beta experience; Workshop is advanced. Local
  Voice, ElevenLabs, and all three separately configured image-provider paths are included.
  Keep the deployment loopback-only and qualify touch/mobile before release.
- **Decision owner:** Product.
- **Details:** [Product state](product-state.md).

### PROD-003 — Direct Decart Start lacks decision-point disclosure

- **Severity/timing:** High; required before an external Character AI pilot.
- **Evidence:** `SessionComposer.tsx` explains Decart media contact, while the primary direct
  `AIExperienceChooser.tsx` Start-with-character path does not repeat what is sent, usage, or
  the five-minute maximum.
- **Impact:** A user can explicitly click Start without receiving the trust context at the action
  that begins external media and paid usage.
- **Correction:** Add concise inline disclosure or a linked detail at every direct Decart Start.
  Do not add a recurring legal modal.
- **Dependencies:** `ARCH-001`; pilot cost/retention policy.
- **Regression risk:** Low.

### ARCH-001 — The browser drops the Decart active-session constraint

- **Severity/timing:** High; required before a Decart pilot.
- **Evidence:** `apps/api/src/features/realtime/routes.ts` returns
  `constraints.maxSessionDurationSeconds`; `apiClient.ts` returns only `apiKey` and `expiresAt`.
  `DecartRealtimeGateway.ts` does not expose duration events. The normal Studio cap is 300 seconds.
- **Impact:** The user sees no cap/countdown/warning and expected expiry can look like failure.
- **Correction:** Retain the authoritative constraint in app-owned types, start a monotonic timer
  only after connection, warn near expiry, distinguish expected completion from disconnect, and
  preserve local fallback. Provider generation ticks may reconcile usage but are not the only UX
  clock.
- **Dependencies:** `PROD-003`, app-owned realtime event types.
- **Regression risk:** Medium.
- **Details:** [Architecture audit](architecture-audit.md).

### PERF-001 — Recording duration and memory support are unbounded and unproven

- **Severity/timing:** High; evidence required before claiming target support.
- **Evidence:** `recordingAttempt.ts` retains main and sidecar chunks; finalization creates new
  Blobs; processing may retain original, sidecar, and replacement. `RECORDING_MEMORY_POLICY.md`
  requires physical measurements, but no results are checked in.
- **Impact:** Long/high-bitrate takes can terminate a mobile tab and lose the temporary take.
- **Correction:** Enforce the approved 300-second maximum with an accessible warning and safe
  automatic Stop/finalize path. Measure 1- and 5-minute checkpoints, finalization, local and
  ElevenLabs processing, and cleanup on every claimed physical target before publishing support.
  Do not silently discard chunks or treat the numerically equal Decart/ElevenLabs limits as the
  recording policy's technical source.
- **Dependencies:** Final pilot device/browser matrix.
- **Regression risk:** Medium for the runtime cap; none for evidence collection.

### SEC-004 — Retained reference assets lack an ordinary deletion lifecycle

- **Severity/timing:** High trust risk; pilot disclosure/operations required, full ownership
  lifecycle required before self-service/public use.
- **Evidence:** uploaded/generated assets are immutable under `LIGHTFRAME_DATA_DIR`; remove,
  reset, browser data clearing, and character deletion can detach relationships without deleting
  bytes. No safe relationship-aware delete route exists.
- **Impact:** A participant can reasonably misread “Remove” as deletion of personal media.
- **Controlled-pilot correction:** say detach, disclose retention at first upload/save and relevant
  destructive actions, use an isolated data directory per participant/cohort, and verify whole
  dataset retirement.
- **Deferred correction:** account-owned relationships, retention policy, tombstones, and
  relationship-aware deletion/garbage collection.
- **Regression risk:** High if per-asset deletion is rushed.

### UX-001 — Touch users can lose live/playback controls

- **Severity/timing:** High; unconditional controlled-pilot stop-ship because touch/mobile creation
  is in scope.
- **Evidence:** `StudioSessionControlBar.tsx` hides after three seconds and restores only on
  `mousemove`/`keydown`; the hidden subtree is inert. Existing tests cover mouse/keyboard only.
- **Impact:** Stop recording, close, mic/camera, and take controls can become unreachable.
- **Correction:** add a stage-owned pointer/touch reveal target outside the inert subtree, reset the
  timer on supported activity, and never auto-hide the only Stop Recording action.
- **Regression risk:** Medium.
- **Details:** [UI/UX current state](ui-ux-current-state.md).

### UX-002 — “Choose saved character” opens generic Saved recipes

- **Severity/timing:** High journey correctness; required before measuring character reuse.
- **Evidence:** both entries call `openSavedRecipesFor('lucy-2.5')`; the Shelf controller initializes
  to `saved`, not `characters`, in a clean session.
- **Impact:** an explicit character action lands on the wrong library category.
- **Correction:** pass one-shot entry intent to the existing Shelf controller. Do not create a
  second picker or store.
- **Regression risk:** Low.

### UX-011 — Permission denial exposes the wrong recovery action

- **Severity/timing:** High recovery defect; recommended before controlled pilot.
- **Evidence:** the domain maps `NotAllowedError` to `camera-denied`; `studioStageNotices.ts`
  recognizes `permission-denied` but not `camera-denied` as a device error. The reviewed
  320×568 baseline therefore shows **Dismiss**, while current journey docs had claimed
  **Capture settings**.
- **Impact:** the user is told to change browser settings but is not taken to the app's recovery
  surface.
- **Correction:** align the app-owned safe code and notice classification, then update the
  deterministic recovery test and intentional baseline.
- **Regression risk:** Low.

### SEC-005 — Provider settings are not a product moderation policy

- **Severity/timing:** High for external use.
- **Evidence:** release behavior varies by the startup-selected OpenAI/BFL/Wiro configuration;
  Wiro's pinned model is explicitly uncensored. Safe refusal mapping is not moderation policy.
- **Impact:** content expectations and support obligations vary silently by deployment.
- **Correction:** qualify every selected provider configuration. Wiro is included for
  qualification but must not be offered to external participants until the product owner approves
  its settings and the participant content/refusal/support policy. A full moderation/reporting
  system is a public-product requirement, not a local pilot prerequisite.
- **Regression risk:** Medium.

### DOC-001 / TEST-007 — Included providers require live entitlement/device evidence

- **Severity/timing:** High release evidence; unconditional because every provider path is in
  pilot scope.
- **Evidence:** deterministic tests prove wiring, not live WebRTC, account entitlement, quota,
  output quality, VTON pinned-ID availability, ElevenLabs zero-retention eligibility, or device
  codecs.
- **Correction:** run and record Lucy 2.5 and exact `lucy-vton-3` smokes; saved-voice browse →
  preview → Apply → remux → Download; and separate OpenAI, BFL, and Wiro
  optimize/generate/compose/edit passes using the startup-selected provider configuration. Never
  run paid providers in CI.
- **Regression risk:** None.

## Recommended pre-self-service improvements

### PROD-002 — First success is not guided

Use moderated observation first. Before an unassisted pilot, add light, dismissible in-context
guidance inside the current route/stage; do not add an onboarding route or tour.

### PROD-013 / UX-007 — “Systems ready” overstates configuration

`/api/capabilities` reports configuration, not provider health, entitlement, or quota. Prefer
“Integrations configured/limited”; show active health only during a real connection.

### UX-003 — Builder generation/review is too far down on narrow screens

The single DOM is correct, but the preview and generation actions follow every configuration
section. Add an anchored Review/Generate affordance or compact status without duplicating the
preview controls. Validate 320×568, 390×844, tablet, and 200% text.

### UX-004 / UX-005 / UX-006 — First-use hierarchy, vocabulary, and recording density

Keep Dock/Shelf/Workshop for now, add action-first subtitles, subordinate advanced tools during
first success, and make Stop Recording dominant. Do not mechanically rename Dock to “AI Setup”
because it also owns Local Camera.

### ARCH-002 — Decart errors are safely but excessively flattened

Map a small allowlist of documented SDK error codes to app-owned safe recovery codes. Never expose
raw provider messages or arbitrary codes.

### PERF-002 / TEST-006 — Successful ElevenLabs output is not byte-bounded

Add declared-length and counting-stream ceilings with exact-boundary/overflow/cancellation tests
before wider self-service or public use. Preserve the original take on failure.

### SEC-007 — Development-only dependency advisories remain

The required production audit is clean, but a full `npm audit` reports six High and one Low
development-toolchain advisories through ESLint/minimatch/brace-expansion and tsup's nested
esbuild. Track compatible upstream remediation and validate a normal upgrade or narrow supported
override; do not apply npm's proposed forced breaking downgrade during unrelated work. This is a
contributor/CI maintenance risk, not a shipped-runtime or controlled-pilot blocker. See
[architecture audit](architecture-audit.md#sec-007--development-only-dependency-advisories-remain).

## Public-launch blockers and deferred work

### SEC-001 — No public identity or authorization boundary

The broker is deliberately loopback-only. Before remote exposure it needs authentication, secure
sessions, per-resource authorization, tenant isolation, CSRF/TLS design, deletion rights, and a new
security review.

### SEC-002 — No rate, entitlement, or cost enforcement

Operational limits are adequate only for a moderated pilot. Public use requires authenticated
rate/concurrency limits, entitlements, idempotent usage settlement, and support/refund policy.

### SEC-003 — Deployment-specific CSP is absent

CSP is disabled for provider media compatibility. Design and test a real origin allowlist only
when deployment origins are known; do not enable a generic strict policy that breaks WebRTC.

### ARCH-003 / PERF-003 — Storage and coordination are single-process

Host-derived ownership, local filesystem assets, process-local operation coalescing, and repair
scans are correct for the supported deployment. Replace them with authenticated ownership,
transactional metadata/object storage, distributed idempotency, and indexed recovery only during
backend work.

### SEC-006 — Server does not derive ElevenLabs input duration

The current UI enforces five minutes. A future untrusted upload boundary must derive duration or
trust only an authenticated ingestion record, not a client-supplied number.

## Consolidated test IDs

The independent specialist reports reused `TEST-###`; the canonical plan uses this allocation:

| ID         | Test obligation                                                                        |
| ---------- | -------------------------------------------------------------------------------------- |
| `TEST-001` | Touch/pointer control recovery and never-hidden Stop behavior for `UX-001`.            |
| `TEST-002` | Complete saved-character entry-intent → Use → Start journey for `UX-002`.              |
| `TEST-003` | State-driven curated visual matrix and semantic readiness invariants.                  |
| `TEST-004` | Decart cap/tick/end/typed-error behavior for `ARCH-001`/`ARCH-002`.                    |
| `TEST-005` | Physical-device recording-memory/finalization/cleanup evidence for `PERF-001`.         |
| `TEST-006` | Declared/chunked successful ElevenLabs output bounds for `PERF-002`.                   |
| `TEST-007` | Gated live provider/device entitlement and full included-provider journeys.            |
| `TEST-008` | Risk-based dynamic-state axe/focus/screen-reader coverage.                             |
| `TEST-009` | Outcome-based Character Builder responsive/reflow coverage.                            |
| `TEST-010` | Shared semantic scenario/readiness model for curated and broad capture when justified. |
| `TEST-011` | Focused WebKit/touch/media interaction smoke without cross-browser pixel baselines.    |

## Test modernization status

### TEST-003 — Curated visual matrix did not protect current central states

**Completed in this audit.** The matrix is now state-driven within a 29-case budget. It protects
the closed initial Studio, local live, and recording across all five viewports; high-risk
Character/Builder/library/review states at desktop and 320×568; desktop VTO/Voice; and small-mobile
finalizing/permission error. Every case rejects unresolved `Loading studio tool…`, uses fixed time
and deterministic media/provider fixtures, denies external traffic, and checks viewport
containment. See [screenshot coverage](screenshot-test-coverage.md).

The new screenshots intentionally reveal unresolved product defects—such as clipped recording
controls and the permission **Dismiss** action—rather than concealing them.

### DOC-002 — Documentation had stale provider links and obsolete Guided images

**Completed in this audit.** Canonical provider links, visual-suite descriptions, the documentation
map, and affected current-state journeys were corrected. The character-builder story was moved to
a direct stable path; unreferenced screenshots of the retired Guided runtime were removed while
historical rationale remains in `PRODUCT_EVOLUTION.md` and `LESSONS.md`.

## Specialist disagreements resolved

1. **What “MVP” means:** public backend controls block remote launch, not a moderated loopback
   pilot.
2. **Touch severity:** touch/mobile is included, so inaccessible control recovery is an
   unconditional controlled-pilot stop-ship.
3. **Saved-character severity:** a real defect and a hard gate when reuse is a pilot metric, but
   not the same safety impact as inaccessible Stop controls.
4. **Asset deletion:** controlled pilot needs truthful disclosure and verified isolated cleanup;
   unsafe per-asset GC was rejected.
5. **Session timing:** the authoritative cap must be visible; provider usage ticks are helpful,
   not the sole timer requirement.
6. **Recording duration:** the product owner selected 300 seconds; enforce it in app-owned
   orchestration and prove it independently from the numerically equal provider limits.
7. **Vocabulary:** incremental action-first copy now; wholesale renaming only after user evidence.
8. **Screenshot scope:** protect central states and semantic readiness; keep 29 as a review budget,
   not the definition of correctness.
