# Immediate pre-remote implementation plan

Plan date: 2026-07-28  
Scope: all remaining work that should be completed or deliberately prepared while Lightframe
Studio remains local, single-operator, and loopback-only

## 1. Purpose and authority

This document turns the completed audit into one safe execution order from the current local
product to the point where a separately authorized remote MVP can begin.

It is a sequencing view, not a second findings register:

- [Project audit findings](project-audit-findings.md) remains authoritative for finding severity
  and disposition.
- [Project audit implementation plan](project-audit-implementation-plan.md) remains authoritative
  for incomplete phase status and completion records.
- This document is authoritative for dependency order and the pre-remote exit gate. When a wave
  completes, update the canonical finding/phase records in the same change.
- Current behavior remains defined by the code, [architecture](ARCHITECTURE.md), and
  [observable user stories](userStories/README.md). Planned outcomes in this file must not be
  described as implemented.

The requested filename intentionally uses `imediate`; the document title uses the conventional
spelling.

## 2. Target state before remote-MVP work

The local phase is complete only when Lightframe Studio is a trustworthy, moderated,
touch/mobile-inclusive, loopback-only product with:

- Character as the primary workflow, VTO as a named beta, Workshop as advanced, and local Voice
  plus ElevenLabs available through the existing single-stage flow;
- separate qualified OpenAI, BFL, and Wiro server configurations, with exactly one selected at
  startup and no automatic fallback;
- a named physical desktop/touch/mobile browser and device matrix;
- an app-owned 300-second recording maximum with an accessible warning and safe automatic
  Stop/finalize;
- understandable provider contact, cost/session, retention, detach/delete, and recovery behavior;
- isolated participant data and a verified whole-dataset cleanup procedure;
- deterministic automated evidence plus dated physical-device and live-provider evidence; and
- an approved remote-backend design package that does not yet expose the broker or implement
  accounts, tenancy, cloud storage, billing, or public sharing.

Remote access through a LAN binding, tunnel, proxy, public hostname, or shared ingress is prohibited
throughout this plan.

## 3. Ordering rules

The work is ordered by severity first, then by dependency and regression safety. A High item can
appear late when it is an evidence gate that would be invalidated by earlier code changes.

For every implementation wave:

1. Run a scoped Graphify query/path and inspect the owning presentation, orchestration/controller,
   pure domain rule, contract, adapter, cleanup owner, and complete journey tests.
2. Characterize the existing behavior before changing it. Add or adjust outcome-based tests with
   the implementation; do not freeze a known defect as the expected state.
3. Make the smallest change at the existing ownership boundary. Do not create a second stage,
   overlay system, repository, provider client, media session, or route.
4. Run targeted tests, then `npm run quality`. Run broader E2E, production, visual, coverage,
   Storybook, and audit gates in proportion to the change.
5. Update canonical behavior docs and affected user stories. After code changes, run
   `graphify update .`.
6. Update visual baselines only for intentional visible changes, inspect every changed image, and
   never hide a behavior failure by accepting snapshots.
7. Complete only one wave at a time unless two items share the same owner and lifecycle and the
   combined change is demonstrably safer.

## 4. Execution overview

| Order | Severity / role                                  | Wave                                                                | Exit result                                                                                          |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0     | Blocking decisions                               | Freeze the local release contract                                   | No implementation depends on an unresolved cohort, device, data, provider, or evidence-owner choice. |
| 1     | Critical interaction risk                        | Restore touch controls and protect Stop Recording                   | A touch-only user cannot lose the only high-consequence action.                                      |
| 2     | High trust, journey, and recovery risk           | Fix low-coupling primary-journey defects                            | Character entry, permission recovery, direct provider disclosure, and capability copy are truthful.  |
| 3     | High provider-session risk                       | Preserve and expose the Decart active-session boundary              | Expected expiry is visible, typed, recoverable, and independently tested.                            |
| 4     | High recording/resource risk                     | Enforce the 300-second take contract                                | Recording auto-finalizes safely without losing the original or releasing resources early.            |
| 5     | High participant-data and provider-policy risk   | Implement the controlled-pilot trust and operating boundary         | Retention, cleanup, provider settings, usage, and support behavior are approved and visible.         |
| 6     | Medium UX/accessibility, elevated by pilot scope | Finish touch/mobile, Voice, responsive, and first-success usability | Required flows are reachable and understandable on the named matrix and assistive technology.        |
| 7     | Medium architecture/provider hardening           | Improve safe errors and bound successful Voice output               | Wider local use cannot consume unbounded output or collapse useful safe recovery classes.            |
| 8     | High release-evidence risk, dependency-late      | Qualify every provider and physical target                          | The final stable build has dated, safe, configuration-specific evidence.                             |
| 9     | High assurance / regression closure              | Complete functional, accessibility, and release regression gates    | Every critical finding is protected by the correct test layer.                                       |
| 10    | Medium-to-low maintenance and polish             | Finish low-risk cleanup without destabilizing the release candidate | Contributor/tooling and remaining local clarity issues are closed or explicitly accepted.            |
| 11    | Remote Critical/High, design-only locally        | Produce the backend/auth/storage handoff package                    | Remote implementation can start from approved boundaries without pretending loopback IDs are users.  |

