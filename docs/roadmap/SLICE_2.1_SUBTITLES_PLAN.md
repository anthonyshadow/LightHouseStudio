# Slice 2.1 — Subtitles on the single clip: audit and plan

**Document type:** the audit-and-plan output of implementation prompt 13 (Phase 2, slice 2.1 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-02 against commit `e8016356`. Prompt 14 implements
it once approved; prompt 15 verifies. Findings `edit-2` and `prod-2` are in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md); D4 is in
[Decisions required](../DECISIONS_REQUIRED.md). No code was changed by this prompt. **Approved
2026-09-02** with the decisions recorded in §5; D4 is recorded as decided in the same commit.

**In one paragraph.** Nothing in any layer knows what a subtitle is. The single-clip edit
specification (`VideoEditSpec`) is the one thing every renderer, contract and persistence path
already agrees on, so subtitles become a field of it: a list of timed, placed cues owned by the
domain, mirrored by the contract, persisted inside the existing snapshot v2 with no migration, drawn
by the same WebGL frame renderer the preview and the worker already share, and burned into the
pixels wherever that spec is rendered. One decision shapes everything else — _where the burn
happens_ — and it is recorded in §5 with the two that follow from it.

## 1. Current behaviour, with evidence

### 1.1 The edit specification and its rules (domain)

- `VideoEditSpec` is trim, crop, rotation, two flips, six adjustments and a filter — nothing timed
  beyond the trim (`packages/domain/src/video-editing/types.ts:33-41`).
- `createDefaultVideoEditSpec` (`rules.ts:36-44`), `normalizeVideoEditSpec` (`rules.ts:105-129`)
  and `videoEditSpecsEqual` (`rules.ts:177-193`) are the three functions every consumer routes
  through; the session normalizes on every `applySpec`/`previewSpec`
  (`apps/web/src/features/video-editor/useVideoEditSession.ts:137-162`) and derives `dirty` from
  equality (`:97`).
- Time is source time: trim bounds are milliseconds into the source, and the worker converts them
  to seconds for mediabunny (`videoEditRender.worker.ts:127-130`).

### 1.2 The render path (worker) and the preview path (stage)

- One worker renders every local edit and every placement export
  (`renderVideoEdit.ts:95-106` posts the spec unchanged; callers are
  `useVideoEditSession.ts:228` and `export-placements/useExportPlacementRender.ts:92`).
- Inside the worker, mediabunny decodes, trims, crops and scales; each frame is handed to a
  `process` callback that draws it through the shared WebGL renderer into an output-sized
  `OffscreenCanvas` and returns that canvas (`videoEditRender.worker.ts:103-109, 141-149`). The
  renderer receives a `processedSpec` with crop and rotation removed because mediabunny already
  applied them (`:105-109`).
- **Timing inside `process`.** mediabunny 1.54.0 (`apps/web/package.json:22`) re-bases each video
  sample to the trimmed output before the transform runs: `sample.setTimestamp(sample.timestamp −
start)` precedes `source.add(sample)` (`node_modules/mediabunny/dist/modules/src/conversion.js:1022-1025`),
  and `process` is wired into that transform (`:994-995`). So `sample.timestamp` in the callback is
  **output time in seconds, zero at the trim start** — the burn-in must map cue times through the
  trim, not read them raw.
- The fragment shader samples the source through crop/rotate/flip, applies the filter and the
  adjustments, and writes an opaque pixel (`videoEditShader.ts:11-64`). Its public surface is
  `render(source, spec)` and `dispose()` (`:106-109`); the context is created with `alpha: false`
  and no preserved buffer (`:111-117`).
- The stage preview creates the same renderer on a `<canvas>` over the persistent `<video>` and
  redraws on `requestVideoFrameCallback` from `previewSpecRef` (`VideoEditStagePreview.tsx:146-188`).
  In crop mode it draws the full rotated frame with crop removed so the selection can be dragged over
  it (`:127-136`). "Before" hides the canvas entirely (`:257`). Parity between preview and export is
  therefore structural: one shader, two canvases.
- `MediaStage` mounts that preview only while editing (`live-stage/MediaStage.tsx:620-624`); the
  contract it receives is built from the session in `studio/useStudioStageModel.ts:75-104`
  (`spec: videoEditor.draft`, playhead, transaction callbacks).

