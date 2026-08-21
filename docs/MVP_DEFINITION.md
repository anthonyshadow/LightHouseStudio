# Lightframe Studio Campaign and Project MVP definition

**Status:** accepted local Campaign/Project capability boundary; all 17 objective criteria and
required automated gates are recorded as passed

**Defined:** 2026-08-11

**Current evidence and go/no-go:** [MVP acceptance runbook](MVP_ACCEPTANCE.md)

**Historical basis:** [MVP alignment audit](archived/MVP_ALIGNMENT_AUDIT.md)

**Delivery plan:** [Lightframe MVP implementation sequence](archived/LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md)

## MVP product statement

Lightframe Studio MVP is the current video-first, local, single-operator Studio with a durable and
coherent work hierarchy:

- a **Campaign** optionally groups related creative work;
- a **Project** is one focused, resumable video workflow;
- an opaque **Media Asset** identifies each durable source or media result without becoming a new
  user-facing library;
- a **Project Revision** preserves creative intent and working state at a semantic checkpoint;
- a **Saved Video / Video Version** preserves playable output media non-destructively; and
- **Download** delivers an exact ready Video Version. Export remains the broader product/taxonomy
  term, not a separate MVP workflow.

The MVP validates campaign-oriented organization without building a marketing-planning suite,
generic multi-format asset platform, collaboration product, public service, or publishing system.

## Product model

```text
Authenticated owner scope (the current Workspace)
├── Campaign 0..N
│   └── Project 0..N
├── standalone Project 0..N
│
├── Assets
│   ├── Saved Videos
│   │   └── immutable Video Versions
│   ├── Character
│   │   └── Character Variant / Wardrobe item
│   ├── Outfit
│   ├── Voice / Saved Voice relationship
│   ├── Recipe / prompt
│   └── immutable reference media

Project
├── current immutable Project Revision
├── revision-scoped Media Asset and Saved Video Version references
├── Processing Jobs linked to their initiating revision
└── output links from a producing revision to exact Video Versions
```

Workspace remains the authenticated owner scope and has no new table. Campaign does not own media
or provider execution. Project does not copy bytes or reusable-resource ownership. Saved Videos
remain a library projection that can contain both Project outputs and legacy unassigned content.

## Campaign decision

### Cardinality and membership

- One Campaign can group many Projects.
- A Project belongs to zero or one Campaign.
- A Project can stand alone.
- “No Campaign” is a virtual list/query bucket, not a database row.
- There is no default Campaign.
- An owner can move a Project between active Campaigns or detach it using optimistic concurrency.
- One Project cannot belong to several Campaigns in MVP.

### Minimum durable metadata

A Campaign contains only:

- opaque UUID;
- immutable owner UUID;
- name;
- optional short brief/description;
- optimistic-concurrency version;
- active, archived, or tombstoned lifecycle;
- created, updated, archived, and deleted timestamps as applicable; and
- its Project relationship through a nullable, owner-constrained Project membership.

Campaign has no tags, goals, audiences, channels, dates, budgets, KPIs, approvals, assets,
variations, calendar, analytics, publishing, or collaboration in MVP.

### Lifecycle policy

- **Archive** removes the Campaign from the default active view. It does not archive, stop, move,
  or delete its Projects.
- Existing Projects under an archived Campaign remain openable through archived/contextual views,
  but new or moved Projects cannot attach until the Campaign is restored.
- **Restore** makes the Campaign active again.
- **Delete** is a tombstone, not byte erasure. It is available only after archive and only after all
  Projects are detached or moved.
- Campaign operations never cascade to Projects, revisions, jobs, Saved Videos, Versions, assets,
  or reusable resources.

### Campaign UX

- Campaigns is a primary authenticated navigation destination alongside Projects and Assets.
- Create Campaign asks for only **Name** and optional **Brief**.
- Success opens Campaign detail with a primary **New Project** action whose Campaign is preselected.
- Campaign detail lists its active Projects and provides move/detach and archive/restore actions.
- The user is never required to create a Campaign before beginning creative work.