### Audit coverage ledger

| Audit severity/disposition                    | Findings accounted for                                                                                | Plan location                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Critical local interaction risk               | `UX-001`, `TEST-001`, `PROD-017`                                                                      | Wave 1, with final physical proof in Waves 8–9                                                 |
| Critical remote-exposure risk                 | `SEC-001`                                                                                             | Wave 11 design only; implementation is prohibited until the separately authorized remote phase |
| High controlled-pilot trust/journey gates     | `PROD-003`, `UX-002`, canonical `UX-011`, `TEST-002`, `PROD-012`                                      | Wave 2                                                                                         |
| High provider-session gate                    | `ARCH-001`, `PROD-004`, `UX-012`, High portion of `TEST-004`                                          | Wave 3                                                                                         |
| High recording/resource gate                  | `PERF-001`, `UX-014`, `TEST-005`                                                                      | Wave 4, with final physical proof in Wave 8                                                    |
| High participant/provider-policy gates        | `SEC-004`, `SEC-005`, `UX-013`, `PROD-006`, `PROD-007`, `PROD-009`, `PROD-010`, `PROD-015`            | Wave 5                                                                                         |
| High included-provider evidence               | `DOC-001`, `TEST-007`, `PROD-008`, `PROD-016`                                                         | Wave 8                                                                                         |
| Medium product/UX/accessibility work          | `PROD-001`, `PROD-002`, `PROD-011`, `PROD-013`, `PROD-014`, `UX-003`–`UX-008`, `TEST-008`, `TEST-009` | Waves 2 and 6                                                                                  |
| Medium architecture/provider hardening        | `ARCH-002`, Medium portion of `TEST-004`, `PERF-002`, `TEST-006`                                      | Wave 7                                                                                         |
| Medium contributor/tooling risk               | `SEC-007`                                                                                             | Wave 10                                                                                        |
| Low local polish / conditional test cleanup   | `UX-009`, conditional `TEST-010`                                                                      | Wave 10                                                                                        |
| Remote-only architecture/security/performance | `ARCH-003`, `SEC-002`, `SEC-003`, `SEC-006`, `PERF-003`, remote portion of `SEC-004`                  | Wave 11 design only                                                                            |
| Completed audit work to preserve              | `TEST-003`, `DOC-002`                                                                                 | Not reimplemented; protected by Waves 9–10 and canonical completion history                    |
| Architectural constraint, not a task          | `UX-010`, `PROD-005`, `PROD-026`–`PROD-030`                                                           | Global ordering rules, loopback boundary, and explicit deferrals                               |
| Later product opportunities                   | `PROD-018`–`PROD-025`                                                                                 | Deferred until local value, ownership, cost, and remote foundations are proven                 |

## 5. Wave 0 — Freeze the local release contract

**Status:** Complete 2026-07-28
**Why first:** these are product and operational inputs to several High/Critical fixes. Coding
around them would create copy, timer, data, device, and provider-policy churn.

Decide and record:

- the exact moderated pilot cohort and whether any local beta step will be unassisted;
- the named desktop and touch/mobile browser/device/OS versions, including which iOS/iPadOS and/or
  Android targets are in scope;
- the warning threshold and expected UI behavior when the 300-second recording cap and the
  separate Decart active-session cap approach or end;
- the participant retention, detach, deletion, and whole-dataset cleanup promise;
- the isolated `LIGHTFRAME_DATA_DIR` strategy and the operator cleanup verification procedure;
- approved OpenAI, BFL, Wiro, Decart, and ElevenLabs settings plus external-participant
  content/refusal/support policy;
- the live-smoke credential owner, billing authorizer, evidence-record owner, and escalation owner;
- operator limits for generated previews, failed paid requests, connection time, and participant
  access; and
- content-free success metrics and a support/escalation procedure.

Already fixed decisions must not be reopened during implementation:

- touch/mobile creation is required;
- Character, VTO, local Voice, ElevenLabs, OpenAI, BFL, and Wiro are included;
- the maximum take is 300 seconds;
- the broker remains loopback-only; and
- Wiro cannot reach external participants until its uncensored configuration is explicitly
  approved by the provider/content policy.

