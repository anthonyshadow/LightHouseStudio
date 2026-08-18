# Lightframe Studio MVP implementation sequence

> **Superseded.** This document describes an architecture in which one `StudioApp` stayed mounted
> across every authenticated route and organization pages hid its media stage. The Studio's capture
> runtime now mounts only on routes that own live media (`isStudioRuntimePath` in
> `apps/web/src/app/paths.ts`); the persistent piece is `AuthenticatedShell`. Read the
> always-mounted claims below as a record of what was true at the time.

**Status:** completed Prompt 02–13 implementation and local-MVP acceptance record

**Acceptance evidence:** [MVP acceptance runbook](../MVP_ACCEPTANCE.md)

**Defined:** 2026-08-11

**Product target:** [Campaign and Project MVP definition](../MVP_DEFINITION.md)

**Audit evidence:** [MVP alignment audit](MVP_ALIGNMENT_AUDIT.md)

## How to use this sequence

This document replaced unimplemented historical Prompts 02–21. Historical Prompt 00 and Prompt 01
remain implementation history and were not rerun. Prompts 02–13 were executed serially against the
repository state at each boundary; the audit rationale remains here as the implementation record.

Every prompt begins with a fresh, selective audit because paths and owners may change between
branches. Current implementation and canonical docs override assumptions in this plan. Preserve
unrelated work, choose the smallest design consistent with the stated invariants, and do not
contact a paid/live provider during ordinary validation.

Twelve prompts deliberately exceed the approximate five-to-ten planning target. The final audit
proved two additional branch boundaries materially safer: Project session/autosave is separated
from creative/media adoption, and processing authority/recovery is separated from capability UI.
Combining either pair would make one review own browser navigation, multiple media lifecycles,
persistence migrations, external-cost ambiguity, and UX activation at once.

The MVP remains loopback-only, local-first, authenticated by the seeded single-operator account,
and video-focused. Nothing in this sequence authorizes public deployment, public signup,
collaboration, billing, provider replacement, destructive production migration, or automatic
backfill.

## Ordered outcomes

| New prompt                            | Outcome                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02 — implemented                      | Correct the dormant relational Project foundation so lineage, exact references, replay, retention, status facts, and reads are safe before writes are exposed. |
| 03 — implemented                      | Add local/shadow Project authority plus owner-derived Project application services and lifecycle APIs, without browser UI.                                     |
| 04 — implemented                      | Establish authenticated Project/Studio routing and a minimal Projects workspace for lifecycle management.                                                      |
| 05 — implemented                      | Add optional lightweight Campaigns and safe Project membership without imposing Campaign creation on Quick Start.                                              |
| 06 — implemented                      | Accept, hydrate, and resume one immutable durable video source for an open Project.                                                                            |
| 07 — implemented                      | Add a URL-owned Project session, semantic autosave, conflict handling, and switch/exit protection without creative-tool integration.                           |
| 08 — implemented                      | Integrate reusable creative intent, local editing, and one durable working-media adoption command while provider starts remain gated.                          |
| 09 — implemented                      | Establish Project-bound processing authority, pre-submit correlation, recovery, ambiguity handling, and durable result retention without enabling UI starts.   |
| 10 — implemented                      | Route Project Character Swap, VTO, and supported Voice actions through that authority with truthful reconnect/retry/stale-result UX.                           |
| 11 — implemented                      | Save one exact immutable Video Version and Project output through crash-safe composite orchestration.                                                          |
| 12 — implemented                      | Expose bounded Project/output history, legacy Unassigned Content, exact-Version reuse, and Download.                                                           |
| 13 — implemented and accepted locally | Complete navigation, accessibility, compatibility, acceptance coverage, and canonical documentation for the local MVP.                                         |

## Dependency map

```text
02 Project invariant correction
  ↓
03 Project authority and API
  ↓
04 Project routing and workspace
  ↓
05 Optional Campaigns
  ↓
06 Durable source and hydration
  ↓
07 Project session, autosave, and switch guards
  ↓
08 Creative intent, local editing, and durable working media
  ↓
09 Processing authority and recovery
  ↓
10 Project processing UX and capability integration
  ↓
11 Atomic output save
  ↓
12 History, exact Versions, and Download
  ↓
13 MVP acceptance
```

The sequence is intentionally serial. Adjacent prompts edit shared Project contracts, schema/local
formats, application services, routes, and navigation; parallel branches would add migration and
ownership risk without reducing the critical path responsibly. Prompt 02's relational migration
precedes Project write traffic. Prompt 03 establishes authority/API before browser state. Prompt 06
establishes immutable source references before session state. Prompt 07 makes navigation and writes
safe before Prompt 08 integrates creative controllers. Prompt 08 keeps Project provider starts
gated until Prompt 09 supplies durable correlation/recovery and Prompt 10 wires the visible
capabilities through it. Prompt 10 precedes composite output save, and Prompt 11 precedes
history/delivery UI.

## Checkpoints

### Foundation checkpoint — after Prompt 05

Project lineage and retention invariants are safe; Projects work in every supported product
persistence mode; optional Campaign membership is owner-safe and non-cascading. Empty Projects and
Campaign organization are usable without entering Studio.

### Persistence checkpoint — after Prompt 08

A source is not described as resumable until durable and inspected. The same Project, source, and
semantic working state return after refresh, browser restart, and application restart. Conflicts
never silently overwrite.

### Product-experience checkpoint — after Prompt 12

An open Project can use the current creative tools, survive accepted processing, preserve its
original, save exact immutable Video Versions, browse bounded history, and download the chosen
Version.

### MVP checkpoint — after Prompt 13

Campaign → Project → source → create/transform → Version → download is coherent, accessible,
responsive, compatible with legacy unassigned content, documented, and validated without implying
public-service or paid-provider readiness.

---

# Prompt 02 — Correct Project revision lineage invariants

## Role

Act as a principal domain/data architect, senior Bun/Elysia backend engineer, PostgreSQL migration
engineer, security engineer, and test lead.

## Objective

Correct the dormant Project persistence foundation so every revision references the exact
same-owner durable media it claims, Project-aware retention prevents premature byte cleanup,
replays cannot lie, current status is truthful, and normal reads are bounded before any user-facing
Project write API exists.

## Why this comes next

The existing aggregate is valuable, but its Project-asset key can lose later-revision provenance;
Saved Video references are UUID-only; output/job link replay can silently accept a mismatch; cleanup
ignores Project retention; and aggregate reads are unbounded. Exposing routes or autosave first
would make those defects persistent user data.

## Audit first

Before editing:

1. Read the repository guide, current Project ADR, Architecture, Cloud Persistence, privacy/cleanup
   policy, MVP audit/definition, and affected testing guidance.
2. Trace Project domain rules, strict contracts, Drizzle schema/migrations, repository ports and
   implementations, Saved Video/Version repositories, media lifecycle registry, reference-image
   cleanup, processing-job persistence, and all current tests.
3. Reproduce or write failing characterizations for:
   - the same asset/role reused in two Project revisions;
   - nonexistent, deleted, and wrong-owner Saved Video Version references;
   - exact versus mismatched job/output replay;
   - cleanup while a Project still retains an asset/version; and
   - the unscoped status-fact contract accepting historical counts for a new current revision.
4. Inspect current database migration ordering and generated-schema policy. Do not hand-edit
   generated metadata.
5. Confirm how encrypted Neon transport is currently enforced before changing relational
   configuration. Leave unrelated dependency cleanup out of this prompt.

## Required work

1. Make Project media-asset links revision-granular. Include revision identity in the durable key
   and repository conflict target so one unchanged source may appear truthfully in many revisions.
   Do not keep a row that simultaneously pretends to be revision lineage and a deduplicated Project
   retention set.
2. Add a normalized, revision-scoped reference for snapshot media of kind
   `saved-video-version`. Validate the exact Saved Video and Video Version, same owner, active state,
   and same-video relation in the revision append transaction. Distinguish imported/reused working
   media from `project_outputs`, which means this Project produced the Version.
3. Require `lastSuccessfulOutput` to match an exact normalized output link visible to the same
   Project; a JSON UUID pair alone is insufficient. The output link keeps its immutable actual
   producing revision. Later revisions may point to that output without duplicating the link or
   rewriting its provenance.
   Make this semantic explicit in types/mappings/schema, preferably as `producingRevisionId`; the
   post-save revision that adopts the pointer is a different event.
4. Replace check-then-ignore link behavior for jobs and outputs. An exact replay is idempotent and
   returns the existing relation. A replay with a different Project revision or related resource
   returns a typed conflict and changes nothing. Use conditional writes/locking appropriate to the
   existing transaction model so concurrent archive/tombstone cannot pass a stale active check.
   Enforce one initiating Project revision for each processing job and one producing Project
   revision for each output Video Version. Reuse by another Project/revision is a normalized
   used-by media reference, never another producer relation.
5. Define a repository/application metadata unit-of-work seam that can later commit Saved
   Video/Version metadata, Project output relation, and Project revision/status CAS together. Do not
   build the user-facing save flow in this prompt.
6. Add one owner-scoped retention query/policy consumed by Saved Video, reference-media, and generic
   byte-cleanup paths. Retain bytes while an active, archived, or tombstoned Project
   revision/reference/output needs them. Physical Project purge is deferred; do not claim erasure.
7. Redesign the status-fact contract so future application callers must supply current
   revision/current-attempt facts. Historical failures and outputs remain history but cannot be
   passed accidentally as current operational truth. `completed` requires the current revision's
   validated exact retained `lastSuccessfulOutput`; processing-operation completion alone is not
   Project completion, and a later material change not represented by that output clears it.
8. Define archive behavior when active jobs exist: block the mutation unless the application later
   invokes an explicit supported cancel/detach policy. Do not silently orphan work.
9. Strictly parse and canonicalize the supported Project snapshot at repository boundaries,
   including normalized timestamps and rejected unknown/unsupported structures.
10. Split the existing eager aggregate read into a bounded Project summary/current-revision read
    and cursor-paginated revision/link history. Retain a full internal read only where a bounded
    mutation genuinely needs it.
11. Add the smallest forward, data-preserving migration for corrected
    keys/references/indexes. Replacing the existing primary-key constraint is not described as
    purely additive. Preflight existing rows: strictly parse snapshots, preserve existing truthful
    links, reconstruct only snapshot-declared direct references whose same-owner resource facts can
    be proven, and fail the migration preflight with an actionable safe report for irreconcilable
    rows. Never infer undeclared roles or historical provenance.
12. Because relational persistence is edited, make Neon TLS requirements explicit in configuration
    and tests. Leave unrelated dependency cleanup out of scope unless the affected persistence work
    itself proves it necessary.

## Architecture constraints

- Keep Project Revision distinct from Video Version.
- Keep one video-specific snapshot schema v1; do not generalize it to multi-format content.
- Keep ownership derived from verified server identity and enforced through same-owner constraints.
- Keep Saved Video and media-byte lifecycle owners intact; Project stores relations, not bytes.
- Never persist Blobs, URLs, storage keys, provider payloads, credentials, or raw errors in a
  Project snapshot.
- Do not replace the Project aggregate, runtime, Elysia, Drizzle, `pg.Pool`, byte-store interface,
  or provider adapters.
- Resource creators remain responsible for idempotent cleanup, but must consult Project retention.
- Preserve provider neutrality and loopback-only behavior.

## Data / migration requirements

- Generate and inspect a forward, data-preserving migration using repository tooling.
- The migration must be safe when Project tables are empty and when valid Prompt 01 rows exist.
- Re-key existing Project asset rows using their already stored revision identity; run the explicit
  preflight above for rows that may have been affected by historical conflict-do-nothing behavior.
- Add owner/revision/version foreign keys and supporting indexes needed by the chosen normalized
  media-reference model.
- Do not backfill Projects, Saved Videos, jobs, or inferred relations.
- Document rollback/compatibility limits. Never run a production migration automatically.
- Add a real PostgreSQL transaction test for create, multi-revision unchanged-source reuse,
  normalized Version reference, conflict replay, and retention behavior.

## UX requirements

None. Do not add Project routes, browser state, or UI. Safe conflict/error types must be suitable for
later app-owned HTTP mapping and must not expose record existence across owners.

## Explicit non-goals

- Campaign schema or membership.
- Project list/create HTTP APIs or UI.
- Local Project repository implementation.
- Durable source upload/record orchestration.
- Autosave, browser Project session, creative-tool integration, or output UI.
- Generic Asset APIs, Deliverables, global Processing Center, tags, search, billing, analytics, or
  public-service security.
