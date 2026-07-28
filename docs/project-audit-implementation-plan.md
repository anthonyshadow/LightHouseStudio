# Project audit implementation plan

This file contains **incomplete phases only**. The sequence is intentional; do not interpret later
public-platform work as current MVP scope. When a phase is fully complete, append a concise record
to [completed work](project-audit-completed-work.md), then remove that phase here in the same
change. Never remove a phase because work merely started or because some tests were skipped.
Use the [immediate pre-remote plan](imediate-implementation-plan.md) as the dependency-safe
execution view through the remote-MVP handoff; this file remains authoritative for incomplete
phase status.

The default release assumption is a moderated, loopback-only, touch/mobile-inclusive
design-partner pilot with Character AI primary, VTO beta, local Voice and ElevenLabs, separate
OpenAI/BFL/Wiro qualification, an app-owned 300-second take maximum, and no public exposure. The
approved [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) now freezes the
physical browser/device targets, participant-data cleanup promise, provider/content policy,
generic local owner roles, usage limits, and escalation path. Their implementation and dated
physical/live evidence remain unresolved release dependencies.

## Phase 1 — Immediate journey and trust blockers

**Objective:** make the primary controlled-pilot path truthful, recoverable, and reachable before
adding new capability.

**Findings:** `UX-001`, `UX-002`, `UX-011`, `PROD-003`, `PROD-013`, `TEST-001`, `TEST-002`

**Progress (2026-07-28):** the Wave 1 `UX-001`/`TEST-001` runtime and automated work is complete:
`MediaStage` owns the single activity timer/listener set, live/playback controls recover from
pointer/touch/focus/keyboard activity, and recording renders a never-hidden dominant Stop action.
Wave 2 runtime, automated work, and maintained-platform visual review are also complete:
saved-character entry intent, permission recovery/retry, shared direct-Decart disclosure, and
truthful configuration copy are implemented and tested. The named physical matrix and
assistive-technology evidence are still pending, so this phase and the Wave 1 findings remain
open.

| Field          | Plan                                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Stage-level touch/pointer control reveal; never-hidden Stop Recording; one-shot Shelf entry intent to Characters; camera-denial recovery classification; direct-Decart disclosure; “configured” capability copy.                                                                                        |
| Likely systems | `StudioSessionControlBar`, `MediaStage`, `StudioApp`, Shelf controller, `studioStageNotices`, safe-error taxonomy, AI chooser, component/E2E/visual tests.                                                                                                                                              |
| Dependencies   | Use the frozen physical touch/mobile matrix and disclosure policy; obtain the named devices for evidence; preserve `/` and current overlays.                                                                                                                                                            |
| Risks          | Auto-hide regressions; focus restoration; stale Shelf intent; accidentally presenting configuration as live health.                                                                                                                                                                                     |
| Acceptance     | Touch/pointer restores controls after timeout; Stop remains available during recording; both character entries show Characters without an extra user correction; permission denial offers the intended settings recovery; every direct Decart Start carries disclosure; configuration copy is truthful. |
| Required tests | Unit tests for activity/timeout and notice mapping; E2E from both character entries through Use/Start; keyboard/focus checks; touch-context browser test; intentional visual updates only where copy/state changes.                                                                                     |
| Documentation  | Update affected user stories, UI/UX current state status, findings/completed-work records, and screenshots manifest if baseline meaning changes.                                                                                                                                                        |
| Exclusions     | No new route, picker, repository, media stage, modal system, provider health probe, onboarding tour, or broad label migration.                                                                                                                                                                          |

**Implementation prompt**