**Completion:** the product owner approved the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md). It records an entirely
moderated cohort of at most five participants; the desktop, five Apple-phone, five
popularity-led Android-phone, Android 17 phone sentinel, five popularity-led tablet, and Android 17
tablet sentinel qualification targets; 30-second warnings for the independent recording and Decart
caps; isolated participant environments and bounded verified retirement; exact provider
configurations and refusal rules; generic local owner roles; operator usage limits; content-free
metrics; and escalation.

**Exit gate:** satisfied for decision freeze. Physical-device access, implementation, live
qualification, cleanup rehearsal, and dated evidence remain gates in their later waves.

## 6. Wave 1 — Critical touch and recording-control safety

**Findings:** `UX-001`, `TEST-001`; the Stop-dominance portion of `UX-006`; `PROD-017`

**Status (2026-07-28):** runtime implementation, automated evidence, and maintained-platform visual
review complete; named physical touch/browser/device and assistive-technology evidence pending.
This wave is not release-complete and its findings remain open until that evidence passes.

Implement in this order:

1. Put pointer/touch/focus activity detection on the persistent stage boundary, outside the
   control subtree that becomes `inert`.
2. Keep one activity timer owner. Do not add competing listeners or a second control bar.
3. Prevent the sole **Stop recording** action from auto-hiding while recording and keep it
   reachable at all five canonical viewports, safe areas, short heights, and 200% text.
4. Preserve mouse and keyboard recovery, focus visibility, reduced motion, and return-focus
   behavior.

Required evidence:

- component tests for timeout, pointer/touch/focus recovery, timer reset, unmount cleanup, and no
  duplicate listeners;
- E2E that waits through the real hide timeout in live and playback, restores controls through a
  touch/pointer action, and completes a recovered action;
- recording-state tests proving Stop never becomes hidden or inert; and
- physical touch checks on every named target.

Implemented automated evidence:

- `MediaStage` owns the only activity timer and the stage-bound pointer, touch, and focus listeners;
  keyboard recovery remains global to the active Studio task without a second timer;
- component tests cover timeout/reset, all recovery inputs, context transition, listener
  de-duplication, unmount cleanup, and recording's never-hidden/non-inert Stop invariant;
- a mobile touch-context E2E waits through the real timeout in live and playback, performs recovered
  actions, and waits beyond the timeout while recording at 200% text; and
- the existing full journey keeps Stop inside all five canonical Chromium viewports, and the five
  intentional recording-state baselines were regenerated and reviewed on Darwin and Linux.

Remaining evidence:

- execute and record the manual protocol on every named physical target and applicable browser;
- complete the relevant VoiceOver, TalkBack, and desktop screen-reader/focus-visible checks.

**Regression guard:** do not remount `MediaStage`, move state into a duplicate mobile control, or
change recording ownership.

**Exit gate:** a touch-only participant cannot lose session, Stop, or take actions. `UX-001` and
`TEST-001` are fully closed with physical evidence.

## 7. Wave 2 — High trust, journey, and recovery corrections

**Findings:** `UX-002`, `TEST-002`, `PROD-012`; canonical `UX-011` camera-permission recovery;
`PROD-003`; `PROD-013` / `UX-007`

**Status (2026-07-28):** runtime implementation, automated evidence, and maintained-platform
visual review complete. Both saved-character entries now deliver a consumable `Characters` intent
to the existing Shelf; camera denial opens Capture Settings, clears the handled error, and permits
explicit retry without provider work; the chooser and Dock share the same Decart
transfer/usage/300-second/Stop disclosure; and the header reports
configured/limited/available-to-try states rather than health. The active audit phase remains open
because Wave 1 physical touch/device and assistive-technology evidence is still pending.

Use separate, small changes in this order:

1. **Saved-character intent:** pass one-shot `Characters` entry intent into the existing Recipe
   Shelf from both saved-character entry points. Do not create another picker or persisted
   navigation state.
2. **Permission recovery:** align app-owned camera-denial codes with stage-notice classification so
   the recovery action opens the intended Capture Settings/browser guidance rather than merely
   dismissing the error.
3. **Direct Decart disclosure:** share concise “what is sent / provider / usage / session maximum /
   Stop” content at every direct Character and VTO Start action. Do not add a recurring legal modal.
4. **Capability truth:** replace health-like “ready” claims derived only from configuration with
   `configured`, `limited`, or `available to try`; show live health only after a real attempt.

Required evidence:

- both character entries → Characters category → Use → Start;
- clean-session, returning-session, Cancel, and focus-return cases for one-shot intent;
- permission deny → actionable recovery, retry, and no provider request;
- disclosure assertions at every provider Start surface;
- no-key/local-only tests and unavailable-provider explanations; and
- intentional visual review only for changed recovery/copy states.

Implemented evidence:

- controller/composition tests cover clean and returning category state, one-shot consumption,
  dirty-form cancellation, and overlay focus return;
- the Character Builder browser journey exercises header and AI-chooser entry through
  **Characters → Use → Start** in Chromium, WebKit, and the mobile project;
- camera-denial tests exercise **Capture settings**, close, explicit retry, and prove that no
  realtime token/provider request occurs;
- component tests assert the shared disclosure at Character, VTO, and Dock Start surfaces; and
- header tests cover configured integrations, the no-key local-only path, and an unreachable
  configuration check without health or entitlement claims; and
- the two changed Darwin baselines (small-mobile selected-character live header and permission
  recovery) were regenerated and inspected for truthful copy, containment, and action
  reachability; the pinned Linux/amd64 suite also passed all 29 curated cases without a
  threshold-exceeding platform diff.

**Exit gate:** primary actions lead where they promise, provider contact is disclosed at the
decision point, and configuration is never represented as live entitlement or health.

## 8. Wave 3 — High Decart session-lifecycle boundary

**Findings:** `ARCH-001`, `PROD-004`, `UX-012`, High portion of `TEST-004`

**Status (2026-07-28):** runtime implementation and deterministic automated evidence complete.
The validated maximum now survives the browser API boundary; one post-commit monotonic clock owns
elapsed/remaining state; SDK tick/end events are allowlisted, sanitized, and cleaned up; the stage
shows the independent timer and static 30-second warning; expected completion preserves local
fallback/current recipe and finalizes an active take before resource release. The focused
maximum-duration journey passes in Chromium, WebKit, and the mobile project. This wave remains
release-incomplete until the gated paid maximum-duration live smoke passes for both claimed Decart
configurations; no live credential or paid call was authorized for this implementation.

Implement in this order:

1. Preserve `constraints.maxSessionDurationSeconds` through app-owned browser contracts. Keep
   provider payloads out of domain/UI types.
2. Start an app-owned monotonic session clock only after a healthy transformed connection commits.
3. Show maximum, elapsed/remaining state, and an accessible warning without displacing Record/Stop.
4. Normalize expected cap completion separately from unexpected disconnect, entitlement, quota,
   permission, and provider failure.
5. Preserve the local preview and current recipe after expected expiry.
6. Subscribe to and clean up allowlisted provider lifecycle/tick events only after verifying their
   installed SDK semantics. Provider ticks may reconcile display but are not billing truth or the
   sole clock.

Required evidence:

- accelerated boundary, warning, expected-end, early-disconnect, reconnect-budget, cancellation,
  stale-result, and unmount tests;
- expiry during recording and finalization, proving final recorder data settles before model/local
  release;
- no raw SDK message/code leakage; and
- one gated live maximum-duration smoke after automated coverage passes.

**Regression guard:** the Decart timer and 300-second recording timer are independent contracts
even though both currently use the same number.

**Exit gate:** the user can plan around the provider limit, expected completion is not shown as a
crash, and cleanup/local fallback remain deterministic.

## 9. Wave 4 — High recording duration and memory safety

**Findings:** `PERF-001`, `UX-014`, `TEST-005`

**Implementation status (2026-07-28):** runtime and deterministic automated work is implemented.
The independent 270/300-second policy warns, coalesces automatic/manual/source Stop, preserves one
main-authoritative original across sidecar and finalization races, explains maximum completion, and
keeps release ordering intact for Local, Character, and VTO. Wave 4 remains open until the named
physical matrix supplies the required memory, codec, processing, interruption, download, and
cleanup evidence.

Implement in this order:

1. Add an app-owned 300-second maximum and accessible pre-limit warning to recording
   orchestration, not to a provider adapter.
2. At the cap, invoke the existing coalesced Stop/finalize path exactly once.
3. Settle final recorder data and the optional sidecar before releasing owned live/provider
   resources.
4. Keep the main video authoritative if the sidecar fails.
5. Publish a healthy original before any local or ElevenLabs replacement; do not revoke the prior
   valid artifact until its replacement exists.
6. Explain that recording ended at the supported maximum and preserve playback, Voice, Download,
   Close, and confirmed Discard.

Required evidence:

- accelerated warning/cap tests with local, Character, and VTO sources;
- simultaneous manual/cap Stop coalescing and duplicate recorder-event tests;
- cap during delayed sidecar, source end, provider disconnect, finalization timeout, and unmount;
- no early stop of borrowed tracks and idempotent owned-resource cleanup;
- memory estimates and physical measurements at idle, 1 minute, 5 minutes, finalization, local
  processing, ElevenLabs processing, and Close/Discard; and
- background/foreground, interruption, codec, download, and cleanup evidence on every named
  physical target.

**Prohibited shortcuts:** silent chunk/original eviction, cloud streaming, relying on provider
expiry to stop recording, or publishing an incomplete take.

