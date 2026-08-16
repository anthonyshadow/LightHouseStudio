# Lightframe Studio MVP alignment audit

> **Historical planning record (fully superseded by the Prompt 02–13 implementation program).** The
> gaps, current-state tables, and recommendations below describe the repository audited on
> 2026-08-11, not the shipped Campaign/Project workspace. Use the current README, Architecture, user
> stories, Product Roadmap, and [MVP acceptance runbook](../MVP_ACCEPTANCE.md) for current behavior and
> evidence. The recommendation below to remove the direct Neon SDK was explicitly declined:
> production uses Neon PostgreSQL, development uses local PostgreSQL, and
> `@neondatabase/serverless` remains intentionally retained.

**Status:** historical audit and implementation rationale; not current behavior or acceptance evidence

**Audit date:** 2026-08-11

**Related documents:** [MVP definition](../MVP_DEFINITION.md),
[implementation sequence](LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md), and
[product roadmap](../PRODUCT_ROADMAP.md)

## Executive summary

Lightframe Studio is currently a local-first, loopback-only, single-operator video Studio. It has
strong record, upload, local-edit, Character Swap, Virtual Try On, Voice, reusable-resource, Saved
Video, version, and download capabilities. It is not yet a Campaign or Project workspace.

Historical Prompt 00 successfully established Bun and Elysia as the application runtime
foundation. Historical Prompt 01 established a useful video-oriented Project domain, strict HTTP
schemas, an additive relational schema, and a Drizzle repository. The Project foundation is not
connected to an application service, route, browser session, Studio workflow, or UI; default local
and shadow modes also have no Project repository.

The smallest credible MVP is not a generic content platform. It is the existing video Studio made
resumable and understandable through:

- an optional, lightweight Campaign organizer;
- one focused, active video workflow per Project;
- durable source acceptance and semantic Project revisions;
- recoverable processing linked to the exact initiating revision;
- immutable Saved Video versions linked as Project outputs; and
- coherent Campaign, Project, Studio, library, and download navigation.

The Project aggregate should be evolved, not replaced. Before any Project write API or autosave is
exposed, its revision-link, output-reference, transaction, status, read-bounding, and cleanup
invariants need a focused correction. The MVP should establish the existing media-asset seam, not
generalize every content type or creative resource into a universal Asset model.

## Evidence and authority

This audit used the following priority when sources differed:

1. current repository implementation;
2. current canonical repository documentation;
3. verified architecture produced by historical Prompts 00–01; and
4. the downloaded, non-canonical Prompt 00–21 sequence.

Current implementation authority is the project README, Architecture, current user stories,
privacy and persistence guides, testing guidance, and accepted ADRs. Product Vision and Product
Roadmap own terminology and direction. Product Evolution, the Phase 1 account plan, deferred
Project Deliverable design, remote-backend handoff, and the downloaded prompt sequence are
historical or deferred material, not current behavior.

## Already implemented foundation

### Product capability

The current Studio can:

- record a local camera source or import a compatible video;
- review and edit video locally through trim, crop, rotation, flip, lighting, filters, and
  H.264/AAC export validation;
- apply zero or one visual transformation—Character Swap or Virtual Try On—and optionally apply a
  local or configured provider-backed Voice treatment;
- run advanced live Character and Virtual Try On flows;
- create and reuse Characters, Character variants, Outfits, Voices, prompts, recipes, and immutable
  reference media;
- save video outputs, append immutable versions, browse Saved Videos, preview, rename, reuse,
  delete, and download; and
- operate locally by default or use configuration-gated PostgreSQL/Neon and private R2 adapters.

### Technical capability

The repository already has:

- strict domain and HTTP-contract boundaries;
- authenticated, owner-derived API access;
- bounded upload, inspection, provider, streaming, cancellation, and cleanup paths;
- a persistent single-stage Studio runtime;
- user-scoped IndexedDB creative libraries and a mature Character Builder draft-recovery pattern;
- local and relational Saved Video persistence with immutable Video Versions;
- media-byte storage behind an owner-scoped asset ID and manifest; and
- the dormant Project foundation described below.

## Prompt 00 verification — Bun and Elysia

Prompt 00 is functionally complete. It should not be repeated as a migration.