> Implement Phase 1 for `UX-001`, `UX-002`, `UX-011`, `PROD-003`, `PROD-013`,
> `TEST-001`, and `TEST-002`. Run `graphify query` and relevant `graphify path/explain` commands
> before editing; inspect the owning UI, controller, domain error rule, contracts, and journey
> tests. Preserve all behavior outside this phase and keep the persistent stage/shared overlay
> architecture. Add focused tests, then run type checks, lint, formatting, module/dead-code checks,
> unit/component/E2E tests, and production build; run `npm run quality` when feasible. Update
> screenshots only for intentional visual changes and inspect every changed baseline. Update the
> canonical docs and Graphify graph. Report files changed and unresolved issues; perform no
> unrelated cleanup. Only after every acceptance criterion and validation passes, append a
> completion record to `docs/project-audit-completed-work.md` and remove this completed phase from
> the active plan in the same change.

## Phase 2 — MVP reliability and provider-session boundary

**Objective:** expose the already-enforced Decart limit, handle expected expiry coherently, and
establish release evidence for every included capability.

**Findings:** `ARCH-001`, `PROD-004`, `DOC-001`, `TEST-004`, `TEST-007`

| Field          | Plan                                                                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Preserve token constraints in browser types; app-owned session clock/events; warning and expected-expiry outcome; local fallback; gated live evidence for Lucy, exact VTO, ElevenLabs, and separate OpenAI/BFL/Wiro configurations.                                     |
| Likely systems | realtime contracts/route/client, Decart gateway/resource/session hooks, stage status/controls, development realtime driver, live-smoke doc.                                                                                                                             |
| Dependencies   | Phase 1 disclosure; frozen 270/300-second thresholds; generic local owner roles; approved provider/content and retention settings; authorized test accounts and physical access to every named device.                                                                  |
| Risks          | Confusing token TTL with active-session cap; timer drift; recording finalization/source-loss races; raw SDK error leakage.                                                                                                                                              |
| Acceptance     | UI shows the authoritative maximum before Start and elapsed/remaining while active; warns; expected cap completion is not presented as a crash; local preview and current recipe survive; cleanup is deterministic; included-provider smoke evidence is dated and safe. |
| Required tests | Accelerated deterministic tick/end cases, disconnect distinction, expiry during recording/finalization, cleanup/cancellation, API contract tests, no external traffic in normal CI, manual gated smoke.                                                                 |
| Documentation  | Architecture, provider smoke, Character/VTO stories, privacy/cost copy, browser support, completed-work record.                                                                                                                                                         |
| Exclusions     | No usage billing, analytics backend, silent model alias change, automatic reconnect policy rewrite, or paid CI traffic.                                                                                                                                                 |

**Implementation prompt**

> Implement Phase 2 for `ARCH-001`, `PROD-004`, `DOC-001`, `TEST-004`, and `TEST-007`.
> Use Graphify impact analysis first, then trace token route → client → gateway → orchestration →
> stage and recording cleanup. Keep provider payloads out of domain/UI types, preserve local-only
> behavior, and never expose/persist credentials. Add deterministic tests and run typecheck, lint,
> format, static module/dead-code checks, unit/integration/E2E tests, builds, and the normal quality
> gate. Update screenshots only when the approved timer/warning changes a curated state; inspect
> baselines. Update canonical docs and `graphify update .`. Report changed files, exact live-smoke
> limitations, and unresolved issues; do no unrelated cleanup. Remove this phase from the active
> plan only after all acceptance criteria and required automated/manual evidence pass, while adding
> its completion record to `docs/project-audit-completed-work.md`.

## Phase 3 — Core-flow UX and activation

**Objective:** reduce first-success friction without replacing the current Studio interaction
model.

**Findings:** `PROD-001`, `PROD-002`, `UX-004`, `UX-005`, `UX-007`, `PROD-012`

