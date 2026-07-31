# Project audit implementation plan

This file contains incomplete work only. Resolved runtime findings are in
[completed work](project-audit-completed-work.md); current gaps are in
[findings](project-audit-findings.md). Remove a phase only after every listed acceptance condition
passes for the same release candidate.

Scope is fixed by the [controlled-pilot contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md): moderated,
loopback-only, at most five participants, Character primary, VTO beta, touch/mobile required, a
300-second take maximum, and no provider fallback.

## Phase 0 — Existing-video single-processing acceptance

**Objective:** qualify the new first-class upload source and exact-model batch workflow before
freezing a release candidate.

Implementation scope:

- one source/visual/voice take pipeline shared by recording and upload;
- authoritative H.264 MP4/MOV and VP8 WebM inspection with the app-owned duration, aspect, byte,
  720p orientation, and synchronization limits;
- strict same-origin video-job contracts, a server-only exact-model Decart adapter, one in-memory
  active job, temporary filesystem ownership, and safe errors;
- zero or one visual transformation, with Lucy and VTO mutually exclusive and no automatic paid
  resubmission; and
- provider-free upload/preview/download plus accessible keyboard/touch configuration in the
  existing persistent stage and overlay system.

Acceptance:

- domain, contract, API, controller, component, E2E, accessibility, and cleanup tests cover every
  rule and failure branch in the existing-video user story;
- all five canonical viewports and 200% reflow preserve the stage, focus, high-consequence actions,
  and named internal scrolling;
- the exact-model live rows and all affected physical rows pass for the same commit;
- `graphify update .` reflects the final ownership/dependency graph; and
- every Phase 1 release command passes without paid traffic or weakened assertions.

Keep this phase incomplete until automated, live, and physical evidence all pass. Deterministic
implementation does not by itself qualify Decart output, mobile pickers, codecs, memory, or
provider retention.

## Phase 1 — Exact-candidate automated gate

**Objective:** establish one candidate before paid or physical qualification.

Complete:

- `pnpm quality`
- `pnpm test:coverage`
- `pnpm test:e2e`
- `pnpm test:production`
- `pnpm test:visual`
- `pnpm audit:prod`
- `pnpm audit:all`
- `pnpm pilot:data-retirement:drill`
- visual baseline inventory and review for every changed Darwin/Linux image

These exact-candidate commands are explicit release work. Coverage and visual regression are not
ordinary push/pull-request CI jobs; that separation does not remove either release acceptance
condition.

Acceptance:

- all commands pass from a clean install on the same full commit;
- unexpected external HTTP/WebSocket denial remains active in ordinary tests;
- no snapshot is updated merely to pass;
- no registry advisory is bypassed with a forced downgrade; and
- the candidate is frozen before evidence collection.

This documentation audit did not run the full release suite or registry-backed audits.

## Phase 2 — Provider and local qualification

**Objective:** close the nine content-free provider/local rows for the Phase 1 commit.

Run the approved procedures in [live provider smoke](LIVE_PROVIDER_SMOKE.md) and record only the
schema in [qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md).

Required rows:

1. Local with no provider credentials or external network;
2. Decart `lucy-2.5`;
3. Decart `lucy-vton-3`;
4. Decart batch `lucy-2.5`;
5. Decart batch `lucy-vton-3`;
6. ElevenLabs saved-voice browse, preview, Apply, remux, Download, and original restore;
7. OpenAI optimization/reference generation;
8. BFL reference generation as the startup-selected provider; and
9. Wiro as a separate operator-qualification pass with required cleanup.

Acceptance:

- `pnpm pilot:qualification:check --commit <full-sha> --verbose` reports `9/9`;
- models, settings, access mode, retention, entitlements, billing authorization, and content policy
  match the release contract;
- every initial billable submission is explicit, has no fallback, and is not automatically
  retried;
- the two Decart models reach expected five-minute behavior without losing the prepared recipe or
  a recording; and
- failures use safe app-owned codes and preserve local preview/original media.

Never run these paid/live passes in CI or without the approved credentials, account review, and
generic owner roles.

## Phase 3 — Physical device, accessibility, and memory qualification

**Objective:** pass all 45 required target/browser rows for the same candidate.

Follow [Browser support](BROWSER_SUPPORT.md), [Manual QA](MANUAL_QA.md), and the
[recording memory policy](RECORDING_MEMORY_POLICY.md).

Every applicable row must cover:

- permission allow/deny/revoke; local/Character/VTO capture; uploaded-video selection,
  replacement, local download, mutually exclusive batch Lucy and batch VTO; and device
  replacement;
- pointer/keyboard or touch recovery, orientation, safe areas, browser chrome, software keyboard,
  200% text, focus, status announcements, and the approved assistive technology;
- a real 300-second take, finalization, memory checkpoints, background/foreground interruption,
  uploaded/recorded local and ElevenLabs processing, download/playback, and cleanup; and
- exact OS/browser/device versions with no emulator or silent target substitution.

Acceptance:

- the validator reports `45/45` physical rows and no invalid records;
- all evidence names the same full commit as Phases 1–2;
- each supported claim is no broader than the passing row; and
- failures remain failed/blocked until the cause is corrected and the exact row is rerun.

## Phase 4 — Moderated pilot operation and learning

**Objective:** operate the approved cohort safely and decide whether the core loop earns further
investment.

Before each participant:

- resolve a fresh browser profile and dedicated `LIGHTFRAME_DATA_DIR`;
- verify the provider/account configuration and operator limits;
- record the generic role owners; and
- admit only one participant environment at a time.

During and after the engagement:

- follow the content/refusal/support policy;
- collect only the content-free measures in
  [product state](product-state.md#controlled-pilot-success-metrics);
- test comprehension of provider contact, Download, and Detach-versus-delete;
- complete the planned return session, withdrawal, or cancellation path; and
- retire the environment within the approved deadline using the signed checklist.

Acceptance:

- every participant environment has a complete, content-free isolation and retirement record;
- no policy, cost, credential, provider-cleanup, or data-isolation incident is unresolved;
- cohort measures are aggregated and row-level participant codes are deleted; and
- the Product Owner records a go/no-go decision for another local cohort or a separately approved
  product phase.

## Deferred, not active MVP work

Accounts, remote hosting, cloud persistence, public deletion, entitlements, billing, collaboration,
sharing, and a creator platform are not phases of this plan. The
[remote backend handoff](REMOTE_BACKEND_HANDOFF.md) must receive product, security/privacy,
architecture, operations, data-owner, and spend-policy approval before any of that work is scoped.