### 1.3 The editor surfaces

- Five tools in a horizontally scrolling rail (`VideoEditWorkspace.tsx:33-69, 417-428`;
  `VideoEditWorkspace.styles.ts` `editToolRailStyles` is `overflowX: 'auto'` with an overflow cue),
  one inspector body per tool (`ToolSettings`, `:152-320`), the `EditRange` slider primitive that
  groups a gesture into one undo entry via `beginTransaction`/`commitTransaction` (`:109-147`).
- The C-to-compare shortcut already ignores text entry (`isTextEntry`, `:338-343`); Escape collapses
  the inspector (`:383-390`) — both matter once a text field lives in the inspector.
- The timeline is one track: selection band, an invisible playhead `<input type="range">`, and two
  trim-handle buttons with pointer capture and arrow-key nudging in one transaction each
  (`VideoEditTimeline.tsx:144-197`, keys `:108-115`). Frame stepping is 1/30 s (`:18`).
- `VideoEditTool` is a closed union (`video-editor/types.ts:4`); `resetToolSpec` switches on it
  (`useVideoEditSession.ts:40-62`).
- A session always begins from a fresh default baseline on the media currently displayed
  (`useVideoEditSession.ts:98-115`): in a Project that is the already-rendered working media, and
  the applied edit is shown as a historical notice, not reloaded into the controls
  (`studio/projectVideoEditOutcome.tsx:26-33`, mounted from `studio/StudioWorkspace.tsx:259-270`).
  Re-editing a baked edit is the documented §9 gap in
  [TARGET_USER_FLOWS](../product/TARGET_USER_FLOWS.md); subtitles inherit it (see §4).
- No captions glyph exists in the icon set (`ui/primitives/AppIcon.tsx:15-61`). Text inputs exist
  as `TextField`/`TextAreaField` (`ui/primitives/FormControls.tsx:113, 155`) and a `SegmentedControl`
  (`SegmentedControl.tsx:80`).

### 1.4 The contract and both persistence paths

- `projectVideoEditSpecSchema` is strict and refines trim order and crop containment
  (`packages/contracts/src/projects.ts:133-188`). It is reused, not copied, by the snapshot's shared
  shape (`:197`), the session proposal (`:762`), the working-media upload metadata (`:827`, required)
  and the reuse request (`:836`, nullable) — so one schema change reaches every request and response.
- The snapshot is version 2 (`:11`), and the legacy v1 read map shares the same shape (`:330-373`,
  union at `:432-435`), so a field added to the shared shape applies to v1 rows on read as well.
- **Postgres:** every write parses through `projectSnapshotSchema` first
  (`infrastructure/database/project-repository.ts:1628, 1818, 1991, 2137, 3046, 3462`); every read
  goes through `parseSnapshot`, which accepts versions 1 and 2 and parses with the same schema
  (`project-repository-mappers.ts:55-62`). The column is `snapshot jsonb` beside
  `snapshot_schema_version` (`schema.ts:683-684`), guarded by
  `check (snapshot_schema_version in (1, 2))` (`:705-708`, installed by
  `apps/api/drizzle/0018_stormy_darkhawk.sql:43`).
- **File mode:** `storedRevisionSchema.snapshot` is the same `projectSnapshotSchema`
  (`features/projects/file-project-persistence-schema.ts:44-59`); the library format is version 7
  and is not keyed to snapshot contents.
- Consequence: an **additive optional field with a default inside the snapshot** needs no schema
  version bump, no migration, no file-format bump, and is read back as its default from every row
  written before it existed. The roadmap's "cue list inside the existing snapshot jsonb and
  `localEdit` contract" is exactly what the code allows.
- Three places compare edit specs as JSON strings, which makes key order load-bearing:
  `sessionProposalMatches` on the server (`project-service.ts:46-60`), the client's reconciliation
  after an upload that failed to confirm (`useProjectWorkingMediaController.ts:124`), and the replay
  fingerprint (`project-working-media-service.ts:151-162` via `project-request-fingerprint.ts:3-4`).
  The first two must keep working when a field is added; the third only needs identical requests to
  fingerprint identically, which an added field does not disturb.