| Field          | Plan                                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Light in-context activation guidance; action-first subtitles; Character-first hierarchy; returning-character resume; unavailable-experience reasons/recovery.                                                                                       |
| Likely systems | idle stage copy/actions, Creative Workspace rail, AI chooser, header/selector, Shelf metadata/controller, local first-use preference if approved.                                                                                                   |
| Dependencies   | Pilot observation from Phases 1–2; approved vocabulary; decide whether guidance persists or is tab/session-only.                                                                                                                                    |
| Risks          | Cluttering the stage; hiding expert tools; adding a parallel navigation model; misrepresenting VTO or provider availability.                                                                                                                        |
| Acceptance     | New users can identify Start Camera, Character, Record, Download sequence; experts retain direct tool access; Character is primary and VTO secondary/beta; resume never starts media/provider work automatically; unavailable branches explain why. |
| Required tests | First-run and returning-user E2E, focus/keyboard, persisted-preference sanitation if any, responsive/overflow, content assertions, moderated usability protocol.                                                                                    |
| Documentation  | README product flow, product state decisions, affected user stories, UI/UX status, Storybook notes.                                                                                                                                                 |
| Exclusions     | No onboarding route, forced tour, wholesale Dock/Shelf/Workshop rename, analytics service, automatic media/provider start, or cloud account state.                                                                                                  |

**Implementation prompt**

> Implement Phase 3 for `PROD-001`, `PROD-002`, `UX-004`, `UX-005`, `UX-007`, and
> `PROD-012` using observed pilot evidence. Query Graphify before edits and preserve the single
> route, stable stage, tool rail, and shared overlays. Make only the approved copy/hierarchy/resume
> changes; keep media/provider starts explicit. Add outcome-based unit/E2E/responsive/a11y tests and
> run typecheck, lint, formatting, static checks, tests, builds, and `npm run quality`. Update and
> inspect screenshots only where the phase intentionally changes visuals. Update canonical docs
> and the graph; list files and unresolved product decisions; prohibit unrelated cleanup. After
> every criterion passes, record completion in `project-audit-completed-work.md` and remove only
> this completed phase from the active plan.

## Phase 4 — Responsive and accessibility improvements

**Objective:** make high-consequence actions reachable at narrow sizes and under assistive
technology without duplicating stateful UI.

**Findings:** `UX-003`, `UX-006`, `TEST-008`, `TEST-009`, `TEST-011`

| Field          | Plan                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Narrow Builder Review/Generate access; dominant recording Stop; 200% text/reflow; dynamic-state axe/focus tests; manual screen-reader/touch checks; focused WebKit smoke.                                                             |
| Likely systems | Character Builder form/preview/footer styles, session control bar, OverlayPanel usage, accessibility-responsive and character-builder journeys.                                                                                       |
| Dependencies   | Phase 1 control behavior; named touch/mobile browser/device matrix; design approval for single-DOM progressive disclosure.                                                                                                            |
| Risks          | Duplicate controls/state, broken focus order, hidden scroll regions, reduced desktop efficiency.                                                                                                                                      |
| Acceptance     | Generate/review and footer actions remain reachable at 320/390/834 and 200% text; Stop is dominant and discoverable; no document overflow; focus order/status announcements are logical; manual assistive-tech checklist is recorded. |
| Required tests | Outcome-based responsive E2E, axe risk matrix, text-spacing/reflow, keyboard, touch, focused WebKit interaction smoke, Storybook variants, manual VoiceOver/TalkBack/NVDA as supported.                                               |
| Documentation  | Browser support, manual QA, screenshot coverage if curated states change, UI/UX current state.                                                                                                                                        |
| Exclusions     | No second preview DOM, page route, cross-browser pixel baselines, or claim of mobile media support without physical evidence.                                                                                                         |

**Implementation prompt**

> Implement Phase 4 for `UX-003`, `UX-006`, `TEST-008`, `TEST-009`, and `TEST-011`.
> Use Graphify first; inspect shared overlay/stage ownership and existing responsive tests. Preserve
> one DOM for Builder controls and one media stage. Add risk-based accessibility/responsive tests,
> run all static checks, unit/component/E2E/Storybook tests, builds, and quality. Change visual
> baselines only for approved layout outcomes and inspect all affected viewports/platforms. Update
> canonical browser/manual/UI docs and the graph. Report files and unresolved real-device gaps; no
> unrelated cleanup. Remove the phase only after automated and required manual criteria pass and a
> completion record is added.