**Exit gate:** every supported target safely reaches 300 seconds, finalizes one valid original,
remains responsive, and releases resources according to the recording memory policy.

## 10. Wave 5 — High data, provider, cost, and content trust boundary

**Status:** Complete 2026-07-28

**Findings:** `SEC-004`, `UX-013`, `PROD-006`; `SEC-005`, `PROD-007`, `PROD-009`, `PROD-010`,
`PROD-015`

### Participant reference data

- Say **detach** when bytes remain and **delete** only when the promised data is actually erased.
- Disclose local retention at first upload/save and at relevant remove/reset/character-delete
  actions.
- Use a dedicated data directory or disposable environment for each approved participant/cohort.
- Add an operator checklist that proves whole-dataset retirement without deleting a shared
  directory.
- Do not add per-asset garbage collection until all retained relationships, lineage, retries, and
  transaction semantics are defined.

### Provider/content/cost policy

- Approve and document each provider's model/settings, participant eligibility, retention setting,
  refusal/content behavior, request/time limits, failure allowance, escalation path, and support
  owner.
- Keep VTO secondary/beta and add guidance for one garment/plain background without fit, sizing, or
  purchase-accuracy claims.
- At reference Generate/Combined/Regenerate/Edit, disclose selected provider contact, possible
  usage, and retained local output.
- At ElevenLabs Apply, show clip duration and provider-usage context without inventing an
  unvalidated confirmation threshold.
- Keep Local Camera, upload-only, direct image save, prompt editing, and local Voice independently
  provider-free.

Required evidence:

- copy/accessibility tests at every affected action;
- isolated-directory retirement drill using disposable data;
- no-provider network denial;
- provider refusal/quota/outage/auth recovery using safe deterministic fakes; and
- signed approval of the external-participant provider and data procedures.

**Exit gate:** the UI, operator procedure, and provider settings tell the same truthful story.
Wiro remains unavailable to participants unless the approved policy explicitly permits its exact
configuration.

**Completion:** Upload, retained-reference Save, Detach, Reset, and character-record deletion now
state when immutable bytes remain. Builder generation and regeneration identify optimizer and
selected provider/model contact, possible credits, retained output, and provider-free
alternatives. ElevenLabs Apply shows duration/model/usage/zero-retention context, and VTO carries
the approved beta/no-accuracy guidance. `PILOT_ACCESS_MODE=participant` server-disables Wiro even
with credentials; only the explicit operator-qualification mode enables its separate technical
pass. The operator checklist and disposable retirement drill prove exact-leaf removal and
shared-root/sibling preservation without adding unsafe per-asset garbage collection. Copy,
accessibility, safe provider recovery, no-provider network denial, targeted multi-browser/mobile
journeys, and the normal quality gate pass. The approved release contract supplies the signed
policy decision. The two intentional Builder baselines were reviewed and refreshed on Darwin and
the pinned Linux runtime; both 29-case curated suites pass. Real
participant checklists and live-provider/device qualification remain later release evidence, not
Wave 5 implementation gaps.

## 11. Wave 6 — Touch/mobile, accessibility, Voice, and activation usability

**Findings:** `UX-003`–`UX-006`, `UX-008`; `PROD-001`, `PROD-002`, `PROD-011`, `PROD-014`;
`TEST-008`, `TEST-009`, `TEST-011`

**Status (2026-07-28):** runtime implementation and deterministic automated coverage complete.
The Studio now has session-only first-take guidance, action-first rail descriptions,
Character-primary/VTO-beta hierarchy with configuration recovery copy, a single-DOM narrow Builder
review shortcut, compact Voice breadcrumbs/progressive disclosure, dynamic axe/reflow coverage, and
a focused WebKit/touch synthetic-media smoke. The wave remains release-incomplete until the named
physical-device, safe-area/browser-chrome/software-keyboard, VoiceOver/TalkBack/desktop
screen-reader, and real WebKit media checks are executed and recorded. The ten intentional Darwin
baseline changes are reviewed; equivalent Linux baseline regeneration/review remains.

Implement only after the primary safety behavior is stable:

1. Keep Character visibly primary, VTO secondary/beta, Workshop advanced, and the local preview →
   Character → Record → optional Voice → Download path understandable.
2. Add an anchored Character Builder Review/Generate affordance or another approved
   single-DOM progressive-disclosure solution. Do not duplicate preview/generation state.
3. Make Stop visually dominant during recording and collapse unrelated unavailable controls
   without hiding session recovery.
4. Add action-first subtitles and plain verbs before considering any Dock/Shelf/Workshop rename.
5. Simplify dense Voice presentation while keeping provider/usage disclosure and an understandable
   Voice Treatments → saved-voice breadcrumb.