- The contract constants the domain also owns are mirrored by hand and held together by
  `apps/api/src/shared-contract-parity.test.ts:113-114` (`VIDEO_EDIT_CROP_PRESETS`,
  `VIDEO_EDIT_FILTERS`); a new enum follows the same pattern.

### 1.5 Where the spec is rendered for a Project, and what a placement does

- Project flow: **Render preview** renders the draft (`useVideoEditSession.ts:211-270`), the
  candidate carries `{ validated, spec }` (`:254`), and **Use as the current cut** uploads the bytes
  with `localEdit: candidate.spec` (`useProjectWorkingMediaController.ts:108-116`); the domain
  records that spec on the new revision (`projects/rules.ts:1389-1450`), clears it after a save
  (`:478-504`) and treats it as material state (`:506-518`).
- Placement exports render **from the working media's bytes** — the already-rendered cut — with a
  spec that is `createDefaultVideoEditSpec` plus a centred crop, nothing else
  (`projects/rules.ts:263-276`; `useExportPlacementRender.ts:87-102`;
  `ProjectOutputSaveSection.tsx:393-405`). "Keep as it is" saves reference the cut and render
  nothing (`:505-508`). The chooser already states the crop cost in words
  (`export-placements/placements.ts:94-116`).
- So today a placement rendition sees the working media as pixels. Whatever the edit burned in —
  a filter, a rotation — is cropped by the placement like any other pixel.

### 1.6 What does not need to change

- `renderVideoEdit.ts` and the worker request type carry the whole spec already
  (`video-editor/types.ts:54-71`): cues travel inside it with no protocol change.
- The shared player has no caption track (`video-player/VideoPlayer.tsx:119-120`, finding edit-2)
  and under D4 burn-in it needs none: burned captions are pixels.
- The e2e editor journey runs on WebKit only (`e2e/existing-video.spec.ts:235`, tag
  `@cross-browser`; see [TESTING](../TESTING.md)); the Chromium project needs an untagged journey.
  The fixture is a real 1,000 ms 1280×720 H.264 clip (`e2e/support/existingVideoHarness.ts:125-127`).
- Fonts: the theme's stack is `Inter, ui-sans-serif, system-ui, …` (`ui/theme.ts:220`) and the app
  loads no web font, so text in the page and text in a worker resolve to the same locally
  installed face on the same device.

## 2. Affected code, contracts, storage and tests

| Layer      | Files                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain     | `packages/domain/src/video-editing/{types,rules}.ts`, new `subtitles.ts`; `projects/rules.ts` (export honesty rule only); tests `video-editing.test.ts`, `video-editing.property.test.ts`, `projects.test.ts`                                                                                                                                                                                   |
| Contracts  | `packages/contracts/src/projects.ts` (`projectVideoEditSpecSchema`, mirrored constants); `projects.test.ts`; `apps/api/src/shared-contract-parity.test.ts`                                                                                                                                                                                                                                      |
| API        | No route, service or repository code change. Tests that round-trip a spec gain a cue: `features/projects/routes.test.ts`, `project-working-media-service.test.ts`, `file-project-repository.test.ts`, `infrastructure/database/project-repository.postgres.integration.test.ts`                                                                                                                 |
| Storage    | No migration (`snapshot_schema_version` stays 2; file library stays 7). Verified in prompt 15 across both modes.                                                                                                                                                                                                                                                                                |
| Web editor | `features/video-editor/{types,useVideoEditSession,VideoEditWorkspace,VideoEditTimeline,VideoEditStagePreview,videoEditShader,videoEditRender.worker}.ts(x)`, new `subtitleRasterizer.ts`, both `.styles.ts`; `studio/projectVideoEditOutcome.tsx`; `ui/primitives/AppIcon.tsx` (one glyph). Tests beside each, plus `useStudioStageModel`/`StudioApp.test.tsx` only if the contract shape grows |
| Web export | `features/export-placements/placements.ts` and `ExportPlacementChooser.tsx` (one honesty sentence; §3 step 9)                                                                                                                                                                                                                                                                                   |
| Fixtures   | Literal specs in `useProjectWorkingMediaController.test.tsx`, `VideoEditWorkspace.test.tsx`, `contracts/projects.test.ts`, the two domain tests                                                                                                                                                                                                                                                 |
| E2E        | `e2e/existing-video.spec.ts` (new Chromium caption journey); `e2e/studioVisualMatrix.ts` (`video-edit-subtitles-dirty`)                                                                                                                                                                                                                                                                         |
| Docs       | `feature-behavior/13-local-video-editing.md`, `DOMAIN_MODEL.md:116-121`, `TARGET_USER_FLOWS.md:100-105`, `BROWSER_SUPPORT.md:146-160`, `CLOUD_PERSISTENCE.md`, `CURRENT_STATE_AUDIT.md:192-193` (edit-2 partial closure), `TESTING.md` if it enumerates journeys                                                                                                                                |