- A runtime façade rewrite or paid/live provider call.

## Testing

Run the smallest meaningful set, including:

- focused Project domain and contract tests;
- schema/migration generation and inspection checks;
- mocked repository unit tests for safe mapping/error behavior;
- real PostgreSQL integration tests for constraints, transactions, concurrent/mismatched replay,
  cross-owner references, and multi-revision asset reuse;
- Saved Video/reference cleanup tests proving Project retention; and
- API package typecheck and, because this is high-risk persistence/security work, the repository
  quality gate.

Do not claim unavailable Docker/PostgreSQL or skipped checks passed.

## Documentation

Update the accepted Project ADR, Architecture, Cloud Persistence, privacy/temporary-data policy,
testing guidance, and migration notes only where behavior or ownership changed. Keep Product Vision
and Roadmap unchanged unless implementation materially changes the agreed plan.

## Acceptance criteria

- The same asset and role can be linked truthfully to revisions N and N+1.
- Every newly linked snapshot Saved Video Version reference is exact, active at link time,
  same-owner, normalized, and revision-scoped; a later library tombstone preserves the exact
  retaining Project relation and bytes.
- A processing job has one initiating Project revision and an output Video Version has at most one
  producing Project revision; later reuse cannot fabricate another producer.
- `lastSuccessfulOutput` cannot name an unlinked/nonexistent/cross-owner Version.
- Exact job/output replay is idempotent; mismatched replay is a no-op conflict.
- Concurrent lifecycle change cannot admit a relation using a stale active check.
- Relational Project-retained bytes survive all affected relational cleanup paths, and a common
  retention-policy port is ready for local implementation no later than Prompt 06.
- Status reflects current revision/current attempt, not unrelated history.
- Archive cannot silently hide active work.
- Current-summary reads are bounded and history is cursor-paginated.
- Supported snapshots are canonicalized; unsupported/unknown data fails safely.
- Existing truthful Project rows migrate without fabricated lineage.
- Focused, real-database, cleanup, type, and quality checks pass.
- No user-facing Project/Campaign behavior was started.

## Completion report

Report behavior implemented, architecture decisions, files changed, generated migration and
rollback/compatibility notes, tests run/results, tests not run and why, local/Neon/R2/manual/live
limits, unresolved risks, and whether the relational foundation correction is ready for Prompt 03.

---

# Prompt 03 — Establish Project authority and lifecycle APIs

## Role

Act as a senior domain/application architect, Bun/Elysia API engineer, local persistence and
PostgreSQL engineer, security engineer, and QA lead.

## Objective

Make owner-scoped empty Projects durable and API-accessible in every supported persistence mode:
create, list, get current state, rename, archive, and restore, without browser UI or media.

## Why this comes next

Prompt 02 makes relational writes safe. The current default local and shadow modes still lack
Project authority, and no application service or route exposes the aggregate. Establishing one
contract and crash-safe authority first keeps routing/UI work in Prompt 04 branch-sized.

## Audit first

Before editing:

1. Re-read the repository guide, implemented Prompt 02 changes, MVP definition, Project ADR,
   Architecture, current route/auth/error patterns, persistence factory, local file repositories,
   and relevant persistence/API tests.
2. Trace the Project repository port and bounded current/list reads, saved-video local repository
   atomic-write/recovery patterns, authentication owner derivation, idempotency receipts, Elysia
   route composition, local owner locks, file-processing traces, and shadow-mode composition.
3. Search for dormant IndexedDB `projects` stores. Confirm they are unused and do not activate them
   as Project authority.
4. Inspect dirty worktree and current routes. Reuse established safe error, strict-contract,
   pagination, CAS, and receipt patterns.

## Required work

1. Implement a versioned, owner-scoped local Project repository with atomic file replacement,
   strict runtime parsing, recovery/compatibility behavior, and the same observable semantics as the
   relational repository.
2. Establish the smallest owner-scoped local lock plus operation-receipt/journal envelope needed by
   Project create and future cross-file commands. It must serialize affected local metadata,
   recover/reconcile interrupted commits, and be extendable by Campaign/source/output operations;
   do not build a general event system.
3. Compose the local Project repository as product authority in both local and shadow modes.
   Shadow may continue writing configured remote job traces, but it must not silently make the
   dormant Drizzle Project repository authoritative or claim Project shadow replication unless a
   deliberate tested adapter is added.
4. Add a thin Project application service that derives owner from authenticated identity, enforces
   lifecycle/CAS rules, maps safe not-found/conflict errors, and generates durable idempotency for
   create and other replay-sensitive mutations.
5. Require an app-controlled operation/idempotency key for Project create and persist an
   owner-scoped receipt in each authority. Exact replay returns the original Project; reuse with a
   different request conflicts. Add the required relational receipt migration rather than assuming
   the current Project schema can provide restart-safe idempotency.
6. Add strict app-controlled contracts and Elysia routes for:
   - cursor-paginated active/archived Project summaries;
   - create an empty Project;
   - fetch one current summary/current revision;
   - rename;
   - archive; and
   - restore.
7. Keep deletion/tombstone out of the normal MVP API. If an existing contract remains public,
   preserve its guarded semantics and test it; do not label tombstone as physical/permanent erasure.
8. Add truthful capability handling if a configured mode cannot initialize Project persistence:
   fail closed at startup or expose a documented safe unavailable state. Do not silently make the
   feature disappear in default local mode.

## Architecture constraints

- Project remains one focused video workflow and can exist empty.
- Server/repository is Project authority. No browser Project cache is introduced in this prompt.
- All owner IDs come from the server session; do not accept owner IDs in public requests.
- Use current Project and revision CAS tokens; stale writes return typed conflicts with safe data.
- List responses are bounded summaries and never include snapshots, storage keys, full history, or
  media bytes.
- Local and relational modes share contracts and domain behavior, not necessarily storage code.
- No Campaign fake/default row and no media backfill.

## Data / migration requirements

- Define and test a versioned local Project metadata format, atomic write/rename, strict startup
  validation, backup/recovery behavior, and owner namespace.
- Add the owner-scoped relational Project-operation receipt migration required for durable create
  idempotency, unless a re-audit proves an equally safe existing durable receipt can be reused.
- Define the local lock/journal/receipt format with a supported version and recovery tests; later
  prompts extend this same envelope rather than inventing incompatible cross-file transactions.
- Existing Project rows remain valid. Existing Saved Videos/jobs remain unassigned.
- Create idempotency survives response loss/application restart in the authority for that mode.

## UX requirements

None. Public errors and conflicts must be finite, safe, and actionable for Prompt 04, but this prompt
does not add a browser adapter, route, navigation, or UI.

## Explicit non-goals

- Campaign aggregate or membership.
- Browser Project API adapter, routes, navigation, workspace, source upload/record/reuse, autosave,
  draft, Project switching policy, or media hydration.
- Creative tools, provider jobs, outputs, Video Version history, export, or download changes.
- Tags, favorites, folders, bulk actions, full search, templates, Deliverables, or generic Assets.
- Public accounts, collaboration, billing, or public deployment.

## Testing

Add and run:

- local Project repository parsing, atomicity, idempotency, owner isolation, CAS, restart, and
  corrupt-file recovery tests, including lock/journal reconciliation;
- relational Project list/lifecycle integration tests affected by the service;
- route tests for auth, Origin, validation, owner isolation, pagination, not-found, conflict, and
  replay;
- local/shadow/authoritative composition tests; and
- affected package typechecks plus the full quality gate because this changes persistence and API
  boundaries.

## Documentation

Update Architecture, Cloud Persistence, testing, route documentation, and the Project ADR to the
exact implemented authority/API. Keep README/Product Roadmap current-state wording clear that no
user-facing Project workspace exists yet.

## Acceptance criteria

- Projects work in default local, shadow, and authoritative relational modes with one public
  contract.
- Create is durable and idempotent across response loss/restart.
- An authenticated owner can list, create, open, rename, archive, and restore only their Projects.
- Lists are bounded and archived Projects are excluded from the default active list.
- Stale CAS returns a safe actionable conflict and never overwrites.
- Local/shadow authority uses the deliberate local repository; authoritative relational mode uses
  Drizzle.
- The owner-scoped local lock/journal/receipt envelope recovers interrupted create commits and is
  ready for later cross-file commands.
- No browser route/UI, source, Campaign, provider, output, or generic Asset behavior was added.
- Focused repository/service/route/composition tests, affected typechecks, and quality pass.

## Completion report

Report behavior implemented, authority choices for local/shadow/relational modes, lock/journal and
receipt decisions, routes/contracts, files changed, migrations/local-format versions, tests
run/results, tests not run and why, compatibility/manual limits, unresolved risks, and whether
Prompt 04 can proceed.

---

# Prompt 04 — Establish Project routing and workspace

## Role

Act as a senior React application architect, product engineer, information architect,
accessibility engineer, API-client engineer, and QA lead.

## Objective

Make the Prompt 03 Project lifecycle user-facing through a canonical authenticated route topology,
shared navigation/chrome, feature-local API/controller boundary, and minimal Projects workspace for
list, Quick Start, open, rename, archive, and restore—without media, Campaign, or creative-tool
integration.

## Why this comes next

Project authority and routes now exist, but the current router only treats `/studio/*` as
authenticated product space and the navigation/header lives inside `StudioApp`. Establishing the
work-context URLs and shell before Campaign/source work prevents parallel features from inventing
competing route and media owners.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompts 02–03, MVP definition, current router/path
   helpers, protected-route/login-return behavior, Studio shell/header/account navigation,
   `StudioApp` mounting, library surfaces, route metadata, exit guards, overlays, and relevant
   tests/user stories.
2. Trace how `/`, `/studio`, `/studio/videos`, `/studio/characters`, and `/studio/outfits` mount one
   Studio/media stage; confirm `/projects` currently redirects and post-login return accepts only
   recognized Studio paths.
3. Trace Project API contracts/errors/CAS, web remote-state policy, focus/restoration, skip link,
   responsive/safe-area layouts, and visual baseline policy.
4. Search for existing shell, list, dialog, status, empty, pagination, and conflict components
   before adding new ones.

## Required work

1. Adopt one canonical MVP route topology under the existing authenticated Studio subtree:
   `/studio/projects` for the workspace and `/studio/projects/:projectId` for an open Project.
   Update path recognition, route metadata, protected deep links, and post-login return behavior.
   Preserve current `/studio` and library URLs; do not add a second authenticated app shell.
2. Make Projects a primary destination in the existing authenticated navigation/chrome. Render the
   Projects workspace as a full authenticated surface while retaining exactly one `StudioApp` and
   media-stage owner.
3. Add a feature-local web API adapter/controller for bounded Project queries and lifecycle
   mutations. The web must not import API persistence code or duplicate domain policy.
4. Add active and archived Project lists with title, derived status, updated time, loading, empty,
   pagination, safe error, and retry behavior. Do not fetch snapshots/history/media for list rows.
5. Add Quick Start/create using `Untitled Project`, open, rename, archive, and restore. Use Project
   CAS and durable operation keys; reconcile exact replay and surface stale conflict without silent
   overwrite.
6. Opening an empty Project shows its identity and truthful empty source state. It may offer the
   future Record/Upload/Use Saved Video entry affordances as disabled/explanatory, but it must not
   claim resumability or mount a second player.
7. Preserve the user's proposed rename on conflict long enough to reload and explicitly retry or
   discard. Refresh/deep link restores the same empty Project from server authority.
8. Establish a single Project route/context boundary that later source/session prompts extend.
   Do not add Project persistence to `StudioApp` or the dormant IndexedDB store.
9. Make active Project identity URL-owned. Navigating from `/studio/projects/:projectId` to a
   global library route such as `/studio/videos`, `/studio/characters`, or `/studio/outfits`
   explicitly exits Project context; those URLs never preserve it only in mounted React state.
   Later in-Project selection uses contextual pickers or returns through the explicit Project URL.

## Architecture constraints

- Keep all MVP authenticated routes under `/studio/*` for this incremental route topology; a future
  URL migration requires separate compatibility design.
- Reuse the current protected route, authenticated Studio shell, one media stage, and library
  surfaces. Do not mount another Studio or create a second header/navigation owner.
- Server/repository is Project authority; React Query/controller state is a cache.
- List reads stay bounded and summaries contain no snapshot, history, byte, storage, or provider
  detail.
- All mutations use owner-derived API behavior, Project CAS, strict contracts, and durable
  idempotency from Prompt 03.
