# Lightframe Studio — Domain model and glossary

**Document type:** canonical product vocabulary and relationships. Every surface, contract, and
document uses these meanings. Where a concept is not yet implemented, its row says so — this file
defines the target language without pretending unresolved implementation details are decided.
Unresolved structural choices are tracked in [Decisions required](../DECISIONS_REQUIRED.md).

## The hierarchy

```text
Account (authenticated owner scope)
├── Campaign (optional organizer: name + brief)          0..N
│   └── Project                                          0..N per campaign
├── standalone Project                                   0..N
│
├── Libraries (account-level, reusable)
│   ├── Videos      — Saved Videos, each with immutable Versions
│   ├── Characters  — reusable creative identities (+ Wardrobe variants)
│   ├── Outfits     — reusable try-on garments
│   └── Voices      — kept provider voices
│
Project
├── source media                        (today: exactly one; target: one or more)
├── working media / current cut         (the media the stage shows)
├── composition                         (target: ordered clips + subtitle tracks + audio settings)
├── Project Revisions                   (append-only creative-state history)
├── Transformations (processing jobs)   (optional AI work, linked to revisions)
├── outputs → Saved Video Versions      (immutable, provenance-linked)
└── exports (placement renditions)      (platform-shaped variants of an output)
```

## Core terms

### Campaign

An optional organizational umbrella grouping related Projects under one initiative. Contains only a
name and an optional brief. One Campaign groups many Projects; a Project belongs to zero or one
Campaign and may stand alone; "No Campaign" is a virtual view, not a default row. Campaign archive
never cascades to Projects; deletion is a guarded tombstone allowed only when the Campaign is
archived and empty. Campaigns never own media, processing state, or outputs.
_Status: implemented as specified._

### Project

An outcome-focused production workspace whose job is to produce a finalized deliverable. A Project
owns its source media references, its revision history, its processing jobs, its composition, and
the links to its saved outputs. It is resumable: closing the browser and returning restores exact
state. Projects can be renamed, duplicated (by reference, no bytes copied), moved between
Campaigns, archived, restored, and — after archiving — tombstoned.
_Status: implemented as a **single-video** workspace (one immutable source, one current cut).
The multi-source, composition-bearing Project is the target model; see
[Decisions required](../DECISIONS_REQUIRED.md) D1–D3._

### Source media

Original video brought into a Project by upload, camera recording, or explicit reuse of a Library
video Version. Sources are immutable once accepted: editing never alters them, and removing a
source from a Project keeps its bytes as long as any history references them.
_Status: implemented, capped at exactly one source per Project (schema-enforced). The target model
allows several sources per Project._

### Asset

The umbrella product term for a piece of media or reusable creative material with ownership, type,
and lineage: source videos, saved video versions, characters, outfits, voices, reference images.
"Asset" alone never names a surface; surfaces name the concrete kind (Videos, Characters…).
_Status: implemented as `media_assets` (byte objects) plus per-kind records._

### Derived asset

An asset produced from another asset — an edited render, an AI transformation result, a placement
rendition, a thumbnail. Derivation is recorded (parent/origin references), and a parent cannot be
deleted while a retained derivative still needs it.
_Status: implemented via origin fields, `source_version_id` lineage, and retention policy._

### Version (Video Version)

An immutable state in the history of one Saved Video. Versions are append-only with a stable
ordinal, carry their origin (recorded, uploaded, editor, character-swap, virtual-try-on,
voice-treatment), dimensions, duration, and — when produced for a placement — the export
specification. A Saved Video has a "current" Version pointer that only changes by explicit action.
_Status: implemented as specified._

### Transformation (processing job)

One explicit, cost-aware unit of AI work: character swap, virtual try-on, voice treatment, or a
future generative operation. A transformation has a full lifecycle — queued/submitting, accepted,
processing, ready, delivered, failed, cancelled, expired, and **ambiguous** (acceptance unknown;
reconciled, never silently resubmitted). Project transformations are durable: they link to the
revision that initiated them, retain their results server-side, and their outputs can be adopted
as the current cut or re-adopted later from History.
_Status: implemented for character swap and virtual try-on in Projects; voice transformations are
standalone-only today (a known gap)._

### Composition

The arrangement that turns a Project's material into one deliverable: an ordered sequence of clips,
plus subtitle tracks and audio settings that apply across the sequence. The composition — not any
single source — is what the user previews, refines, saves, and exports.
_Status: **not implemented.** Today a Project's "composition" degenerates to a single current cut
with one edit specification. Composition storage shape is an open decision (D3)._

### Timeline

The editing surface that displays and manipulates the composition: clip order, per-clip trims,
split points, subtitle cues over time. "Timeline" names UI; "composition" names the data.
_Status: a single-clip timeline (trim handles, frame stepping) exists; the multi-clip timeline is
target work._

### Clip

A reference into source media with in/out trim points, occupying a position in the composition. A
clip does not copy bytes; splitting a clip creates two references.
_Status: not implemented (single-clip editing only)._

