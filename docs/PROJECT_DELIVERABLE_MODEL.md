# Deferred Project Video child model

**Status:** design note for later; not implemented  
**Created:** 2026-08-11
**Decisions updated:** 2026-08-14

## Purpose

The current Project foundation allows one Project to retain many Saved Video outputs. It
intentionally gives each Project one active creative snapshot at a time. That is enough for a
focused Project such as **Summer Launch Video Set** to retain and independently play a 30-second
launch video, a 15-second social cut, and a vertical teaser after those outputs have been saved.
That Project can belong to a separate **Summer Product Launch** Campaign through the implemented
optional, non-cascading Campaign membership.

A user-facing Project **Video**—represented internally by a `Project Deliverable`—becomes useful
when all three videos must also remain independently editable and resumable at the same time. For
example, each may need its own source, edit history, selected Character/Outfit/Voice, active job,
export target, and last-opened phase.

**Videos** is the approved future UI name because it matches the current product medium and is
clearer to creators than the production term “Deliverables.” `Project Deliverable` remains the
proposed internal contract and schema term because it leaves room for an exact output purpose and
delivery specification without weakening the current video-specific lifecycle. This naming
decision does not authorize implementation or a schema migration.

This document preserves that future direction. It does not authorize schema, API, UI, migration,
provider, or background-work changes today.

**What shipped instead (2026-08-21).** **Make another version** derives a _new Project_ from an
existing one by reference — same source, same creative setup, no bytes copied — so a second cut of
the same material is an ordinary Project with its own revisions, jobs and outputs. That covers the
"independently editable and resumable at the same time" need without a child aggregate, at the cost
of the grouping this document proposes: the copies are siblings in a list, not Videos inside one
Project. Revisit this design only if that grouping proves necessary.

## Proposed model

```text
Campaign: Summer Product Launch (implemented optional organizer)
└── Project: Summer Launch Video Set
    ├── Video: 30-second launch video (internal Project Deliverable)
    │   ├── immutable deliverable revisions
    │   ├── source/working assets and processing jobs
    │   └── one or more Saved Video output versions
    ├── Video: 15-second social cut (internal Project Deliverable)
    │   └── independent revision, resume, job, and output state
    └── Video: Vertical teaser (internal Project Deliverable)
        └── independent revision, resume, job, and output state
```

The Project remains the project-level aggregate root for name, archive/delete policy, ordering, and
the list of deliverables. The implemented Campaign relationship groups Projects separately and does
not take ownership of Project processing state. Each future Deliverable becomes a child aggregate
with its own:

- immutable owner inherited from and constrained to the parent Project;
- title, position, derived status, aggregate version, current revision, and timestamps;
- one active source/working context and strict versioned creative snapshot;
- normalized asset, processing-job, and Saved Video/output relationships; and
- archive/tombstone lifecycle when independent child removal is needed.

Suggested normalized tables are `project_deliverables`, `project_deliverable_revisions`,
`project_deliverable_assets`, `project_deliverable_jobs`, and `project_deliverable_outputs`. Exact
names should follow the schema conventions in force when implementation begins.

## Rules to preserve

- A Project may intentionally remain collection-only with zero Videos. Empty Projects are valid,
  not incomplete records that require automatic child creation.
- A Saved Video is still an output/version, not editable working state.
- One exact Saved Video Version may be referenced by several Projects or future Project Videos.
  Each relationship preserves its own role and provenance; reuse does not copy bytes or imply that
  every referencing workflow produced the Version.
- Each Deliverable has one active snapshot, but a Project may have several active Deliverables.
- Editing or processing one Deliverable must not change the snapshot, status, playback, or CAS token
  of another.
- Project status is a summary derived from child status plus Project archive/delete lifecycle; it is
  never an independently editable label.
- Provider submission remains an explicit action scoped to one Deliverable revision. A late result
  is linked to its originating revision and cannot replace newer work without matching child CAS.
- Media bytes stay in the asset store. Object URLs, browser component state, provider credentials,
  raw prompts/provider bodies, and private locations remain outside snapshots.
- Parent deletion cannot cascade through retained Deliverables, outputs, or shared assets. Archive
  comes first, and permanent deletion remains relationship-safe and explicitly confirmed.
- This model is a collection of independent video work items inside one Project, not a multitrack
  timeline, clip bin, Campaign model, collaborative system, or nonlinear editor.

## CAS and transactions

Use separate tokens:

- `projects.version` protects Project metadata and deliverable membership/order.
- `project_deliverables.version` protects one child lifecycle and current-revision pointer.
- `project_deliverable_revisions.revision_number` is monotonic within one Deliverable.

Creating, reordering, or removing a Deliverable compares the Project token. Appending creative work
compares only the selected Deliverable token and current revision, so unrelated videos do not
conflict. Relationship writes must repeat owner and parent IDs in composite foreign keys. Source
acceptance, revision insert, role links, and current-pointer advance remain one transaction.

## Possible API and UI shape

A later Project detail screen could show an accessible Videos/Outputs list. Selecting a row would
open that Video's current workspace; Preview would open one scoped authenticated player
and release it on close. Several outputs may be listed, but only the explicitly opened video should
load bytes. Keyboard order, focus return, reduced motion, and small-viewport behavior must follow
the existing overlay and media ownership system.

Potential routes should remain owner-derived and app-controlled, for example:

```text
GET    /api/projects/:projectId/deliverables
POST   /api/projects/:projectId/deliverables
GET    /api/projects/:projectId/deliverables/:deliverableId
PATCH  /api/projects/:projectId/deliverables/:deliverableId
POST   /api/projects/:projectId/deliverables/:deliverableId/revisions
```

These are illustrative only. They are not current contracts.

## Migration path from the current Project model

Implementation should be additive and staged:

1. Create Deliverable tables and constraints without changing existing Project reads/writes.
2. Create one **Primary video** Deliverable only for each existing Project that already has reliable
   working or output lineage, by copying rather than moving that lineage under an idempotent
   migration receipt. Leave collection-only Projects empty.
3. Verify owner, revision, asset, job, and output counts plus current pointers before switching any
   read authority.
4. Dual-read or compare in a reviewed compatibility window; never dual-submit provider work.
5. Switch application authority only after reconciliation and rollback evidence.
6. Retain old Project revision/link rows until backup, restore, and relationship-safe retirement are
   separately approved. Do not drop or rewrite them in the initial migration.

Existing unassigned Saved Videos remain unassigned. No inferred Deliverable should be created when
reliable Project lineage does not exist.

## Decisions recorded before implementation

The following product decisions are approved but do not make this model current runtime authority:

1. A Project may intentionally remain collection-only; it does not automatically require a child.
2. One Saved Video Version may appear in more than one Project or future Project Video.
3. The UI name is **Videos**; the proposed internal model remains `Project Deliverable`.

Before implementation, independently decide whether children archive separately, how ordering
works, and whether Project-level creative defaults are copied or referenced. Those lifecycle
choices must be reflected in contracts and migrations rather than inferred from the approved name.

Campaign membership is an implemented separate product and architecture decision. Do not make a
future Deliverable implementation the point where Campaign ownership, cardinality, or lifecycle is
silently changed.