- Empty Project navigation starts no media, provider, or paid work.
- Global library routes are not hidden Project routes. Refreshing one restores that library, not a
  stale mounted Project context; returning to work uses its canonical Project URL.

## Data / migration requirements

None expected. Do not add database/local-format migrations or activate dormant IndexedDB Project
stores. If a contract defect blocks the UI, fix it narrowly with compatible API tests and report
why.

## UX requirements

- Projects is a primary authenticated destination.
- Quick Start is one primary action and does not require Campaign, source, brief, tags, or provider
  choices.
- Empty state explains that Projects will preserve work but does not claim media resume yet.
- Rename/archive/restore use shared accessible dialogs or inline controls, restore focus, announce
  results, and expose busy/error/conflict state.
- Back/forward/deep-link, skip-link/main focus, keyboard, reduced-motion, compact/short/safe-area,
  and 200%-text behavior follow current patterns.
- Legacy `/studio/*` URLs and current library navigation remain functional.
- Leaving Project detail for a global library is presented as an explicit Project-context exit; an
  empty Project has nothing to flush yet, and Prompt 07 adds the dirty-work guard.

## Explicit non-goals

- Campaigns or Project membership.
- Source upload/record/reuse, Project autosave/draft/switch guards, media hydration, or creative
  state.
- Provider jobs, outputs, Video Version history, Download changes, tags, search, bulk actions,
  Deliverables, or generic Assets.
- A new global app shell, router rewrite, Studio decomposition, or public account flow.

## Testing

Add and run:

- path/router/protected-return/route-metadata tests for list, detail, refresh, deep link, legacy
  routes, and unknown routes;
- web API/controller tests for bounded list, create replay, open, rename/archive/restore CAS,
  conflict preservation, pagination, errors, and cache invalidation;
- component tests for loading/empty/active/archived/open states, dialogs, focus, announcements, and
  no media/provider contact;
- targeted responsive/accessibility visual cases for Projects list and empty detail; and
- affected web/contracts typechecks plus repository quality because route/shell behavior is shared.

## Documentation

Add the observable empty-Project lifecycle user story and update README, Architecture, route/user
story indexes, testing/visual maps, and Product Roadmap from “foundation only” to the exact
user-facing lifecycle. Do not claim source resume, Campaigns, or creative-tool integration.

## Acceptance criteria

- `/studio/projects` and `/studio/projects/:projectId` are protected, deep-linkable, restore after
  login, and coexist with every legacy Studio/library URL.
- Exactly one authenticated chrome and one Studio/media-stage owner exists.
- An owner can list, Quick Start, open, rename, archive, and restore their empty Projects.
- Lists are bounded; default view excludes archived Projects; stale CAS never overwrites.
- Refresh/deep link restores the same empty Project from server authority.
- Project identity survives only in its canonical URL; a global library refresh cannot silently
  resurrect or mutate the previously mounted Project.
- Empty Project navigation starts no media/provider work and makes no resume claim.
- Keyboard/focus/announcement and targeted responsive/visual cases pass.
- No Campaign/source/processing/output or browser Project authority was added.

## Completion report

Report route topology and compatibility decisions, behavior/UI, shell/media ownership, files
changed, any contract correction, tests run/results, tests not run and why, manual limits,
unresolved risks, and readiness for Prompt 05.

---

# Prompt 05 — Organize Projects in lightweight optional Campaigns

## Role

Act as a principal product/domain architect, PostgreSQL and local-persistence engineer, Bun/Elysia
API engineer, React information architect, accessibility engineer, and test lead.

## Objective

Add the smallest useful Campaign organizer—name, optional brief, lifecycle, and optional Project
membership—so users can answer what initiative they are working on without being forced through
campaign planning before creative work.

## Why this comes next

Projects now exist end to end. A minimal optional Campaign makes the campaign-workspace positioning
credible while preserving standalone Quick Start and avoiding speculative marketing-platform
features.

## Audit first

Before editing:

1. Read the repository guide, implemented Project lifecycle, MVP definition, Product Vision/Roadmap,
   Architecture, persistence/cleanup docs, Project routes/UI, and relevant tests.
2. Trace current Project version/CAS, list queries, local metadata format, relational owner
   constraints, route auth, navigation shell, overlay/dialog patterns, and archive semantics.
3. Confirm no Campaign schema/domain/contract/route/UI has appeared since this plan. Search for
   terms used only in vision documents and avoid treating them as implementation.
4. Re-evaluate whether a nullable owner-constrained Project membership remains the smallest model.
   Use another model only if current code proves it safer, and document why.

## Required work

1. Add a pure Campaign domain aggregate and rules for normalized name, optional bounded brief,
   immutable owner, version/CAS, active/archive/restore, and guarded tombstone lifecycle.
2. Add strict contracts, local and relational repositories, explicit mappings, and owner-derived
   services/routes for bounded list, create, get, rename/edit brief, archive, restore, and guarded
   tombstone.
3. Add optional Campaign membership to Project. The smallest expected model is a nullable Campaign
   ID with an owner-constrained restrictive relation and Project CAS; do not introduce many-to-many
   membership without an implemented need.
4. Support create-in-Campaign, move between active Campaigns, and detach to No Campaign. Verify the
   target Campaign exists, is same-owner, and is active inside the mutation boundary.
5. Enforce lifecycle:
   - Campaign archive does not archive or alter Projects;
   - archived Campaigns reject new/moved membership until restored;
   - Campaign tombstone requires archive and zero attached Projects; and
   - no Campaign operation cascades to media, revisions, jobs, outputs, or resources.
6. Add Campaigns as a primary authenticated destination with active/archived lists, lightweight
   create/edit, detail, grouped Project list, New Project, move/detach, archive, restore, and an
   explicit guarded tombstone action for an archived empty Campaign.
7. Add the virtual No Campaign group to Projects. Never create a default/Unassigned Campaign row.
8. Keep Campaign success fast: after Name plus optional Brief, open detail with a primary New
   Project/Quick Start action.

## Architecture constraints

- Campaign organizes; Project owns working-state/revision relationships.
- Project belongs to zero or one Campaign; Campaign has zero or many Projects.
- Workspace remains conceptual owner scope; do not add a Workspace or organization table.
- All relationships are same-owner and server-authorized.
- Project membership mutation participates in Project CAS and cannot silently overwrite concurrent
  Project work.
- Campaign summaries never load Project revisions or bytes; Project lists remain paginated.
- Archive/delete is non-cascading and does not imply byte erasure.
- Provider, media, reusable-resource, and Saved Video owners remain unchanged.

## Data / migration requirements

- Generate/inspect an additive relational Campaign/membership migration with composite owner
  constraints, restrictive deletion, lifecycle checks, and list indexes.
- Evolve the local Project format and add local Campaign storage with versioned migration,
  atomicity, restart recovery, and idempotent create receipts by extending Prompt 03's owner lock
  and operation journal rather than inventing a second transaction mechanism.
- Existing Projects migrate with null Campaign membership.
- Existing Saved Videos and all other content remain unassigned; do not create a default Campaign.
- Document downgrade/rollback constraints and never migrate production automatically.

## UX requirements

- Campaign creation has only required Name and optional Brief.
- Standalone Project Quick Start remains equally prominent.
- Campaign and Project lists expose clear empty, loading, archived, and safe-error states.
- Moving/detaching a Project is explicit, accessible, and confirms the resulting location.
- Archiving a Campaign explains that its Projects remain intact.
- Deleting/tombstoning a nonempty Campaign is blocked with a safe instruction to move/detach
  Projects; do not offer cascade deletion.
- Tombstoning an archived empty Campaign requires explicit confirmation, restores focus safely, and
  explains that no Project/content bytes are being erased.
- Deep links, back navigation, focus restoration, 200% text, compact/mobile layout, and reduced
  motion follow existing patterns.

## Explicit non-goals

- Mandatory/default Campaigns or multi-Campaign Projects.
- Campaign-owned assets, jobs, outputs, reusable resources, or processing state.
- Goals, audiences, channels, dates, budgets, KPIs, tags, calendar, variations, approvals,
  publishing, analytics, templates, brand kits, or collaboration.
- Source/resume, creative tools, processing, Version history, or Download changes.
- Public accounts, roles, teams, or tenant abstractions.

## Testing

Add and run:

- Campaign domain/contract parity and lifecycle tests;
- local repository migration/restart/idempotency/owner/CAS tests;
- real PostgreSQL migration/constraint/repository tests for same-owner membership, archive, detach,
  and restrictive deletion;
- service/route auth, Origin, validation, pagination, replay, conflict, and non-enumeration tests;
- web router/API/controller/component tests for create, detail, New Project, move/detach,
  No Campaign, archive, restore, blocked nonempty delete, and successful archived-empty tombstone;
- targeted accessibility/responsive/visual cases; and
- affected typechecks plus the repository quality gate.

## Documentation

Add a current Campaign organization user story and update README, Architecture, Product Vision,
Product Roadmap, Cloud Persistence, testing/visual documentation, and Campaign/Project terminology
to the exact implemented scope. Keep rich Campaign concepts labeled deferred.

## Acceptance criteria

- Campaign is a durable owner-scoped aggregate in every supported persistence mode.
- Project is optionally related to exactly one same-owner Campaign.
- Standalone Projects and the virtual No Campaign view work without a synthetic row.
- Projects can move/detach with CAS only to active same-owner Campaigns.
- Campaign archive leaves Projects unchanged; guarded delete cannot cascade or remove a nonempty
  Campaign.
- An archived empty Campaign can be tombstoned through an explicit accessible action and then
  disappears from active/archived lists without affecting Projects or content.
- Create Campaign requires only Name, accepts optional Brief, and reaches New Project quickly.
- Campaign/Project navigation, deep links, focus, and target responsive cases work.
- Existing Projects migrate to null membership; no legacy content gets fabricated lineage.
- Focused tests, migration checks, typechecks, visuals, and quality pass.

## Completion report

Report behavior, Campaign/Project cardinality and lifecycle decisions, storage/migration details,
routes/UI, files changed, tests run/results, tests not run and why, compatibility/manual limits,
unresolved risks, and whether the Foundation checkpoint is satisfied.

---

# Prompt 06 — Attach and hydrate an immutable Project source

## Role

Act as a principal media-lifecycle engineer, local/cloud persistence engineer, Bun/Elysia API
engineer, React state architect, UX architect, security engineer, and QA lead.

## Objective

Allow an open Project to accept an uploaded video, finalized local recording, or exact existing
Saved Video Version as its immutable source and restore that same safe, playable source after
navigation, refresh, browser restart, or application restart.

## Why this comes next

Campaign and Project organization is now coherent, but current source, edit, and correlation state
is browser memory. A Project cannot credibly promise resume until the original is durable,
inspected, linked to the exact revision, and hydratable through an owner-checked content endpoint.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompts 02–05, MVP definition, Architecture, current
   upload/record/Saved Video flows, media inspection, byte-store/lifecycle, privacy/cleanup,
   browser persistence rules, exit guards, and relevant user stories/tests.
2. Trace the actual owners of selected File, finalized recording artifact, source Blob/object URL,
   loaded Saved Video lineage, local edit base, Project snapshot, byte manifest, upload staging,
   R2 direct upload, content streaming/range, and object-URL cleanup.
3. Inspect Prompt 03's local lock/journal and current upload receipts for extension; confirm dormant
   Project/upload/outbox IndexedDB stores remain unused.
4. Characterize refresh during local upload, direct R2 upload, after durable accept, and on exact
   Saved Video Version reuse.
5. Confirm media MIME/size/duration/dimension/orientation limits from current contracts rather than
   inventing new limits.

## Required work

1. Add the smallest app-owned Project source-ingestion command and strict contracts that reuse
   current validated upload/record storage and inspection paths. Support:
   - uploaded supported video;
   - finalized normalized local recording; and
   - explicit reuse of one exact active same-owner Saved Video Version.
2. Preserve responsive local preview while bytes transfer, but do not mark the Project resumable or
   append a ready-source revision until durable storage, inspection, owner metadata, and checksum
   are complete.
3. Store a new upload/recording as an owner-bound ready Media Asset/manifest and revision-scoped
   source link. Reusing a Saved Video Version normally references and retains that Version's
   existing asset bytes plus exact normalized Version lineage; do not copy bytes merely to make it
   a Project source, and do not claim the historical video was produced by this Project.
4. Add owner-checked Project media hydration/content access that returns validated metadata and a
   controlled streaming/content URL. On resume, reconstruct fresh object URLs through the existing
   media owner; never persist a blob/data URL.
