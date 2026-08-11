# 0002: Durable Project aggregate

- Status: Accepted
- Date: 2026-08-11

## Context

Saved Videos represent durable outputs and immutable output versions, but they do not preserve the
creative work-in-progress that produced them. Browser controller state, object URLs, temporary
Blobs, and IndexedDB metadata are not sufficient authority for a resumable video workspace.

The product needs an owner-scoped aggregate that can retain creative intent, immutable history,
durable source identity, job lineage, and multiple independently playable outputs without turning
a Saved Video into the workspace itself. Existing videos and jobs must remain valid, and this
foundation must not add Project routes, Project UI, public tenancy, or automatic provider work.

## Decision

- The user-facing product name remains **Lightframe Studio**. The GitHub repository remains
  `anthonyshadow/LightHouseStudio`; this decision does not rename it.
- A `Project` is the durable workspace aggregate for one focused production effort. It owns a
  title, materialized/validated status, aggregate CAS version, current revision identity, lifecycle
  timestamps, and immutable owner. It is not a Campaign: no Campaign domain, relationship, route,
  or UI is introduced by this decision.
- Every Project begins with revision 1, including an empty named Project. Project revisions are
  immutable, monotonically numbered snapshots with an explicit parent, author/source metadata,
  and a schema version. The Project points to a revision belonging to that same owner and Project.
- Snapshot V1 is a strict allowlist of creative intent: durable source and working/presented media
  references, selected Character/Variant, Outfit and Voice treatment, one mutually exclusive
  Character Swap or Virtual Try-On choice, optional relevant live-mode metadata, prompt/recipe
  references and authored intent, local edit/export specifications, last successful output,
  workflow phase, and timestamps. It stores no media bytes, object URLs, provider credentials,
  provider bodies, internal storage locations, or React/component state.
- Normalized `project_assets`, `project_jobs`, and `project_outputs` relationships preserve
  queryable lifecycle and lineage. A Project may have any number of Saved Video outputs; one
  snapshot still represents one active working context. Existing Saved Videos and jobs remain
  unassigned because no reliable Project lineage exists, and no backfill runs in this change.
- Owner is repeated only on relationship rows needed for composite foreign keys. Those constraints
  require the Project, revision, media asset, processing job, Saved Video, and output version to
  have the same owner. Restrictive foreign keys prevent physical parent deletion while protected
  relationships remain.
- The persisted Project `version` is the aggregate CAS token for every mutation. Revision append
  also requires the expected current revision number, locks the Project row, verifies the linear
  parent, validates all directly referenced media as same-owner `ready` assets, inserts the
  immutable revision/links, and advances the current pointer in one transaction. A stale writer
  receives a typed Project-version or revision conflict; it never overwrites.
- Status is not arbitrary UI text. Active status is derived from durable source availability,
  active/failed jobs, and successful outputs. `archived` and `deleted` are lifecycle overrides.
  A Project is resumable only while its referenced source asset is durably `ready`.
- Normal deletion archives first. The separately confirmed permanent-delete rule writes a deleted
  tombstone; it does not physically delete Project rows, revisions, links, media, jobs, or Saved
  Videos. Physical retention/erasure remains a separately reviewed lifecycle operation.
- An asynchronous job link records the revision that initiated the work. A later stale result may
  remain attributable to that revision, but future orchestration must not promote it into the
  current snapshot unless the Project/revision CAS still matches. Initial paid submission remains
  explicit and is never automatically repeated.
- The Drizzle Project repository is composed only in authoritative `postgres`/`neon` persistence.
  There are deliberately no Project HTTP routes or browser UI in this decision.

## Consequences

Projects can represent a resumable creative session and retain many output videos without relying
on mounted React state. Existing Saved Video and processing-job contracts remain unchanged. The
schema migration is additive: it creates Project tables/enums and owner-consistency constraints but
does not modify, assign, or delete existing records.

Snapshot evolution now requires explicit version parsing and migration. Project mutations must use
the repository transaction/CAS boundary, and media cleanup must treat Project links as retained
relationships. Rolling application code back can leave the additive tables unused; dropping them
after Project writes would be destructive and requires a separate reviewed migration and backup
plan.

The one-active-context model does not yet support several independently resumable works-in-progress
inside one Project. The deferred [Project Deliverable child model](../PROJECT_DELIVERABLE_MODEL.md)
defines that possible extension without making it current behavior.

A future Campaign may group Projects through a separately designed, owner-constrained
relationship. That addition must define standalone Project behavior and archive, detach, delete,
and retention semantics instead of repurposing the Project aggregate as campaign metadata.

## Alternatives considered

- Making each Saved Video the Project was rejected because an output cannot represent unfinished
  choices, job state, or multiple deliverables and versions safely.
- Persisting React/controller state or browser object URLs was rejected because those values are
  implementation-specific, untrusted, and not durable across reload or devices.
- Storing every relationship inside snapshot JSON was rejected because ownership, traversal,
  deletion safety, and lifecycle checks require relational constraints and indexes.
- Automatically importing existing Saved Videos as read-only Projects was rejected because their
  source/edit lineage is incomplete and fabricating it would misrepresent resume capability.
- Hard deletion with cascading children was rejected because it could erase lineage or media still
  required by retained outputs.
