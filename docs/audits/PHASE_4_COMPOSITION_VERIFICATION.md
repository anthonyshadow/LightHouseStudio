# Phase 4 verification — composition end to end

**Document type:** the evidence record for implementation prompt 35 ("Composition end-to-end
verification"), run on 2026-09-16 at head `0aea1955`. It verifies the
[vision](../product/PRODUCT_VISION.md)'s core workflow items 3 and 6–10 **without AI**, in the
running product, and files follow-ups rather than fixing what it finds. Prompt 35 is a gate: its
failures pause the sequence rather than being papered over.

## Verdict

**The gate does not pass.** Nine of fourteen checks pass. Five fail, and they are not the same
kind of failure:

- **Three are slice 4.3's scope, already scheduled and already documented.** Save and the export
  variants do not see the arrangement, so the vision's item 9 cannot be reached for a multi-clip
  deliverable.
- **One is unowned.** No control anywhere in the product can put a caption on an arrangement,
  although the model carries the cues and the renderer burns them.
- **One is a defect outside composition entirely, found on the way.** A Project that holds any
  media cannot be restored from the archive. This affects every Project in the product, not only
  arranged ones, and no slice owns it.

What the slice _did_ build works. A two-source, three-clip arrangement is built, split, reordered,
levelled, rendered and previewed in the running product, and it survives a reload. The centrepiece
of the roadmap's Phase 4 is real. What is missing is the far side of it: nothing an operator
arranges can yet become the thing they deliver.

## How it was verified

A scripted walkthrough drove the product on an isolated stack — a throwaway PostgreSQL database,
the API on a spare port with every provider unconfigured, and a Vite instance proxied to it — in
Playwright's Chromium on an Apple M1 Pro. Each item recorded its own evidence and none aborted the
walk, so no failure could hide the items after it. Screenshots were taken at every step.
Where a claim could be settled by the server rather than the page, it was: clip counts, stored
levels, snapshot fields and the saved Version's own dimensions were read back from the API.

The walkthrough itself is not committed. It was a measuring instrument, not a regression test: what
it proves about the passing items is already pinned by `e2e/real-stack-project-deliverable.spec.ts`
and `e2e/stitched-render.spec.ts`, and what it proves about the failing ones belongs in the
follow-ups below rather than in a suite that would then be red on purpose.

One measurement error was found and corrected mid-run, and is recorded because it would have
produced a false pass: counting elements matching `/Autosav/` finds the workspace masthead even
while the arrangement hides it with `display: none`. Counting only _visible_ matches is what turned
that item from a pass into a failure.

## Evidence per item

### Vision 3 — organize and preview the Project's media — **pass**

Two videos uploaded through the Media area list as two rows, the first badged `Original`, each with
its frame and duration (`1080×1920`, `1280×720`). Pressing **Preview** opens an inline player
against that source's own content route
(`/api/projects/:id/sources/:assetId/content`).

### Vision 6 — combine clips into a composition, and keep editing it

| Check                         | Result   | Evidence                                                                                                                       |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Split at the playhead         | **pass** | One 1,000 ms clip became two at the playhead.                                                                                  |
| Add a second video as a clip  | **pass** | The picker offered both held videos; choosing the 1280×720 one produced a three-clip arrangement over two different sources.   |
| Reorder                       | **pass** | **Move earlier** and **Move later** reorder the strip and are reversible.                                                      |
| Per-clip audio level and mute | **pass** | Clip volume set to 40% and Mute/Unmute both reach the stored arrangement, confirmed by reading the revision back from the API. |
| **Captions across the cut**   | **fail** | See below.                                                                                                                     |

**Captions across the cut cannot be authored.** The arrangement surface offers thirteen buttons and
four sliders, and not one of them names a subtitle, caption, cue or text:

```
Back to the Project · <three clip tiles> · Split at playhead · Add a clip · Undo · Redo ·
Render arrangement · Mute this clip · Move earlier · Move later · Remove this clip
```

This is a gap in the authoring surface alone. `Composition.subtitles` exists and is sequence-timed,
the stitched renderer burns cues across a cut through the same rasteriser the single-clip editor
uses, and the domain model already says the field "is written by nothing yet". The single-clip
editor's Subtitles tool cannot stand in: its cue list lives in _source_ time on `localEdit`, the
composition's lives in _sequence_ time, and nothing translates between them.

A note for whoever verifies this next: a split of one already-captioned cut will show burned-in
text apparently crossing a cut, because the pixels were baked before the split. That is not this
item. The cut between **two different videos** is.

### Vision 7 — preview the result accurately — **pass**

**Render arrangement** turned the three-clip, two-format arrangement into one 22,480-byte
`video/mp4` and played it, captioned:

> Rendered from 3 clips · 00:02.00 · 1080×1920. This is exactly what the arrangement produces. The
> file is not kept anywhere; saving an arrangement comes next.

Selecting the 16:9 clip reports what the render did to it: "Shown with bars: its shape differs from
the arrangement's 1080×1920 frame."

### Vision 8 — save progress at any point and safely return later

| Check                                       | Result   | Evidence                                                         |
| ------------------------------------------- | -------- | ---------------------------------------------------------------- |
| Reopen restores the arrangement             | **pass** | A full page load and re-entry restored all three clips in order. |
| **The autosave is visible while arranging** | **fail** | See below.                                                       |

The stamp exists — `Autosaved · 2:11 PM` was in the DOM — and **zero of its occurrences were
visible** while the arrangement held the stage. The arrangement takes the stage through the same
mechanism the single-clip editor uses, and the shell hides the Project route, its masthead and
therefore the only save indicator in the product. The arrangement surface reads the render's phase
but never the session's.

The consequence is narrow but real against the vision's sixth principle, "the user always knows
what is saved": on the one surface where an operator builds an arrangement, nothing on screen says
whether their work is saved. The slice's own e2e spec works around it by polling the API. The
conflict and save-failure paths that flow 13 promises are invisible there for the same reason.

### Vision 9 — identify the final deliverable and export it — **fail**

Three checks, all failing, all the same root cause.

**The Save step never mentions the arrangement.** With a three-clip arrangement autosaved on the
revision, the Save panel reads:

> Choose a placement, then save the exact current cut shown on the stage. **Current cut** — This
> frame and the selected placement are what the saved video will use. … The original video shown on
> the stage, with no later cut applied.

**What Save stores is the presented source, whole.** The revision held a three-clip arrangement;
Save's subject was `presentedMedia`, a single asset.

**Measured, which is the sharpest evidence in this record:** a save was completed with a chosen
placement and one extra variant. The arrangement is three clips and 2.00 s. The saved deliverable
is **1080×1920 and 1,000 ms** — the presented source alone, re-framed. Its variants are re-frames
of that same single cut, because the placement renderer takes one `Blob` read from the current cut
and never calls the composition renderer.

Nothing warns the operator. They can arrange, render, watch a correct two-second preview, press
Save, and receive a one-second video with no notice that their arrangement was not included.

This is exactly what roadmap slice 4.3 promises ("the composition is what Save operates on") and
what the slice 4.2 record deferred to it. The gap is scheduled. The silence about it is not.

### Vision 10 — archive when done; restore later if needed

| Check                       | Result   | Evidence                                                |
| --------------------------- | -------- | ------------------------------------------------------- |
| Archive an arranged Project | **pass** | It archives, and the composition stays on the revision. |
| **Restore it**              | **fail** | See below.                                              |

**An archived Project that holds media cannot be restored.** Confirming **Restore Project** leaves
the Project archived and raises:

> **Restore not applied** — This Project needs current media facts before it can be restored.

The dialog around that message reads "Restoring returns this **empty** Project to the active
workspace", over a Project holding two videos and a three-clip arrangement, and the confirm button
relabels to **Reload and retry restore**, which hits the same guard every time. That is a dead end
in the sense the vision's seventh principle forbids.

The guard is deliberate and its reason is sound: `ProjectService.restore` refuses whenever the
snapshot carries `sourceAssetId`, `workingMedia`, `presentedMedia` or `lastSuccessfulOutput`,
because it passes empty media facts into the domain rule and would otherwise derive a wrong status.
It trades a wrong status for a refusal. What it does not do is tell the operator that archiving a
Project with media is one-way, or refuse the archive up front the way the archive path already
refuses for other reasons.

**Scope, stated plainly: this is not a composition defect.** Every Project that has ever held a
video trips it. The only automated coverage is a test named for restoring an _empty_ Project, and
the refusal string appears exactly once in the tree — in the code that throws it.

## Gates run

| Gate                                                                                                   | Result                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `bun run quality`                                                                                      | exit 0 — 2,602 tests, 311 files                                                                                      |
| `e2e/real-stack-project-deliverable.spec.ts` + `e2e/stitched-render.spec.ts`, Chromium, isolated stack | 5 passed                                                                                                             |
| Stitched render budget, re-measured                                                                    | 467 ms for 2.20 s of 1080×1920 output from three clips — 212 ms per output second, 49,805 bytes, 14 progress reports |

The render budget is within one percent of the 457 ms the slice 4.2 record measured, on the same
machine and fixtures.

## Follow-ups filed

Not fixed here, per the prompt. Ordered by how much of the vision each one blocks.

1. **Restore refuses any Project that holds media** (`apps/api/src/features/projects/project-service.ts`,
   the guard in `restore`). Vision item 10 and target flow 16 both promise restoration. Either
   derive the real media facts for the status re-derivation, or refuse the _archive_ up front and
   say so. Whichever is chosen, the copy that calls a media-bearing Project "empty" and the retry
   that cannot succeed both need to go. No slice owns this; it is not composition work.
2. **Save and export do not see the arrangement** — slice 4.3, already scheduled. Until it lands,
   the Save step should say that an arrangement is not included, rather than describing the current
   cut as though no arrangement existed. That sentence is the cheap half and is worth doing first.
3. **No control authors a caption on an arrangement.** The model and the renderer are both ready.
   This needs an owner: it is target flow 11's "positions subtitles over specific time ranges" and
   no slice currently carries it.
4. **The autosave state is invisible while arranging**, along with the conflict and save-failure
   paths. The surface has the session; it does not read it.
5. **Smaller items the audit surfaced and the walkthrough did not contradict**, each cheap and
   local: Undo and Redo stay enabled on an archived arrangement (the server refuses the write, so
   the surface offers a gesture that cannot land); an archived Project that was never arranged
   shows a disabled **Arrange this video** with no stated reason; a preview longer than five
   minutes is rendered in full and then refused with the intake's copy about choosing a shorter
   video; a staged proposal that un-arranges a Project is not reflected until it is written; and a
   duplicated Project shows the Media area's heading with no list and no empty state beneath it.

## What this record does not claim

The walkthrough exercised one browser engine, one machine and the committed fixtures. It did not
test a phone, a long arrangement, a slow network, or a Project with many sources. The audio level
was verified as _stored_ and as _applied by the renderer's own tests_; no automated check anywhere
varies a level against the real encoder and measures the resulting samples, because the one
committed fixture carrying sound is a fifth of a second long. Saying the level "works" means the
value reaches the file's encoder correctly, not that anyone has listened to it.