5. Add a feature-local Project source controller outside the large Studio owners. It hydrates the
   Project/current revision and maps the durable source into the current single media stage without
   becoming a second media owner.
6. Enforce the MVP source rule: the first accepted source is the Project's immutable original.
   Failed or unaccepted staging may be replaced. Choosing a different accepted original starts a
   new Project; edit/transform results later advance working/presented state, not source.
7. Keep source reuse separate from output intent. Reusing Saved Video Version X as source does not
   authorize or preselect Add Version on Saved Video X; Prompt 11 receives a separately explicit
   save target.
8. Extend the Prompt 03 local lock/journal/receipt envelope for source acceptance plus metadata/byte
   reconciliation. Implement the common Project-retention policy for local references before any
   byte cleanup. Ensure abandoned/failed staging and object URLs are cleaned by their creator.
9. Define Project switching during recording, upload, inspection, and source acceptance. The user
   must either stay until the lifecycle owner reaches a safe point, explicitly abort cancellable
   staging, or let an already committed owner-scoped operation reconcile against its original
   Project without ever mutating the newly opened media stage.

## Architecture constraints

- A Project has one immutable accepted original/source for MVP. A different accepted original
  always starts a new Project.
- Project Revision is semantic state, not a media-byte copy and not a keystroke log.
- Project/repository is authority; no Project draft cache is introduced in this prompt.
- Use the existing media stage, recording-artifact owner, byte-store, inspection, streaming,
  upload, and cleanup seams. Do not mount a parallel player pipeline.
- Never accept a browser owner ID, storage path/key, claimed checksum, or Saved Video relation as
  authority without server verification.
- Do not expose raw storage/provider data or persist object URLs.
- Keep local, shadow, PostgreSQL/local-byte, and Neon/R2 semantics aligned without forcing cloud
  storage for MVP.
- No automatic provider call occurs during source selection, hydration, checkpoint, or resume.
- A source-stage operation remains bound to its initiating Project; route changes cannot retarget
  its eventual commit or media presentation.

## Data / migration requirements

- Add only video-specific metadata/relations required for durable Project source hydration if the
  corrected foundation does not already contain them.
- Local mode must persist owner-bound manifest/Project linkage and recover interrupted metadata
  operations safely.
- Relational mode must use exact same-owner ready-asset/Version constraints inside the append
  transaction.
- Upload operation IDs and Project mutation receipts survive response loss/restart and are
  idempotent. Reusing a key with different bytes/source/revision conflicts.
- Preserve all existing Saved Video and source byte behavior. No bulk backfill or source
  inference.
- Extend the established local operation envelope; do not add or reinterpret a browser cache.

## UX requirements

- An open empty Project offers **Record**, **Upload**, and **Use Saved Video** without a forced
  wizard.
- Upload/record preview remains available while durable acceptance shows truthful progress.
- Clearly distinguish **Preparing source**, **Saving changes**, **All changes saved**, **Conflict**,
  and safe failure. Do not call a tab-only Blob saved/resumable.
- Refresh after acceptance restores the source and current Project; refresh during incomplete
  staging explains whether it resumes or safely restarts without duplicate commit.
- Source failures give safe retry/change-source actions and never expose paths/provider bodies.
- Switching Projects during source staging uses explicit stay/abort/background-reconcile copy that
  matches the actual lifecycle state; completion for the old Project never replaces the new stage.
- UI follows current overlay, focus, announcements, reduced-motion, compact, safe-area, and 200%
  text patterns.

## Explicit non-goals

- Campaign feature expansion.
- Project autosave/draft, resource selection, local edit, switch/exit policy, Character Swap,
  Virtual Try On, Voice, or provider job integration beyond preserving compatible existing
  behavior outside Project.
- Saving Project outputs/Versions or Version-history UI.
- Multiple sources/Deliverables, generic Asset library/API, background offline sync, cross-device
  promise, or cloud requirement.
- Collaborative merge, automatic backfill, direct publishing, or paid/live provider calls.

## Testing

Add and run:

- domain/contract tests for ready-source, immutable-original, exact-Version lineage, and separate
  save-target rules;
- local and relational service/repository tests for upload/record/Version reuse, exact owner,
  idempotency, conflict, interruption, and cleanup retention;
- content/stream tests for auth, ranges/HEAD, safe metadata, missing bytes, and fresh hydration;
- browser controller tests for refresh/restart hydration, exact-Version reuse without byte copy or
  append-target inference, object URL ownership, failed/pending upload, mid-stage Project switching,
  old-Project completion isolation, and no provider contact;
- targeted E2E for create → upload/record synthetic source → accept → refresh → resume in local mode
  and the available relational harness;
- responsive/accessibility/visual cases for source and save states; and
- affected typechecks plus the repository quality gate.

Use synthetic fixtures only; no camera hardware, live R2, or paid provider is required for ordinary
validation. Report those manual/live limits.

## Documentation

Update the Project user story, existing-video and recording stories, Architecture, Cloud
Persistence, privacy/temporary-data and cleanup guidance, testing/manual QA, browser persistence
policy, and README to the exact durable-source/resume behavior. Correct any now-stale statement that
refresh necessarily loses Project-retained source work; do not overstate cloud/cross-device
durability.

## Acceptance criteria

- Upload, finalized recording, and explicit exact-Version reuse can become a Project source.
- A source is linked only after durable, inspected, ready, same-owner acceptance.
- Original bytes remain non-destructive and Project-aware cleanup retains them.
- The same Project and source return after refresh, browser restart, and app restart in each
  supported mode.
- Hydration creates a fresh controlled media source and never persists an object URL.
- The first accepted source remains immutable; choosing another accepted original starts a new
  Project.
- Reusing a Version does not copy bytes merely for Project source or infer an Add Version target.
- Interrupted/replayed acceptance is idempotent and leaves no unauthorized/orphaned durable claim.
- A mid-stage Project switch is blocked, explicitly aborts safe staging, or lets the old owner
  reconcile without mutating the new Project/stage.
- No provider work starts implicitly and no generic Asset/Deliverable system was added.
- Focused tests, E2E, affected typechecks, visuals, and quality pass.

## Completion report

Report behavior, immutable source authority/readiness, browser/server ownership, local/relational
operation recovery and retention, files changed, migrations/local format changes, tests
run/results, tests not run and why, hardware/live/provider limits, compatibility risks, unresolved
issues, and readiness for Prompt 07.

---

# Prompt 07 — Establish the Project session and autosave guards

## Role

Act as a principal frontend/application architect, domain/application engineer, persistence-aware
UX architect, accessibility engineer, and QA lead.

## Objective

Add one URL-owned browser Project session with bounded semantic autosave, conflict preservation,
and route/switch/exit protection, without integrating creative resources, local edits, provider
actions, or output saves yet.

## Why this comes next

Prompt 06 provides a durable source and defines staging-switch behavior. Before creative tools add
many mutation producers, one session owner must establish how the current Project is hydrated,
saved, conflicted, flushed, discarded, and exited across every `/studio/*` route.

## Audit first

Before editing:

1. Read the repository guide, implemented Project/source behavior, MVP definition, current router,
   Project API contracts, browser persistence policy, Studio exit guard, recording/render owners,
   authentication/logout paths, and affected tests.
2. Trace current route identity, deep-link hydration, query/cache ownership, source controller,
   Project/revision CAS, operation keys, back/forward behavior, global library navigation, logout,
   refresh/unload, recording finalization, render, and object-URL cleanup.
3. Characterize response loss, offline/unavailable API, stale CAS, reload with a pending proposal,
   Project-to-Project switch, Project-to-global-library exit, and logout while dirty.
4. Confirm dormant IndexedDB Project stores remain unused. Add a browser draft only if the audited
   failure model proves it necessary.
5. Inspect the large Studio owners for one narrow session integration port; do not move creative or
   media lifecycle ownership in this prompt.

## Required work

1. Add a feature-local browser Project session/controller outside the large Studio owners. It
   hydrates Project summary/current revision, exposes **Saving changes**, **All changes saved**, and
   conflict state, and maps durable state into the existing controllers without becoming a second
   media owner.
2. Define a typed semantic-proposal port and persist the Project/session fields already implemented
   through Prompt 06 (identity, durable source/current reference, workflow phase, and explicit
   session metadata). Coalesce compatible proposals at a bounded interval; never append per input
   event. Prompt 08 adds creative/edit proposal producers through this port.
3. If a browser draft/cache is needed, define a versioned owner-scoped bounded schema with strict
   validation, explicit discard, and server-revision base token. The server remains authority; a
   divergent cache never overwrites automatically. Do not activate dormant stores without an
   explicit migration.
4. Preserve a local proposal on CAS failure, fetch current server state, and offer explicit
   retry/reapply or discard when safe. Do not implement collaborative merge.
5. Extend exit/switch orchestration so changing Projects, leaving Studio, logging out, refresh, and
   unload coordinate with recording/finalization/render and pending Project save. A switch flushes,
   stays on failure/conflict, or explicitly discards; navigation within `/studio/*` cannot bypass
   it.
6. Make active Project identity URL-derived. Entering a global library route is a guarded Project
   exit, not a hidden context switch; refreshing that route must not restore a Project from mounted
   memory. Returning to work uses the canonical Project URL and server state.
7. Expose one small session integration port to the existing Studio shell/source controller. Do not
   hydrate creative selections or local edit state, create working media, or enable provider starts.
8. Normalize visible session copy for **Saving changes**, **All changes saved**, **Conflict**, and
   safe unavailable/dirty states without calling a temporary render or browser cache saved.

## Architecture constraints

- Server/repository remains Project authority; a query cache or optional draft is subordinate.
- Active Project identity comes from the canonical URL, never an unversioned global singleton.
- One feature-local session/controller owns Project hydration, proposal coalescing, CAS, and flush;
  `StudioApp` and media owners consume a narrow port.
- Existing recording, rendering, media-stage, and object-URL lifecycle owners remain authoritative.
- No creative resource, edit spec, working-media adoption, provider request, or output save is added.
- No automatic paid request, retry, fallback, or provider contact occurs.

## Data / migration requirements

- No server schema or local-authority migration is expected unless a re-audit finds a contract gap.
- If a browser draft is justified, it is owner-scoped, bounded, strictly versioned, based on one
  server revision token, explicitly discardable, and never authoritative.
- Existing Projects and creative libraries remain unchanged; no applied values are fabricated.

## UX requirements

- Opening/deep-linking a Project shows truthful hydrating, ready, dirty, saving, saved, conflict, and
  safe failure states.
- Switching Projects or entering a global library flushes, stays on conflict/failure, or obtains
  explicit discard; the destination never receives the old Project's late completion.
- Back/forward, refresh, unload, and logout match the same policy within browser limitations.
- **All changes saved** remains distinct from temporary media readiness or rendering.
- New/touched controls meet current keyboard, focus, announcement, compact, safe-area, and 200%-text
  expectations.

## Explicit non-goals

- Creative-resource selection/hydration, local edit persistence, durable working-media adoption, or
  provider action enablement.
- Outputs/history/Download, new creative capabilities, provider changes, or fallback routing.
- Full Studio decomposition, global state framework, library unification, tags, or Campaign planning.

## Testing

Add and run focused tests for:

- session/controller hydration, semantic coalescing, exact replay, response loss, and query/cache
  invalidation;
- optional draft versioning/divergence only if a draft is introduced;
- CAS proposal preservation and explicit retry/reload/discard;
- Project switch, Project-to-library exit, back/forward, refresh/unload, and logout coordination with
  source/recording/render owners;
- canonical URL restoration and proof that global library refresh does not resurrect Project state;
- save/conflict/error accessibility and targeted responsive/visual cases; and
- affected typechecks plus repository quality.

Do not call live/cost-bearing providers. Report advanced live/device/codec checks as manual where
the existing testing policy requires them.

## Documentation

Update the Project workflow user story, route/navigation behavior, Architecture, browser persistence,
privacy, and testing docs to the exact session/autosave/exit contract. Do not claim creative-state,
processing, or output resume.

## Acceptance criteria

- One URL-owned session restores the Project/source without becoming another media owner.
- Semantic autosave is bounded; exact replay converges; conflict preserves the local proposal and
  never silently overwrites.
- Project switch, global-library exit, back/forward, refresh/unload, and logout cannot bypass the
  flush/stay/discard policy.
- Refreshing a global library URL does not silently restore the prior Project context.
- **Saving changes**, **All changes saved**, conflict, and failure copy is truthful.
- No creative-resource/edit/working-media/provider/output behavior was added.
- Focused controller, route/guard, accessibility, typecheck, and quality checks pass.