## 3. Design and implementation plan (in order)

### The model — one owner, `packages/domain/src/video-editing`

```ts
export const SUBTITLE_CUE_PLACEMENTS = ['top', 'middle', 'bottom'] as const;
export type SubtitleCuePlacement = (typeof SUBTITLE_CUE_PLACEMENTS)[number];

export type SubtitleCue = Readonly<{
  id: string; // app-generated UUID: the editor's selection key and what a retime keeps
  text: string; // ≤ SUBTITLE_CUE_TEXT_MAX_LENGTH (200), ≤ SUBTITLE_CUE_MAX_LINES (3)
  startMs: number; // source time, like trim
  endMs: number; // source time; endMs − startMs ≥ SUBTITLE_CUE_MINIMUM_DURATION_MS (100)
  placement: SubtitleCuePlacement;
}>;

// VideoEditSpec gains one field, last:
subtitles: readonly SubtitleCue[]; // ≤ SUBTITLE_CUE_LIMIT (200), sorted by start; overlaps allowed
```

Why these shapes: **source time** so cues sit beside the trim they belong to and survive a trim
being loosened (a cue outside the trim is kept, not deleted, and simply does not render); a
**placement region** rather than free coordinates so one cue lays out sensibly on every frame shape
the product produces (five placements, portrait and landscape cuts); **overlaps allowed** (decided,
§5) so a speaker label can sit over a running line or a word can be emphasised mid-sentence — cues
active at the same time in the same region stack toward the frame's centre in start order, so the
stacking is a function of the data and never of edit order; **100 ms minimum**, matching
`VIDEO_EDIT_MINIMUM_TRIM_MS`, so word-by-word timing is not ruled out; an **id** because the lane, the
inspector and undo need a stable identity through retimes, and persisting it costs nothing.

Rules, all pure, in a new `video-editing/subtitles.ts` composed by `rules.ts`:

- `normalizeSubtitleCues(cues, source)` — clamp into `[0, durationMs]`, enforce the minimum
  duration, sort by start (then id, so equal starts are stable), cap text length and line count, cap
  the list. Overlaps are left exactly as the operator set them. Text is trimmed and empty text is
  **kept** here: an empty cue is an edit-time state (the user is typing) and must not vanish under
  the normalization that runs on every keystroke.
- `finalizeSubtitleCues(cues)` — what leaves the editor: trimmed text, empty cues dropped. Applied
  by the session when it renders and records a candidate, so a rendered spec is always
  contract-valid.
- `subtitleCuesAt(cues, timeMs)` — every cue covering a time, in start order (often empty, sometimes
  several).
- `stackSubtitleCues(active)` — the render order within a region when several cues are active at
  once: cues stack toward the frame's centre in start order (`bottom`: the earliest sits lowest and
  later ones rise above it; `top`: the earliest sits highest and later ones drop below it;
  `middle`: centred as one group, earliest on top). Pure data in, ordered lines out, so the preview,
  the worker and the lane cannot disagree about which cue is where.
- `outputSubtitleCues(spec)` — cues intersected with the trim and re-based to output time. The single
  owner of the time mapping the worker needs (§1.2).
- `subtitleRegionBox(placement, frame)` — the normalized box a cue lays out in, with insets that
  depend on the frame's orientation: portrait frames keep the bottom band clear (`bottom` inset
  0.22, `top` 0.10) because Reels/TikTok/Shorts overlay their own controls there and because it is
  what survives a 1:1 or 4:5 crop of a 9:16 cut; landscape frames use 0.10/0.08. `middle` is
  centred. Text width is at most 0.8 of the frame; font height 0.045 of the frame height; line
  height 1.25. These numbers are the B prompt's to tune against real frames, but they live here so
  the preview, the worker and the export note cannot disagree.