6. Use moderated observation first. Add light, dismissible in-context first-success guidance only
   for observed hesitation points; do not add a route or forced tour.
7. Keep product learning content-free through moderated notes or explicitly opted-in local
   diagnostics. Do not add a network analytics backend.

Required evidence:

- `320×568`, `390×844`, `834×1112`, `1280×720`, and `1440×960`;
- portrait/landscape, safe areas, short heights, browser chrome, software keyboard, 200% text,
  reduced motion, and approximately 44px touch targets;
- dynamic-state axe/focus coverage and keyboard-only journeys;
- VoiceOver/TalkBack and the approved desktop screen-reader matrix;
- focused physical WebKit/touch/media interaction smoke; and
- no document overflow, clipped critical actions, hover-only behavior, or duplicate stateful UI.

**Exit gate:** every included workflow is usable on the named touch/mobile matrix and with the
approved assistive technologies. Responsive screenshots alone do not satisfy this wave.

## 12. Wave 7 — Medium architecture and provider hardening

**Status (2026-07-29):** Complete. The pinned Decart SDK error event/throw shapes now cross the
adapter only as a small app-owned allowlist with a generic fallback; cancellation, disconnect, and
listener/track cleanup remain independently covered. ElevenLabs preview and Voice Changer success
responses now enforce declared and cumulative byte ceilings, cancel the upstream reader on
overflow/caller cancellation, reject malformed MP3 output, and apply the same bounds again before
the browser constructs a Blob. Exact-boundary, declared/chunked/endless overflow, cancellation,
safe-error, and immutable-original/last-valid-take tests pass. No live provider call was needed or
made.

### 7A. Safe Decart error recovery

**Findings:** `ARCH-002`, remaining Medium portion of `TEST-004`

- Map only a small verified allowlist of installed/documented SDK errors into app-owned safe codes.
- Preserve a generic fallback and never expose arbitrary provider codes, messages, bodies, URLs, or
  causes.
- Test known mappings, unknown fallback, cancellation, disconnect, and cleanup.

### 7B. Bound successful ElevenLabs output

**Findings:** `PERF-002`, `TEST-006`

- Choose byte ceilings from measured valid five-minute output formats.
- Enforce both declared `Content-Length` and cumulative streaming limits.
- Abort upstream work on overflow/cancel where supported.
- Preserve the immutable original and last valid take on every failure.
- Test below-boundary, exact-boundary, declared oversize, chunked oversize, endless stream,
  malformed content, cancellation, and browser-safe normalized errors.

**Regression guard:** do not create a universal provider interface or a server-wide generic
repository. Keep provider request/poll/download formats and resource ownership inside their
adapters.

**Exit gate:** provider failures remain safe but actionable, and successful Voice output cannot
consume unbounded server/browser memory.

**Completion evidence:** the installed `@decartai/sdk@0.1.15` declarations and implementation plus
the documented realtime error classes were used to freeze mappings for authentication, model
availability, WebRTC timeout/ICE/WebSocket, server, and signaling failures. Unknown codes, raw
messages, data, URLs, and causes collapse to the generic app fallback. ElevenLabs remains pinned to
`mp3_44100_128`; five minutes at 128 kbps is approximately 4.8 MB, so the app-owned conversion
ceiling is 8 MiB and the short saved-preview ceiling is 2 MiB. Both server and browser accept the
inclusive boundary and fail closed above it.

## 13. Wave 8 — High provider and physical-device qualification

**Findings:** `DOC-001`, `TEST-007`, `PROD-008`, `PROD-016`; final manual evidence for
`TEST-001`, `TEST-005`, `TEST-011`

**Status (2026-07-29):** Evidence implementation complete; qualification open. The approved matrix
is now executable as 7 provider/local requirements and 45 physical target/browser requirements.
Strict records allow only the date, full commit, generic environment/owner classes, exact app-owned
configuration, bounded timing/duration/MIME data, safe code, and pass/fail/blocked outcomes. Extra
fields are rejected, records from another commit do not count, and
`npm run pilot:qualification:check` fails closed while any row is missing or invalid. A
deterministic no-key Local journey separately protects the browser from provider HTTP, WebSocket,
SDK, token, and media work. No paid/live or physical pass was run in this implementation, so Wave 8
and every dependent release finding remain open.

Run only against the stable release candidate after the preceding behavior and policy waves pass.
Use dedicated least-privilege credentials, explicit billing authorization, non-sensitive test
media, and the assigned evidence owner.

Required separate passes:

1. Lucy 2.5 prompt-only, image-only, and combined input; Apply/clear/recovery; recording,
   finalization, fallback, and cleanup.
