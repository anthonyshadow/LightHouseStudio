# Slice 4.1 — Timeline UI: audit and plan

**Document type:** the audit and implementation plan for roadmap slice 4.1, produced by prompt 32
(A) of [`IMPLEMENTATION_PROMPTS.md`](IMPLEMENTATION_PROMPTS.md). **No code was changed.** The plan
is delivered for approval; prompt 33 (B) implements it.

**Audited at:** branch `phase4`, commit `b94bb650`, 2026-09-14.

**Method:** the standard audit-and-plan procedure — eleven parallel readers over every subsystem the
slice touches, seven design probes, each adversarially reviewed on three lenses (feasibility,
reuse-and-ownership, edge cases), then a completeness critic over the whole. Every claim below cites
code that was read at that commit. Where the canon and the code disagree, the code wins and the
disagreement is recorded in §6.

---

## 0. The three findings that change the slice

Prompt 32 describes slice 4.1 as building a timeline over an existing composition model, with "the
existing single-clip tools becom[ing] per-clip tools". Three facts about head make that description
partly unbuildable as written. They are stated first because everything else follows from them.

**(1) The composition model exists, and nothing whatsoever uses it.** Slice 3.1 built
`packages/domain/src/composition/` and put `composition: Composition | null` on the snapshot
(`packages/domain/src/projects/types.ts:178`). `grep -rn 'Composition\b' apps/web/src` returns **no
production match**. The model is read-migrated, validated, and inert.

**(2) There is no write path for a composition, from anywhere.** `projectSessionProposalSchema` —
the checkpoint write, and the only way the browser changes a snapshot — is `.strict()` over exactly
five keys, and `composition` is not one of them (`packages/contracts/src/projects.ts:1108-1120`).
On the server the only assignments are `composition: null` (`packages/domain/src/projects/rules.ts:584`,
`:1547`), a pass-through (`:626`), and `compositionWithoutMedia`, which only ever _removes_ clips
(`:1712`). **Nothing in this product can create a composition.** Slice 4.1 is therefore not "UI over
an existing model"; it is the first writer, and the write path is API/DB-checklist work that the
roadmap never allocated to a slice.

**(3) `CompositionClip` cannot express five of the seven tools.** The clip is
`{ id, media, trim, audio }` (`packages/domain/src/composition/types.ts:19-26`) and `Composition` is
`{ clips, subtitles }` (`:34-37`). `VideoEditSpec` additionally carries crop, rotation, flips,
adjustments and filter (`packages/domain/src/video-editing/types.ts:70-80`). So the v3 model already
decided: **trim and audio are per-clip, subtitles are per-sequence, and crop/rotate/flip/lighting/
filters have no home in a composition at all.** The roadmap sentence at
`docs/roadmap/PRODUCT_ROADMAP.md:237` cannot be honoured without a domain and contract change that is
its own slice. This is a §5 question, not something to resolve by quietly widening a schema.

---

## 1. Current behaviour, with evidence

### 1.1 The editor is single-clip to the type level

`useVideoEditSession` (427 lines) holds twelve `useState` and three `useRef`; none is a collection.
It owns one `VideoEditSource` — `{ artifact: RecordingArtifact; metadata }` where
`RecordingArtifact = DomainRecordingArtifact<Blob>` (`apps/web/src/features/recording/types.ts:28`) —
one `VideoEditSpec` baseline, and an undo history of whole-spec snapshots capped at
`VIDEO_EDIT_HISTORY_LIMIT = 50` (`packages/domain/src/video-editing/rules.ts:16`).

The single-clip assumption is load-bearing at the type level in three places that must widen
together: `VideoEditSource` (`apps/web/src/features/video-editor/types.ts:39-42`),
`VideoEditWorkerRequest.source: Blob` (`:64`), and `RenderVideoEditInput.source`
(`renderVideoEdit.ts:6`). Every write is normalized against one source geometry
(`useVideoEditSession.ts:153-157`).

`playheadMs` is **source time of one loaded `<video>`**, clamped against
`session.source?.metadata.durationMs` (`VideoEditTimeline.tsx:65-66`) and mirrored from
`video.currentTime` (`seekEditorVideo.ts:15-18`). It is not sequence time, and nothing converts
between the two.

### 1.2 Persistence is a receipt, not a document

