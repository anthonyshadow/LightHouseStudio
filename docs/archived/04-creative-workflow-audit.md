# Creative workflow audit

Measured against the lifecycle the product states for itself:

**Idea → Source media → Creation → Editing → Transformation → Review → Save → Organize → Export**

| Stage          | State       | Verdict                                                           |
| -------------- | ----------- | ----------------------------------------------------------------- |
| Idea           | Absent      | No brief, no notes, no reference board, no starting point         |
| Source media   | Strong      | Record, upload and reuse all work; validation is careful          |
| Creation       | Strong      | Capture is solid; the AI pipeline is the best part of the product |
| Editing        | Partial     | Trim/crop/rotate/lighting/filters only — no text, audio or speed  |
| Transformation | Strong      | Bounded, reconciled, cost-honest                                  |
| Review         | Strong      | Compare against original, take review, exact-Version preview      |
| Save           | Strong      | Non-destructive, versioned, idempotent                            |
| Organize       | Weak        | Text lists, no search, no thumbnails, no totals                   |
| Export         | **Missing** | One file, source aspect, no presets, no variants                  |

The curve is the point: the product is strongest exactly where it is hardest — the media and
provider pipeline — and weakest exactly where it is easiest — naming, finding, and finishing.

## Losing work

**This is handled unusually well.** `StudioExitGuard` blocks navigation while a recording is
active, a render is running, a temporary take exists, voice processing is live, or creative work is
dirty. Session expiry no longer silently discards in-memory work. Project output save writes an
idempotency receipt to storage first, so a reload mid-save reconciles rather than duplicating.
Optimistic concurrency refuses stale writes with a specific message.

**One exception.** `/studio/{videoId}` is outside the guard: `studioWorkspaceKeyFromPath` returns
`null` for it (`StudioExitGuard.tsx:41-45`). Nothing in the product links there, so reachability is
low — but the route exists and it can lose work.

**One larger exception.** The creative library — Characters, Outfits, prompts — has **no protection
at all** in the default `DATABASE_MODE=local`: browser IndexedDB, no export, no backup, no warning.
Character reference images cost real provider money to generate. Losing the library orphans them,
and the cloud mode's `purgeExpiredUnreferenced` will eventually reclaim them.

## Destructive editing and originals

**Correct by construction.** A Project has one immutable source that never changes. Local edits
produce new working media. Provider results are new assets. Saved Videos append Versions rather than
replacing them. Downloads are exact Versions.

**But the user cannot see the lineage they are protected by.** History lists revisions and outputs
as rows of text and timestamps. There is no visual tree, no side-by-side of Version 1 against
Version 3, no "what changed" summary. The product does the hard part and hides the payoff.

## Originals versus edits

The distinction is modelled precisely — `sourceAssetId`, `workingMedia`, `presentedMedia` — and
**shown to the user in those words**. Three media pointers with near-synonymous English names is a
comprehension problem, not a modelling one. The fix is labels, not types.

## Organization

**Campaign → Project → Video** is coherent on paper. In practice:

- A Campaign carries no creative meaning — no channel, no dates, no goal, no asset count, no visual
  identity. It is a folder described as strategy.
- A Project cannot be duplicated, templated or branched.
- The Assets hub does not distinguish server-durable Videos and Voices from browser-local Characters
  and Outfits.
- Saved Videos default to a title inherited from their Project, so libraries fill with repeated
  "Untitled Project" entries — observed live: two of four recent items.

## Revisiting previous work

Resuming a Project is well built: the workspace opens on the step the Project reached, latches that
choice, and deep-links tasks via `?task=`.

Two costs. Opening a Project with a source downloads the entire video — up to 300 MB — before the
workspace is usable. And finding _which_ Project to resume relies on the Dashboard's first item or
scrolling an unsearchable list.

## Making variations — the biggest gap

Marketing production is variation: same source, different character; same cut, different aspect;
same message, different length. The product supports **none** of it as a first-class action.

There is no duplicate Project, no "re-run with a different outfit", no variant set, no batch. Each
variation is a fresh Project, a re-chosen source, a re-selected creative stack, and a new paid job.
The domain is ready for this — `ProjectRevision` already captures the full creative intent, so a
duplicate is a revision copy with one field changed — but no surface offers it.

## Previews and metadata

Video cards show duration, resolution, date, version count, operation and character — good, useful
metadata. Then: **the poster frame is missing on some records and absent entirely on every other
surface**.

Thumbnail generation runs once, client-side, in `useSaveVideo` via `saveThumbnailWhenAvailable`,
and its failure path is `.catch(() => video)` — swallowed, unlogged, never retried, no backfill and
no way for the operator to fix it. Confirmed live: two of seven saved videos display
_"Preview unavailable"_, both AI character-swap outputs. Thumbnails are also generated at
480×270 with `fit: 'cover'`, so a 9:16 video is centre-cropped into a landscape tile.

## Processing states

Handled with real care: phase indicators, elapsed time, honest acceptance-unknown reconciliation,
and cost warnings before every retry. The remaining gap is that cost is always a _warning_ and never
a _number_. The operator cannot see what a job costs, what they have spent, or how many jobs they
have run.

## Download and export

`?download=true` on the exact Version, with the retained filename. Present in the Videos library,
Project History and the save-success panel; **absent from the Project workspace Save tab**
(**M2**).

Beyond that there is no export product at all: no aspect presets, no resolution choice, no bulk
export, no naming convention, no per-channel output. `ProjectExportSpecification` — already carrying
`aspect: 'source' | '16:9' | '9:16' | '1:1' | '4:5'`, `resolution` and `includeAudio` — is written
by nothing. This is the clearest case in the codebase of a feature that is 60 % built and 0 %
delivered.

## Moving between workflows

Hand-offs are implemented thoughtfully through `StudioRuntimeRegistry` and the shell's handoff
channel: a saved video opens in Studio, a voice waits until a source exists, a saved video becomes a
Project source, a character applies to an existing-video step. The plumbing is good.

What is missing is the _reverse_ direction and the _lateral_ one: a finished Video cannot become a
new Project's starting point in one action from the Videos library, and there is no way to send one
Project's creative setup to another.

## What the product would look like if this were fixed

The smallest set of changes that would make the creative loop feel complete:

1. Every surface shows the work, not a description of it.
2. Everything is findable by typing part of its name.
3. Ordinary words on every label.
4. Export asks "where is this going?" and produces the right file.
5. "Make another version" is one button.

None of these require new architecture. Four of the five are presentation. The fifth already has its
domain type.