2. Exact `lucy-vton-3` prompt-only, garment-only, and combined input; no silent alias migration.
3. ElevenLabs saved-only browse, preview, Apply, remux, Download, Restore Original, zero-retention
   eligibility, limit, and failure behavior.
4. OpenAI optimize/generate/compose/edit.
5. BFL optimize/generate/compose/edit in a separate startup-selected server configuration.
6. Wiro optimize/generate/compose/edit and remote input/output cleanup in a separate
   startup-selected server configuration, only under the approved policy.
7. Local/no-key denial proving no unexpected external HTTP, WebSocket, SDK, token, or media
   traffic.
8. Every named physical device/browser target completing touch recovery, local/AI capture,
   300-second recording/finalization, Voice, download, background/foreground, and cleanup.

Record only safe evidence: date, commit, account/environment class, browser/OS/device class, exact
app-owned model/configuration, action timing, duration, MIME type, safe result/code, and pass/fail.
Never record credentials, prompts, personal media, raw provider bodies, signed URLs, tokens, or
network archives.

**Exit gate:** every included provider configuration and every support target has current,
reviewable evidence. A missing credential, owner, entitlement, policy approval, or physical device
keeps this wave open; it is not a reason to weaken tests or substitute mocks.

## 14. Wave 9 — Functional and release regression closure

**Findings:** `TEST-001`, `TEST-002`, `TEST-004`–`TEST-009`, `TEST-011`; `TEST-010` only if the
remaining harness duplication still causes false-state risk

**Implementation status (2026-07-29):** deterministic regression consolidation is complete.
Existing pure, component/controller, dynamic axe/focus, five-viewport, touch-recovery,
WebKit/mobile synthetic-media, provider lifecycle, safe-error/output-bound, no-key provider-denial,
Storybook, and curated visual protections were audited rather than duplicated. A missing Chromium
saved-voice journey now covers saved-library listing, preview without a take body, explicit
voice-intent on every ElevenLabs request, immutable-sidecar Apply, local remux, processed Download,
Restore Original, and exact object-URL preservation/release. The broad screenshot capture remains
an explicitly untracked artifact while the curated matrix and pruning inventory share the semantic
scenario paths; no observed false-state risk justifies `TEST-010` consolidation.

On the current Darwin host with Node 24, `quality`, coverage, the full functional E2E matrix,
production smoke, the curated 29-case visual suite, and every build/Storybook command passed
without baseline changes. The registry-backed production and full development dependency audits
could not be rerun in this execution because external dependency-metadata submission was not
authorized; the last documented state remains a clean production audit and six High plus one Low
development-only advisories assigned to Wave 10. Named physical device/browser, assistive
technology, codec, maximum-duration provider, and live-provider qualification also remain open
under Wave 8. Therefore the implementation is present, but the Wave 9 release exit gate is not yet
fully satisfied and no audit phase is moved to completed work.

Consolidate protection after behavior settles:

- pure domain tests for product rules and safe codes;
- component/controller tests for state, races, async generations, cancellation, cleanup, timers,
  duplicate Stop, and immutable originals;
- E2E for complete observable journeys, recovery, touch, focus, and network denial;
- Storybook for component states and focused interaction/accessibility;
- the existing curated visual suite for high-value visual regressions, semantic readiness, fixed
  time/media, viewport containment, and platform-specific baselines; and
- manual/live protocols only for physical devices, assistive technology, codecs, and providers.

Run the complete pre-release gate from a cleanly reproducible install:

```bash
npm run quality
npm run test:coverage
npm run test:e2e
npm run build
npm run test:production
npm run test:visual
npm run storybook:typecheck
npm run storybook:test
npm run storybook:build
npm run audit:prod
```

Also run the full development dependency audit and record any remaining accepted advisory; do not
claim it passed if it did not.

**Exit gate:** all required automated commands pass, every intentional baseline is inspected,
external network denial remains active, and all manual/live limitations are recorded rather than
silently waived.

## 15. Wave 10 — Medium-to-low maintenance and polish

### Development dependency advisories

**Finding:** `SEC-007`

- Prefer compatible upstream ESLint/minimatch/brace-expansion and tsup/esbuild upgrades.
- Use a narrow, supported override only with full lint/type/build/test/audit evidence.
- Never use `npm audit fix --force` or accept a breaking downgrade to make the report green.

### Temporary-artifact clarity

**Finding:** `UX-009`

- Consider “Close and release” or equivalent post-download copy while retaining confirmed
  Discard.
- Verify that copy matches actual object-URL release and does not claim browser download
  completion.

### Harness consolidation

**Finding:** conditional `TEST-010`

- Consolidate shared scenario/readiness setup only when measured duplication still causes false
  states or maintenance risk.
- Keep broad capture as an artifact and the curated suite as the regression oracle.

