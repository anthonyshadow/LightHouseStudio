# Systems architecture audit

Each finding is classified by who it affects:

**(1)** affects users now · **(2)** will affect users as usage grows · **(3)** affects
maintainability only · **(4)** technically imperfect, not worth changing.

## Overall assessment

This is a well-architected codebase. Dependencies point inward, the domain package is free of React,
HTTP and I/O, contracts are shared and validated at both ends, route inventories fail when they
drift, and the shell/runtime boundary is real and enforced. The findings below are refinements, not
a case for rework.

## Domain boundaries — sound

`packages/domain` holds product policy with no framework coupling. `packages/contracts` holds Zod
schemas used by both apps. `apps/web` never imports `apps/api`. Route handlers are thin; policy
lives in domain rules and application services. `bun run check:modules` enforces the graph.

The one boundary worth watching: `packages/domain/src/projects/rules.ts` is 1 138 lines and
`packages/contracts/src/projects.ts` is 1 051. Project is doing a lot of work as a single aggregate.
Not a problem yet. **(4)**

## State management — sound, with one caveat

TanStack Query owns remote state in the shell so it survives navigation. The Studio runtime owns
ephemeral capture state and is torn down on exit. Cross-route state passes through
`StudioRuntimeRegistry` and a handoff channel rather than shared mutable state. Route-triggered
effects key on `location.key`, which is correct for a persistent shell.

**Caveat (3):** `StudioApp` is a 782-line orchestrator wiring roughly 30 hooks, several of which
take 8–15 parameters. It is readable, well-commented and correct, but it is the single point where
every Studio concern meets. Adding a capability means editing this file.

## Component architecture

| #   | Finding                                                                                                                                                                                             | Class   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AR1 | **`ProjectRouteSurface.tsx` is 1 350 lines** holding the Projects list, the overview, the workspace, the source section, notices and four dialog mounts. Three unrelated surfaces share one module. | **(3)** |
| AR2 | **`StudioApp.tsx` is 782 lines**, the convergence point for capture, review, uploads, editing, project bridging and saving.                                                                         | **(3)** |
| AR3 | **`VideoGallery.tsx` is 886 lines** — list, filters, preview overlay, version inspector, rename and delete in one component.                                                                        | **(3)** |
| AR4 | **Style modules rival their components** — `ProjectRouteSurface.styles.ts` 968 lines, `StudioApp.styles.ts` 810. Splitting the component should split these too.                                    | **(3)** |

None of these are god components in the pejorative sense — they are cohesive and heavily tested.
They are simply large enough that they slow change.

## The largest maintenance liability

**Two complete Project repositories that must behave identically.**

- `apps/api/src/features/projects/file-project-repository.ts` — 2 423 lines
- `apps/api/src/infrastructure/database/project-repository.ts` — 3 819 lines

Both implement the same optimistic-concurrency, revision-append, asset-link, output-save and
processing-trace semantics. 6 200 lines of policy surface that can silently diverge. There is
integration coverage, but every future Project change must be written twice and verified twice.
**(3)**, escalating to **(2)** as Project features grow.

Do not consolidate this now. It is a large, risky change with no user-visible benefit. Record it,
and revisit it if `local`/`shadow` mode is ever retired.

## Persistence and data ownership — sound

Ownership always comes from the verified session subject via `ownerUserIdForRequest`, never from a
body, query, path or device id. Optimistic concurrency (`expectedVersion`,
`expectedRevisionNumber`) on every Project and Campaign mutation. Idempotency keys on saves.
Server-side keyed locks for file-mode atomicity. Byte storage abstracted behind `AssetByteStore`
with local, R2 and shadow implementations.

## Performance

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                            | Class                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| PF1 | **Full-video buffering on Project open.** `useProjectSourceController` downloads the entire source — bounded at 300 MB — into a `Blob` before the workspace is usable (`:176`). At 1080p this is tens of seconds on a fast link and minutes on a slow one, with a blocking "hydrating" phase. The bytes route already supports HTTP ranges via `sendRangedAsset`; the workspace does not use them. | **(1)**, worsening **(2)** |
| PF2 | **Dashboard polls the job queue every 3 s** whenever any job is active (`refetchInterval: 3_000`). Correct for one operator; not a pattern to carry forward.                                                                                                                                                                                                                                       | **(4)**                    |
| PF3 | **Thumbnails are generated once, client-side, at save time**, with no server fallback and no backfill. One failure is permanent.                                                                                                                                                                                                                                                                   | **(1)**                    |
| PF4 | **Peak memory during finalization** holds recorder chunks, the raw assembled input, the in-progress encoded output, the final MP4 and an optional audio sidecar simultaneously — documented and measured in [`RECORDING_MEMORY_POLICY.md`](../RECORDING_MEMORY_POLICY.md), and the reason for the 300-second cap. Honest, bounded, and a real ceiling on clip length.                              | **(2)**                    |
| PF5 | **Thumbnails are rendered 480×270 `fit: 'cover'`** regardless of source aspect, so 9:16 videos are centre-cropped into landscape tiles.                                                                                                                                                                                                                                                            | **(1)**, cosmetic          |

