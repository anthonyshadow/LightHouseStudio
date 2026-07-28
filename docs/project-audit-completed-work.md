# Project audit completed work

This file preserves concise completion records removed from the
[active implementation plan](project-audit-implementation-plan.md). Add an entry only after every
acceptance criterion and validation gate for that work passes.

## 2026-07-28 — Wave 0 local release contract

**Scope:** Product and operating decisions only; no runtime compatibility or provider-readiness
claim.

Completed:

- Approved an entirely operator-assisted cohort of at most five invited solo creators/design
  partners with no unassisted local-beta step.
- Named the desktop, Apple/Android phone, and tablet qualification targets plus rolling stable
  Chrome, Firefox, Safari, iOS/iPadOS 26.6, and Android 17 baselines.
- Selected independent 30-second warnings for the 300-second recording and Decart active-session
  boundaries, including expected-end behavior during recording.
- Approved per-participant browser/data-directory isolation, a seven-day-return window, retirement
  within 24 hours of the final engagement and no later than eight days after first use, and a
  relationship-safe cleanup verification procedure.
- Approved exact Decart, OpenAI, BFL, Wiro, and ElevenLabs pilot settings, participant content and
  refusal rules, and no fallback or automatic paid resubmission.
- Assigned generic local-phase Credential Custodian, Billing Authorizer, Evidence Recorder, Pilot
  Product Owner, and Support & Escalation Owner roles.
- Approved participant/provider limits, content-free metrics, and the incident/escalation path.
- Recorded the full decision in
  [the controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) and synchronized
  product, privacy, provider, browser, QA, audit, and release documentation.

Intentional exclusions:

- No claim that the physical matrix, latest OS/browser combinations, 300-second behavior, provider
  configurations, cleanup procedure, or accessibility protocol has passed.
- No application code, remote exposure, accounts, cloud persistence, billing, or public
  moderation system.
- Wiro remains technical/operator qualification only, and ElevenLabs participant conversion
  requires confirmed zero-retention eligibility.

## 2026-07-28 — Repository, product, provider, UI/UX, and documentation audit

**Findings:** `TEST-003`, `DOC-002`  
**Scope:** audit and evidence only, except for visual-test/documentation modernization.

Completed:

- Independently reviewed architecture, product, and UI/UX, then ran a cross-specialist challenge
  and recorded the final disagreements/resolutions.
- Queried the existing Graphify knowledge graph for architecture, provider boundaries, media
  ownership, and high-impact modules.
- Compared current Decart and ElevenLabs integration behavior with current official documentation.
- Created the canonical architecture, product, UI/UX, consolidated findings, active plan, visual
  coverage, and documentation-index documents.
- Rebalanced the curated Chromium suite within its 29-case review budget around current central
  states and all five established viewports.
- Added semantic screenshot readiness checks that reject unresolved deferred-tool fallbacks.
- Added deterministic saved-character, Character Builder combined-reference, VTO, and Voice
  fixtures without live provider traffic.
- Generated all 29 Darwin and all 29 Linux/amd64 baselines with the pinned Chromium/Playwright
  runtime, then visually reviewed every retained image in platform contact sheets plus full-size
  spot checks of initial Studio, recording, Character Builder, saved-character library, settled
  Take Review, Voice Browser, and permission failure.
- Pruned 54 non-curated broad captures only after both platform sets were complete; the retained
  manifest now verifies exactly 29 baselines per platform with no missing or extra files.
- Re-enabled the curated visual job in the main CI workflow.
- Removed obsolete, unreferenced images of the retired Guided experience and moved the current
  Character Builder story to a stable direct path.
- Corrected stale provider-documentation links and current-state journey/documentation claims.

Intentional exclusions:

- No broad product refactor, backend, authentication, payments, analytics, cloud persistence, or
  provider fallback.
- No live paid provider calls.
- No claim that the visual work fixes the interaction defects it now exposes.
- No silent replacement of the pinned `lucy-vton-3` contract.

Validation results and any environment-limited checks are recorded in the task handoff and should
be repeated after later implementation phases.