| Area               | Verified result                                                                                                                                               | Recommendation                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Package manager    | Bun `1.3.14`, `.bun-version`, `packageManager`, `bun.lock`, and isolated workspace linking are authoritative.                                                 | Keep.                                                                                                                          |
| API framework      | Elysia `1.4.29` owns route and hook execution.                                                                                                                | Keep.                                                                                                                          |
| HTTP listener      | Bun uses an intentional loopback `node:http` compatibility listener to preserve fixed content length, socket-finish leases, abort, and backpressure behavior. | Keep; do not casually replace it.                                                                                              |
| Node tooling       | Node `26.x` remains the explicit runtime for retained Vitest, Vite, Playwright, Storybook, tsup, and related tools invoked through Bun scripts.               | Keep; this audit corrected the accepted ADR's stale `24.x` line.                                                               |
| pnpm               | No pnpm lockfile or executable pnpm workflow remains. References are historical or ignore-file residue.                                                       | No migration work.                                                                                                             |
| Fastify            | No Fastify server or plugin runtime remains. `@fastify/busboy` is used as a standalone multipart parser.                                                      | Do not misclassify or replace it for its package name.                                                                         |
| Drizzle/PostgreSQL | Drizzle configuration, migration generation/check commands, PostgreSQL compose service, and CI migration/smoke gates are present.                             | Keep.                                                                                                                          |
| Neon               | The active path uses Drizzle with `pg.Pool`; the environment permits authoritative Neon mode.                                                                 | Make TLS expectations explicit when relational persistence is next touched; remove the unused direct Neon SDK if still unused. |
| R2                 | Private R2 is configuration-gated behind the byte-store and lifecycle boundaries.                                                                             | Keep.                                                                                                                          |
| Tests and CI       | Bun install, quality, integration, database, browser, visual, dependency, and security gates are established.                                                 | Reuse affected gates; no broad CI phase.                                                                                       |

The application runtime still presents some Fastify-shaped compatibility methods. They preserve
tested security and streaming behavior. The MVP should stop expanding that façade and migrate
individual route groups only when their work requires it; removing it is not an MVP outcome.

## Prompt 01 verification — durable Project foundation

Prompt 01 implemented:

- a video-specific Project snapshot schema v1;
- statuses for draft, ready, processing, needs-attention, completed, archived, and deleted;
- immutable, monotonically numbered revisions with parent lineage;
- Project-version and current-revision optimistic concurrency;
- create, rename, append, archive, restore, tombstone, and status-derivation rules;
- strict shared Project contracts;
- additive Project, revision, asset-link, job-link, and output-link tables;
- owner-constrained and same-Project composite foreign keys;
- explicit database/domain mappings and transaction-based Drizzle repository operations;
- an accepted Project architecture decision; and
- focused domain, contract, migration, schema, and mocked repository tests.

Prompt 01 did not implement:

- a Project application service or Elysia routes;
- list/current-summary/history API contracts;
- local or shadow Project persistence;
- a browser Project client, session, autosave, or conflict flow;
- a Project route, list, dashboard, or Studio integration;
- processing-job or Saved Video orchestration through Project;
- Campaign; or
- migration/backfill of existing Saved Videos, jobs, or browser state.

### Existing Project foundation classification

| Classification | Recommendation                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep unchanged | Owner-scoped Project aggregate; immutable owner; strict/versioned video snapshot; immutable revision lineage; Project and revision CAS; archive-first/tombstone lifecycle; source-ready rule; explicit mappings; owner-constrained foreign keys; Saved Video/Video Version identity for outputs; no fabricated backfill. |
| Extend         | Local/shadow persistence; owner-derived service and routes; idempotency; bounded list/current reads and paginated history; optional Campaign membership; durable source ingestion; browser session/resume; exact job/output orchestration; Project-aware retention; real PostgreSQL integration coverage.                |
| Modify         | Revision asset-link key/semantics; saved-video-version reference validation; job/output replay and transaction behavior; current-revision status facts; archive-with-active-job policy; snapshot canonicalization at persistence boundaries; cleanup participation.                                                      |
| Simplify       | One active video workflow per Project; semantic checkpoints rather than revision-per-keystroke; archive/restore as the primary UI lifecycle; no Deliverable child aggregate; no generic Asset API, global Processing Center, tags, or bulk management for MVP.                                                           |
| Deprecate      | Treat the unused generic `MediaAssetRecord` and `ProcessingJobRecord` types as partial future seams, not current product APIs; stop expanding the runtime compatibility façade; remove the unused direct Neon SDK only if re-audit confirms it remains unused.                                                           |
| Replace        | Do not replace the Project aggregate. Replace only the hybrid Project-asset relation and the assumptions that Project Revision equals media Version or that Project is merely a wrapper around one provider job.                                                                                                         |

### Foundation corrections required before Project writes

1. **Revision asset lineage is lossy.** A Project asset row claims a revision, but its key is only
   `(project_id, asset_id, role)`. Reusing the same source and role in a later revision silently
   preserves the earlier revision row because append uses conflict-do-nothing. Make the relation
   revision-granular, with revision identity in its key. If a separate deduplicated retention set is
   ever useful, derive or model it separately rather than mixing both meanings.