## Phase 5 — Architecture stabilization

**Objective:** improve provider error/resource boundaries and remediate confirmed development
toolchain advisories through focused, compatible changes.

**Findings:** `ARCH-002`, `PERF-002`, `TEST-006`, `SEC-007`

| Field          | Plan                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope          | Allowlisted Decart safe-error mapping; bounded successful ElevenLabs preview/conversion streams; browser preservation on oversize/failure; compatible development-toolchain advisory remediation when available.                                                                     |
| Likely systems | Decart adapter/resource/session errors, domain safe-error taxonomy, ElevenLabs HTTP provider, streaming helper, voice API client/tests, package manifest/lockfile and CI.                                                                                                            |
| Dependencies   | Current official/installed SDK error shapes; approved byte ceilings based on five-minute output formats; compatible upstream ESLint/minimatch and tsup/esbuild releases.                                                                                                             |
| Risks          | Leaking provider detail; truncating valid audio; cancellation/backpressure bugs; overgeneralizing provider adapters; breaking lint/build resolution through an unsafe override.                                                                                                      |
| Acceptance     | Known safe Decart classes map to actionable app codes with generic fallback; raw data never escapes; declared/chunked oversize audio aborts safely; exact-boundary valid audio succeeds; original take remains valid; full and production npm audits pass without forced downgrades. |
| Required tests | Adapter/route/client tests for allowlist/fallback, content length and cumulative overflow, upstream cancellation, exact boundary, and immutable-original preservation; complete quality/build and both npm audits.                                                                   |
| Documentation  | Architecture/error model, provider smoke recovery, dependency finding status.                                                                                                                                                                                                        |
| Exclusions     | No universal provider interface, fallback engine, public rate system, server duration decoder, provider-message passthrough, or `npm audit fix --force`.                                                                                                                             |

**Implementation prompt**

> Implement Phase 5 for `ARCH-002`, `PERF-002`, `TEST-006`, and `SEC-007`. Query/explain the
> Decart and ElevenLabs paths with Graphify, verify current official SDK/API contracts, and keep mappings
> allowlisted and app-owned. Preserve every unrelated provider/media behavior. Add negative and
> boundary tests; remediate development advisories only through compatible upgrades or a tested
> narrow override, never a forced breaking downgrade. Run typecheck, lint, format,
> module/dead-code checks, unit/integration/E2E tests, builds, quality, and full/production audits
> as relevant. Update screenshots only if an intentionally
> changed visible recovery is curated, and inspect them. Update docs and graph; list changed files
> and unresolved provider unknowns; no unrelated cleanup. Move this phase to completed work only
> after all criteria pass.

## Phase 6 — Functional testing beyond completed screenshot modernization

**Objective:** close journey, dynamic accessibility, and deterministic provider-lifecycle gaps
that pixel tests cannot prove.

**Findings:** `TEST-001`, `TEST-002`, `TEST-004`, `TEST-005`, `TEST-006`, `TEST-007`, `TEST-008`,
`TEST-009`, `TEST-011`

| Field          | Plan                                                                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Consolidate completed phase tests; risk-based dynamic axe/focus; full saved-voice synthetic journey; local-camera all-provider denial; semantic scenario registry shared by curated/broad capture if duplication still harms maintenance.                               |
| Likely systems | E2E harness/actions/network driver, accessibility suites, Storybook variants, visual and broad-capture setup helpers.                                                                                                                                                   |
| Dependencies   | Behavioral Phases 1–5 complete; do not freeze known pre-fix states.                                                                                                                                                                                                     |
| Risks          | Test over-cross-product, brittle DOM coupling, slower CI, accidentally allowing external traffic.                                                                                                                                                                       |
| Acceptance     | Each critical finding has an observable journey test; no screenshot captures fallback unintentionally; external HTTP/WebSocket denial remains; broad capture is clearly an artifact, curated visual remains regression oracle; failure output names scenario/readiness. |
| Required tests | The tests added by this phase plus `quality`, coverage, E2E, production smoke, visual, Storybook, and audit gates.                                                                                                                                                      |
| Documentation  | Screenshot coverage, manual QA, architecture testability, user stories.                                                                                                                                                                                                 |
| Exclusions     | No paid/live CI, generated AI imagery in snapshots, five-viewport cross-product for every dynamic state, or implementation-private hook assertions when a journey suffices.                                                                                             |

