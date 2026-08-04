# Project audit findings

**Current as of:** 2026-08-02

This register contains unresolved findings only. Current behavior is defined by
[Architecture](ARCHITECTURE.md) and the [user stories](userStories/README.md). Execution order
lives in the [active plan](project-audit-implementation-plan.md).

## Assessment

Lightframe Studio has a coherent local-first record/upload post-editing loop and strong resource,
provider, and persistence boundaries. The supported product remains an operator-assisted,
loopback-only pilot candidate. It is not qualified for participants and is not a public backend.

The original runtime blockers have been implemented with deterministic coverage. The remaining
pilot work is candidate verification, physical-device/accessibility evidence, live-provider
qualification, and per-participant operating evidence.

At this audit the qualification validator reports **0/12 provider/local** and **0/45 physical**
passes because no completed evidence records are checked in.

## Active controlled-pilot findings

| Finding                                                                                                         | Current state                                                                                                                                                                                                                                                           | Completion evidence                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARCH-001`, `DOC-001`, `TEST-004`, `TEST-007` — live provider qualification                                     | Decart clock/end handling, startup-selected batch broker/state, safe errors, provider finalization order, and synthetic journeys are implemented. Live entitlement, exact-model behavior, batch output/retention, pricing, and five-minute boundary evidence is absent. | Pass all twelve provider/local rows for the exact candidate, including Decart batch Character/VTO, Pruna Character 720p/1080p, and Pruna Wardrobe.                                      |
| `UX-001`, `UX-003`, `UX-006`, `TEST-001`, `TEST-008`, `TEST-009`, `TEST-011` — physical touch and accessibility | Touch/pointer/focus/keyboard recovery, dominant recording Stop, narrow Builder access, reflow, synthetic WebKit, axe, and focus tests exist. No named physical row is qualified.                                                                                        | Pass every required physical browser/device row, including safe areas, keyboard, 200% text, focus/status, screen reader, and real media behavior.                                       |
| `PERF-001`, `TEST-005` — real 300-second media evidence                                                         | The independent 270/300-second warning and coalesced Stop/finalize path are implemented for Local, Character, and VTO. Browser memory, codecs, interruption, remux, and cleanup remain unmeasured on required targets.                                                  | Record successful one- and five-minute checkpoints, finalization, local/ElevenLabs processing, download, background/foreground, and cleanup for all claimed targets.                    |
| `SEC-004` — participant data retirement                                                                         | Detach/retention copy, isolated-directory policy, checklist, and disposable cleanup drill are implemented. No real participant environment has completed the procedure.                                                                                                 | Pass the drill before admission and complete the content-free checklist for every participant profile/data directory through final retirement.                                          |
| `PROD-001`, `PROD-002`, `UX-004`, `UX-005`, `UX-007` — comprehension and value                                  | Record/upload hierarchy, action-first descriptions, availability reasons, and dismissible first-take guidance are implemented. No moderated cohort evidence exists.                                                                                                     | Observe the approved cohort without expanding scope; record only the contract's content-free activation, comprehension, reuse, output-value, and support measures.                      |
| `SEC-007` — dependency and candidate verification                                                               | Production dependencies audit clean. One low-severity Windows development-server advisory remains in `tsup`'s pinned `esbuild@0.27.x` range; functional/visual recording paths also remain blocked by the known synthetic transcode limitation.                         | Run every release command against one exact candidate and resolve failures without an incompatible transitive override, forced downgrade, weakened assertion, or blind snapshot update. |

Resolved runtime, UX, provider, and visual findings are intentionally omitted. See
[completed work](project-audit-completed-work.md) for their durable summary.

## Deferred public-product blockers

These are not active local-pilot work:

- `SEC-001`: no public authentication, authorization, tenancy, or CSRF/session boundary;
- `SEC-002`: no public rate, entitlement, billing, or spend enforcement;
- `SEC-003`: no deployment-specific CSP/origin policy;
- `ARCH-003` / `PERF-003`: filesystem ownership, process-local coordination, and repair scans are
  single-operator mechanisms;
- `SEC-006`: a future untrusted upload boundary must derive or authoritatively bind audio duration;
  and
- no public retention/deletion, moderation, observability, incident, backup, or rollback system.

The [remote backend handoff](REMOTE_BACKEND_HANDOFF.md) is an unapproved design for those seams. It
does not authorize remote exposure, accounts, cloud persistence, or billing.

## Decisions that remain fixed

- Record/upload post-editing is primary; live Character/VTO transformation and Workshop are advanced.
- Touch/mobile creation and the 300-second take maximum are required.
- The server remains loopback-only.
- Provider contact stays explicit; image providers remain startup-selected with no fallback or
  automatic initial paid retry.
- Whole-environment retirement is the pilot deletion promise; unsafe per-asset garbage collection
  is rejected.
- Public-platform work waits for pilot evidence and separate approval.