2. **Saved Video references are UUID-only.** Snapshot `workingMedia` and `presentedMedia` references
   of kind `saved-video-version`, plus `lastSuccessfulOutput`, are not persistence-validated for
   exact version existence, active-at-link state, or same owner. Persist a revision-scoped
   normalized media reference and validate it in the same append unit of work. A later library
   tombstone preserves an already retained Project reference and bytes. Keep imported/reused media
   references distinct from an output that this Project produced.

3. **Output save is not atomic end to end.** Saved Video/Version creation, Project output link,
   and Project revision/CAS are separate operations. Link methods also use check-then-insert and
   conflict-do-nothing, so a mismatched replay can be reported as success. Introduce one metadata
   unit of work for relational mode and a recoverable idempotency/journal equivalent for local mode.
   Exact replay is idempotent; a different revision or resource under the same operation conflicts.
   Each processing job has one initiating Project revision and each output Version at most one
   producing Project revision; later reuse is used-by lineage, not another producer.

4. **Cleanup does not honor Project retention.** Saved Video and reference-media deletion can
   remove bytes while a Project still references them because tombstone mutations do not trigger a
   restrictive foreign key. One owner-scoped retention policy must be consulted by byte cleanup and
   reference cleanup before Project links become user-visible. Active, archived, and tombstoned
   Projects retain their referenced bytes in MVP; physical Project purge is deferred.
   A Saved Video removed from the global gallery must also remain available through an exact
   owner-checked retaining Project relation; retaining bytes without a Project-scoped content path
   would still leave unusable history.

5. **The status-fact contract lacks revision/attempt scope.** No current Project service computes
   these facts, so this is a latent downstream risk rather than observed user behavior. A naive
   aggregate-wide caller could let old output/failure counts make newer work look complete or
   broken. Before adding that caller, operational status must use the current revision and current
   active attempt; historical failures remain history.

6. **The default read is unbounded.** Repository `get` eagerly loads all revisions and all links.
   Add a bounded summary/current-revision read and cursor-paginated history before autosave produces
   material history.

7. **Snapshot parsing is not fully canonicalized at persistence boundaries.** Strictly parse the
   supported version, normalize timestamps and applied values, and reject unknown fields/versions
   before storing or returning a snapshot.

## Current product architecture

### Frontend

The router exposes `/`, `/studio`, and Studio library views for Saved Videos, Characters, and
Outfits. `/` is a provider-free Login/Enter Studio surface. One mounted `StudioApp` and one media
stage survive movement among `/studio/*` library surfaces.

The working video, selected treatments, generated results, local edit history, loaded Saved Video
lineage, and accepted provider-job ID are primarily owned by React hooks and reducers. Route exit
guards protect some in-memory work, but navigation between future Projects inside `/studio/*` would
bypass the current leave-Studio guard. The UI has no Project identity, route, list, client, or
session.

Shared overlay, focus, status, responsive, safe-area, and reduced-motion patterns are strong.
Native confirm/prompt calls and some unobserved asynchronous creative-library errors remain, but a
broad dialog or Studio rewrite is not required for MVP. New/touched Campaign and Project paths
should use the shared accessible patterns.

### Backend and domain

The Bun process accepts loopback requests, delegates app-owned contracts to Elysia, derives the
owner from the authenticated session, and keeps provider/storage credentials server-side. Route
groups are thin over feature services, provider adapters, storage, and repositories.

PostgreSQL/Neon is authoritative metadata persistence when configured. Local file repositories and
the local byte store are the default product authority. Shadow mode observes selected relational
paths while retaining local product behavior. The Project repository is currently composed only in
authoritative relational modes.

Provider-neutral video job services own submission, polling, retrieval, cancellation where
supported, delivery leases, and temporary cleanup. Project job and output tables are not connected
to those services.

## Current domain map