**Implementation prompt**

> Implement Phase 6 for `TEST-001`, `TEST-002`, `TEST-004`, `TEST-005`, `TEST-006`,
> `TEST-007`, `TEST-008`, `TEST-009`, and `TEST-011`. Use Graphify impact analysis first and audit
> existing coverage before adding tests. Preserve deterministic fixed media/time/provider fakes and
> deny all unexpected external traffic. Avoid redundant matrices and DOM-private assertions. Run
> lint, format, type/static checks, unit/integration/component/Storybook/E2E/production/visual tests,
> coverage, builds, and dependency audit. Update screenshots only for intentional scenarios and
> review platform baselines. Update docs/graph; report files and unresolved manual/live evidence;
> no unrelated cleanup. Remove the phase only after every acceptance criterion passes and its
> completed-work entry is written.

## Phase 7 — Performance and resilience evidence

**Objective:** implement and prove the approved 300-second recording contract on the required
touch/mobile matrix.

**Findings:** `PERF-001`, `TEST-005`

| Field          | Plan                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Accessible pre-limit warning; safe automatic Stop/finalization at 300 seconds; physical device/codec measurement table; 1- and 5-minute finalization/local/ElevenLabs-processing/cleanup peaks; background/foreground cleanup checks. |
| Likely systems | Recording domain/orchestration, timer/status presentation, memory policy/estimator, focused tests, browser support, and manual QA.                                                                                                    |
| Dependencies   | Named product-supported physical device/browser matrix and access to every target.                                                                                                                                                    |
| Risks          | Lost take from an unsafe cap; misleading emulator evidence; scope expansion into streaming storage.                                                                                                                                   |
| Acceptance     | Every named target has versioned evidence at 300 seconds; warning is perceivable; automatic Stop coalesces and finalizes safely while preserving the original; cleanup returns resources; published limits match measurements.        |
| Required tests | Existing recorder/finalization race tests, accelerated warning/cap/duplicate-Stop tests, 300-second target-device protocol for local and model sources plus local/ElevenLabs processing, and regression commands.                     |
| Documentation  | Recording memory policy results, browser support, manual QA, README limitations.                                                                                                                                                      |
| Exclusions     | No silent chunk eviction, cloud upload, service-worker recording, or long-form editor.                                                                                                                                                |

**Implementation prompt**

> Implement Phase 7 for `PERF-001` and `TEST-005`. Use Graphify before any code change. Add the
> app-owned 300-second warning and safe automatic Stop/finalization without relying on provider
> expiry. Preserve immutable-original/finalization-before-release guarantees and duplicate-Stop
> coalescing. Add focused tests and run all static/test/build/quality gates; update visuals only for
> intentional warnings/timers and inspect them. Execute the physical 1- and 5-minute evidence
> protocol on every named target, including local/ElevenLabs processing and cleanup. Update
> memory/browser/manual docs and graph; report devices, codecs, measurements, files, and unresolved
> gaps; no unrelated cleanup. Only after the evidence and all criteria pass, record completion and
> remove this phase.

## Phase 8 — Backend-preparation boundaries

**Objective:** stabilize migration seams without implementing a backend prematurely.

**Findings:** `ARCH-003`, `SEC-001`, `SEC-002`, `SEC-003`, `SEC-004`, `SEC-006`, `PERF-003`

