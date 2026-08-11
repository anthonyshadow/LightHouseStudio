# Deferred Project Deliverable child model

**Status:** design note for later; not implemented  
**Created:** 2026-08-11

## Purpose

Prompt 01 allows one Project to retain many Saved Video outputs. It intentionally gives each
Project one active creative snapshot at a time. That is enough for a Project such as **Summer
Campaign** to retain and independently play a 30-second launch video, a 15-second social cut, and a
vertical teaser after those outputs have been saved.

A `Project Deliverable` becomes useful when all three videos must also remain independently
editable and resumable at the same time. For example, each may need its own source, edit history,
selected Character/Outfit/Voice, active job, export target, and last-opened phase.

This document preserves that future direction. It does not authorize schema, API, UI, migration,
provider, or background-work changes today.

## Proposed model

```text
Project: Summer Campaign
├── Deliverable: 30-second launch video
│   ├── immutable deliverable revisions
│   ├── source/working assets and processing jobs
│   └── one or more Saved Video output versions
├── Deliverable: 15-second social cut
│   └── independent revision, resume, job, and output state
└── Deliverable: Vertical teaser
    └── independent revision, resume, job, and output state
```

The Project remains the campaign-level aggregate root for name, archive/delete policy, ordering,
and the list of deliverables. Each Deliverable becomes a child aggregate with its own:

- immutable owner inherited from and constrained to the parent Project;
- title, position, derived status, aggregate version, current revision, and timestamps;
- one active source/working context and strict versioned creative snapshot;
- normalized asset, processing-job, and Saved Video/output relationships; and
- archive/tombstone lifecycle when independent child removal is needed.

Suggested normalized tables are `project_deliverables`, `project_deliverable_revisions`,
`project_deliverable_assets`, `project_deliverable_jobs`, and `project_deliverable_outputs`. Exact
names should follow the schema conventions in force when implementation begins.

## Rules to preserve

- A Project may have zero or more Deliverables. Empty Projects remain valid.
- A Saved Video is still an output/version, not editable working state.
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
- This model is a collection of independent video work items, not a multitrack timeline, clip bin,
  collaborative campaign system, or nonlinear editor.

## CAS and transactions

Use separate tokens:

- `projects.version` protects campaign metadata and deliverable membership/order.
- `project_deliverables.version` protects one child lifecycle and current-revision pointer.
- `project_deliverable_revisions.revision_number` is monotonic within one Deliverable.

Creating, reordering, or removing a Deliverable compares the Project token. Appending creative work
compares only the selected Deliverable token and current revision, so unrelated videos do not
conflict. Relationship writes must repeat owner and parent IDs in composite foreign keys. Source
acceptance, revision insert, role links, and current-pointer advance remain one transaction.

## Possible API and UI shape

A later Project detail screen could show an accessible Deliverables/Outputs list. Selecting a row
would open that Deliverable's current workspace; Preview would open one scoped authenticated player
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
2. Create one **Primary video** Deliverable for each existing Project by copying, not moving, the
   current Project revision lineage and links under an idempotent migration receipt.
3. Verify owner, revision, asset, job, and output counts plus current pointers before switching any
   read authority.
4. Dual-read or compare in a reviewed compatibility window; never dual-submit provider work.
5. Switch application authority only after reconciliation and rollback evidence.
6. Retain old Project revision/link rows until backup, restore, and relationship-safe retirement are
   separately approved. Do not drop or rewrite them in the initial migration.

Existing unassigned Saved Videos remain unassigned. No inferred Deliverable should be created when
reliable Project lineage does not exist.

## Decision gate before implementation

Before building this model, confirm:

1. Whether every Project automatically starts with one Deliverable or may remain collection-only.
2. Whether a Saved Video may appear in more than one Deliverable/Project.
3. Whether Deliverables may be archived independently or only removed from an archived Project.
4. Whether ordering is manual, creation-based, or both.
5. Whether Project-level creative defaults are copied into new Deliverables or referenced live.
6. Whether the UI calls these children **Videos**, **Deliverables**, **Cuts**, or another exact name.