## Project decision

### Product meaning

A Project is one focused production effort for one active video workflow and any number of
immutable output Versions. It provides the durable correlation that is currently scattered among
temporary source Files, recording artifacts, edit state, creative selections, provider jobs, and
Saved Video IDs.

The deferred Deliverable child model is not part of MVP. If future evidence requires independently
resumable media work inside one Project, it can be introduced as a separate reviewed aggregate
instead of overloading the current Project.

### Project owns

Project owns:

- title, lifecycle, optional Campaign membership, and optimistic-concurrency version;
- ordered immutable Project Revisions;
- the current revision pointer;
- workflow phase and the exact durable source/working/presented media references;
- the current local video-edit specification;
- the exact creative intent and treatment settings applied at each revision;
- links to Processing Jobs with their initiating revision;
- links from producing revisions to exact Saved Video/Video Version outputs; and
- derived current operational status.

### Project references, but does not own

Project references:

- Media Asset bytes and metadata;
- Saved Videos and immutable Video Versions;
- Characters and the exact Character Variant used;
- Outfits and immutable reference media;
- Voices/Saved Voice relationships;
- recipes, prompts, and other reusable creative resources; and
- provider-neutral processing operations.

The revision stores stable resource IDs plus the minimal exact applied values, resource revision,
or fingerprint needed to reproduce/explain the choice. It does not depend on a mutable “current
default,” and it does not duplicate an entire reusable library record.

### Project lifecycle and status

- Create is idempotent and may use a generated `Untitled Project` title that can be renamed later.
- Empty Projects are valid drafts, so organization does not force a source upload.
- A Project becomes safely resumable only after its source is durably stored, inspected, and ready.
- A Project's source is immutable while it is attached: a second acceptance conflicts rather than
  overwriting it. Failed or unaccepted staging may be replaced, and an accepted source can be
  explicitly removed to choose a different one without deleting the Project, its history, or any
  saved output Version. Local edits and transformations advance working/presented media without
  replacing the source.
- Status reflects the current revision and current active attempt: draft, ready, processing,
  needs-attention, or completed. Historical failures do not poison newer work.
- The current revision is completed only when its validated `lastSuccessfulOutput` names an exact
  retained output represented by that revision. A later material intent or working-media change
  that is not represented by that output clears the pointer and returns the Project to ready (or
  the applicable current-attempt state). A processing operation being complete does not by itself
  make the Project completed.
- Archive is blocked while a non-abandonable operation is active. For an accepted provider job, the
  service must use an explicit documented block/cancel/detach policy rather than silently hiding it.
- Archive hides the Project from active views but retains all relationships.
- Restore re-derives current status from current facts.
- MVP UI emphasizes archive/restore. Tombstone deletion remains guarded and does not imply physical
  erasure of retained media. A tombstoned Project continues to retain its relationships and bytes;
  physical Project purge is a separately designed post-MVP lifecycle.

## Asset decision — establish the seam

MVP chooses **establish the seam**, not generalize now.

The existing opaque, owner-bound asset ID plus byte-store manifest remains the media-byte identity.
Authoritative relational modes retain `media_assets` as metadata/lifecycle authority; local mode
uses the same owner-bound byte-manifest contract with deliberate local Project metadata. Add only
the video metadata/content endpoints required to accept, validate, hydrate, stream, retain, and
clean up a Project source or working result.

Do not:

- rename Saved Video to Asset;
- create a generic user-facing Asset library;
- force Characters, Outfits, Voices, recipes, and prompts into one asset table;
- invent media-neutral editing or export specifications without a second implemented format; or
- treat the unused generic media type as an already established public contract.

Future image/audio/graphics work can extend the asset boundary through explicit media kinds and
format-specific metadata while Project snapshot schemas evolve deliberately.

## Revision, Version, output, and Download decision