| Concept           | Current identity and authority                                                                                           | Persistence and bytes                                                                                                          | Lifecycle/version behavior                                                               | Assessment                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| User              | Seeded UUID; server session determines owner.                                                                            | Local process/config session state or users/sessions tables in authoritative relational mode.                                  | Local/shadow sessions do not survive broker restart; authoritative sessions can.         | Implemented for single operator.                                         |
| Workspace         | Conceptual authenticated owner scope.                                                                                    | No Workspace table or independent store.                                                                                       | Exists while the user uses Studio and libraries.                                         | Implemented under another concept; no MVP table needed.                  |
| Campaign          | None.                                                                                                                    | None.                                                                                                                          | None.                                                                                    | Missing and required in lightweight optional form for this MVP.          |
| Project           | UUID owner aggregate in domain/contracts and relational schema.                                                          | Drizzle/PostgreSQL/Neon only; no bytes.                                                                                        | CAS, immutable revisions, archive/tombstone.                                             | Partially implemented.                                                   |
| Project Revision  | UUID plus Project-local number.                                                                                          | Relational JSON snapshot plus normalized links.                                                                                | Immutable creative-intent checkpoint.                                                    | Partially implemented; lineage correction required.                      |
| Media Asset       | Opaque owner-bound asset ID; relational `media_assets` when authoritative; local manifest/byte-store identity otherwise. | Local filesystem or private R2.                                                                                                | Pending/ready/deleting/deleted or manifest existence; cleanup owned by resource creator. | Technical seam implemented; no coherent user-facing generic Asset model. |
| Saved Video       | UUID logical gallery/output record.                                                                                      | Local file repository or relational table; bytes through asset store.                                                          | Mutable metadata/current pointer, tombstone deletion.                                    | Implemented.                                                             |
| Video Version     | UUID immutable version within a Saved Video.                                                                             | Local manifest or relational row; local/R2 media asset bytes.                                                                  | Append-only version history and exact content endpoint.                                  | Implemented; older versions not fully exposed in UI.                     |
| Character         | User-scoped creative ID.                                                                                                 | IndexedDB with optional creative-library CAS replica; immutable reference bytes use local/R2 storage.                          | Editable reusable record; deletion has reference cleanup policy.                         | Implemented reusable resource.                                           |
| Character Variant | Child ID under Character/Wardrobe.                                                                                       | Same creative library and reference storage.                                                                                   | Reusable child history/selection, not a generic campaign variation.                      | Implemented reusable resource.                                           |
| Outfit            | User-scoped creative ID.                                                                                                 | IndexedDB with optional CAS replica; reference bytes local/R2 when present.                                                    | Editable/deletable reusable record.                                                      | Implemented reusable resource.                                           |
| Voice             | Provider/local selection; Saved Voice membership is owner-scoped.                                                        | API repository for Saved Voice relationships; provider owns remote voice data.                                                 | Reusable selection; search state is ephemeral.                                           | Implemented reusable capability.                                         |
| Recipe/prompt     | User-scoped creative ID and payload.                                                                                     | IndexedDB with optional CAS replica.                                                                                           | Editable reusable intent; exact applied values are not immutable by ID alone.            | Implemented; Project must snapshot relevant applied values/revision.     |
| Processing Job    | UUID operation/job record.                                                                                               | In-memory/temp/file traces locally; relational accepted-job records in configured modes. Provider holds temporary remote work. | Explicit bounded execution, polling, failure, cancellation where supported, and cleanup. | Implemented but not Project-aware.                                       |
| Generated result  | Runtime Blob/object URL or server/provider temporary result until saved.                                                 | Browser memory, temporary server file, and provider storage.                                                                   | Lost on refresh/cleanup unless adopted into durable storage.                             | Implemented temporarily; durable adoption gap.                           |
| Export            | Current render plus authenticated download action.                                                                       | No Export entity; bytes are the selected Saved Video Version.                                                                  | Delivery action, not history.                                                            | Implemented narrowly; a durable Export entity is deferred.               |

In the requested domain classifications: Workspace is implemented under the authenticated-owner
concept; Campaign is missing and required in minimal form; Project and Project Revision are
partially implemented; Asset is partially implemented as a technical media seam rather than a
coherent generic product model; media Version is implemented through Video Version; Character
Variant is implemented as a reusable Character child while a generic campaign Variation is missing
and deferred; and reusable creative resources are implemented across intentionally different
lifecycle authorities.

The concrete authoritative relational records are `users`/`sessions`, `projects`,
`project_revisions`, `project_assets`, `project_jobs`, `project_outputs`, `media_assets`,
`saved_videos`, `video_versions`, `saved_voices`, `creative_assets`, `creative_libraries`,
`reference_image_assets`, and `processing_jobs`. Default local mode instead uses feature-owned file
repositories and owner-bound byte manifests; the creative browser records use owner-scoped
IndexedDB. All durable server records and byte manifests are owner-scoped to the authenticated
user. Project relationships point to assets, jobs, and exact Saved Video Versions rather than
owning those records. Most deletion is a tombstone or guarded feature-owned cleanup; the P0 gap is
that current cleanup does not yet include Project relationships in its retention decision.

## Persistence and resume assessment