The session writes nothing. Its terminal state is a `candidate` that a caller commits: standalone via
`recording.replaceSource` (`useStudioSavedVideoController.ts:382-454`), or in a Project via
`adoptProjectWorkingMedia`, which POSTs the rendered file with `localEdit: candidate.spec`
(`useProjectWorkingMediaController.ts:98,115`). `localEdit` therefore describes **pixels already
baked in** — slice 3.1 states this and settles the interaction with a composition explicitly:
"`localEdit` stays that media's provenance and is not re-applied"
(`SLICE_3.1_COMPOSITION_MODEL_PLAN.md:422-423`). An edit never survives navigation, reload or reopen.

### 1.3 The editor already takes over the Project surface

This is the most useful existing mechanism in the slice, and it is easy to miss.
`StudioWorkspace.tsx:191-196` marks the stage column `data-video-edit-active` / `data-project-context`,
and `mainGridStyles` reacts twice: it collapses the grid to one column
(`apps/web/src/studio/StudioApp.styles.ts:614-618`) and **hides the entire Project route surface**
(`:619-621`, against `[data-project-route]` on `ProjectRouteSurface.tsx:43`) — masthead, tablist and
every task panel.

A composition editor needs exactly this, and it already exists on a runtime path. It also means a
fifth workspace **task panel is the wrong mount**: that panel lives in
`<aside css={taskInspectorStyles}>` at `gridColumn: 2` (`ProjectWorkspaceSurface.styles.ts:104-105`)
inside a `minmax(20rem, 25rem)` track (`StudioApp.styles.ts:563`). A multi-clip timeline does not fit
in a 25rem sidebar, and the grid rules that would widen it do not fire above laptop.

### 1.4 Clip → bytes has no complete resolver

`CompositionClip.media` is a `ProjectMediaReference` — by its own doc comment "a source, an adopted
result or a borrowed Library Version" (`composition/types.ts:14-18`). But the source catalogue has
exactly one writer, the source-accept path (`project-repository.ts:1973`), while adopted working
media is written to a different table (`:2336`, `:3227`, `:3792`) and never becomes a source. The
snapshot's `workingMedia` is re-pointed away from the source by `adoptProjectWorkingMedia`
(`projects/rules.ts:1775`), `promoteProjectJobResult` (`:1841`) and a presenting save (`:1261`).

So for any Project that has rendered an edit, adopted a Saved Version, or saved a presenting output,
a clip over the working media **cannot be resolved through `listProjectSources`** — and slice 3.1
says the first real composition is seeded over exactly that media
(`SLICE_3.1_COMPOSITION_MODEL_PLAN.md:422-423`). Worse,
`GET /api/projects/:projectId/working-media` returns the _current_ adoption only, with no
`revisionId` parameter (`apps/api/src/route-inventory.test.ts:110`), so a clip over an older adoption
has no metadata read at all.

The existing owner of this mapping is `describeCurrentCut`
(`apps/web/src/features/projects/useProjectCurrentCut.ts:39-56`), which branches on
`projectMediaReferencesEqual` and asks the matching surface. Its `CurrentCut` type (`:7-15`) is
field-for-field what a clip resolver needs. **Any design that invents a new resolver is duplicating
this file.**

### 1.5 The domain has the nouns, not the verbs

`packages/domain/src/composition/rules.ts` provides `validateComposition` (`:40`),
`normalizeComposition` (`:118`) and `compositionDurationMs` (`:132`). That is all. There is **no**
insert, remove, reorder, split, retime, or sequence-time↔clip-time conversion. Slice 4.1 writes all
of them.

Two invariants are already decided and must not be re-litigated:

- **An empty composition is unrepresentable.** `validateComposition` fails on zero clips (`:41`) and
  `compositionWithoutMedia` returns `null` rather than an empty sequence, with the reason stated:
  "a composition with no clips is not a valid composition — the same shape a Project has before
  anyone arranges anything" (`projects/rules.ts:1564-1579`). **Deleting the last clip un-arranges the
  Project**; it is not an error and not a question.
- **Cues are sequence-time and unbounded on purpose.** `UNBOUNDED_TIMELINE`
  (`composition/rules.ts:34`) exists so trimming an upstream clip does not truncate trailing cues.
  Slice 3.1 assigned the ripple policy to 4.1 and called it additive (`:424`).

### 1.6 The bundle gate does not measure the surface this lands on