## Completion report

Report session/URL authority, autosave/CAS/draft/exit decisions, files changed, migrations if any,
tests run/results, tests not run and why, browser lifecycle limits, compatibility risks, unresolved
issues, and readiness for Prompt 08.

---

# Prompt 08 — Integrate creative intent, local edits, and durable working media

## Role

Act as a principal frontend/application architect, video workflow and media-lifecycle engineer,
domain engineer, product UX architect, accessibility engineer, and QA lead.

## Objective

Connect reusable creative intent and local video editing to the Prompt 07 Project session, and add
one narrow command that can adopt validated local renders or exact retained media as durable
working/presented state without replacing the immutable original or enabling provider work.

## Why this comes next

The session now owns hydration, autosave, conflicts, and exits. Creative controllers can integrate
through that stable port without also redesigning navigation, while a deliberate working-media
command closes the gap between temporary render preview and the exact durable input required by
later processing/output prompts.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompt 07 session, MVP definition, current creative and
   local-edit user stories, privacy/cleanup policy, and affected testing guidance.
2. Trace actual owners and handoffs for Character, Character Variant/Wardrobe, Outfit, immutable
   reference media, Saved Voice/local Voice settings, recipe/prompt, visual treatment, live
   mode/capture metadata, existing-video plan, `VideoEditSpec`, edit history/candidate, render
   preview, working/presented media, byte manifest, and object URLs.
3. Identify mutable resources whose stable ID is insufficient historically. Determine the minimal
   applied values/revision/fingerprint needed to explain a checkpoint without copying full records.
4. Characterize local render success/failure, exact Media Asset/Video Version reuse, response loss,
   CAS conflict, missing resource, cleanup, refresh, and Project switch.
5. Trace current provider-start gates, mutual exclusion, stale-result guards, and single media-stage
   ownership. No cost-bearing call is authorized in this prompt.

## Required work

1. Add explicit feature-local adapters that translate current creative controllers into typed
   semantic proposals consumed by the Prompt 07 session. Do not make those controllers persistence
   services or create a second Project session.
2. Persist meaningful checkpoints for creative selection, visual/Voice treatment, live metadata,
   local edit specification, working/presented reference, and workflow phase. Coalesce compatible
   changes; never append per keystroke, frame, slider tick, or undo-history entry.
3. Validate reusable resources owner-safely on hydration. A missing/tombstoned resource retains a
   historical label/explanation and allows reselection without failing the Project or revealing
   cross-owner existence.
4. Store stable resource IDs plus only the exact applied label, immutable child/reference ID,
   settings, prompt/treatment values, resource revision, or fingerprint needed for explanation and
   reproducibility. Characters, Variants, Outfits, Voices, recipes, prompts, and references remain
   independently owned workspace resources.
5. Persist the existing validated `VideoEditSpec` at semantic checkpoints. Keep undo/redo and
   transient render candidates in their current in-session owner rather than Project revisions.
6. Add one owner-derived, idempotent **Adopt Project Working Media** command for:
   - a validated local render whose bytes are durably stored, inspected, checksummed, and ready; or
   - an exact retained same-owner Media Asset/Saved Video Version already valid for reuse.
     The command appends a CAS-checked revision with normalized working/presented reference, extends
     the local journal/relational transaction boundary, never replaces source, and never infers an
     Add Version target or produced-by output relation.
7. Keep **Render preview** temporary until the user/action explicitly adopts ready working media.
   Failure, abandonment, and object-URL/byte cleanup stay with the creator and consult Project
   retention before deletion.
8. Preserve current selection/configuration, one active visual treatment, optional Voice sequence,
   compatibility/preflight rules, current non-Project workflows, advanced live flows, and exactly
   one mounted media stage.
9. Keep every Project provider-backed Start action gated with truthful explanatory UI until the
   processing-UX work in Prompt 10. Configuring creative intent must not submit work; Prompt 09
   establishes the service authority first.
10. Apply current-status semantics: a material intent/edit/working-media change not represented by
    the exact retained `lastSuccessfulOutput` clears that pointer and returns the Project to ready
    (or its current-attempt state). A completed render/operation alone is not Project `completed`.

## Architecture constraints

- Domain/contracts do not import React, browser APIs, persistence clients, or provider payloads.
- Web adapters map explicit Project snapshot values to existing feature-local controllers.
- Project references reusable records and media; it does not take over their bytes or lifecycle.
- Source remains the first immutable accepted original; working/presented media may advance.
- Used-by media references remain distinct from Project output produced-by provenance.
- No Project provider-backed request is available and no automatic paid request/fallback occurs.
- The single-stage/media/object-URL lifecycle remains authoritative.
- Refactor only at a proven adapter, ownership, or cleanup boundary.

## Data / migration requirements

- Evolve the video snapshot only if v1 cannot represent required exact applied values. Use an
  explicit supported version/read migration and never reinterpret old snapshots silently.
- Extend Prompt 03's local journal/receipt for working-media adoption and reuse Prompt 02's
  revision-granular media relations/retention policy in relational mode.
- Prefer compact applied snapshots/fingerprints over speculative generic resource tables.
- Existing creative libraries and records remain unchanged; no applied value or provenance is
  fabricated.
- Exact replay returns the original adopted revision; changed media/spec/revision under one key
  conflicts.

## UX requirements

- Opening a Project restores compatible Character/Variant, Outfit, Voice, treatment, edit spec,
  working media, and phase through existing controls.
- Missing reusable resources are explained with **Choose another** while source remains usable.
- **All changes saved**, temporary **Render preview**, and durable working-media readiness are
  visibly distinct.
- Explicit adoption shows saving/conflict/failure state and never implies a Saved Video/Version was
  created.
- Existing Original/Result, mutual-exclusion, preflight/consent, keyboard, focus, announcement,
  compact, safe-area, reduced-motion, and 200%-text behavior remains.

## Explicit non-goals

- Provider submission/reconnect/retry/result UI; those belong to Prompts 09–10.
- Saved Video/Video Version output save, history, Download, or Add Version target selection.
- New creative capabilities, provider/model changes, captions, overlays, cover, mixing, image
  workflows, media-neutral composition, or broad Studio decomposition.
- Generic Asset/library unification, tags, or Campaign planning.

## Testing

Add and run:

- snapshot mapping/parity and any explicit schema-version migration tests;
- hydrate/checkpoint tests for every integrated resource/treatment/edit/phase field;
- missing/deleted/wrong-owner resource and retained-reference tests;
- local/relational working-media adoption tests for local render, exact asset/Version reuse,
  readiness, source immutability, used-by provenance, replay/conflict, cleanup, and restart;
- session/controller tests for semantic coalescing, status-pointer clearing, switch/exit, and object
  URL ownership;
- proof of no provider contact and continued provider-start gating;
- targeted no-provider E2E for resource selection → local edit/render → adopt → refresh; and
- affected accessibility/visual cases, typechecks, and repository quality.

Use synthetic fixtures. Report real device/codec/live limits; do not call paid providers.

## Documentation

Update the Project workflow and affected Character/VTO/Voice/recipe/live/local-edit stories,
Architecture, persistence, privacy/cleanup, and testing docs to exact checkpoint and working-media
behavior. Do not claim processing recovery or Saved Video output yet.

## Acceptance criteria

- Creative/resource/local-edit state hydrates and checkpoints through one Project session without
  revision spam or duplicate lifecycle owners.
- Reusable resources remain independently owned; exact applied history remains explainable when a
  current resource is missing.
- A validated local render or exact retained media can become durable working/presented state
  idempotently without replacing source, inventing output provenance, or choosing Add Version.
- Material creative/working-media change clears obsolete completed-output state truthfully.
- Temporary render preview, saved Project state, and durable media readiness use distinct copy.
- Project provider starts remain gated and no paid/live request occurs.
- Focused persistence/controller/E2E/accessibility/typecheck/quality checks pass.

## Completion report

Report adapters and state integrated, applied-snapshot/working-media/ownership decisions, files
changed, migrations/local-format versions, tests run/results, tests not run and why,
device/codec/provider limits, compatibility risks, unresolved issues, and readiness for Prompt 09.

---

# Prompt 09 — Establish recoverable Project processing authority

## Role

Act as a principal distributed-workflow and media-lifecycle engineer, Bun/Elysia service engineer,
local/relational persistence engineer, security/cost-control engineer, and QA lead.

## Objective

Establish the server/persistence authority that links each operation to its exact Project Revision
before external submission, reconnects where provider identity is durable, handles ambiguity
without auto-resubmission, rejects stale promotion, and retains valid results before cleanup—while
Project provider buttons remain gated.

## Why this comes next

Creative intent is now Project-aware. Relational/shadow job services can already restore work once
a provider job ID is durable, but the browser/Project cannot rediscover that relation; local mode
stores traces without admission restore; and a crash after external acceptance but before the
provider ID is persisted is inherently ambiguous unless that provider proves idempotency. Build and
prove that authority first; Prompt 10 alone routes visible Project capability starts through it.

## Audit first

Before editing:

1. Read the repository guide, implemented Project/source/creative behavior, current provider and
   privacy docs, job service/contracts/repositories, temporary-file cleanup, delivery leases,
   cancellation/deadline/retry policy, status rules, and affected tests.
2. Trace every actual operation ID, idempotency key, accepted provider job ID, input/output asset,
   poll/retrieve path, runtime hook state, stale-result guard, server trace, and cleanup owner for
   Character Swap, VTO, Voice, and applicable live/recorded flows.
3. Confirm which jobs are recoverable in local, shadow, and authoritative modes and which providers
   support cancellation/retrieval after restart. Do not promise more than the adapter can prove.
4. Reproduce response-loss after acceptance, reload while accepted/processing/retrieving, newer
   Project revision before old completion, failure then explicit retry, and app restart.
5. Reuse current bounded polling/deadline/backoff behavior; do not assume SSE or a background worker
   is necessary.

## Required work

1. Create one application command for Project-bound submission that validates the current
   Project/version/revision, exact durable input, selected capability, and same-owner relations,
   then commits the app-owned `submitting` processing record, operation/idempotency identity, and
   Project job link to the initiating revision in one relational transaction or local-authority
   journal before the external call. Provider acceptance later fills the durable provider identity;
   it does not create the Project correlation for the first time.
2. Persist enough normalized provider-neutral job state to reconnect safely in every supported
   product mode. Raw provider payloads, prompts outside approved product intent, internal URLs,
   credentials, and arbitrary upstream errors never become public Project state.
3. On hydrate/reload, query the linked current attempt and resume bounded status/retrieval without
   submitting again once the provider job ID is durable. Automatic network retry may
   retrieve/status-check that operation; it must never create a new billable provider operation.
4. Treat a persisted `submitting` operation without a durable provider job ID as ambiguous. Never
   auto-resubmit it. Reconcile only where the provider proves idempotency or query-by-app-request
   key; otherwise expose safe needs-attention and an explicit, cost-aware user decision.
   For a synchronous/streaming capability such as current provider-backed Voice, retain and inspect
   the returned result before reporting success; if interruption makes acceptance unknowable, use
   the same ambiguous state, or keep that Project action gated until the adapter can meet this
   contract. Do not imply queued-job reconnection where no provider status identity exists.
5. Make status current-revision scoped. Record explicit processing phase, safe
   failure/needs-attention, and operation completion; keep historical attempts in paginated history
   without poisoning current work. Operation completion alone does not set Project `completed`.
6. Before promoting completion, compare the initiating Project revision/current expected operation.
   A valid stale success from an explicitly accepted paid operation is durably stored/inspected as
   a historical owner-bound job-output asset linked to its initiating revision before temporary
   cleanup, but it never changes current working/presented media or current revision. Prompt 10 may
   expose it for explicit later use. Invalid/failed results follow defined cleanup.
7. Durably store and inspect a successful current result as an owner-bound Media Asset before the
   Project calls it retained/resumable and before provider/server temporary cleanup. Append a
   `job-result` revision and normalized job-result asset relation through crash-safe idempotent
   orchestration. This is working media linked to its job, not a `project_outputs` producer link;
   only Prompt 11 creates a Saved Video/Video Version output.
8. Preserve explicit cancellation where supported. For accepted jobs that cannot be canceled, make
   leave/archive behavior truthful and reconnectable rather than pretending discard stopped cost.
9. Make retry an explicit new attempt with a new operation identity linked to the current revision.
   Never automatic fallback or automatic billable retry. An ambiguous submitting operation is not
   silently retried.