| Meaningful work                         | Current authority                             | Refresh        | Browser restart | App restart                         | Browser-data deletion                           | Local machine loss / future device              |
| --------------------------------------- | --------------------------------------------- | -------------- | --------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Working source/take/result              | React reducer with Blob/object URL            | Lost           | Lost            | Lost                                | Lost                                            | Lost                                            |
| Existing-video plan and accepted job ID | React hooks/refs                              | Lost           | Lost            | Lost                                | Lost                                            | Lost; remote job may continue temporarily       |
| Local edit spec/history/candidate       | React hook                                    | Lost           | Lost            | Lost                                | Lost                                            | Lost                                            |
| Live draft/capture preferences          | React state                                   | Lost           | Lost            | Lost                                | Lost                                            | Lost                                            |
| Loaded Saved Video source correlation   | React state                                   | Lost           | Lost            | Lost                                | Lost                                            | Lost                                            |
| Character Builder active draft/journal  | IndexedDB                                     | Retained       | Retained        | Retained                            | Lost                                            | Lost without an authoritative replica           |
| Characters/variants/Outfits/recipes     | IndexedDB; optional relational CAS copy       | Retained       | Retained        | Retained                            | Local copy lost; configured replica may recover | Only configured remote copy can survive         |
| Saved Videos/Versions                   | Local files or PostgreSQL plus local/R2 bytes | Retained       | Retained        | Retained                            | Retained                                        | Local mode lost; configured Neon/R2 can survive |
| Saved Voice membership                  | API repository                                | Retained       | Retained        | Mode-dependent                      | Retained                                        | Mode-dependent                                  |
| Project                                 | Relational repository only                    | No UI consumer | No UI consumer  | Retained only in authoritative mode | Not browser-owned                               | Configured Neon can survive                     |

The MVP does not promise cloud or cross-device durability. It must truthfully make Project work
survive refresh, browser restart, and application restart in the selected documented persistence
mode. Provider-temporary media is never durable authority. Browser IndexedDB may cache drafts, but
the server-side Project/repository remains the Project authority.

## Current user journey

The implemented primary journey is:

```text
Open `/` → log in or enter Studio → record or upload in `/studio` → review source →
optionally apply one visual treatment and/or Voice → optionally edit locally →
save as a Saved Video or append a Version → open Saved Videos → download current Version
```

Campaign and Project do not appear in this journey. Live Character/VTO, Workshop, Recipe Shelf,
Wardrobe, builders, and creative libraries are advanced or contextual paths around the same mounted
Studio runtime.

## Workflow assessment

| Workflow                    | Current result and authority                                                                                                                                                                                                     | Project adaptation needed                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Upload existing video       | Browser validates and retains a temporary File/Blob; provider upload occurs only on explicit transformation; save creates a Saved Video/Version.                                                                                 | Durably ingest and inspect the source before claiming resume; link the source asset and restore a fresh content URL.            |
| Record local video          | Browser recording is finalized/normalized into a temporary playable artifact.                                                                                                                                                    | Persist the accepted original as a durable source; preserve local preview while transfer completes.                             |
| Character Swap              | In-memory selection/plan submits one explicit provider job and receives a temporary result.                                                                                                                                      | Snapshot exact applied Character/variant intent, link the accepted job to a revision, and durably adopt success before cleanup. |
| Virtual Try On              | In-memory Outfit/reference/prompt plan submits the configured capability.                                                                                                                                                        | Snapshot exact applied Outfit/reference intent and use the same job/result rules.                                               |
| Voice Treatment             | Local or explicit provider treatment produces a temporary presented result.                                                                                                                                                      | Snapshot the exact Voice/treatment settings; persist a chosen successful output before temporary cleanup.                       |
| Character creation/Wardrobe | Durable user-scoped reusable records with separate draft recovery and immutable references.                                                                                                                                      | Reference from revisions; do not copy ownership into Project.                                                                   |
| Local video editing         | Non-destructive edit spec/history in memory; render creates a temporary candidate.                                                                                                                                               | Persist the current edit specification at semantic checkpoints; recreate from durable source until explicitly saved as media.   |
| Save Video                  | Creates a logical Saved Video or appends a Video Version; both authorities persist idempotency receipts, but the mounted client owns operation-key continuity and cannot reconcile a composite Project save after response loss. | Reuse/extend durable receipts and atomically/recoverably link the exact output Version to its producing Project Revision.       |
| Version history             | Backend stores immutable versions; gallery exposes mainly current version and count.                                                                                                                                             | Add bounded Project output/history UI and exact older-version play/use/download; no A/B or restore system.                      |
| Download                    | Downloads the current Saved Video Version.                                                                                                                                                                                       | Label distinctly from All changes saved, Render preview, Save as New Video, and Add Version; download an exact ready Version.   |

## Updated product target

For this MVP, the directional hierarchy becomes:

```text
Authenticated owner scope (the current Workspace)
├── Campaign (optional organizer)
│   └── Project (one active focused video workflow)
│       ├── immutable Project Revisions (creative intent/checkpoints)
│       ├── revision-scoped source/working media references
│       ├── revision-scoped Processing Jobs
│       └── exact Saved Video / Video Version outputs
├── standalone Projects (the virtual “No Campaign” group)
├── reusable Characters and Character Variants
├── reusable Outfits, Voices, recipes, prompts, and reference media
└── Saved Videos, including legacy unassigned content
```

