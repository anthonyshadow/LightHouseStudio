## Implementation Prompt — Step 5: Carry the placement with the video

### Objective

Make a saved Video remember the placement it was made for, show it in the Videos library, and open
its export panel on it — so the operator does not have to make the same decision twice.

### Context

Lightframe Studio's Project workspace asks "Where is this going?" and records the answer. Step 4 of
this roadmap made the saved Version actually be in that placement and recorded it on the Version.

The Assets side has not caught up. `apps/web/src/features/video-gallery/VideoExportPanel.tsx:33`
initialises with:

```ts
const [placement, setPlacement] = useState<ProjectExportSpecification | null>(null);
```

Nothing reads the producing Project's placement, or the Version's. So a video saved for
"Phone, full screen" opens its export panel with nothing selected, and the primary control becomes a
plain `Download` of the source shape. The most important decision in the product is silently
discarded at the boundary between Project and Asset.

### User Problem

The operator chooses a placement once in the Project, and has to remember it and choose it again in
Assets — or receive the wrong file without being told.

### Required Behavior

- The Videos library shows each Version's placement, in plain language ("Phone, full screen"), where
  one was recorded.
- The export panel opens with that placement selected.
- Re-framing to a **different** placement remains available and still states honestly that it happens
  locally and does not change the saved version.
- Versions with no recorded placement — everything saved before step 4 — behave exactly as they do
  today, with no placement shown and no empty state implying one is missing.

### Existing Areas to Inspect

Confirm what step 4 actually persisted before building on it; do not assume the field name.

- `apps/web/src/features/video-gallery/VideoExportPanel.tsx` — the panel and its initial state
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — the library, its cards, and where version
  metadata is displayed (this file is large; change only what this step needs)
- `apps/web/src/features/saved-videos/useSavedVideoPlacementDownload.ts` — the render-and-download path
- `apps/web/src/features/saved-videos/SavedVideoSuccessActions.tsx` — how the save moment already
  presents a placement, including its `exportSpecification` prop and the unsupported-browser notice.
  Reuse its language.
- `apps/web/src/features/export-placements/placements.ts` — `exportPlacementLabel`,
  `exportPlacementShortLabel`, `exportSpecificationSummary`. **All user-facing placement wording must
  come from here** so it cannot drift.
- `packages/contracts/src/saved-videos.ts` — the Version contract, as step 4 left it
- `apps/api/src/features/saved-videos/saved-video-service.ts` — where a Version is read back

### Scope

- Read the placement recorded on the Version.
- Show it on the video record in the library.
- Default the export panel's selection to it.

### Out of Scope

- Storing additional re-framed files, or producing more than one placement per Version.
- Changing the export panel's honest statement that re-framing to a _different_ placement happens
  locally and does not change the saved version. That statement is correct and must stay.
- Backfilling placements onto Versions saved before step 4.
- Any change to the Project side.
- Refactoring `VideoGallery.tsx`.

### UX Requirements

- Show the placement as a plain label ("Phone, full screen"), never a ratio or a resolution as the
  primary form. Ratio and pixel size may appear as supporting detail, as
  `exportPlacementHint` already does.
- The primary download control must say what it will produce.
- Changing to a different placement must remain one click — do not bury it behind a disclosure.
- A Version with no recorded placement must show nothing rather than "None" or an empty slot.
- Must work at 375 px.

### Technical Requirements

- This is a read of a value that already exists after step 4. Do not add a new endpoint, and do not
  fetch the producing Project to discover the placement — read it from the Version.
- Reuse the existing placement copy helpers; do not write new wording.
- `VideoExportPanel` deliberately owns its own render-progress state so that frequent progress
  updates do not re-render the poster grid behind it. Preserve that — do not lift state into
  `VideoGallery`.
- Preserve the existing focus-return behaviour on the panel.

### Acceptance Criteria

- A Version saved for a placement displays that placement in the Videos library.
- Opening the export panel for such a Version shows that placement already selected.
- The primary control names what it will produce.
- Choosing a different placement still works, and still states that re-framing is local and the saved
  version is unchanged.
- A Version with no recorded placement renders exactly as it does today, and its download works.
- The panel and the library render correctly at 375 px.

### Regression Protection

- Downloading pre-existing Versions must keep working unchanged.
- The unsupported-browser path — where `render.supported` is false and the panel offers a plain
  download — must be preserved.
- Do not regress the poster grid's render behaviour while an export is in progress.
- Existing tests assert the panel's initial empty selection; update them rather than removing them.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/video-gallery src/features/saved-videos
```

Add `bun run typecheck` only if a contract changed. Do not run the full test suite or the build.

### Completion Report

State: every file changed; where the placement is read from and why that source rather than the
Project; how a Version with no placement is handled; the final wording of the primary control; the
validation commands and their output; and anything about step 4's persisted shape that made this
harder than expected.
