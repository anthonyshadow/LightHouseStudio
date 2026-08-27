## Implementation Prompt — Step 4: Save the video in the placement that was chosen

### Objective

Make the video that Lightframe stores actually be in the placement the operator selected, so that
the Save panel's existing promise becomes true.

**This is the highest-value and highest-risk step in this roadmap. Read the whole prompt before
writing anything.**

### Context

Lightframe Studio produces marketing video. In a Project's **Save** tab the operator is asked
"Where is this going?" and chooses a placement — Keep as it is, Widescreen, Phone (9:16), Square
(1:1), or Tall feed post (4:5). The panel then states:

> This frame and the selected placement are what the saved video will use.

**That statement is false today.** What actually happens:

- `saveProjectOutputRequestSchema` (`packages/contracts/src/projects.ts:849`) is
  `{ expectedVersion, expectedRevisionNumber, media, target }`. `media` is a reference to media that
  **already exists**. No re-framed bytes are sent, and no export specification is sent.
- The chosen placement is written to the Project revision snapshot as `exportSpecification` — an
  intent, recorded and displayed in History.
- Re-framing happens **later, in the browser, at download time**, through
  `useSavedVideoPlacementDownload` and the WebCodecs worker — and only when the operator presses a
  specific "Download for phone" control.

The Assets library is candid about this — `VideoExportPanel.tsx:52` says "Re-framing happens in this
browser; the saved version is not changed." So two surfaces make opposite claims about the same
mechanism, and the one that is wrong is the one where the decision is made.

The consequence is that the stored Video is not the deliverable. It cannot be shared, published, or
re-downloaded in the right shape without re-rendering by hand, and on a browser without WebCodecs it
cannot be produced at all.

**The fix reuses what already exists.** Render with the current WebCodecs worker at save time and
upload the result. Do not build a server-side render pipeline — that is explicitly deferred.

### User Problem

The operator specifies the shape their video needs to be, is told it was applied, and receives a
file in the original shape.

### Required Behavior

- Saving with a placement other than "Keep as it is" stores a Version whose bytes are re-framed to
  that placement.
- Saving with "Keep as it is" stores the current cut unchanged, byte for byte.
- The produced Version records the placement it was produced for, readable back from the API.
- Where the browser cannot render, the operator is told **before** saving that the original shape
  will be stored, and the Version records that no placement was applied.
- Saving is idempotent exactly as it is today: a save interrupted by a reload reconciles to one
  Version and does not re-render or re-upload silently.

### Existing Areas to Inspect

Trace the whole save path before changing it — UI → controller → API client → route → service →
repository → storage. Do not infer behaviour from names or tests.

**Web**

- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` — the panel, `runOperation`, the
  pending-operation recovery, and the claim at line 519
- `apps/web/src/features/projects/projectOutputOperationStorage.ts` — how a pending save survives a
  reload
- `apps/web/src/features/projects/projectsApi.ts` — `saveProjectOutput`
- `apps/web/src/features/export-placements/useExportPlacementRender.ts` and `placements.ts` — the
  existing placement render wrapper and the copy derived from the domain
- `apps/web/src/features/video-editor/renderVideoEdit.ts` and `videoEditRender.worker.ts` — the
  renderer, and `videoEditRenderingSupported()`
- `apps/web/src/features/saved-videos/useSavedVideoPlacementDownload.ts` — how re-framing is invoked
  today
- `apps/web/src/features/projects/useProjectWorkingMediaController.ts` — the existing upload path for
  new media on a Project

**Contracts and domain**

- `packages/contracts/src/projects.ts` — `saveProjectOutputRequestSchema`,
  `projectMediaReferenceSchema`, the working-media schema and its 300 MB ceiling
- `packages/domain/src/projects/types.ts` — `ProjectExportSpecification`, `PROJECT_EXPORT_ASPECTS`
- `packages/domain/src/projects/rules.ts` — `projectExportPreview`,
  `defaultProjectExportResolution`, and the revision rules

**API**

- `apps/api/src/features/projects/routes.ts` — the outputs route
- `apps/api/src/features/projects/project-output-service.ts` (and its tests)
- `apps/api/src/features/saved-videos/saved-video-service.ts` — how a Version is created and how its
  thumbnail is produced
- `apps/api/src/features/projects/project-repository.ts` — the interface both repositories implement.
  **Any persistence change must be made in both `file-project-repository.ts` and
  `infrastructure/database/project-repository.ts`.**

### Scope

- Render the selected placement at save time using the existing worker.
- Upload the rendered bytes through the working-media path that already exists, and reference them in
  the save request.
- Persist the applied placement on the produced Version.
- Progress, cancellation and failure handling for a render that now sits inside saving.
- Keep the existing copy and make it true.

### Out of Scope

- **Any server-side render pipeline.** Deferred deliberately.
- More than one placement per save — **but leave room for it.** Prefer a data shape that could carry
  several specifications later over one that forecloses it. Do not build it.
- Changing the placement options, their labels, or their descriptions.
- Assets-side behaviour — the export panel and the Videos library are step 5.
- Changing the source or working-media contracts beyond what this needs.
- Refactoring `ProjectOutputSaveSection` for tidiness.

### UX Requirements

- Saving now takes materially longer. Show **render** progress distinctly from **upload** progress —
  the operator must be able to tell which stage is slow.
- The render must be cancellable, and cancelling must leave the Project unchanged with no Version
  created.
- Where `videoEditRenderingSupported()` is false, say so **before** the save control is pressed, not
  after. The existing warning in `SavedVideoSuccessActions` is the right tone and wording to draw on.
- The success state must name the placement that was actually applied — not the one that was
  requested, if they differ.
- Reuse `StatusNotice` and `ExportPlacementProgress`. Do not hand-roll progress UI.
- The panel must remain usable at 375 px — step 3 repaired that surface, do not regress it.

### Technical Requirements

- **Reuse `renderVideoEdit`.** Do not write a second renderer, and do not duplicate the shader or the
  chunk accumulator.
- The rendered output must agree with what `ExportPlacementChooser` previewed. Both must come from
  `projectExportPreview` and `defaultProjectExportResolution` — do not compute geometry twice.
- **Idempotency is load-bearing.** The render now happens before the save request, so the persisted
  pending operation must cover the whole thing. A recovered save must not re-render and must not
  create a second Version. Read `projectOutputOperationStorage.ts` and preserve its guarantees
  exactly.
- Do not drop `expectedVersion`, `expectedRevisionNumber` or the idempotency key to simplify a call.
- Respect the 300 MB contract ceiling on the rendered output. Fail with an explanation **before**
  uploading, not after.
- Prefer referencing already-uploaded re-framed bytes over adding raw bytes to the save request: it
  keeps the save contract about references and reuses upload machinery that already handles
  checksums, size caps and multipart.
- If you change persistence, change **both** repository implementations and keep them behaviourally
  identical.
- Memory: a rendered video is a large Blob. Release it once uploaded; do not retain it in state.
- Never contact a paid provider. This step touches no provider code.

### Acceptance Criteria

- Saving with a placement other than "Keep as it is" produces a Version whose stored width and height
  match that placement's resolution.
- Saving with "Keep as it is" produces a Version byte-identical to today's behaviour.
- The produced Version records the placement it was produced for, and it can be read back from the
  API.
- Where rendering is unsupported, the operator is warned before saving, the original shape is stored,
  and the Version records that no placement was applied.
- A save interrupted by a reload reconciles to exactly one Version and does not re-render.
- Cancelling the render leaves the Project unchanged and creates no Version.
- A render that would exceed the size ceiling fails before upload, with an explanation that names the
  limit.
- Render progress and upload progress are distinguishable.
- `ProjectOutputSaveSection.tsx`'s existing claim is now true, and has not been weakened to make it
  true.
- Project History still renders the placement of past revisions.
- The panel still works at 375 px.

### Regression Protection

This is the riskiest step in the roadmap. Protect specifically:

- **Idempotency and CAS on the output path.** Both repositories.
- **Pending-operation recovery across reload**, including the "Checking the save that was already
  started. No second save will be created." path.
- **Existing saved Versions** and their thumbnails must be unaffected, and must still download.
- **Version ordinals** and the new-video-versus-add-version choice must behave exactly as today.
- Do not change source or working-media behaviour.
- Do not change what the Project stage displays.

### Validation

Run only what this change touches:

```bash
bun run --filter @studio/api exec vitest run src/features/projects src/features/saved-videos
bun run --filter @studio/web exec vitest run src/features/projects src/features/export-placements src/features/video-editor
bun run --filter @studio/domain exec vitest run
bun run --filter @studio/contracts exec vitest run
bun run typecheck
```

Then the Project journey specs in `e2e/successful-studio-journeys.spec.ts` only. Do not run the full
E2E suite, the production build, or the visual suite unless you changed layout.

### Completion Report

State: every file changed; where the render happens in the save sequence and why; exactly how the
rendered bytes reach storage; how idempotency is preserved across the render and what you did to
prove a recovered save does not re-render; how the placement is persisted on the Version and in both
repositories; the unsupported-browser behaviour and its copy; how the size ceiling is enforced; every
validation command and its output; and any acceptance criterion you could not meet, with the reason.