No N+1 query pattern was found. List endpoints are cursor-paginated with bounded page sizes.
`ProjectAssetsSection` resolves memberships against one already-fetched video map and the in-memory
creative store rather than per-row requests. `VideoGallery` deduplicates cached and paged reads.

## Concurrency and races

Handled with unusual care. Generation counters and `AbortController` per async controller; media
ownership transfer that commits a replacement before revoking the superseded URL; coalesced stop
requests; server-side CAS on every mutation; explicit reconciliation for unknown provider
acceptance; `location.key`-scoped effect guards.

One recorded observation from the earlier audit stands: a detached `AbortController` listener on
aborted saved-video loads (**B10**). Bounded and unlikely to matter. **(4)**

## Security — strong

- **Loopback-only, unconditionally.** `installLocalSecurityBoundary` rejects any non-loopback `Host`
  with `421`, in every mode. This is the product's principal control.
- **CSRF.** Every mutation requires a trusted same-origin `Origin`/`Referer` matching `Host`, with
  strict URL parsing that rejects credentials, paths and multiple hosts.
- **Per-capability intent headers** for voice, video, wardrobe and remote reference import.
- **Session cookie** `httpOnly`, `SameSite=strict`, TTL-bounded, cleared on verification failure.
- **Demo credential prefill fail-closes** on `nodeEnv === 'production'`.
- **No server credential reaches the client.** No `VITE_*` secret; capabilities expose booleans and
  model identifiers only.
- **Errors are normalized.** Provider bodies, prompts and upstream codes never reach the user.

### The one security-adjacent finding

`apps/api/src/providers/pruna/video-replace-provider.ts:239` submits
`disable_safety_checker: true`, with the repository's own comment:

> `//TODO Before making project public, change to false and make configured for local development by environment variable`

Combined with a configured `seedream-v5-lite-uncensored` reference-image model, the product
currently generates without provider-side content filtering. On a loopback single-operator tool
this is a deliberate choice; as a release gate it is unclosed, and closing it is a small,
well-understood change. **(1)** for release readiness, not for current users.

## Input and file validation — strong

Zod at every boundary. Byte caps enforced before allocation (`readBoundedBlob` checks declared
`Content-Length`, then streams with a running bound, then verifies observed length equals declared).
Media facts validated client- and server-side. Reference images capped at 5–10 MB, video input at
300 MB (200 MB for VTO), voice conversion at 25 MB.

## Error handling and observability

**Error handling: strong.** A translator chain normalizes provider errors; `RouteErrorBoundary`
distinguishes stale chunks from crashes; every query surfaces a retry.

**Observability: thin.** OpenTelemetry tracing exists but is off by default. Client errors go to a
local in-memory `clientDiagnostics` buffer and `console.error`, surfaced only when the operator
clicks "Copy diagnostic details". There is no aggregation, no error rate, no provider latency or
failure telemetry. Appropriate for a local tool; the first real gap the moment more than one person
uses it. **(3)**

## Failure recovery — strong

Idempotency receipts persisted to storage before the request, so a reload reconciles rather than
duplicates. Explicit retry decisions with cost acknowledgement. Creative-library sync pause with a
real recovery path. Bounded, cancellable provider work with an explicit abandon that states the
provider may continue billing.

## Scalability limits — real, and correctly scoped

Full-video buffering, 300-second recordings, browser-side rendering, in-memory encode peaks, and a
single-process API are all genuine ceilings. Every one of them is documented, measured and correct
**for a single-operator local tool**. None should be lifted before the product has a reason to.

## Summary by class

| Class                                    | Findings                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **(1) Affects users now**                | PF1 full-video buffering · PF3 thumbnail failure · PF5 thumbnail aspect · safety-checker release gate    |
| **(2) Will affect users as usage grows** | PF1 · PF4 memory ceiling · dual Project repositories                                                     |
| **(3) Maintainability**                  | AR1–AR4 large modules · dual repositories · thin observability · 7 legacy creative-store schema versions |
| **(4) Not worth changing**               | Dashboard polling · `AbortController` listener · Project aggregate size                                  |