10. Add safe reconciliation for partially completed local metadata/byte retention and transactional
    relational metadata. Cleanup only after durable adoption or explicit abandonment policy.
11. Add strict owner-derived service/routes/contracts for submit, current-attempt status,
    reconciliation, explicit retry, and supported cancellation. Keep the Project UI gate in place;
    use service and deterministic fake-provider tests to prove the command before integration.

## Architecture constraints

- Processing Job belongs to one exact initiating Project Revision; a retry is a new attempt.
- Operation/idempotency identity is app-owned; provider job ID is an adapter detail, never owner
  authority.
- Provider selection remains configuration/capability level.
- Submission is explicit, bounded, owner-checked, rate/size/deadline constrained, and non-fallback.
- Only current expected work may advance current Project media; stale work cannot win a race.
- Successful durable result assets and Project references use existing storage/retention owners.
- Relational metadata is transactional; local mode uses durable journal/receipts and compensation.
- Shadow mode uses the local Project/Saved Video journal as authority and reconciles relational job
  traces or R2 writes as side effects; it never claims atomic commit across stores.
- Public errors are finite, safe, retry-classified, and non-enumerating.
- Project provider Start controls remain gated until Prompt 10; no parallel legacy submission path
  may bypass this authority once integration begins.

## Data / migration requirements

- Reuse the corrected Project job/output/asset relations and current processing-job schema where
  they match. Add only fields/indexes/receipts needed for exact operation, attempt, current-revision,
  and recovery semantics.
- Evolve local job/Project formats versionedly with restart and partial-write recovery.
- Apply the same local-authority journal semantics in shadow mode and test reconciliation of any
  configured relational trace or R2 side effect.
- Existing unlinked/historical jobs remain unassigned. Do not infer their Project/revision.
- Exact replay returns the original job after its provider ID is durable. Changed input,
  capability, revision, or intent under the same key conflicts. Ambiguous `submitting` never means
  “safe to submit again.”
- Result adoption records checksum/readiness before Project promotion and is safe to retry after a
  crash.
- Define cleanup for abandoned, failed, stale, adopted, archived, and tombstoned relations.

## UX requirements

No new Project processing UX. Preserve the truthful Prompt 08 gate. Public status/error contracts
must be finite and actionable for Prompt 10, including submitting, accepted/queued, processing,
retrieving, saving result, complete, needs attention, cancellation capability, and ambiguity.

## Explicit non-goals

- Global Processing Center, SSE/WebSocket status, distributed worker/orchestrator, offline provider
  queue, scheduled processing, or cross-user work.
- Automatic paid retry/fallback or provider replacement.
- Product analytics, usage ledger, credits, quotas, or billing.
- Project processing-button/status integration, global Processing Center, or UI redesign.
- Video Version/output save, history, and Download owned by Prompts 11–12.
- Public hosting, tenant RBAC, or broad rate-limit infrastructure.

## Testing

Add and run:

- domain/contract tests for current attempt/status, exact replay, retry, and stale adoption;
- service/repository/route tests for owner isolation, Origin, current revision, same input, response
  loss, accepted reconnect, failure, explicit retry, cancellation capability, and safe errors;
- local restart/journal/partial-adoption cleanup tests;
- real PostgreSQL transactional/concurrency tests for job link, archive race, result asset,
  `job-result` revision, and exact/mismatched replay;
- deterministic fake-provider tests for durable-ID reconnect, ambiguous submitting without
  resubmission, provider-idempotency reconciliation where supported, bounded polling, deadlines,
  no fallback, stale promotion rejection/historical retention, and cleanup;
- route/contract tests proving finite status/error/capability output suitable for Prompt 10; and
- affected typechecks plus repository quality.

Do not call live or paid providers. Keep manual/live smoke explicitly separate.

## Documentation

Update Architecture, persistence, privacy/temporary-data, cleanup, testing/manual/live-provider
guidance, and affected backend processing documentation to the exact authority/recovery semantics.
Keep current user stories clear that Project provider starts remain gated until Prompt 10; do not
claim global background processing or guarantees adapters cannot prove.

## Acceptance criteria

- Every new accepted job is linked to one exact owner Project Revision and app-owned operation.
- The app-owned processing record and Project link commit before provider submission; an external
  acceptance can therefore become ambiguous, but never Project-uncorrelated.
- Reload/restart reconnects work whose provider ID is durable without resubmission; ambiguous
  `submitting` never auto-resubmits and resolves only through proven provider support or explicit
  needs-attention policy.
- Status and needs-attention reflect the current revision/current attempt.
- A valid paid completion for an obsolete revision is retained as historical job-output media but
  cannot replace current Project media.
- A successful current result is stored, inspected, linked, and retained through a `job-result`
  revision before temporary cleanup and before being represented as resumable.
- Synchronous/streaming Voice or another capability without a durable provider job identity either
  retains its result before success with ambiguity-safe interruption handling or remains gated.
- Exact replay is idempotent; changed replay conflicts; retry is an explicit new attempt.
- Cancellation/archive/switch policy is exposed safely for Prompt 10 to present according to actual
  provider capability and cost state.
- Public errors remain safe and no raw provider/credential/internal detail is persisted/exposed.
- Project provider controls remain gated; no global processing infrastructure, automatic paid retry,
  or output-history UI was added.
- Focused service/route/fake-provider/restart/real-database/typecheck/quality checks pass.

## Completion report

Report operation/job/result authority, provider-cost/cancellation/ambiguity decisions, files
changed, migrations/local-format changes, tests run/results, tests not run and why, live-provider
limits, compatibility/cleanup risks, unresolved issues, and readiness for Prompt 10.

---

# Prompt 10 — Integrate recoverable processing into Project workflows

## Role

Act as a principal React/application workflow engineer, media-processing product engineer,
security/cost-control engineer, accessibility specialist, and QA lead.

## Objective

Route Project Character Swap, Virtual Try On, and only supportable Voice processing through Prompt
09's Project-bound authority, replace the temporary gate with truthful submit/reconnect/retry/result
UX, and prove no Project path can bypass durable correlation or auto-resubmit ambiguous work.

## Why this comes next

The operation/job/result authority is now crash-aware and tested without UI. Integrating existing
capability surfaces in a separate branch keeps browser media ownership, provider consent, status
presentation, and switch behavior reviewable without changing persistence semantics at the same
time.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompts 08–09, current Project/processing and capability
   stories, privacy/provider/cost policy, and affected testing guidance.
2. Trace every Character Swap, VTO, Voice, and applicable live/recorded Start control through
   preflight, consent, request, abort, polling/streaming, result publication, stale guard, retry,
   object URL, cleanup, and current Project gate.
3. Confirm which capability adapters meet Prompt 09 queued or synchronous/streaming recovery
   contracts. Keep an unsupported Project action gated rather than inventing provider guarantees.
4. Trace Project hydration/current-attempt query, switch/exit/archive behavior, media-stage result
   handoff, status announcements, and the existing non-Project workflows that must remain compatible.
5. Reproduce reload during each fake-provider state, response loss, ambiguous submit, stale success,
   safe failure, explicit retry, cancellation capability, and success retention.

## Required work

1. Route each supported Project Start control through the one Project-bound command using current
   Project/revision, exact durable input from Prompt 08, selected capability/intent, and a durable
   app-owned operation key. Remove/disable any parallel Project submission path that skips the
   pre-submit Project link.
2. Enable only capability adapters that satisfy Prompt 09. Queued providers reconnect through a
   durable provider identity. Synchronous/streaming Voice reports success only after the returned
   result is retained/inspected; ambiguous interruption becomes needs-attention, or Voice remains
   gated with truthful copy.
3. On Project hydrate/reopen, query the current attempt and resume bounded status/retrieval without
   creating another billable operation. Exact response-loss replay returns the same operation.
4. Present finite current-attempt states: submitting, accepted/queued, processing, retrieving,
   retaining result, result ready, needs attention, failed, and safely canceled only when supported.
   Processing-operation completion does not label the Project `completed`; output save in Prompt 11
   establishes that state.
5. Make retry an explicit new attempt and cost-bearing decision. Never automatic provider fallback,
   paid retry, or resubmission of ambiguous `submitting` state.
6. A valid current result becomes the durable working/presented media produced by Prompt 09's
   `job-result` revision before it is shown as resumable. A stale valid success never replaces the
   current stage; explain that it was retained in this Project and leave bounded historical access
   to Prompt 12.
7. Preserve supported cancellation. Project switch/archive copy distinguishes local/pre-accept
   abort from accepted remote work that may continue and reconnect; never claim discard stopped
   provider cost when it did not.
8. Preserve existing capability preflight, mutual exclusion, single media stage, object-URL/cleanup,
   provider consent, current non-Project flows, and advanced live behavior.
9. Keep processing UI in the open Project/current capability surfaces. Do not add a global
   Processing Center, event system, SSE/WebSocket layer, or background/distributed worker.

## Architecture constraints

- Project capability controls use one app-owned command; browser hooks do not become job authority.
- Provider identity remains adapter detail; Project/domain concepts remain capability-oriented.
- Only current expected work advances current media; stale results remain retained history.
- Existing media-stage and byte/object-URL lifecycle owners remain singular.
- No automatic billable retry/fallback, provider replacement, or unsupported cancellation claim.
- Public UI/errors never expose raw provider bodies, prompts, credentials, internal URLs, or codes.

## Data / migration requirements

None expected beyond Prompt 09. If integration exposes a contract/index defect, correct it narrowly
with compatible migration/format tests. Do not create a second job, receipt, or result authority.

## UX requirements

- Start remains explicit and shows provider/cost consent already required by the capability.
- Refresh/reopen reconnects the same accepted operation; the user is never asked to resubmit merely
  to see status.
- Ambiguity explains that status cannot be proven and another attempt may cost money.
- **Retry** is explicit; cancellation and archive/switch copy match actual capability.
- Stale success does not replace current media and is described as **Retained in this Project**, not
  as the current or saved Video Version.
- Status/progress/error/recovery controls meet current focus, live-region, keyboard, reduced-motion,
  compact, safe-area, and 200%-text patterns.

## Explicit non-goals

- Saved Video/Video Version output save, Add Version, history browser, or Download.
- Global Processing Center, SSE/WebSocket, distributed worker, scheduled/offline processing, usage
  ledger, analytics, quotas, or billing.
- New capability/provider, automatic fallback/retry, provider architecture rewrite, or live paid
  validation.
- Broad Studio/hook decomposition unrelated to the Project command boundary.

## Testing

Add and run:

- browser adapter/controller tests proving each supported Project Start uses the Project command and
  no legacy Project path bypasses it;
- deterministic fake-provider tests/E2E for queued reconnect, synchronous retained result,
  unsupported Voice gate, response loss, ambiguous submit, explicit retry, cancel capability,
  stale retained success, current result handoff, switch/archive, and refresh;
- existing non-Project capability regression tests, mutual exclusion, stale guards, media/object URL
  cleanup, and no automatic fallback/retry;
- status/copy/focus/live-region/responsive/visual tests; and
- affected package typechecks plus repository quality.

Do not call paid/live providers. Report adapter/device/live limits honestly.

## Documentation

Update Project and affected Character Swap/VTO/Voice/live stories, README, Architecture,
privacy/temporary-data, cleanup, testing/manual/live-provider guidance, and Product Roadmap to the
exact enabled/gated capability and recovery behavior. Do not claim output Version history yet.

## Acceptance criteria

- Every enabled Project capability starts through the pre-linked Prompt 09 operation; no parallel
  browser submission path exists.
- Reload/reopen reconnects durable-ID work without resubmission; ambiguous work never auto-retries.
- Synchronous/streaming capability success is retained first, or that capability remains gated.
- Current results become durable Project working media; stale valid results are retained but never
  promoted automatically.
- Retry/cancellation/switch/archive/status copy matches real cost and provider capability.
- Existing non-Project workflows, single media stage, mutual exclusion, and cleanup remain intact.
- No output Version/history/global-processing infrastructure was added.
- Focused fake-provider browser/E2E/accessibility/typecheck/quality checks pass.

## Completion report

Report enabled/gated capabilities, browser-to-command integration, recovery/ambiguity/result UX,
files changed, migrations if any, tests run/results, tests not run and why, live/provider/device
limits, compatibility/cleanup risks, unresolved issues, and readiness for Prompt 11.

---

# Prompt 11 — Save an exact Project output atomically

## Role