| Term                    | MVP meaning                                                                                                          | Durable representation                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Original/source         | The first accepted input preserved without destructive replacement.                                                  | Ready Media Asset linked revision-granularly as source.                                     |
| Working/presented media | The durable media currently used or shown, which may be an asset or exact Saved Video Version.                       | Revision snapshot plus normalized same-owner reference.                                     |
| Generated/edited result | A candidate produced from source and intent. It may remain reconstructable/temporary until adopted.                  | Temporary result first; a ready Media Asset or Video Version when the user saves/adopts it. |
| Project Revision        | Immutable semantic checkpoint of creative intent, references, edit spec, workflow phase, and current output pointer. | Project revision row/file record with normalized relationships.                             |
| Saved Video             | Logical named output/library record whose current pointer can advance.                                               | Existing Saved Video aggregate.                                                             |
| Video Version           | Immutable playable media state of a Saved Video.                                                                     | Existing version record and asset bytes.                                                    |
| Project output          | Provenance link from the exact producing Project Revision to one exact Saved Video/Video Version.                    | Normalized Project output relation.                                                         |
| Variation               | A purposeful alternative for another audience/message/placement, not merely an older version.                        | Deferred; no generic MVP entity.                                                            |
| Download                | Delivery of an exact ready Video Version; “export” remains a broader product taxonomy term.                          | Action/audit trace as already needed; no durable Export aggregate.                          |

Project Revision and Video Version are deliberately different. A user can checkpoint intent
without rendering media, and can create a Video Version only when durable playable bytes exist.
Reusing a prior Version may produce a new Project Revision without creating another Version.

An output relation records the revision whose ready working/presented media and intent produced the
saved Version. The atomically appended post-save revision then references that exact output as its
last successful output. It does not rewrite the producing revision. Reusing a Saved Video Version
as a Project source also does not make that Saved Video an Add Version target; the save target is a
separate explicit choice at save time.

If future export settings generate different bytes, those bytes must first become a ready Version
and Project output; then download that exact Version. Merely downloading existing bytes does not
create another durable entity.

Removing a Saved Video from the global library tombstones/hides that logical record. If a Project
still retains an exact output Version, Project-scoped owner-checked history/content access remains
available and the bytes are retained. The removal confirmation must explain that Project history is
preserved. Physical purge requires every retained relationship to be removed through a separately
designed post-MVP lifecycle.

## Reusable-resource decision

Characters, Character Variants, Outfits, Voices, Saved Voice relationships, recipes, prompts, and
reference media remain owner/workspace reusable. A Campaign or Project never becomes their
lifecycle owner merely by using them.

A revision captures:

- the stable resource and child/version ID, when available;
- a display label for historical explanation;
- the exact prompt/treatment/selection values actually sent or applied where a mutable library ID
  is insufficient; and
- an immutable reference ID or content fingerprint where reproducibility needs it.

Deleting or editing a reusable resource must not rewrite old revisions. Cleanup must retain bytes
still needed by a Project and allow a historical revision to explain a missing/tombstoned optional
resource without exposing another owner's existence.

## Canonical MVP journey

The MVP keeps the current Studio flexible and does not introduce a forced wizard:

```text
Log in to Dashboard
  ↓
Open Projects, or open/create a Campaign
  ↓
Create a named Project, or create it without a name for an untitled standalone Project
  ↓
Record, upload, or reuse an exact Saved Video Version as source
  ↓
Wait for durable source acceptance; local preview remains usable
  ↓
Use local editing and/or one explicit Character Swap or Virtual Try-On;
checkpoint Voice settings where useful, while unsupported Project Voice processing remains gated
  ↓
Checkpoint semantic intent automatically and show saved/conflict state
  ↓
Reconnect queued processing whose provider identity is durable; never auto-resubmit an ambiguous
operation
  ↓
Review original/current result and optionally edit locally
  ↓
Save as a new Saved Video or append an immutable Video Version
  ↓
Review Project outputs/history and download the exact ready Version
```

At any safe point, the user can leave and later resume the Project. Project switching must first
flush a semantic checkpoint, keep the user in place on conflict, or obtain explicit discard. It
must never revoke media still owned by another active Project/session.

## MVP information architecture

Minimum authenticated destinations are:

- **Dashboard:** orientation, account onboarding, recent work, and explicit creation/resume actions;
- **Create:** the focused standalone video workspace at `/studio/create`;
- **Projects:** default active list, recent status, optional Campaign, create/open/rename/archive;
- **Campaigns:** active list, create/open/rename/edit brief/archive, and grouped Projects;
- **Project overview/workspace:** organization at `/projects/:projectId` and focused media
  work at its `/workspace` child;
- **Assets:** Videos, Characters, Outfits, and Voices, with a “No Project” chip for legacy or
  independently saved Videos; and
- current contextual access to Wardrobe and builders.

It requires Campaigns, Projects, Assets, current Project identity, save state, and processing state
to be clear in the main navigation/shell.

Project detail also exposes non-owning, detachable membership for supported Assets without changing
source, working-media, output, history, or retention authority. Active Project identity is owned by
the overview/workspace URL pair. Opening a global Assets route
is a guarded workspace exit, not an identity kept only in mounted React state; in-Project resource
selection uses contextual pickers or returns through the explicit Project workspace URL.

## Persistence and reliability contract

- The selected documented persistence mode is authoritative. Local and shadow modes must support
  the same user-visible Campaign/Project behavior as authoritative relational mode.
- Project metadata and durable sources survive refresh, browser restart, and application restart.
- IndexedDB may hold an owner-scoped, versioned draft/cache for coalescing or offline-safe UI
  recovery, but it never overrides the server Project or silently overwrites a conflict.
- Autosave occurs at semantic changes or a bounded coalescing interval, not every input event.
- Project switching and unload coordinate with the existing recording/render/exit owners.
- A queued provider operation reconnects once its provider identity is durable. An ambiguous
  `submitting` operation never auto-resubmits; a synchronous/streaming capability without a
  recoverable provider identity must retain its returned result before success or remain gated.
- Stale completions cannot replace media for a newer revision.
- A successful cost-bearing result is retained in durable storage before provider/server temporary
  cleanup whenever the UI represents it as saved or resumable.
- Save operations use durable idempotency. Exact replay returns the original result; mismatched
  replay conflicts.
- Relational metadata mutations that create/link a Video Version and advance a Project share one
  transaction. Local mode provides equivalent crash recovery through a journal/operation receipt
  and compensation. Shadow mode follows its local Project/Saved Video authority and treats remote
  database or R2 writes as reconciled side effects; it does not claim cross-store atomicity.
- Cleanup checks all owner-scoped retained relationships before deleting bytes.

## Migration and compatibility

- Apply additive/forward relational migrations with inspectable rollback or compatibility notes;
  never migrate production automatically.
- Correct existing Project relation keys without fabricating missing lineage. Existing valid rows
  retain the revision identity already stored.
- Existing Saved Videos, Video Versions, jobs, Characters, Variants, Outfits, Voices, and recipes
  remain valid and unchanged.
- Do not bulk-assign legacy content to fake Projects or Campaigns.
- Existing Saved Videos with no Project output provenance are chipped **No Project**. Reusing
  an exact Version as Project source/working media adds truthful used-by lineage but does not remove
  unknown-producer status. Only a real Project output relation established by an output save assigns
  producing provenance.
- An explicit “Use in Project” action creates truthful used-by lineage from that point; it does not
  claim how the historical video was produced.
- Migration/replay is idempotent, owner-safe, observable, and reversible where practical.

## MVP security and privacy boundary

- The current loopback, seeded-user, single-operator boundary remains.
- All ownership comes from the verified server session; requests never choose an owner.
- Owner-constrained Campaign/Project/media/job/version relations are checked inside mutations.
- Missing and wrong-owner records return the same safe response.
- Mutations enforce the existing trusted-Origin policy.
- Browser contracts never reveal storage keys, internal paths, permanent credentials, provider raw
  bodies, hidden causes, or arbitrary upstream codes.
- Provider work remains explicit, bounded, cancellable where supported, and free of automatic
  billable retry/fallback.
- Campaign and Project archive/delete never cascade into user content.
- Current privacy, temporary-data, provider, and manual/live-test disclosures remain authoritative.