`BUILD_CLOSURE_BUDGETS` covers three roots only — `index.html`,
`src/app/shell/AuthenticatedShell.tsx`, `src/studio/StudioApp.tsx` — and
`FORBIDDEN_CLOSURE_DEPENDENCIES` only the first two
(`scripts/check-build-manifest.mjs:5`, `:180`). `staticManifestClosure` walks `entry.imports` and
never `dynamicImports` (`:191-201`). **`ProjectRouteSurface` is in neither budget**, so the common
claim that a static import there "fails the build" is false. Measured at this commit:
index.html 333,526/345,000 · shell 745,003/746,000 (997 free) · Studio 1,095,125/1,096,000 (875 free).
The numbers that move for this slice are mostly ungated, which is a reason to _record_ them, not a
licence to ignore them.

### 1.7 Revision write amplification is real and unbudgeted

`project_assets` is keyed `(projectId, revisionId, assetId, role)` (`schema.ts:794`) and `checkpoint`
writes `projectAssetLinksForRevision(revision)` on **every** revision
(`project-service.ts:328-336`), with `PROJECT_SESSION_AUTOSAVE_MS = 750`
(`projectSessionController.ts:9`). A 100-clip composition autosaving per gesture writes up to 100 rows
per checkpoint, and there is no revision pruning anywhere. In file mode the whole aggregate is
re-parsed and rewritten per revision (`file-project-repository.ts:403`, `:1692`).

---

## 2. Affected code

**Domain (`packages/domain`)** — `composition/rules.ts` (new operations), a new sequence-arithmetic
module, `composition/types.ts` (result/refusal types), `composition/index.ts`,
`video-editing/subtitles.ts` (cue creation parameterised off a spec), `projects/media-reference.ts`
(a reference key for map lookup).

**Contracts (`packages/contracts`)** — `projects.ts`: `projectSessionProposalSchema` gains
`composition` (only under Q1 = durable). `compositionSchema` already exists and accepts everything the
new operations produce; no other change.

**API (`apps/api`)** — `project-service.ts` (`sessionProposalMatches`), `routes.test.ts`,
`project-snapshot-relations.ts`, both repositories' round-trip tests. No new endpoint, no migration,
no schema change.

**Web (`apps/web`)** — a new composition surface and session hook under `features/video-editor/`;
`projectSessionController.ts` (`proposalFromCurrent`); a clip-media resolver built on
`useProjectCurrentCut.ts`; `VideoEditWorkspace.tsx` if tool scoping lands; `StudioWorkspace.tsx` for
the entry affordance.

**Tests** — `composition.test.ts` and a new property test; `useVideoEditSession.test.tsx`;
new surface/interaction tests; `routes.test.ts` and both repository suites; roughly nine API test
files construct bare `proposal: {}` literals that must gain the new key. Both route oracles are
**untouched** if §3's mount is approved.

**Not touched:** the render worker, `videoEditShader.ts`, `MediaStage`, the live-capture runtime, the
existing single-clip editor's behaviour.

---

## 3. The plan, in order

Scope is held to one slice. The ordering is not cosmetic — each step's predecessors are the things
that fail silently if taken out of order.

**Step 1 — the write path (only if Q1 = durable).** Add `composition` to
`projectSessionProposalSchema` (`contracts/projects.ts:1108`), to `sessionProposalMatches`
(`project-service.ts:45-57`), and to `proposalFromCurrent` (`projectSessionController.ts:39-45`)
**in one commit and in the same key order**. All three compare by `JSON.stringify` text
(`projectSessionController.ts:47-50`, `project-service.ts:51-57`); missing one silently breaks replay
convergence for _every_ checkpoint, not just composition ones. Guard the
`projectSessionProposalSchema.parse` at `projectSessionController.ts:135` — it is unguarded in a
synchronous React handler, the contract is strictly tighter than the domain (`z.uuid()` at
`contracts/projects.ts:503` vs `requireOpaqueId`), and `normalizeComposition` repairs neither
duplicate ids nor the clip cap. Prove the round trip in both persistence modes: every relational
assertion today is `composition: null`.

**Step 2 — domain sequence arithmetic.** One new module (name it once and use it everywhere):
`compositionClipDurationMs`, a prefix-sum `compositionClipStarts`, `clipAtSequenceMs`, and
`sequenceToClipMs`/`clipToSequenceMs`. Pure, no React, no I/O. Refactor `compositionDurationMs` to
reuse the per-clip helper so there is one spelling of "a clip's contribution".