- `subtitlePlacementsCutByCrop(placements, crop)` — which regions a normalized crop would cut (used
  by step 9).
- `createDefaultVideoEditSpec` gains `subtitles: []`; `normalizeVideoEditSpec` composes
  `normalizeSubtitleCues`; `videoEditSpecsEqual` compares cues field by field. Add `subtitles` **last**
  in both the domain literal and the contract schema so the JSON comparisons in §1.4 keep matching.

### The contract — mirror, default, refine

- `SUBTITLE_CUE_PLACEMENTS`, `SUBTITLE_CUE_LIMIT` and `SUBTITLE_CUE_TEXT_MAX_LENGTH` mirrored in
  `packages/contracts/src/projects.ts` beside `VIDEO_EDIT_FILTERS`, asserted equal in the parity
  test.
- `subtitleCueSchema`: strict object, `id: z.uuid()`, `text: z.string().trim().min(1).max(200)`,
  finite non-negative `startMs`, positive `endMs`, `placement: z.enum(...)`, refine `endMs > startMs`.
- `projectVideoEditSpecSchema` gains `subtitles: z.array(subtitleCueSchema).max(200).default([])`
  and a `superRefine` that rejects cues out of start order and duplicate ids; overlapping cues are
  valid (§5, Q2). The default is what makes this additive: every stored v1/v2 snapshot and every
  existing request parses.
- Contract tests: accepts cues, including two that overlap; defaults a missing list; rejects order,
  empty text, a 200-cue overflow, a non-UUID id. Fixtures gain `subtitles: []`.

### The renderer — captions as a second texture in the one shader

- `createVideoEditFrameRenderer` gains `setOverlay(image: TexImageSource | null)`, which uploads a
  premultiplied RGBA texture to unit 1 (`UNPACK_PREMULTIPLY_ALPHA_WEBGL`) or clears it; `render`
  binds both units; `dispose` deletes both. The fragment shader samples the overlay in **output**
  UV space (`v_uv`, not `sourceUv`) after grading, so text is never cropped, rotated, flipped or
  colour-graded: `color = overlay.rgb + color * (1 − overlay.a)`. Output stays opaque.
- New `subtitleRasterizer.ts` (web, imported by the worker and the preview only — never by anything
  in the shell closure): `rasterizeSubtitleCues(active, frame, layoutBox) → OffscreenCanvas`. One
  function draws the look for the whole active set, region by region in `stackSubtitleCues` order —
  bold sans in the theme's stack, white, on a rounded 55 %-black box per line, centred, greedy word
  wrap to the region width, character-break for a word wider than the box. It measures with the
  canvas's own `measureText`, so it works identically on a page canvas and in a worker.
  Rasterization happens **only when the active set changes** — keyed on the active cues' ids, texts
  and placements — or the frame size changes, never per frame: at 1080×1920 the overlay is one
  8.3 MB canvas and one texture, well inside the 300 MB bound.
- Worker (`videoEditRender.worker.ts`): compute `outputSubtitleCues(request.spec)` once; in
  `process`, `subtitleCuesAt(cues, sample.timestamp * 1000)`; when the active set changes, rasterize
  (or clear) and `setOverlay`; then `render` as today. `processedSpec` is untouched — the renderer
  does not read `spec.subtitles`, the overlay is explicit.
- Preview (`VideoEditStagePreview.tsx`): in the frame loop,
  `subtitleCuesAt(spec.subtitles, video.currentTime * 1000)` — the `<video>` plays the source, so
  source time — with the same rasterize-on-change discipline. In crop mode the layout box is the crop rectangle scaled into the
  displayed frame, so captions are visible while the operator makes room for them. "Before" shows
  none, as it shows no edit.
- WYSIWYG parity is then the same argument the editor already makes for colour: one renderer, one
  rasterizer, two canvases whose only difference is pixel size — and the layout is in frame-relative
  units, so a 1280-wide preview and a 1920-wide export place text identically.

### The editor — a sixth tool, a cue lane, no new primitives

- `VideoEditTool` gains `'subtitles'`; `TOOLS` gains **Subtitles** (new `AppIcon` glyph
  `subtitles`); `resetToolSpec` resets `subtitles` to the baseline.
