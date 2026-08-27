# Technical architecture audit

Does the architecture support the experience the product wants? Mostly yes. Each issue below is
classified as:

**(1)** affects users now · **(2)** will affect users as usage grows · **(3)** affects
maintainability · **(4)** technically imperfect but not worth changing.

## Boundaries — sound

Imports point inward and stay there. `packages/domain` holds real policy (1,487 lines of Project
rules alone) with no React, no HTTP and no I/O. `packages/contracts` is Zod only. `apps/web` never
imports `apps/api` implementation. Route handlers are thin; policy sits in domain rules or
application services.

The web shell/runtime split is the best structural decision in the codebase:
`AuthenticatedShell` owns what outlives a surface — the query cache, awaitable confirmations, the
session lifecycle — and the Studio capture runtime is lazily mounted **only** on the three routes
that own live media, derived rather than hand-listed and asserted route-by-route in `paths.test.ts`.

Two route-inventory oracles (`apps/web/src/app/route-inventory.test.ts`,
`apps/api/src/route-inventory.test.ts`) fail when routes drift. This is cheap and unusually
effective.

## Data ownership and relationships — sound, with one empty node

Project is a properly modelled aggregate: immutable revisions carrying full snapshots, optimistic
concurrency on every mutation, idempotency receipts, and a documented ADR
([`decisions/0002-durable-project-aggregate.md`](../../decisions/0002-durable-project-aggregate.md)).

Campaign is `{name, brief, status, version}` and nothing else — a **product** gap, not a technical
one, but it means the Campaign→Project edge carries no information. **(1)**

## The largest liability: two Project repositories — **(3)**

`apps/api/src/features/projects/file-project-repository.ts` (2,524 lines) and
`apps/api/src/infrastructure/database/project-repository.ts` (3,861 lines) implement the same
`ProjectRepository` interface — 55 and 51 methods respectively — and must stay behaviourally
identical forever.

They are tested by **two entirely separate suites with different strategies**:
`file-project-repository.test.ts` drives real temp-directory file I/O through the services;
`project-repository.test.ts` drives a scripted database. There is **no parameterized conformance
suite** asserting the same expectations against both.

Both paths are live: `DATABASE_MODE=local` is the documented default in `.env.example`, development
requires `postgres`, and production requires `neon`.

Nothing here is currently broken. The risk is structural: 6,385 lines of parallel implementation
with no mechanism that fails when they diverge. **Recommendation: one shared conformance suite, not
a rewrite.** Roadmap step 13.

## Client/server responsibility — one misplacement — **(1)**

**Video rendering lives entirely in the browser, including for the product's headline output.**

- Local editing in the browser is the right call and a genuine differentiator.
- **Placement re-framing in the browser is not.** It makes the deliverable dependent on
  `VideoEncoder`/`VideoDecoder` availability, produces the file only when a particular download
  button is pressed, and leaves the server with no way to produce the artifact it recorded a
  specification for.

The fallback is handled honestly rather than silently, which is to the code's credit — but the
consequence is that a saved Video is never in its placement. This is the single architectural fact
behind the product's biggest gap.

The cheapest correct fix reuses what exists: render with the current WebCodecs worker **at save
time**, upload the re-framed bytes through the working-media path that already exists, and reference
those bytes in the save. That requires no new server render pipeline. Roadmap step 4.

## Media handling — good

- Project sources stream from a ranged content route rather than downloading whole. Confirmed live:
  `GET /api/projects/:id/source/content` returned `206 Partial Content`, after a
  `Range: bytes=0-0` probe that proves the route serves the media before the stage commits to it.
- `PresentedRecordingArtifact.media` is either an owned `Blob` or a URL-backed
  `remote-presentation`, narrowed through `ownedRecordingArtifact` when complete bytes are needed.
- Object-URL lifecycle was checked directly: 11 creations, 10 revocations, and the asymmetry is
  accounted for — `useSessionDraftState` revokes the previous URL before creating a replacement and
  revokes every draft on unmount; `ReferenceImageField`'s single creation transfers ownership to
  that same state. **No leak found.**
- Recording memory is bounded by a measured policy with its own estimator script.
- Upload size is capped at 300 MB in the contract, and reads are byte-bounded and streamed.

## Data fetching — good, with one small over-fetch — **(4)**

Measured on a Dashboard load: six parallel requests — projects, campaigns, videos, video-jobs,
capabilities, creative-library. No waterfall, no N+1.

Two notes:

- Each request appears twice in the dev network log, the first aborted. That is React 19 StrictMode
  double-invocation with TanStack Query cancelling via `AbortSignal` — **development-only, not a
  defect.**
- The Dashboard fetches Projects and Campaigns at `pageSize=20` and renders four. For Campaigns this
  is deliberate and commented: campaign names must resolve for any Project, not only for the four
  shown. For Projects it is incidental, but the query key is shared with the Projects list surface,
  so the extra rows warm the next navigation. Payloads are small. Not worth changing.

Polling is disciplined: the processing queue polls at 3 s **only while jobs exist**, stops at zero,
and re-checks on window focus so work started elsewhere becomes visible.

## Rendering — no problems found — **(4)**