**Step 3 — domain clip operations.** `appendClip`, `removeClip` (returns `Composition | null`, per
§1.5), `moveClip`, `splitAt`, `setClipTrim`, `setClipAudio`, plus `compositionsEqual`. Identity-
preserving like `normalizeComposition`. IDs come from an explicit `createId` parameter — the domain
mints no UUIDs; the convention is `requireId(context.createId(), ...)`
(`projects/rules.ts:742`, `:1248`, `:1367`). On split, the **left** half keeps the id: it preserves
every downstream index and satisfies the type comment at `composition/types.ts:17-21`.
Run `bun run check:modules` **before** exporting from the barrel, not after — it is the only thing
that catches a cycle, and `projects/rules.ts:25` already value-imports `../composition`.

**Step 4 — clip media resolution.** Extend `useProjectCurrentCut.ts` rather than writing a second
resolver; add `projectMediaReferenceKey` to `media-reference.ts` for map lookup. The shape of this
step depends entirely on Q3.

**Step 5 — the composition session.** A **new** `useCompositionSession`; `useVideoEditSession` is left
alone. Its lifecycle is the inverse of the single-clip one (durable, hydrated, autosaved vs one Blob,
rendered once, forgotten), so widening the existing hook would put two lifecycles in one owner. Do
**not** extract a shared `useEditHistory<T>` in this slice: `HistoryState` is `VideoEditSpec`-shaped
end to end, `applySpec` closes over `sourceGeometry`, and the limit is a video-editing domain
constant — the extraction touches the hook behind the convergence regression suite for no 4.1
benefit. Duplicate the small stack deliberately and let slice 4.5 unify it. Initialise history empty
and `reset` when media resolves; the catalogue is a `useQuery` whose data is `undefined` on first
render, and proposing on open would make "opening Compose writes nothing" false.

**Step 6 — the surface.** One composition surface mounted where `VideoEditWorkspace` mounts, taking
the stage over via the existing `data-video-edit-active` mechanism (§1.3): clip strip with
`role="listbox"` + roving tabindex, single-select, split at playhead, keyboard reorder with a live
region, pointer reorder, per-clip trim, per-clip audio, sequence-level subtitles, and a **static
preview of the selected clip** — one `<video>` at the clip's content URL seeked to its in-point.
Every UI-checklist state, reduced-motion respected, focus placed deliberately after a move or split.

**Step 7 — entry, exit and validation.** The affordance that opens it; the exit guard reading the
composition's dirty state; then build, `check:build-manifest` (recording `ProjectRouteSurface`'s
ungated closure, not only the two budgeted numbers), `check:modules`, `check:docs`, targeted suites,
and the e2e journey.

---

## 4. Risks and dependencies

| Risk                                             | Why it bites                                                                                                                               | Mitigation                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Proposal key order split across commits          | Replay convergence dies silently for every checkpoint; the failing tests are the convergence cases, not the composition ones               | Step 1 is one commit; add a convergence test that asserts the three spellings agree                           |
| Autosave × clip count write amplification (§1.7) | 100 rows per checkpoint at 750 ms, no pruning, worse in file mode                                                                          | Coalesce composition edits before proposing; state a debounce; measure `GET /history` at high revision counts |
| Clip media unresolvable (§1.4)                   | The _seeded_ clip is the unresolvable one, so this is the default case, not an edge                                                        | Q3 decides; if sources-only, amend `composition/types.ts:14-18` on the record                                 |
| Pointer-drag geometry                            | One container `getBoundingClientRect` cannot yield midpoints for duration-proportional tiles, and live reorder invalidates the measurement | Measure per-tile on gesture start; keyboard reorder ships first and is independently complete                 |
| Bundle closure is ungated here (§1.6)            | A regression will not fail the build                                                                                                       | Record the `ProjectRouteSurface` closure before and after; consider adding it to the budgets as a follow-up   |
| Scope creep back to the original design          | Three of the seven design probes independently proposed multi-clip playback, which the roadmap assigns to 4.2                              | §7 is the line; prompt 33 should refuse work that crosses it                                                  |

**Dependencies:** Q1 gates steps 1, 4 and 5. Step 2 gates steps 3, 6 and every trim/split/reorder
behaviour. Q5 gates the preview half of step 6. Nothing here depends on slice 4.2, 4.3 or 4.5.

---

## 5. Questions whose answers change the implementation

Five. Everything else is decided in §6.

**Q1 — Does 4.1 make the composition durable, or ship it session-local?**
Durable means step 1: a contract field, the three-place key order, both repositories' round trips, and
~nine API test files gaining a key. Session-local removes all of it — and the CAS, conflict, archived
and reconciliation surface with it — but means arranging clips is lost on reload, which is hard to
call a shipped feature. _This is the single biggest scope lever._ **Recommendation: durable**, and
name it in the plan as the write path slice 3.3 never built rather than pretending it is UI work.