## Objective “MVP complete” criteria

MVP is complete only when all of the following are demonstrated in every supported product
persistence mode unless a mode is explicitly and canonically unsupported before implementation:

1. The entry, authenticated shell, and empty states explain that Lightframe is a video creative
   workspace organized through optional Campaigns and Projects.
2. The user can create, rename/edit, archive, restore, guarded-tombstone, list, and open a Campaign
   with name and optional brief; tombstone is blocked while Projects remain attached.
3. The user can create a named standalone or Campaign Project, or create one without a name without
   unnecessary required metadata; any Project may intentionally remain collection-only.
4. The user can move/detach a Project and use the virtual No Campaign view; Campaign lifecycle does
   not cascade.
5. The user can record, upload, or explicitly reuse a Saved Video Version as the Project source;
   the original becomes durable before the Project claims resumability.
6. Refresh, browser restart, and application restart restore Project identity, source, current
   semantic state, and a fresh playable content URL.
7. Character Swap, Virtual Try-On, reusable Character/Variant/Outfit/Voice/recipe choices, and local
   edit state operate in the Project without duplicating their lifecycle owners. Voice settings can
   be checkpointed; a Voice-processing adapter either retains a recoverable Project result before
   claiming success or remains truthfully gated.
8. The user can see whether Project state is saving, saved, conflicted, processing,
   needs-attention, or ready/completed.
9. A queued provider job reconnects after navigation/reload once its provider identity is durable;
   ambiguous submission never auto-resubmits, common failure offers an explicit safe retry, and
   stale completion cannot overwrite newer work.
10. The original remains recoverable, and Project Revisions are distinct from playable Video
    Versions.
11. Saving creates a new Saved Video or exact immutable Video Version and links it to the producing
    Project Revision through crash-safe/idempotent orchestration.
12. The user can browse bounded Project history/outputs, open/use/download an exact previous Video
    Version, and find legacy videos with no producing Project.
13. The user can move coherently among Dashboard, Create, Campaigns, Project overview/workspace,
    and Assets without losing or silently discarding work.
14. Download selects an exact ready Video Version and is labeled distinctly from **All changes
    saved**, **Render preview**, **Save as New Video**, and **Add Version**.
15. Cross-owner, missing, archived/deleted, replay, conflict, cleanup-retention, refresh-resume, and
    migration cases have focused automated coverage.
16. The complete no-paid-provider E2E journey, relevant visual/responsive cases, affected typechecks,
    database migration checks, and repository quality gate pass; environment-dependent manual and
    live-provider limits are reported honestly.
17. Canonical README, Architecture, Product Vision/Roadmap, privacy/persistence guidance, user
    stories, testing docs, and ADRs match the behavior that actually ships.

Implementation presence is not acceptance evidence by itself. The
[MVP acceptance runbook](MVP_ACCEPTANCE.md) maps each criterion to focused implementation/tests and
records passing results for all 17 criteria and every required automated gate. The resulting
conclusion is **GO for the local Campaign/Project MVP only**. Environment-dependent physical-device,
assistive-technology, live Neon/R2, and paid-provider checks remain named limits and do not
authorize public deployment.

## Explicit non-goals

MVP excludes:

- mandatory Campaigns, Campaign-owned assets, rich briefs, planning, variations, review, calendars,
  publishing, or analytics;
- a Workspace/organization table, real signup, teams, roles, sharing, comments, or approvals;
- generic Asset CRUD/library/search, image or graphics creation, or media-neutral composition;
- Project Deliverables or multiple independently resumable workflows inside one Project;
- captions, transcription, overlays, cover design, audio mixing, advanced export presets, and direct
  publishing;
- A/B comparison, generic restore, tags, favorites, folders, bulk operations, or a global Processing
  Center;
- usage ledgers, billing, credits, quotas, product analytics, or public-service infrastructure;
- a general Studio rewrite, runtime migration, provider replacement, or broad dialog cleanup; and
- automatic migration or invented lineage for existing content.