Campaign supplies organization, not processing ownership. Project supplies a resumable work
context, not duplicate byte storage. Media Asset supplies opaque byte identity. Saved Video and
Video Version remain the logical output and immutable playable history.

## Ranked major misalignments

| Rank | Severity                    | Current state                                                                                                                                                                             | MVP target and user impact                                                                                                   | Technical impact                                                                                                                                                            | Recommended resolution                                                                                                                                              |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | P0 data integrity           | Project asset links can silently lose later-revision provenance; Saved Video refs are not existence/owner-normalized.                                                                     | A resumed revision must refer to the exact durable resources it claims, or users may see the wrong/missing source or output. | JSON snapshots and normalized relations can disagree, making lineage, validation, status, and retention untrustworthy.                                                      | Correct revision-granular relations and exact same-owner media references before write APIs.                                                                        |
| 2    | P0 retention                | Cleanup can remove bytes still referenced by a Project.                                                                                                                                   | “Saved/resumable” work must not become a broken pointer after library cleanup.                                               | Tombstone-based cleanup bypasses restrictive foreign keys and can leave permanently dangling Project references.                                                            | Centralize owner-scoped Project-aware retention checks.                                                                                                             |
| 3    | P0 transaction/replay       | Save as New Video/Add Version, output link, and Project revision/CAS can partially succeed; mismatched conflict replay can look successful.                                               | Refresh or response loss must not duplicate or strand the user's save.                                                       | Split commits can orphan metadata/bytes, duplicate logical Versions, or advance only one aggregate after a crash.                                                           | Use one relational metadata transaction and a recoverable local operation journal with exact replay semantics.                                                      |
| 4    | P1 product coherence        | No Campaign, Project service, route, browser state, or UI exists.                                                                                                                         | Users cannot identify an initiative or resumable creative effort.                                                            | The dormant aggregate is not composed into a vertical capability and cannot be exercised in the documented default mode.                                                    | Add Projects end to end, then optional lightweight Campaign organization.                                                                                           |
| 5    | P2 durability               | Sources, edits, Project/job correlation, and generated results are mostly memory-owned.                                                                                                   | Leaving or refreshing can lose meaningful work even while provider work continues.                                           | Browser memory is the only Project-workflow correlation authority, so restart can strand remote work and media ownership.                                                   | Durable source acceptance, semantic autosave, job reconnect, and result retention.                                                                                  |
| 6    | P2 persistence parity       | Project exists only in authoritative relational modes although local is the default product mode.                                                                                         | The advertised MVP would disappear in the default setup.                                                                     | Services/routes cannot compose consistently, and product behavior would vary silently by configuration.                                                                     | Add deliberate local/shadow Project and Campaign persistence with matching contracts.                                                                               |
| 7    | P3 workflow integration     | Creative selections and jobs have no Project authority; IDs can point to mutable resource payloads.                                                                                       | Resume may reconstruct different intent than the user applied.                                                               | Stable IDs alone cannot reproduce mutable applied values, while duplicate in-memory correlations can drift.                                                                 | Snapshot exact resource IDs plus relevant applied values/revisions; keep resources reusable and independently owned.                                                |
| 8    | P5 version language         | Project Revision, Video Version, “Save,” and download are easy to conflate; older versions are hard to access.                                                                            | Users cannot tell whether intent, playable media, or a file was saved.                                                       | Two distinct histories and delivery actions lack clear contract/UI boundaries, inviting redundant persistence.                                                              | Distinguish All changes saved, Render preview, Save as New Video, Add Version, and exact-Version Download.                                                          |
| 9    | P6 information architecture | Projects, Campaigns, Voices, and some libraries are not first-class navigation; `/projects` redirects away.                                                                               | Previous and in-progress work is difficult to discover.                                                                      | The router has no durable work-context URL, and internal Project switches could bypass the current Studio exit guard.                                                       | Add primary Campaigns/Projects destinations and visible current-Project identity while preserving the single Studio runtime.                                        |
| 10   | P7 processing truth         | Relational/shadow services can restore jobs with a durable provider job ID, but the browser/Project cannot rediscover them; local mode stores traces only, and status facts are unscoped. | Users may resubmit paid work or see stale completion/failure state.                                                          | Reload loses Project correlation; local restart and the external-submit ambiguity window remain unsafe; a naive future caller could let old counters poison current status. | Link/query jobs through Project, add local recovery, never auto-resubmit ambiguous submission, reject stale adoption, and scope status to current revision/attempt. |

## UX and information architecture assessment

The strongest existing product is a flexible Studio, not a wizard. The MVP should add context around
that Studio rather than replace it:

- Campaigns and Projects become primary authenticated destinations.
- A user can Quick Start an `Untitled Project` without first creating a Campaign.
- Campaign creation asks for only name and optional brief, then presents a primary New Project
  action.