| Field          | Plan                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Design record for authenticated subject/tenant ownership, opaque IDs, timestamps/version/provenance, transactional idempotency, object storage, retention/deletion, rate/usage enforcement, CSP/deployment; keep current local implementations. |
| Likely systems | Domain/contracts/repository interfaces and architecture docs; code only for a proven migration hazard.                                                                                                                                          |
| Dependencies   | Validated pilot value; deployment, identity, tenancy, privacy, retention, moderation, and support decisions.                                                                                                                                    |
| Risks          | Premature universal repositories, provider payloads in contracts, treating Host hashes as user IDs, breaking local-first flow.                                                                                                                  |
| Acceptance     | Migration plan maps each current temporary detail to a future boundary; no filesystem key/token/device ID becomes public identity; no remote exposure occurs; any schema addition has a current consumer and migration test.                    |
| Required tests | Contract/migration tests only for approved current code changes; module boundary and full quality gates.                                                                                                                                        |
| Documentation  | Architecture/backend readiness, privacy, decision records, threat model.                                                                                                                                                                        |
| Exclusions     | No auth service, product database, distributed queue, cloud recording, billing ledger, or remote deployment in this phase.                                                                                                                      |

**Implementation prompt**

> Execute Phase 8 for `ARCH-003`, `SEC-001`, `SEC-002`, `SEC-003`, `SEC-004`, `SEC-006`, and
> `PERF-003` as a backend-readiness design/stabilization phase, not backend implementation. Query
> Graphify for persistence/owner/idempotency paths; preserve local behavior and dependency
> direction. Add code only for a demonstrated migration hazard with current acceptance criteria.
> Run all relevant static/tests/build/quality gates for any code change; update screenshots only for
> intentional UI changes. Update canonical architecture/privacy docs and graph, list files and open
> decisions, and prohibit unrelated cleanup. Remove this phase only when its design acceptance and
> any approved code criteria pass and a completion record is added.

## Phase 9 — Post-MVP account and cloud persistence foundation

**Objective:** add secure identity and user-owned persistence only after pilot evidence justifies a
remote product.

**Findings:** `SEC-001`, `ARCH-003`, `SEC-004`, `SEC-006`

| Field          | Plan                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Auth/session/CSRF, authorization/tenancy, user-owned characters/recipes/assets, deletion/retention, transactional metadata/object storage, migration/import strategy, observability/support basics.                     |
| Likely systems | New backend persistence/auth boundaries, API authorization, repository adapters, account UX; existing domain/contracts remain provider-independent.                                                                     |
| Dependencies   | Phase 8 design; privacy/legal/security review; deployment topology; validated cross-device/account demand.                                                                                                              |
| Risks          | Data leakage, broken local migration, storage cost, incomplete deletion, account complexity obscuring core value.                                                                                                       |
| Acceptance     | Threat model and privacy review pass; every resource is tenant-authorized; deletion/retention is testable; local data migration is explicit/reversible; no secret reaches browser; operational rollback/support exists. |
| Required tests | Auth/session/CSRF, authorization matrix, tenant isolation, migration, deletion, retention, object storage, load/failure, full existing regression suite.                                                                |
| Documentation  | Security model, operations, privacy/retention, migration, support runbook, updated deployment instructions.                                                                                                             |
| Exclusions     | No credits/subscriptions, social sharing, collaboration, or full cloud video editor.                                                                                                                                    |

**Implementation prompt**

> Implement Phase 9 for `SEC-001`, `ARCH-003`, `SEC-004`, and `SEC-006` only after the product
> owner authorizes remote accounts. Begin with Graphify and the approved Phase 8 design; preserve
> provider-independent domain/contracts and local export behavior. Add security/tenant/migration
> tests plus all lint/type/static/unit/integration/E2E/build/quality checks. Update visuals only for
> approved account UI and inspect them. Update security/privacy/operations docs and graph, report
> files and unresolved risks, and perform no unrelated cleanup. Remove the phase only after the
> security/privacy acceptance and every test pass, with a completed-work entry.

## Phase 10 — Monetization and entitlement enforcement