Act as a principal media/versioning architect, transaction and local-recovery engineer, Bun/Elysia
API engineer, React product engineer, UX writer, accessibility engineer, and QA lead.

## Objective

Let the user save the current ready Project media as a new Saved Video or append an immutable Video
Version, link that exact Version to its producing Project Revision through crash-safe idempotent
orchestration, and reconcile response loss without duplicating or partially advancing either
aggregate.

## Why this comes next

Project intent, source, creative choices, and provider results are now durable. Saved Video
repositories already persist idempotency receipts, but the mounted client owns operation-key
continuity and no composite receipt/transaction coordinates Saved Video/Version metadata, Project
output provenance, and the post-save Project revision. Fix that save boundary before adding
history/delivery UI.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompts 02–10, MVP definition, Project/Saved Video ADRs,
   Saved Video domain/contracts/services/repositories/routes, direct upload, content streaming,
   gallery UI, save hook/idempotency, deletion/retention, download behavior, and affected tests/docs.
2. Trace new-video save, append-Version CAS, current-version pointer, source lineage, thumbnail
   generation, byte commit/cleanup, local repository atomicity, relational transaction boundaries,
   Project output unit-of-work seam, and the exact `lastSuccessfulOutput` rules.
3. Reproduce response loss after bytes commit, after Saved Video metadata commit, after Project link,
   and after Project revision advance in both local and relational modes.
4. Confirm existing durable Saved Video receipts in local and relational authorities and determine
   whether they can be extended safely for the composite operation rather than duplicated.

## Required work

1. Define one owner-derived **Save Project Output** application command with a durable operation ID.
   It accepts the current expected Project/revision, exact ready working/presented media, save intent
   (new Saved Video or append to one exact same-owner active Saved Video with CAS), validated title
   where needed, and current output metadata. The Add Version target is a separate explicit choice;
   it is never inferred from a Saved Video Version reused as Project source.
2. In relational mode, use one shared metadata transaction/unit of work for Saved Video/Video
   Version metadata, Project output relation, `lastSuccessfulOutput`/presented-media revision, status,
   and Project CAS. The output relation identifies the expected pre-save revision whose ready media
   and intent produced the Version; the atomically appended post-save revision references that
   output without rewriting provenance. Stage/verify bytes outside the metadata transaction through
   existing lifecycle ownership and compensate safely on conflict/failure.
   That post-save current revision is `completed` only because its validated
   `lastSuccessfulOutput` names the exact retained output it represents; Prompt 08's rule clears the
   pointer/status on a later unrepresented material edit.
3. In local mode, provide equivalent crash recovery with a versioned operation receipt/journal,
   deterministic operation identity, ordered atomic file commits, reconciliation, and idempotent
   compensation. A restart must converge to one exact Version and one Project output or a safe
   retryable precommit state.
   Shadow mode follows this local authoritative journal and reconciles configured relational traces
   or R2 byte effects; do not describe those independent stores as one atomic transaction.
4. Exact replay returns the original Saved Video/Version/Project result. Reusing the operation ID
   with different Project revision, bytes, save target, or metadata conflicts and changes nothing.
5. Preserve Saved Video and Video Version semantics:
   - Saved Video is the logical named library record;
   - Video Version is immutable playable media;
   - Project output links one exact producing Project Revision to one exact Version; and
   - Project Revision remains creative state, not the media version itself.
6. Add the minimal review/save UI for **Save as New Video** and, only after separate explicit target
   selection/confirmation, **Add Version**. Reuse the durable operation ID across retry/reload and
   reconcile to the one committed result.
7. Ensure Saved Video removal, Project archive/tombstone, and byte cleanup honor retained output and
   media references. Removing a Saved Video from the global library hides/tombstones it but retains
   exact Version bytes and enables owner-checked Project-scoped content access while a Project link
   remains; confirmation explains that Project history is preserved.

## Architecture constraints

- Project Revision, Saved Video, Video Version, output relation, and download remain distinct.
- Saved Videos remain a reusable/global owner library, not editable Project authority.
- One exact Video Version is immutable; appending never overwrites prior bytes.
- All save/link/version operations are owner-scoped, current-revision/CAS checked, and idempotent
  across restart/response loss.
- External byte storage cannot participate in a database transaction; use staged readiness and
  compensation, never distributed-transaction fiction.
- No raw storage keys, provider details, owner IDs supplied by browser, or unsafe errors.
- Keep current local/relational Saved Video and byte-storage owners.

## Data / migration requirements

- Reuse Prompt 02 normalized output/media references and unit-of-work seam. Add schema only when the
  implemented transaction/replay contract requires it.
- Reuse or extend existing durable Saved Video receipts for the composite operation where safe;
  otherwise add one Project-output operation receipt with a single unambiguous owner. Do not keep
  competing receipts that can disagree.
- Preserve existing Version IDs, ordinals, current pointers, source lineage, thumbnails, and
  tombstone behavior.
- Do not bulk-create output links. Unlinked content remains unchanged for Prompt 12.
- Never run a production migration automatically.

## UX requirements

- The review surface makes current media and original comparison clear before saving output.
- Save offers **Save as New Video** and, only for an explicit loaded target, **Add Version** with
  target title/current revision confirmation.
- Response loss/reload reconciles to the one committed result and does not ask for a blind duplicate
  save.
- **All changes saved**, **Render preview**, **Save as New Video**, and **Add Version** remain
  distinct in touched flows.
- Dialogs, focus, announcements, progress, compact/mobile, safe-area, 200% text, and reduced-motion
  behavior follow existing accessible patterns.

## Explicit non-goals

- Generic Version/Asset platform, Project Deliverables, purposeful Variation entity, A/B comparison,
  restore/rollback editing, branching, comments, approvals, or publishing.
- Cover designer, expanded presets, bundles, social/channel metadata, watermarking, or durable Export
  history.
- Automatic backfill/assignment or migration of legacy Saved Videos.
- Project history, Unassigned Content UI, exact historical-Version browsing/reuse, or Download
  changes owned by Prompt 12.
- Global Processing Center, usage ledger, billing, analytics, or public sharing.

## Testing

Add and run:

- domain/contract tests for producing-revision versus post-save-reference semantics;
- local journal/receipt tests covering crash/response loss at each save stage, exact/mismatched
  replay, append CAS, compensation, and restart convergence;
- real PostgreSQL transactional/concurrency tests for new Saved Video and append Version paths,
  Project CAS, output relation, current pointer, and cleanup retention;
- route/service tests for auth, Origin, owner isolation, explicit append target, safe
  not-found/conflict, lifecycle retention, and idempotency;
- browser tests for save language, separate source/append target, response reconciliation, and
  removal copy for Project-retained Versions;
- targeted no-provider E2E for Project → Save as New Video → Add Version → response-loss refresh,
  plus relevant accessibility/responsive visuals; and
- affected package typechecks and repository quality.

Use synthetic media fixtures. Do not call paid/live providers or claim physical-device/codec checks
passed when not run.

## Documentation

Update Project and Saved Video user stories, README, Architecture, Cloud Persistence,
privacy/cleanup, testing/manual QA, terminology, and Product Roadmap to the exact composite-save and
Project-retained removal behavior. Do not claim history/Download UI until Prompt 12.

## Acceptance criteria

- One explicit operation saves exactly one new/append Video Version and links it to one producing
  Project Revision.
- Relational metadata commits atomically; local metadata recovers/reconciles equivalently across
  restart and response loss.
- Exact replay returns the original result; changed replay conflicts without duplicates or partial
  Project advancement.
- Originals and all prior Video Versions remain intact.
- Producing revision provenance remains distinct from the post-save revision's output pointer.
- The post-save revision is completed through its exact retained output pointer; a later
  unrepresented material change returns status to ready/current-attempt state.
- Reusing a Version as source never infers the Add Version target.
- Removing a Saved Video from the global library retains Project-scoped exact Version availability
  and explains that behavior.
- **All changes saved**, **Render preview**, **Save as New Video**, and **Add Version** are distinct.
- Cleanup and lifecycle operations retain referenced bytes and never cascade unexpectedly.
- No Variation, Export aggregate, comparison/restore, publishing, or generic Asset platform was
  added.
- Focused tests, crash/replay tests, real database checks, save E2E, visuals, typechecks, and quality
  pass.

## Completion report

Report behavior, transaction/journal and byte-compensation decisions, Version/output semantics,
files changed, migrations/local-format versions, tests run/results, tests not run and why,
codec/storage/manual/live limits, legacy compatibility, unresolved risks, and whether the
output transaction is ready for Prompt 12.

---

# Prompt 12 — Review history, exact Versions, and Download

## Role

Act as a senior media-library product engineer, Bun/Elysia API engineer, React UX engineer,
accessibility specialist, information architect, and QA lead.

## Objective

Expose bounded Project activity/output history, exact Video Version preview/reuse/Download,
Project-retained Versions removed from the global library, and legacy Unassigned Content without
mutating current pointers or fabricating provenance.

## Why this comes next

Prompt 11 makes output creation and linking crash-safe. Users can now be shown prior work without
racing partial metadata or conflating Project Revision with Video Version. Separating this read/UI
slice keeps the transaction branch reviewable and makes Download the final delivery action rather
than a new Export aggregate.

## Audit first

Before editing:

1. Read the repository guide, implemented Prompts 02–11, MVP definition, Project/Saved Video user
   stories, bounded Project history contracts, Saved Video detail/version/content routes, gallery
   UI, Project-retained tombstone policy, and relevant testing/visual guidance.
2. Trace producing revision, post-save reference revision, processing attempts, retained stale job
   outputs, Saved Video current pointer, exact Version metadata/content, source reuse, library
   tombstone, Project-scoped content authorization, and Download.
3. Inspect existing pagination, media preview, range/HEAD, object-URL, focus, and gallery action
   owners. Do not add another player/media owner.
4. Define Unassigned Content from normalized provenance: a legacy Saved Video with no Project output
   relation remains unassigned. Merely reusing a Version as source records used-by lineage and does
   not fabricate produced-by assignment.

## Required work

1. Add/finish bounded cursor-paginated Project activity/output queries that distinguish Project
   Revisions, processing attempts, retained historical job results, and Saved Video Versions. Never
   return full snapshot history or bytes in list responses.
2. Present output provenance truthfully: show the producing revision/operation and, where useful,
   the later revision that made the output current without treating them as one event.
3. Add owner-checked exact-Version metadata and controlled Project-scoped content access, including
   a Version whose Saved Video was removed from the global library but remains retained by the
   Project. Wrong-owner and missing relations remain non-enumerating.
4. Add Project output/history UI and the minimum Saved Videos Version UI needed to select a specific
   Version, see current marker/ordinal/origin/timestamp/status, and preview it through the existing
   media owner.
5. Allow **Use in Project** from one exact Version through Prompt 06's source command or Prompt 08's
   working-media adoption command, as explicitly chosen, plus **Download** of one exact ready
   Version. Viewing, using, or downloading an old Version never changes the Saved Video current
   pointer and never preselects Add Version target.
6. Surface legacy Saved Videos with no Project output provenance as **Unassigned Content**. Keep
   them fully usable; explicit source reuse creates truthful used-by lineage from that point, not a
   historical producer relation.
7. Expose retained valid stale job results in bounded Project history with an explicit safe action
   to use one as working media if current lifecycle/validation permits. Never promote it
   automatically.
8. Keep Download as the user-facing delivery action and Export as broader product taxonomy only.
   Do not create a durable Export record. If changed settings create new bytes, Prompt 11's output
   save must create a Version before Download.
9. Ensure Project/Saved Video removal copy explains global-library hiding versus Project-history
   retention and never claims physical erasure while retained relationships exist.

## Architecture constraints

- Project Revision, processing attempt/result, Saved Video, Video Version, Project output, and
  Download remain distinct.
- Read models are bounded/cursor-paginated and map explicitly; no eager full aggregate or media
  bytes in list payloads.
- Exact-Version content uses existing byte/range/lease/object-URL owners.
- Project-scoped access to a globally hidden Saved Video requires an exact same-owner retained
  relation; a bare Version ID is insufficient.
- Source used-by lineage never becomes output produced-by lineage.
- Viewing/reuse/Download is read-only with respect to Saved Video current pointer.
- No generic Asset/Version/Variation/Export abstraction is introduced.

## Data / migration requirements

- Prefer indexes/read models over new ownership tables; reuse normalized Project references and
  outputs.
- Add only owner-constrained pagination/query indexes proven necessary and inspect any migration.
- Existing Saved Videos/Versions remain unchanged. Do not create Project output links for legacy
  data.