- An open Project displays its identity and save/processing state while reusing the current single
  media stage and creative tools.
- Switching Projects must checkpoint, stay, or explicitly discard; the current internal-route exit
  guard is insufficient.
- Terminology distinguishes **All changes saved**, **Render preview**, **Save as New Video**,
  **Add Version**, and **Download**. “Checkpoint” and “export” remain architecture/product taxonomy,
  not invented MVP actions.
- The virtual “No Campaign” and “Unassigned Content” views are queries, not fake records.

## Architecture assessment

The existing domain/contracts/web/API layering is appropriate. Product policy belongs in Project
and Campaign rules and application services; Elysia routes should remain thin; the web must not
import server repositories. Keep providers behind capability-oriented adapters and keep permanent
credentials on the server.

Do not activate the dormant IndexedDB `projects`, `uploadSessions`, or `syncOutbox` stores merely
because their names exist. If IndexedDB is used for transient/coalesced Project drafts, define a
versioned, owner-scoped cache with migration and discard semantics; it must never become a second
Project authority.

Do not add a Workspace table, Deliverable child, generic Asset service, global event system,
distributed worker, or Project-wide state framework for hypothetical later consumers.

## Security assessment

MVP-relevant requirements are narrow and existing-pattern based:

- derive the owner from the verified server session for every Campaign, Project, media, job, and
  output operation;
- return the same safe not-found behavior for missing and wrong-owner IDs;
- validate exact owner, active lifecycle, and revision/version relationships inside mutation
  boundaries;
- reject browser-supplied owner IDs, storage keys, provider IDs as authority, and untrusted Origin
  on mutations;
- keep Project snapshots free of Blobs, URLs, raw provider payloads, prompts not intended for the
  product record, internal paths, credentials, and arbitrary errors;
- keep provider work explicit, bounded, non-fallback, and without automatic billable retry;
- make Campaign archive/delete non-cascading and Project/media deletion relationship-safe; and
- preserve loopback-only and seeded-account boundaries. Public tenancy, RBAC, billing, abuse, and
  distributed limits are not MVP work.

When relational/Neon persistence is touched, explicitly validate encrypted Neon transport rather
than relying on an undocumented connection-string convention.

## Testing assessment

Existing focused verification passed on 2026-08-11:

```text
bunx vitest run \
  packages/domain/src/projects/projects.test.ts \
  packages/contracts/src/projects.test.ts \
  apps/api/src/infrastructure/database/project-repository.test.ts \
  apps/api/src/infrastructure/database/project-migration.test.ts \
  apps/api/src/infrastructure/database/schema.test.ts

Result: 5 test files, 17 tests passed.

bun run --filter @studio/api db:check

Result: Drizzle schema and migration check passed.
```

Those tests demonstrate the present foundation, but they do not cover the P0 relation/replay bugs.
The implementation sequence requires real PostgreSQL transaction tests, local repository recovery,
cross-owner reference tests, cleanup-retention tests, route/service integration, focused web tests,
and a final end-to-end Campaign/Project/Studio/Version journey. Physical devices, real codecs,
assistive technology, memory behavior, and paid/live providers remain explicit manual or authorized
smoke gates; ordinary validation must not contact them.

## Documentation assessment

Canonical documentation accurately distinguishes the current Studio from the future product, with
three narrow corrections from this audit:

- the accepted runtime ADR's Node tooling version was stale and is corrected with this audit;
- the current existing-video user story incorrectly places Record/Upload choices on `/`; and
- Product Vision/Roadmap previously put all Campaign work after the user-facing Project phase.

This program intentionally moves only a minimal optional Campaign organizer into MVP so the updated
campaign-workspace positioning is credible. Rich Campaign planning remains long-term.

## Old implementation sequence assessment

Prompts 00–01 below are assessed from repository evidence. Prompts 02–21 are unimplemented planning
material.