### Subtitle track / subtitle cue

Timed text over the composition: each cue has text, a start and end time, and a placement that may
change per time range. Whether subtitles are burned into exports, carried as sidecar tracks, or
both is an open decision (D4).
_Status: not implemented anywhere (no schema, contract, or UI)._

### Working media / current cut

The media the Project's stage currently shows and the next edit starts from: the accepted source,
a local render adopted after manual editing, an adopted AI result, or a reused Library Version.
Adopting a new current cut never destroys the previous state — History records every change.
_Status: implemented._

### Project Revision

An append-only checkpoint of a Project's creative state (autosaved). Revisions are the Project's
undo-safe memory: what was selected, what was being made, which jobs and outputs attach where.
Revision = creative-state history; Version = playable media history. They are never merged.
_Status: implemented (full snapshot per revision)._

### Final deliverable

The output a Project currently designates as "the result": a specific Saved Video Version,
provenance-linked to the revision that produced it. A returning user must be able to see and
download the final deliverable without re-entering the workspace. Saving a deliverable does not end
the Project; work may continue and later saves may supersede it (see D2).

Two different records answer "what has this Project produced", and they are not interchangeable.
The snapshot's `lastSuccessfulOutput` names the Version produced from the _exact_ material state it
sits beside, so the domain clears it on any material change (`nextSnapshot` in
`packages/domain/src/projects/rules.ts`) — after one further edit it is `null` even though the save
happened. The durable record is the append-only output history (`project_outputs`, served by
`GET /api/projects/:id/outputs`, newest first, each row carrying `isCurrentForProject`). A surface
showing what a Project has produced must read the history; a surface asking whether the current cut
is already saved reads the snapshot.

_Status: partially implemented — outputs and provenance exist, and the Project overview surfaces
the most recent one (poster, placement, Download, View in Assets), saying so when the Project has
changed since. The product still marks the Project "completed" on save._

### Export

Producing the file that leaves the product: today, a download of an exact Version, optionally
re-framed for a **placement** — the destination shape the media is going to (keep as-is,
widescreen 16:9, phone 9:16, square 1:1, tall 4:5) at a fixed resolution. A placement chosen at
save time is rendered into real bytes and recorded on the Version. Export variants are sibling
placements of one deliverable.
_Status: implemented one placement per save; multi-placement variant sets are target work (D10)._

### Archive

A reversible shelving state for Projects and Campaigns: archived items leave default views but
remain openable and restorable. Deletion is a separate, guarded tombstone step after archive, and
is relationship-safe — bytes referenced by retained history are never destroyed by it.
_Status: implemented._

## Supporting terms (kept, with their exact meanings)

| Term                                    | Meaning                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saved Video**                         | A Library video record: title, status, append-only Versions, current-Version pointer, Project provenance when known ("No Project" chip otherwise). |
| **Take**                                | A just-recorded, in-memory camera capture under review; it becomes durable only by saving (to a Library or a Project).                             |
| **Placement**                           | The destination shape a video is produced for. A placement is not delivery; nothing is sent anywhere.                                              |
| **Library**                             | An account-level collection surface: Videos, Characters, Outfits, Voices.                                                                          |
| **Character / Wardrobe variant**        | A reusable creative identity (prompt + reference image) and its saved outfit variants.                                                             |
| **Membership ("Used in this Project")** | A non-owning organizational link from a Project to Library items it uses. Removing it never deletes anything.                                      |
| **Recording session**                   | The live camera stage lifecycle: camera off by default, explicit start, optional live AI, take review.                                             |

## Deprecated names (do not use in new UI, code, or docs)

| Deprecated                                                                                                | Use instead                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| "Creative assets", "account library", "Saved Creative Library", "Library data" (four names for one store) | **Library** (place) / the concrete kind (thing)   |
| "Release" (as a take action)                                                                              | Save / Close / Discard                            |
| "Recipe" (user-facing)                                                                                    | Saved prompt / Outfit                             |
| "Deliverables" (user-facing)                                                                              | Videos (the approved UI name)                     |
| Provider names as user-facing choices ("Decart API", "Pruna API")                                         | Capability names (Character Swap, Virtual Try-On) |

## Invariants that hold across the model

1. Ownership derives from the verified session subject only — never from a body, query, path,
   storage key, provider ID, or device ID.
2. Versions and Revisions are append-only; history is never rewritten.
3. Bytes referenced by any retained history are never deleted; cleanup is retention-gated.
4. Every mutation that creates bytes or spends money is idempotent (idempotency keys) and
   concurrency-safe (compare-and-set versions). These are load-bearing; never removed to
   "simplify" a call.
5. Cost-bearing provider work is explicit, bounded, and never retried or fanned out automatically;
   unknown acceptance is reconciled, never resubmitted.
6. No output — manual or AI — may end up orphaned outside a Project or Library.