**Exit gate:** remaining local maintenance risk is either resolved with full evidence or documented
as a named, owned acceptance. No low-severity cleanup may destabilize the release candidate.

## 16. Wave 11 — Remote-backend preparation, design only

This wave prepares the next phase but does not implement or expose it.

**Remote findings:** `SEC-001`, `SEC-002`, `SEC-003`, `SEC-006`, `ARCH-003`, `PERF-003`; the
remote portions of `SEC-004`

Produce an approved design package covering:

1. **Deployment and threat model:** public origins, TLS termination, CSP/COEP inventory, CSRF
   posture, secret management, trust boundaries, abuse cases, incident response, and rollback.
2. **Identity and authorization:** authenticated subject, organization/tenant, roles, resource
   ownership, authorization matrix, secure session lifecycle, and account deletion.
3. **Resource inventory:** characters, recipes, references, takes, sidecars, processed outputs,
   provider operations, usage records, idempotency keys, and audit/support metadata.
4. **Persistence topology:** transactional metadata database, object storage, immutable/versioned
   fields, opaque IDs, provenance, timestamps, indexing, and consistency boundaries.
5. **Migration and portability:** explicit local import/export, schema/version migration,
   reversible rollout, rollback, ownership assignment, and no automatic destructive move.
6. **Retention and deletion:** promises, detach/delete semantics, relationship-aware erasure,
   tombstones/audit where justified, provider-side deletion, backups, legal holds if applicable,
   and whole-account deletion verification.
7. **Provider execution:** server-owned idempotency, durable jobs, poll/retry/reconciliation,
   cancellation, safe errors, concurrency, rate limits, entitlements, spend budgets, and support
   visibility without content leakage.
8. **Media ingestion:** authenticated upload records, server-derived duration/format limits
   including ElevenLabs input duration, malware/content handling as approved, and bounded
   processing.
9. **Observability and operations:** content-free metrics, logs/traces with redaction, alerts,
   dashboards, support tools, backups, restore drills, deploy/rollback, and incident ownership.
10. **Remote-phase test strategy:** auth/session/CSRF, authorization and tenant-isolation matrix,
    object-storage and database failure, idempotency, deletion/retention, rate/entitlement,
    migration/rollback, load, security, and the complete preserved local regression suite.

Architecture constraints:

- Never turn a loopback Host hash, device ID, filesystem path, provider ID, token, or storage key
  into user identity.
- Keep `packages/domain` and `packages/contracts` independent of React and provider payloads.
- Do not invent a generic repository spanning browser storage, transactional metadata, and object
  storage.
- Preserve explicit provider intent, immutable originals, app-owned safe codes, and one selected
  reference provider per execution unless a later approved policy deliberately changes them.
- Add code in this wave only for a demonstrated present-day migration hazard with a current
  consumer and migration tests.

**Exit gate:** the design has product, security/privacy, architecture, operations, and data-owner
approval. The local product still binds only to loopback. No remote implementation starts until
the handoff checklist below passes.

## 17. Pre-remote handoff checklist

All boxes are mandatory:

- [ ] Waves 0–10 are complete or have a written, owner-approved acceptance that does not weaken a
      controlled-pilot safety/support claim.
- [ ] No Critical or High local-loopback finding remains open.
- [ ] The exact physical support matrix and 300-second evidence are published.
- [ ] Every included provider configuration has current live evidence and an approved policy.
- [ ] Participant retention, detach/delete, and whole-dataset cleanup promises are approved and
      operationally verified.
- [ ] Credential, billing, evidence, incident, and support owners are named.
- [ ] All automated release commands pass and manual/live limitations are explicit.
- [ ] Current docs and user stories match the implemented local behavior.
- [ ] The remote threat model, ownership/authorization matrix, persistence design, migration plan,
      retention/deletion design, provider-spend design, and operations plan are approved.
- [ ] A separate remote-MVP implementation plan has been authorized.
- [ ] The loopback broker has not been exposed during preparation.

## 18. Explicitly deferred until after this plan

`PROD-018`–`PROD-030` remain deferred product work or scope constraints. Do not implement these as
“preparation”:

- public authentication, sessions, authorization, tenancy, or account UI;
- a production database, object store, distributed queue, or cloud take library;
- remote/public deployment, LAN/tunnel/proxy access, sharing, or collaboration;
- credits, subscriptions, trials, payment processing, settlement, or refunds;
- public voice import/cloning;
- automatic provider fallback;
- a marketplace, templates platform, commerce/VTO integration, or full editor;
- cloud character/recipe/video portability before ownership guarantees are approved; or
- revived Guided/Projects product routes.

Those belong to the separately approved remote or later product phases. The safest outcome of this
plan is a proven local product and a precise handoff—not a partially exposed backend.
