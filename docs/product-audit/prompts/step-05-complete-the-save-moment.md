## Implementation Prompt — Step 5: Complete the save moment inside a Project

### Objective

Make saving a Project output end with the finished file in the operator's hands and a
distinguishable name on the record — matching the quality of the standalone Studio save path.

### Context

Lightframe Studio is a local-first, single-operator browser video studio. There are two paths that
produce a Saved Video:

1. **Standalone Studio save** — ends with `SaveVideoSuccessPanel` and the inline
   `SavedVideoSuccessActions`, offering **Download · View in Assets · Create another**.
2. **Project output save** — `apps/web/src/features/projects/ProjectOutputSaveSection.tsx`. It is
   the more careful of the two: it writes an idempotency receipt to storage _before_ the request via
   `projectOutputOperationStorage.ts`, so a reload mid-save reconciles rather than duplicating. But
   it ends with a status message and **no download**, and it seeds the title from
   `current.project.title`, so successive saves from one Project produce identically-named records.

Observed in the running product: multiple Saved Videos titled "Untitled Project", none of which can
be told apart in the library.

### User Problem

The operator completes the work and then has to navigate elsewhere to get the file, and later cannot
tell their saved records apart.

### Required Behavior

- A successful Project output save offers **Download** and **View in Assets** without leaving the
  Save tab.
- The default title for a new Saved Video distinguishes successive saves from the same Project.
- The title field is visible and editable before the save is committed.
- All existing concurrency, idempotency and reconciliation behaviour is unchanged.

### Existing Areas to Inspect

- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` — `runOperation`, the `OutputPhase`
  state machine, the `saved` notice, the new/append dialogs
- `apps/web/src/features/projects/projectOutputOperationStorage.ts` — the pending-receipt contract
- `apps/web/src/features/saved-videos/SavedVideoSuccessActions.tsx` — the component to reuse
- `apps/web/src/adapters/api-client/savedVideosApi.ts` — `downloadSavedVideoUrl`
- `apps/web/src/features/saved-videos/useSaveVideo.ts` — how the standalone path derives its title
- `apps/api/src/features/projects/project-output-service.ts` and
  `packages/contracts/src/projects.ts` — the save contract and its response shape
- `apps/web/src/features/projects/ProjectOutputSaveSection.test.tsx`

### Scope

- Render `SavedVideoSuccessActions` on the Save tab after a successful save, using the response's
  Saved Video and current Version.
- Improve the default title so repeated saves from one Project are distinguishable.
- Make the title field prominent in the new-Video dialog.

### Out of Scope

- Export presets or aspect selection — that is a later step.
- Any change to the save request, response, idempotency key, receipt storage or reconciliation.
- The standalone Studio save path.
- The append-to-existing-Video flow's target selection.
- Renaming existing Saved Videos.

### UX Requirements

- Success should read as an outcome, not a receipt: name the video, name the version, offer the file.
- Reuse the existing `SavedVideoSuccessActions` styling and labels; do not write a second download
  link.
- Keep the existing polite live-region announcement; the actions are additive to it.
- Preserve focus behaviour — do not steal focus from the operator when the actions appear.
- Maintain the mobile Project output review layout that `e2e/accessibility-responsive.spec.ts`
  covers.

### Technical Requirements

- Use `downloadSavedVideoUrl` and the retained filename. Do not construct a URL by hand.
- The response already carries the Saved Video and its current Version; do not add a fetch.
- Do not change `inFlightRef`, `recoveredRef`, the pending-receipt write ordering, or the
  `conflict` / `reconciling` phases.
- The default title must be derived deterministically. Do not call `Date.now()` inside render.
- Keep `projectQueryKeys` and `savedVideoQueryKeys` invalidation exactly as it is.

### Acceptance Criteria

1. After a successful "Save as new Video", the Save tab offers Download and View in Assets.
2. After a successful "Add Version", the same actions appear for the new Version.
3. Two successive saves from one Project produce two distinguishable default titles.
4. The title is editable before saving.
5. Reload-mid-save still reconciles to exactly one Version, with the recovered messaging unchanged.
6. A conflict still produces the existing conflict phase and message.

### Regression Protection

- The idempotency and reconciliation tests in `ProjectOutputSaveSection.test.tsx` must pass without
  weakening.
- Verify that a save which reconciles after reload does not double-invalidate queries or show the
  success actions twice.
- Do not change the `archived` or `processing` guards that disable saving.

### Validation

```bash
npx vitest run apps/web/src/features/projects/ProjectOutputSaveSection.test.tsx apps/web/src/features/saved-videos apps/api/src/features/projects
```

### Completion Report

Report where the success actions were mounted, the default-title rule, how it stays deterministic,
confirmation that the receipt/reconciliation path is untouched, and the tests added or updated.

### Working rules

Audit the affected area before changing it. This is the most concurrency-sensitive surface in the
product — understand `runOperation` fully before editing it, and change presentation only. Reuse
`SavedVideoSuccessActions` and `downloadSavedVideoUrl`. Make no unrelated changes and remove no
existing functionality. Do not guess. Maintain responsive behaviour and accessibility. Run only the
checks above. Report exactly what changed.