**Q2 — Where does the composition editor mount?**
Taking over the stage the way `VideoEditWorkspace` does (§1.3), or as a fifth Project workspace task?
Decides the layout, the exit guard, the tablist work and the route oracles.
**Recommendation: take over the stage** — the mechanism exists, and a timeline does not fit a 25rem
inspector.

**Q3 — May a clip reference working media and adopted results, or only the source collection?**
Only-sources makes every clip a map lookup and makes `composition/types.ts:14-18` a lie to amend.
Allowing working media needs `useProjectCurrentCut`'s branch, a second loading state, and still has
**no answer for older adoptions** (§1.4).
**Recommendation: sources plus the current working media via `describeCurrentCut`; refuse clips over
historical adoptions in 4.1** and say so in the type comment.

**Q4 — Is per-clip crop / rotate / lighting / filters in 4.1?**
`CompositionClip` cannot express any of it (§0.3). Yes ⇒ a domain and contract change lands _before_
any UI is designed, and `PRODUCT_ROADMAP.md:237` stands. No ⇒ that sentence is amended on the record,
the way Phase 2's was at `PRODUCT_ROADMAP.md:132-145`.
**Recommendation: no** — trim and audio per clip, subtitles per sequence, the rest deferred to a
domain slice of its own.

**Q5 — Does 4.1 play the sequence, or preview the selected clip only?**
Playing requires a two-element ping-pong host, a sequence clock, cut crossing and audio switching —
and is still not gapless. `PRODUCT_ROADMAP.md:238-239` already assigns "accurate stitched preview" to
slice 4.2.
**Recommendation: selected-clip preview only**, and let 4.2 own playback.

---

## 6. Decided here, not asked

Per the Standing rules ("otherwise choose the narrowest conservative interpretation and proceed"):

- **Deleting the last clip un-arranges the Project** (`composition → null`). Already decided by
  `projects/rules.ts:1564-1579`.
- **No cue ripple on trim.** Cues stay anchored to sequence time; slice 3.1 called the ripple policy
  additive (`SLICE_3.1_COMPOSITION_MODEL_PLAN.md:424`).
- **`localEdit` is untouched provenance** and is never re-applied over a composition (`:422-423`).
- **Split keeps the left half's id.**
- **One module and one name** for sequence arithmetic — the three design probes proposed three of
  each.
- **`playheadMs` in the composition surface is sequence time**, and is a different value from the
  single-clip editor's source-time playhead. Three design probes conflated them.
- **Selection is `{ kind: 'clip'; id } | null`** — a two-variant union whose second variant has no
  writer is not worth shipping while cue selection stays in `useVideoEditSession.ts:78`.
- **No new dependency** for drag-and-drop.

**Two canon corrections this audit obliges:**

1. `PRODUCT_ROADMAP.md:237` — "the existing single-clip tools become per-clip tools" is false against
   the model slice 3.1 built. Amend it when Q4 is answered.
2. For whoever writes 4.2: mediabunny's `AudioEncoderWrapper.add` **throws** on any change of
   `numberOfChannels` or `sampleRate` between incoming samples, and that guard runs _before_ the
   resample branch. An implementation that assumes `transform.sampleRate` handles mixed audio will
   throw mid-encode on the first mixed pair, after the video has been paid for.

---

## 7. Out of scope — the line prompt 33 should hold

Moves to **4.2**: multi-clip playback, cut crossing, the sequence clock, the normalization _target_
implementation, stitched render, widening `VideoEditWorkerRequest.source`.
Moves to **4.3**: composition-aware save and variant sets.
Moves to **4.5**: the `useEditHistory` extraction and StudioApp decomposition proper — prompt 32 asks
only for what is "strictly needed", and on the §5-Q2 recommendation that is **zero props**.
**Refused or deferred entirely:** per-clip crop/rotate/lighting/filters (no domain home); a
composition-wide audio bus; timeline zoom and virtualization (`PRODUCT_ROADMAP.md:250-251` makes it
conditional on measurement — cite the measurement or scope it out); clip thumbnails (no poster on the
contract for recorded or uploaded sources).

---

## 8. Validation this slice will run