**Objective:** choose and enforce a sustainable model from measured provider cost per usable
download.

**Findings:** `SEC-002`, `PROD-007`, `PROD-014`, `PROD-015`

| Field          | Plan                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Usage semantics/ledger, rate/concurrency, plan entitlements, credit reservation/settlement/refund rules, user visibility, billing provider only after pricing decision.                   |
| Likely systems | Authenticated backend routes, usage events, provider operation IDs, account UI, support/admin tools.                                                                                      |
| Dependencies   | Accounts; privacy-reviewed measurement; actual provider consumption and usable-output rates; credits-vs-subscription decision.                                                            |
| Risks          | Spend abuse, double charging, unfair failure billing, provider/account mismatch, premature pricing.                                                                                       |
| Acceptance     | Server enforces every paid operation; idempotent settlement handles success/failure/cancel; user sees limits; support can audit without content; pricing is backed by measured economics. |
| Required tests | Concurrency/rate, entitlement, reservation/settlement/refund, idempotency, webhook/auth, failure/retry, privacy/logging, full regression.                                                 |
| Documentation  | Pricing/usage policy, support/refund runbook, security/privacy, provider-specific accounting assumptions.                                                                                 |
| Exclusions     | No payments before economics; no client-side-only enforcement; no recording of prompts/media/names/voice IDs/provider URLs.                                                               |

**Implementation prompt**

> Implement Phase 10 for `SEC-002`, `PROD-007`, `PROD-014`, and `PROD-015` only after accounts
> and measured economics exist. Use Graphify to trace every billable boundary; preserve explicit
> provider intent and idempotency. Add complete server-enforcement/failure/privacy tests and run all
> static, unit, integration, E2E, build, quality, audit, and security gates. Update screenshots only
> for approved usage UI and inspect them. Update pricing/support/security docs and graph; report
> files, assumptions, and unresolved business decisions; no unrelated cleanup. Remove the phase
> only after every acceptance criterion passes and completion is recorded.

## Phase 11 — Longer-term creator platform

**Objective:** expand only from validated repeated individual creation and export.

**Findings:** `PROD-018`–`PROD-030`

| Field          | Plan                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | Prioritized options: cloud take history, portable libraries, trim/history, curated packs, sharing/publishing, collaboration, commerce-aware VTO. Each requires its own evidence gate. |
| Likely systems | Account media libraries, asynchronous processing/storage, sharing/rights/moderation, collaboration models, creator UX.                                                                |
| Dependencies   | Repeat-use/cohort evidence; accounts/retention; unit economics; rights/moderation/product thesis for each feature.                                                                    |
| Risks          | Building a platform before product-market fit; privacy/rights expansion; expensive media storage; diluted Character-performance value.                                                |
| Acceptance     | Each selected feature has a validated user problem, measurable success criterion, approved security/privacy/cost design, and independently scoped implementation plan.                |
| Required tests | Feature-specific domain/contract/security/load/E2E/accessibility/visual tests plus full regression and operations drills.                                                             |
| Documentation  | Product decision record, architecture/threat model, user stories, operations/support, roadmap update.                                                                                 |
| Exclusions     | No automatic multi-provider fallback, public voice import/cloning, revived retired routes, or marketplace before explicit approval/evidence.                                          |

**Implementation prompt**

> Select and implement one independently approved Phase 11 item referencing the applicable
> `PROD-018`–`PROD-030` IDs. First use Graphify to map impact and verify the evidence trigger; do
> not bundle unrelated platform features. Preserve existing local creation/export and provider
> boundaries. Add all feature, security, accessibility, performance, and regression tests; run
> lint/type/static/unit/integration/E2E/visual/build/quality/audit gates. Update screenshots only for
> intentional new UI and inspect them. Update canonical product/architecture/user-story/operations
> docs and graph; list files and unresolved issues; prohibit unrelated cleanup. Remove only the
> completed item/phase after all acceptance criteria pass and its completion record is written.