React Compiler is enabled. The one-second elapsed-time tick is isolated in `ProcessingQueueTrigger`
so a live job re-renders a button rather than the route. `VideoExportPanel` deliberately owns its
own render-progress state so a many-times-per-second progress update cannot re-render the poster
grid behind it. This is careful work.

## Component size — **(3)**

| File                                                               | Lines |
| ------------------------------------------------------------------ | ----- |
| `apps/web/src/features/video-gallery/VideoGallery.tsx`             | 1,057 |
| `apps/web/src/features/existing-video/useExistingVideoWorkflow.ts` | 924   |
| `apps/web/src/studio/StudioApp.tsx`                                | 840   |
| `apps/web/src/features/dashboard/DashboardRouteSurface.tsx`        | 821   |
| `apps/api/src/features/video-jobs/video-job-service.ts`            | 1,424 |

None is incoherent, and each has a defensible single ownership. They are large enough to slow review
and to make regressions easier. Worth splitting **when a change lands in one**, not as a campaign.

## Security — strong

- Loopback-only: non-loopback `Host` → `421`, unconditionally, in every configuration.
- Origin enforcement verified live: an off-origin request is refused `403 forbidden_origin`, with
  guidance that does not leak internals.
- Ownership derives from the verified session subject only — never from a body, query, path or
  device id.
- Server credentials never reach `VITE_*`. Errors are normalized; no raw provider bodies, prompts,
  internal URLs or upstream codes reach the client.
- The first-pass audit's release gate is closed:
  `PRUNA_VIDEO_REPLACE_DISABLE_SAFETY_CHECKER` now defaults to `false` and is configuration, not a
  hard-coded literal. The repository's `//TODO Before making project public` is gone — there are
  zero `TODO`/`FIXME`/`HACK` markers in application source.

**One content-policy note, not a code defect:** the audited environment is configured with the
reference-image model `seedream-v5-lite-uncensored`. That is an operator decision, correctly
expressed as configuration, and worth an explicit choice before the product is shown to anyone else.

## Error handling — good

No swallowed catch blocks anywhere in `apps/web/src` or `apps/api/src`. A route error boundary
distinguishes a stale-chunk failure from a crash, offers reload, and lets the operator copy
diagnostics on request rather than printing a raw error on the page. Client errors are recorded
locally and never transmitted.

## Observability — inconsistent — **(2)**

`pino` with request-id and OpenTelemetry trace correlation is wired into the runtime, and BFL and
Wiro reference-image lifecycles log through it (`app.ts:249-256`).

But video-job work — the paid, asynchronous, hardest-to-diagnose path — logs through bare
`console.warn` with no request or trace id: provider submission failure, terminal state without a
result, durable trace update failure, temporary cleanup failure. When a paid job fails in a
non-local deployment, the correlation needed to explain it is missing.

OTel tracing itself defaults off (`OTEL_TRACING_ENABLED=false`).

**Recommendation:** route provider logging through the same `pino` child logger. Small, and it makes
the most expensive failure mode diagnosable.

## Concurrency and failure recovery — good

Idempotency keys and CAS versions are load-bearing and consistently applied. Pending output
operations are persisted and reconciled on return. Job concurrency is bounded globally and
per-provider (`VIDEO_JOB_MAX_ACTIVE`, `VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER`). There is no automatic
paid retry anywhere. Acceptance-unknown states reconcile rather than resubmit.

I found no race condition. The one I looked hardest for — a save interrupted by reload creating two
Versions — is explicitly prevented and has user-facing copy for the recovery path.

## Scalability limits — **(2)**

Appropriate for one operator; the boundaries are known and mostly documented.

- Counts are computed to a ceiling (`exceedsCeiling`) rather than censused — a good decision.
- Cursor pagination throughout, with `max(40)` page sizes.
- Characters and Outfits render their entire list with no pagination — fine at tens, not at
  thousands.
- Browser-side rendering does not scale with video length; the 300 s / 300 MB caps are the real
  boundary and they are enforced.

## Dead code, duplication, flags

- `knip` reports **no dead code** (`bun run check:dead-code`, exit 0).
- Feature flags are few and honest: `REALTIME_VIDEO_BETA_ENABLED`, `PRUNA_VIDEO_REPLACE_ENABLED`,
  `PRUNA_IMAGE_TRY_ON_ENABLED`, `DEMO_AUTH_ENABLED`, `OTEL_TRACING_ENABLED` — all default-off except
  demo auth.
- The only substantial duplication is the dual Project repository, above.

## Repository health — one gate currently red — **(3)**

`bun run check:docs` **fails**: thirteen broken links, caused by an in-progress move of
`LightFrameUXAudit.md`, `LightFrameUXImplementationPlan.md` and `LightFrameSuperdesignPrompts.md`
into `docs/archived/` without updating the six documents that reference them.

This is working-tree state, not a shipped defect, but it means every subsequent change validates
against an already-failing gate. Fix first. Roadmap step 1.

## Summary by classification

| Class                                    | Issues                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| **(1) Affects users now**                | Browser-only placement rendering · Campaign edge carries nothing                            |
| **(2) Will affect users as usage grows** | Provider logging without correlation · unpaginated creative libraries                       |
| **(3) Maintainability**                  | Dual Project repository without a conformance suite · five large components · red docs gate |
| **(4) Not worth changing**               | Dashboard over-fetch · StrictMode double-fetch in dev                                       |