- Session: `selectedSubtitleId: string | null` + setter (transient, reset in `begin`); `startRender`
  renders and records `finalizeVideoEditSpec(draft)`; `dirty` compares the finalized draft. Ids from
  `crypto.randomUUID()` as `useCharacterWardrobeVariantDraft.ts:25` already does.
- Inspector for the tool: **Add subtitle at playhead** (start = playhead, end = min(start + 2 s,
  trim end), placement `bottom`, text field focused and selected); one fieldset per cue —
  `TextAreaField` (200 max, 3 rows, edits through `previewSpec` bracketed by
  `beginTransaction`/`commitTransaction` on focus/blur so a typed sentence is one undo entry),
  Start/End `EditRange`s with **Set start/end to playhead**, `SegmentedControl` Top/Middle/Bottom,
  **Delete**. Selecting a cue seeks the playhead to its start so the stage shows it. Empty list
  state says how to add one; a "trim hides this subtitle" note when a cue lies outside the trim.
- Timeline: a cue lane under the track, rendered when cues exist or the tool is active. Overlapping
  cues need rows: each cue takes the first row whose last cue ended before it starts (the interval
  colouring every timeline uses), so simultaneous cues sit one above another and the lane grows by a
  row at a time. Each cue is a `button` positioned by percent, `aria-label` "Subtitle n, text,
  start–end", `aria-pressed` when selected; click selects and seeks; drag moves the whole cue in one
  transaction with pointer capture (the trim-handle pattern); Left/Right nudge one frame, Shift ten;
  Delete removes. Edge retiming stays in the inspector, where it is already keyboard-accessible.
- Project notice (`projectVideoEditOutcome.tsx`): the applied-edit baseline names the subtitle count
  and says plainly that changing them means editing again from a cut without them (§4).

### Export honesty (small, and what keeps the placement claim true)

- With the burn at the edit render (§5, Q1), a placement crops captions like any pixel. The
  chooser already says what the crop removes; it gains one sentence when the cut carries subtitles:
  "Subtitles at the bottom stay inside this shape" / "would be cut by this shape", from
  `subtitlePlacementsCutByCrop` against `projectExportPreview`'s rectangle. Inputs it needs are
  already on hand in `ProjectOutputSaveSection` (`latest.revision.snapshot.localEdit`).

### Order of changes for prompt 14

1. Domain types, `subtitles.ts`, rule composition; unit and property tests (stacking order for
   simultaneous cues, clamping, sort stability, output re-basing through the trim, region boxes).
2. Contract schema, mirrored constants, parity test, contract tests; fixture sweep (`subtitles: []`).
3. API tests round-trip one cue through upload metadata, reuse, file repository and the Postgres
   integration test — proving the no-migration claim rather than asserting it.
4. Rasterizer with a scripted 2D-context test (wrap, character-break, box geometry, portrait vs
   landscape insets, two simultaneous cues stacked in one region).
5. Shader overlay + renderer API; shader test extended for the second texture's lifecycle.
6. Worker burn-in; worker test drives the stub runtime's `process` with samples at output times on
   either side of a cue boundary and inside an overlap, **through a non-zero trim**, asserting
   `setOverlay` is called with a rasterized canvas exactly once per change of the active set and
   cleared when it empties.
7. Preview overlay; preview test asserts the same discipline from `video.currentTime`.
8. Session, tool, inspector, lane, icon, styles, Project notice; component tests for add / edit /
   retime / reposition / delete, keyboard on the lane, one-undo-per-gesture, and that C-compare and
   Escape behave with a text field focused.
9. Export sentence; placements and chooser tests.
10. Chromium e2e caption journey: upload the fixture → Edit video → Subtitles → add at playhead →
    type → set end → the lane shows the cue → Save edited video → replacement dialog → Replace
    Without Saving → the edited artifact exists. Visual-matrix case `video-edit-subtitles-dirty`.
    Docs listed in §2.

**Validation (per `CLAUDE.md`):** the domain and contracts package tests plus their direct
consumers; `vitest run apps/web/src/features/video-editor apps/web/src/features/export-placements
apps/web/src/features/projects apps/web/src/studio`; `vitest run apps/api/src/features/projects
apps/api/src/shared-contract-parity.test.ts`; typecheck and lint on touched packages; the targeted
e2e spec and the two editor visual cases; and — because the domain chunk is in the shell closure
(§4) — `bun run build` with `scripts/check-build-manifest.mjs`. Not the whole suite, not Playwright
and Vitest together.