- Unassigned is a query/projection, not a row, status mutation, fake Campaign, or fake Project.
- Retained stale results keep their initiating revision and never receive invented output lineage.

## UX requirements

- History clearly separates “Project change,” “Processing attempt/result,” and “Saved video
  Version.”
- Exact Version selection shows current/non-current status and never changes current merely by
  viewing.
- Actions use **Use in Project** and **Download**; saving actions remain **Save as New Video** and
  **Add Version** elsewhere.
- Unassigned Content explains that no trustworthy producing Project is known, without presenting an
  error or forcing assignment.
- A Saved Video removed from the global library remains reachable only from its retaining Project,
  with clear removal/retention copy.
- Loading, empty, pagination, stale/missing media, safe errors, focus, announcements, compact/short,
  safe-area, reduced-motion, and 200%-text states follow existing patterns.

## Explicit non-goals

- A/B comparison, restore/rollback, branching, purposeful Variations, Deliverables, generic Asset
  history, comments, approvals, publishing, or sharing.
- Cover/export preset generation, bundles, social/channel metadata, or durable Export history.
- Automatic backfill/assignment, current-pointer mutation on view/use/download, or physical purge.
- Campaign planning, global Processing Center, tags/folders/bulk actions, analytics, or billing.

## Testing

Add and run:

- contract/service/route tests for bounded cursors, provenance roles, exact Version, Project-scoped
  tombstoned access, non-enumeration, stale-result history, and Unassigned projection;
- browser controller/component tests for history categories, pagination, exact Version selection,
  current marker, preview, Use in Project, no append-target inference, Download, hidden-library
  retention, and safe missing states;
- range/HEAD/delivery-lease and object-URL lifecycle tests for exact historical Version content;
- targeted no-provider E2E for save two Versions → refresh → select old Version → Download/use,
  legacy Unassigned Content, and remove-from-library-but-retain-in-Project behavior;
- relevant accessibility/responsive/visual cases; and
- affected package typechecks plus repository quality.

Use synthetic media. Report real codec/device/storage limits; do not call paid/live providers.

## Documentation

Update Project history and Saved Video user stories, README, Architecture, Cloud Persistence,
privacy/cleanup, testing/manual QA, Product Roadmap, and terminology to exact history,
Project-retained removal, Unassigned Content, and Download behavior. Keep Export/Variation/restore
and publishing deferred.

## Acceptance criteria

- Project history is bounded and distinguishes revisions, processing, historical results, and
  output Versions.
- Producing revision and later output-reference revision are not conflated.
- An exact old Version can be previewed, used, and downloaded without changing current pointer or
  inferring an Add Version target.
- A globally hidden/tombstoned Saved Video Version remains accessible only through an exact
  same-owner retaining Project relation.
- Legacy Saved Videos remain usable as Unassigned Content; no producer lineage is fabricated.
- Valid stale paid results are discoverable and can be explicitly used without automatic
  promotion.
- Download is the only new delivery action; no Export/Variation/restore system was added.
- Focused API/web/content tests, synthetic E2E, visuals, typechecks, and quality pass.

## Completion report

Report read/provenance decisions, user behavior, Project-scoped retention access, files changed,
migrations if any, tests run/results, tests not run and why, codec/device/storage/manual limits,
legacy compatibility, unresolved risks, and whether the Product-experience checkpoint is satisfied.

---

# Prompt 13 — Complete the MVP workspace and acceptance

## Role

Act as a principal product engineer, UX/information architect, accessibility specialist, security
reviewer, QA/release lead, and documentation owner.

## Objective

Finish and validate the coherent local MVP experience across Campaigns, Projects, the open Project
Studio, reusable libraries, Saved Videos, exact Versions, and download; correct only integration
gaps found by end-to-end evidence; and make canonical documentation match the shipped boundary.

## Why this comes next

All core vertical capabilities now exist. This final prompt proves they form one understandable,
accessible, restart-safe product and resolves integration defects without becoming a catch-all
feature, refactor, public-infrastructure, or launch program.

## Audit first

Before editing:

1. Re-read the repository guide, all implemented Prompt 02–12 completion reports, MVP definition,
   README, Product Vision/Roadmap, Architecture, user stories, privacy/persistence/testing/manual QA,
   browser support, visual policy, accepted ADRs, and deferred account/infrastructure roadmap.
2. Walk the product from clean supported local state and configured relational test state:
   Login → Campaign/standalone Project → durable source → creative choice/local edit → processing
   recovery → Save as New Video/Add Version → history → exact-Version Download →
   leave/resume/archive.
3. Audit navigation/deep links/current identity, loading/empty/error/conflict/processing/save states,
   back/exit/logout/project-switch guards, focus, keyboard, announcements, reduced motion, compact
   layouts, 200% text, media/object URL cleanup, and legacy Unassigned Content.
4. Audit new routes/services for authentication, trusted Origin, owner isolation, safe errors,
   strict schemas, bounded queries, idempotency, CAS, retention, and provider-cost behavior.
5. Inspect migrations/local formats from all prompts against a realistic pre-MVP fixture. Never
   infer lineage or run production migration.
6. Use failures to make only the smallest integration corrections. Do not open unrelated cleanup.

## Required work

1. Make primary authenticated navigation coherent among Campaigns, Projects, the active Project
   Studio, Saved Videos, Characters, Outfits, and contextually available Voices/Wardrobe/Recipe
   tools. Show current Campaign/Project identity and safe route return points.
2. Ensure Quick Start remains fast from Projects and Campaign detail, and first-run/empty states
   explain Campaign optionality, Project purpose, durable source, Versions, reusable resources, and
   download in plain product language.
3. Normalize touched save/status terminology and accessible presentation across all surfaces:
   Saving changes/All changes saved/conflict; processing; Save as New Video/Add Version;
   Unassigned Content; and exact Download.
4. Replace native prompt/confirm only on MVP paths where it prevents consistent accessibility or
   safe async error handling. Use the existing shared overlay/dialog system. Defer unrelated broad
   replacement.
5. Resolve integration errors, unhandled promises, focus loss, stale query state, duplicate media
   ownership, exit/switch bypass, or cleanup leaks observed on the canonical path. Refactor only at
   proven lifecycle/ownership boundaries.
6. Add/complete compatibility fixtures and migration checks from the pre-Prompt-02 state through
   current schema/local formats. Prove legacy Saved Videos/resources remain usable and unassigned.
7. Add one deterministic no-paid-provider end-to-end MVP suite plus focused failure journeys for
   CAS conflict, response-loss replay, refresh during accepted synthetic processing, missing
   resource, cleanup retention, Campaign archive, Project switch, and exact old-Version download.
8. Add only the relevant visual/responsive/accessibility matrix. Reuse existing viewport and
   platform-baseline policy rather than snapshotting every screen.
9. Perform the repository release validation appropriate to this high-risk cross-package candidate.
   Keep physical device, real camera/microphone, assistive technology, real codec/memory behavior,
   R2/Neon environment, and live paid providers as explicitly reported manual/authorized gates.
10. Reconcile canonical docs with implementation and move superseded plan details to history only
    where repository policy supports it. Keep this sequence as the implementation record; mark
    prompt completion statuses accurately rather than deleting audit rationale.

## Architecture constraints

- No new product aggregate or provider is introduced in hardening.
- Preserve local-first, loopback-only, seeded single-operator scope.
- Preserve owner-derived authorization, app-owned contracts/errors, explicit bounded provider work,
  Project/Version distinction, optional Campaigns, non-cascading lifecycle, and Project-aware
  retention.
- Keep browser caches untrusted, server/repository authority explicit, queries bounded, and media
  ownership singular.
- Do not broaden supported devices/codecs/providers without required evidence.
- Do not treat a clean happy-path demo as sufficient; failure, restart, replay, cleanup, and legacy
  compatibility are MVP behavior.

## Data / migration requirements

- Do not add a migration unless a specific acceptance defect requires it.
- Test forward migration from the repository state immediately after historical Prompt 01 through
  all MVP migrations, including valid existing Project rows and legacy Saved Videos/resources.
- Test local format upgrades, interrupted writes, restart recovery, and idempotent re-open.
- No fabricated Campaign/Project/output lineage, no destructive production action, and no cascade.
- Record rollback/compatibility limits and required operator steps in canonical persistence docs.

## UX requirements

- The user can always answer: current Campaign if any, current Project, source/current media,
  Project save state, processing state, available prior Versions, reusable-resource location, and
  how to download the finished Version.
- Campaign remains optional and Project creation stays low-friction.
- Navigation never silently discards, double-submits, or revokes retained work.
- All canonical-path dialogs and asynchronous actions expose accessible name, focus behavior,
  announced status/error, disabled/busy state, and safe recovery.
- Target desktop/compact/short/safe-area/200%-text layouts remain usable without obscuring dominant
  recording/cancel/save actions.
- Copy does not claim cloud sync, collaboration, publishing, generic assets, physical erasure,
  provider cancellation, or cross-device recovery beyond actual behavior.

## Explicit non-goals

- New creator tools, Campaign planning fields, variations, Deliverables, generic Assets, image
  workflows, publishing, analytics, collaboration, billing, signup, or public hosting.
- Global Processing Center, SSE, background/distributed worker, usage ledger, product analytics, or
  broad production observability project.
- Broad Studio rewrite, global state replacement, design-system rewrite, native-dialog sweep,
  runtime façade removal, dependency modernization, or unrelated CI hardening.
- Unapproved paid/live provider calls or production database/storage migration.

## Testing

Run and report:

- all affected focused unit, domain, contract, service, repository, route, web controller/component,
  and migration/local-format tests;
- real PostgreSQL integration and database schema/migration checks;
- deterministic no-paid-provider E2E for the canonical journey and listed failure journeys;
- curated visual regression cases at canonical viewports/platform baselines;
- automated accessibility checks plus documented keyboard/focus/200%-text review;
- affected package typechecks, builds, dependency/security checks, and `bun run quality`;
- the release-candidate process from README and Testing that is safe in the local environment.

Do not call live providers or claim skipped environment-dependent checks passed. List physical
device, assistive technology, real camera/mic, codec, memory, live Neon/R2, and provider smoke items
still requiring authorized manual evidence.

## Documentation

Update canonical README, documentation map, Product Vision, Product Roadmap, Architecture, Cloud
Persistence, privacy/temporary data, current user stories/index, Testing, Manual QA, browser support,
visual coverage, and accepted ADRs to implemented truth. Mark the MVP audit/definition and this
sequence with accurate completion/evidence status. Keep the deferred account/infrastructure roadmap
and post-MVP categories separate.

## Acceptance criteria

- Every objective criterion in `docs/MVP_DEFINITION.md` is either demonstrated or the MVP is not
  marked complete.
- Campaign → Project → durable source → existing creative tools → recoverable processing → exact
  Video Version → Download works without paid/live providers in supported test modes.
- Refresh/restart, response loss, CAS conflict, stale completion, missing resource, switch/exit,
  archive, cleanup retention, and legacy Unassigned Content behave safely.
- Navigation, copy, loading/error/status, focus, keyboard, responsive, and selected visual cases are
  coherent on the full journey.
- All affected ownership/schema/idempotency/retention boundaries have negative coverage.
- Pre-MVP relational and local data upgrade without fabricated lineage or destructive cascade.
- Required automated release checks pass; every skipped/manual/live limit is named honestly.
- Canonical docs describe current behavior separately from post-MVP direction.
- No deferred feature, broad refactor, public infrastructure, or provider expansion entered scope.

## Completion report

Report the final behavior and user journey, architecture decisions/corrections, files changed,
migrations and compatibility evidence, automated tests and exact results, tests not run and why,
manual/live/device/provider/storage limits, unresolved risks, each MVP criterion outcome, and a clear
go/no-go conclusion for the local Campaign/Project MVP. Do not claim public-service readiness.

---

## Work intentionally left after this sequence

The following remains visible in [Product Roadmap](../PRODUCT_ROADMAP.md), not silently discarded:

- creator enhancements such as captions, overlays, cover frames, mixing, richer presets, and new
  media formats;
- rich Campaign planning, variations, brand intelligence, publishing, and integrations;
- organization enhancements such as tags, folders, bulk operations, comparison/restore, and a
  global Processing Center;
- collaboration, organizations, roles, sharing, comments, and approvals;
- commercial accounts, billing, usage/credit/quotas, and public-service readiness; and
- unrelated broad refactors, runtime cleanup, observability/product analytics, and infrastructure
  hardening without a current product consumer.