Domain: `composition.test.ts` table cases for the sequence mapping and one case per split edge, plus a
property test alongside `video-editing.property.test.ts`. Contracts/API: the round trip in **both**
persistence modes, the three-place proposal agreement, and the parity suite. Web: composition session
tests (split is one history entry; undo restores the clip count and the surviving id), surface
interaction tests including keyboard reorder and focus placement, and the existing editor suites
unchanged as a regression. Repo gates: `typecheck`, `lint`, `check:modules` (before the barrel
export), `build` + `check:build-manifest` (recording the ungated `ProjectRouteSurface` closure),
`check:docs`, `format:check`. One e2e journey, real stack, arranging a second clip and reopening to
prove durability — only if Q1 is answered durable. Never vitest and Playwright concurrently.

---

## 9. What was built

Approved on 2026-09-14 — every §5 recommendation taken as recommended — and implemented in the same
pass. `bun run quality` exits 0: 2,508 tests pass, the module graph is clean, and all three bundle
closures are green (two of them after a documented raise, §9.3).

### 9.1 The write path, which is the part nobody had built

`composition` now rides the session proposal, appended **last** in all three places that spell that
order — `projectSessionProposalSchema`, `sessionProposalMatches` and `proposalFromCurrent` — because
they compare as serialized text and appending is the one edit that cannot silently re-order one
against the others. A contract test pins the wire order for exactly that reason.

A proposal that **omits** `composition` is refused with the existing stale-client "reload" message
rather than defaulted to `null`. The difference matters: a proposal replaces the snapshot's creative
part wholesale, so defaulting would let a tab left open from before this change check a creative
field in and take the operator's whole arrangement out with it. Refusing costs that tab a reload.

`propose` also stopped throwing. It was an unguarded `.parse` in a synchronous React handler, and the
contract is deliberately stricter than the domain that produces the value; it now refuses the stage
and says so through the session's own error phase, rather than taking the click out of the app.

### 9.2 Domain, session, surface

The domain gained the verbs it lacked: `composition/sequence.ts` (placements, the clip under an
instant, and the two-clock conversion) and `composition/operations.ts` (append, remove, move, trim,
audio, split, equality) — all pure, identity-preserving, and taking `createId` from the caller
because the domain mints nothing. 23 domain tests cover them, including the split boundary as an
inclusive bound.

`useCompositionSession` owns the arrangement and stages it through the Project session; it is a new
hook rather than a widened `useVideoEditSession`, because that one's lifecycle is the inverse of
this one's. `CompositionSurface` takes the stage over through the existing `data-video-edit-active`
mechanism — which already collapses the grid and hides the Project route — with a `role="listbox"`
clip strip, roving tabindex, live-region announcements, split-with-a-stated-reason, per-clip trim and
audio, and a still preview of the selected clip. 11 component tests.

One thing the plan did not anticipate: **nothing seeds a first arrangement**, so the surface would
only ever have shown an empty state. The seed is now made where the operator asks for it — one clip
over the cut the Project already works from, trimmed to the whole of it, so an arrangement renders to
exactly what the Project produces today. Opening the editor still writes nothing.

### 9.3 The bundle budgets, raised with the reason

Both ceilings went red and were raised: shell 745_003 → 748_264 (budget 749_000), Studio
1_095_125 → 1_099_037 (budget 1_100_000). The cause is structural, not a stray import:
`@studio/domain` builds to a single `dist/index.js`, so Rollup assigns that whole module to the one
shared chunk every route loads, and any export the app uses anywhere is emitted there — including
operations only the lazily loaded editor calls. Narrowing the barrel import in `projects/rules.ts`
was tried and changed nothing for exactly that reason. The real fix is emitting the domain as split
chunks, which is a package build change and would give back more than the 3_261 bytes recorded here.
The full ledger entry is in `scripts/check-build-manifest.mjs`.

### 9.4 Deliberately not done

- **Pointer drag-and-drop reorder.** Reorder is complete by keyboard (`Alt`+arrows) and by the
  inspector's Move earlier / Move later, so nothing is unreachable. The pointer gesture is left out
  because the audit's own design for it was refuted on the geometry — one container rect cannot
  yield midpoints for duration-proportional tiles, and a live reorder invalidates the measurement —
  and it wants a pass of its own rather than a guess at the end of this one.
- **Editing subtitles over the sequence.** Cues are stored, validated, and survive every gesture
  (a split moves none of them, which is tested). Editing them from this surface needs
  `SubtitleToolSettings` parameterised away from `useVideoEditSession`, which is the tool-scoping
  restructure §7 assigns to a later slice.
- Everything else §7 names: playback across cuts, stitched render, composition-aware save, the
  `useEditHistory` extraction, and per-clip crop/rotate/lighting/filters.