## 4. Risks and dependencies

- **The shell budget will move.** The shell closure is at 727,321 of 728,000 bytes and already
  carries the chunk holding the video-editing rules (measured on the current build manifest: chunk
  `referenceImageRoutes-*.js` is in `AuthenticatedShell`'s static closure). Composing cue rules into
  `normalizeVideoEditSpec` therefore adds their bytes to every authenticated route. Expect a raise of
  about 1,000–1,500 bytes, documented like the three before it; the rasterizer and shader stay behind
  the lazy editor and the shell's `FORBIDDEN_CLOSURE_DEPENDENCIES` (`videoEditShader` is already
  forbidden there). If the raise is judged unacceptable, the fallback is to keep
  `normalizeSubtitleCues` out of `normalizeVideoEditSpec` and call it from the session — the
  invariant still holds at the contract boundary, but the domain no longer guarantees it on every
  normalize.
- **Burned captions cannot be re-edited** — the same limitation as every baked edit today
  (TARGET_USER_FLOWS §9 gap), only sharper because text is what people most want to fix. The notice
  will say so; the structural fix is Phase 3's composition, where cues become composition state
  rendered at the final render.
- **Cross-device fidelity.** The same device draws identical text in page and worker; a different
  device draws the same layout in whatever its font stack resolves to. That is the roadmap's stated
  risk and the price of adding zero bytes. Bundling a face (Q3) removes it at a bundle cost.
- **Worker text APIs.** `OffscreenCanvas` 2D with `fillText`/`measureText` is available wherever the
  editor already runs (it already requires OffscreenCanvas, WebGL and WebCodecs in a worker); Safari
  is the one to verify by hand in prompt 15, as `BROWSER_SUPPORT.md` already says of the codec path.
- **Timing correctness depends on mediabunny's re-basing** (§1.2) — pinned at 1.54.0 and covered by
  the worker test in step 6, so a future bump that changes it fails a test rather than shifting
  captions silently.
- **D4** is recorded as decided (burn-in) in [Decisions required](../DECISIONS_REQUIRED.md) with this
  plan, per the roadmap's "decisions before starting". Prompt 13 was issued with "D4 = burn-in", so
  that was a recording step, not a new decision.

## 5. Decisions (recorded 2026-09-02)

The three questions whose answers change the implementation were put to the product owner with
this plan; the answers below are the ones prompt 14 implements.

**Q1 — Where does the burn happen? Decided: at the edit render, once** (as recommended). Captions
are part of the single-clip edit and are burned wherever that spec is rendered: the standalone
**Save edited video** and the Project **Render preview**. Placement renditions then inherit them as
pixels, and the chooser says when a placement would cut them (§3, export honesty). The alternative —
keep cues as data until each placement render, lay them out per placement — is the better
deliverable for mixed-aspect variant sets, but it makes the working media a cut _without_ its
captions, so the Project stage would need a caption overlay in the player, "Keep as it is" saves
would have to render instead of referencing bytes, the standalone path would still burn at the edit
render, and `localEdit` would describe an edit not yet applied. That is Phase 3's composition model
arriving early; it is taken there, deliberately, when cues become composition state.

**Q2 — Overlap policy. Decided: overlapping cues are allowed** (against the recommendation of one
cue at a time). What that buys: a speaker label can sit over a running line, a word can be
emphasised mid-sentence, and a cue never has its timing silently moved by another cue's. What it
costs, all in §3: a deterministic stacking rule in the domain (`stackSubtitleCues`), a rasterizer
that draws a set rather than a cue and re-rasterizes when the set changes, and a multi-row lane.
Nothing about persistence or the contract grows beyond dropping the overlap refinement.

**Q3 — Font. Decided: the theme's system stack, no bundled face** (as recommended). Bundling one
weight of one face would give cross-device fidelity at roughly 100–300 KB and need `FontFace`
loading in the worker before the first frame; the vision lists caption styling presets as a later
possibility, and that is where a bundled face belongs.

Everything else in §3 is a routine call made the way the nearest existing code makes it, and prompt
14 proceeds on those defaults.