| Old prompt | Status          | Recommendation                                       | MVP?    | Reason                                                                                                                                      |
| ---------- | --------------- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 00         | Implemented     | Keep; narrow corrective follow-up                    | N/A     | Bun/Elysia migration is sound; the Node doc correction is applied here, while Neon TLS is clarified when persistence is next touched.       |
| 01         | Implemented     | Keep, modify focused invariants, then extend         | N/A     | The aggregate is valuable, but relation, reference, replay, cleanup, status, read, and local-mode gaps must precede UI writes.              |
| 02         | Not implemented | Rewrite and split across new Prompts 02–04           | Yes     | Project lifecycle needs the P0 correction, owner-scoped local/relational authority/API, then a separate route/workspace slice.              |
| 03         | Not implemented | Rewrite across new Prompts 06–08                     | Yes     | Separate durable source/hydration, session/autosave guards, and creative/working-media integration; discard speculative browser authority.  |
| 04         | Not implemented | Merge into new Prompts 04–05                         | Yes     | Establish Project routing/workspace first, then add only the lightweight optional Campaign organizer and primary navigation.                |
| 05         | Not implemented | Merge relevant integration into new Prompts 06–08    | Partial | Existing flow, preflight, privacy, and provider consent largely exist; make source/intent/local editing Project-aware without a new wizard. |
| 06         | Not implemented | Rewrite across new Prompts 09–10                     | Yes     | Separate recoverable Project job/result authority from capability UI; do not build a global Processing Center or SSE system.                |
| 07         | Not implemented | Merge touched behavior into Prompts 04/07/13         | Partial | Use shared dialogs/errors/exit rules on new paths; broad native-dialog replacement is unrelated.                                            |
| 08         | Not implemented | Defer                                                | No      | Usage ledger, credits, quotas, and financial accounting do not make this local MVP coherent.                                                |
| 09         | Not implemented | Remove as a standalone prompt                        | No      | Safe tracing already exists; product analytics is deferred and not a prerequisite.                                                          |
| 10         | Not implemented | Reuse existing hardening in Prompts 02/06/08–09      | Partial | Current inspection, SSRF, checksum, R2 lifecycle, and cleanup boundaries are substantial; only Project retention/result gaps are MVP work.  |
| 11         | Not implemented | Defer broad scope; test new boundaries               | Partial | Owner-isolation tests are required; public tenant security and distributed controls are not.                                                |
| 12         | Not implemented | Simplify into new Prompt 12                          | Yes     | Expose bounded Project/output history and exact Video Versions; defer comparison and restore workflows.                                     |
| 13         | Not implemented | Merge minimal list/status/archive into Prompts 04–05 | Partial | Defer tags, favorites, folders, bulk operations, and full search.                                                                           |
| 14         | Not implemented | Defer                                                | No      | A generalized CompositionSpec has no second media consumer. Reuse current video edit/export specs.                                          |
| 15         | Not implemented | Defer                                                | No      | Captions/transcription are creator enhancements, not product-foundation requirements.                                                       |
| 16         | Not implemented | Defer                                                | No      | Text overlays and safe guides are not required to establish Campaign/Project coherence.                                                     |
| 17         | Not implemented | Keep only save/Download distinction in Prompts 11–12 | Partial | Defer cover selection and expanded export presets.                                                                                          |
| 18         | Not implemented | Defer                                                | No      | Mixing, fades, speed, and mastering do not address the current persistence/product gap.                                                     |
| 19         | Not implemented | Remove as a standalone prompt                        | No      | Refactor only where Project integration proves an ownership boundary; no broad Studio decomposition.                                        |
| 20         | Not implemented | Remove as a standalone prompt                        | No      | Current Bun CI and security/release gates are strong; run affected gates in Prompt 13.                                                      |
| 21         | Not implemented | Rewrite as new Prompt 13                             | Yes     | Complete local MVP acceptance and canonical docs; pre-account/public readiness remains deferred.                                            |

## MVP definition

MVP is complete when an authenticated local operator can optionally create a Campaign, quickly
create or open a Project, attach a durable recorded/uploaded/reused video source, use the existing
creative tools, leave and resume safely, observe and recover accepted processing without surprise
resubmission, preserve the original, save immutable output Versions linked to exact Project
Revisions, find prior work and legacy unassigned videos, and download an exact finished Version.

The full objective criteria and lifecycle decisions are in [MVP definition](../MVP_DEFINITION.md).

## Deferred beyond MVP

- **Creator enhancements:** captions, transcription, text/graphics overlays, cover frames, audio
  mixing, speed, mastering, richer presets, generalized composition, Deliverables, image and other
  content workflows.
- **Marketing platform:** richer briefs, goals, audiences, channels, calendars, variations, review
  states, tags/favorites/folders, publishing, scheduling, integrations, and analytics.
- **Brand intelligence:** Brand Kits, product catalogs, guidelines, templates, recommendations,
  embeddings, and automated brand enforcement.
- **Organization:** broad search, bulk operations, A/B comparison/restore, and a global Processing
  Center.
- **Collaboration:** organizations, memberships, roles, sharing, comments, approvals, presence, and
  notifications.
- **Commercial/accounts:** signup, recovery, MFA, multi-device identity, plans, billing, credits,
  usage ledgers, and quotas.
- **Public infrastructure:** public hosting, distributed workers/rate limits, moderation and malware
  scanning, production product analytics, backup/PITR drills, formal portability/erasure, and
  incident operations.
- **General cleanup:** broad native-dialog replacement, unrelated Studio decomposition, runtime
  façade removal, and CI work without an affected MVP contract.
