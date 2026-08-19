## Implementation Prompt — Step 11: Export for a placement

### Objective

Let the operator choose where a video is going — 16:9, 9:16, 1:1, 4:5, or the source shape — and
produce a file that matches, recording the choice on the Project revision.

### Context

Lightframe Studio is a local-first, single-operator browser video studio for marketing video. Today
its output is a single MP4 in whatever shape the source happened to be. There are no channel presets
and no resolution choice.

**The domain was already designed for this and nothing uses it.**
`packages/domain/src/projects/types.ts` defines:

```ts
export interface ProjectExportSpecification {
  readonly container: 'video/mp4';
  readonly aspect: 'source' | '16:9' | '9:16' | '1:1' | '4:5';
  readonly resolution: { readonly width: number; readonly height: number } | null;
  readonly includeAudio: boolean;
}
```

`ProjectSnapshot.exportSpecification` carries it. Searching the repository, the only writers are
test fixtures setting it to `null`. `PROJECT_WORKFLOW_PHASES` also contains `'export'`, which no
domain rule ever sets.

A local render path already exists and works: `apps/web/src/features/video-editor/renderVideoEdit.ts`
drives a dedicated worker (`videoEditRender.worker.ts`) that decodes, transforms via
`videoEditShader.ts` and encodes H.264/AAC MP4, applying a `VideoEditSpec` that already includes crop
and rotate. An aspect change is a crop plus a scale — the machinery is there.

### User Problem

The operator finishes a video and gets one file in one shape. Every real destination — a Reel, a
feed post, a landscape ad — needs a different one, and the product offers no way to produce it.

### Required Behavior

- Before saving a Project output, and when downloading, the operator can choose a placement.
- `source` is the default and takes today's code path unchanged.
- The chosen specification is written into the Project revision snapshot and visible in History.
- The produced file matches the chosen aspect and resolution, with audio preserved unless explicitly
  excluded.
- A browser without the required codec support degrades to `source` with an explanation.

### Existing Areas to Inspect

- `packages/domain/src/projects/types.ts` — `ProjectExportSpecification`, `ProjectSnapshot`
- `packages/domain/src/projects/rules.ts` — `validateProjectSnapshot`, `appendProjectRevision`,
  `saveProjectOutput`, `deriveProjectStatus`
- `packages/contracts/src/projects.ts` — the snapshot and save-output schemas
- `packages/domain/src/video-editing/rules.ts` — `VideoEditSpec` and its validation
- `apps/web/src/features/video-editor/renderVideoEdit.ts`, `videoEditRender.worker.ts`,
  `videoEditShader.ts`, `types.ts` — the existing render path and its supported/unsupported detection
  (`videoEditRenderingSupported`)
- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` — the save flow, its idempotency
  receipt and reconciliation (do not disturb them)
- `apps/web/src/features/saved-videos/useSaveVideo.ts` and `SaveVideoDialog` — the standalone save
- `apps/web/src/features/projects/ProjectHistorySection.tsx` — where the specification should be
  visible
- `packages/contracts/src/video-jobs.ts` — `VIDEO_RESULT_MAX_BYTES`
- `docs/RECORDING_MEMORY_POLICY.md` — the memory constraints any new render must respect

### Scope

- A placement control at the Project save step and in the standalone save dialog.
- Domain validation of the specification (allowed aspect/resolution combinations).
- Writing `exportSpecification` into the revision through the existing revision-append path.
- Applying the transform through the existing render worker.
- A filename that reflects the placement.
- Showing the specification in Project History.

### Out of Scope

- Producing several placements at once — that is the next step's territory.
- Text, captions or overlays.
- Server-side rendering.
- Changing capture aspect ratios in `CaptureSettingsPanel`.
- New providers or any provider submission change.
- Setting `workflowPhase: 'export'` — leave the phase machine alone unless a rule genuinely requires
  it, and if you believe it does, stop and report rather than changing it.

### UX Requirements

- Ask **"where is this going?"**, not "what aspect ratio?". Label placements in plain terms with the
  ratio as secondary detail.
- Preview the crop before committing, and show what will be cropped away.
- Default to `source`, so an operator who does not care is unaffected.
- When the browser cannot render, say so plainly and fall back to `source` — reuse the existing
  "Local editor unavailable" degradation language rather than writing a new one.
- Show progress and offer cancel during the render, matching the existing editor's behaviour.
- Maintain accessibility: the control must be keyboard-operable and labelled, and the preview must
  have a text description of the chosen result.

### Technical Requirements

- **Reuse `renderVideoEdit`.** Express the aspect change as a `VideoEditSpec` crop plus scale. Do not
  add a second render path, a second worker, or a canvas fallback on the main thread.
- Validate allowed combinations in a **domain rule**, not in a component. An unsupported combination
  must be rejected with a domain error, consistent with the existing `ProjectRuleErrorReason` style.
- The specification lives in the revision snapshot, so it must be written through
  `appendProjectRevision` and respect `expectedRevisionNumber`. Do not bypass optimistic concurrency.
- Update `validateProjectSnapshot` to validate the specification when present, and keep `null`
  meaning "source, unchanged".
- Respect `VIDEO_RESULT_MAX_BYTES` and reject an oversized result before publication, exactly as the
  worker already does.
- Respect `docs/RECORDING_MEMORY_POLICY.md`: do not hold the source, the candidate and the encoded
  output longer than the existing edit path does.
- `source` must be a true no-op that takes the current code path — not a render that happens to
  produce the same shape.

### Acceptance Criteria

1. A placement can be chosen at Project save and at standalone save; `source` is the default.
2. Choosing `source` produces byte-identical behaviour to today, with no render invoked.
3. Choosing a placement produces a file matching that aspect and resolution.
4. Audio is preserved unless `includeAudio` is explicitly false.
5. The specification is persisted on the revision and shown in Project History.
6. An unsupported combination is rejected by a domain rule with a clear message.
7. A browser without render support degrades to `source` with an explanation, and saving still works.
8. Existing Projects and saves with `exportSpecification: null` behave exactly as they do today.
9. Optimistic concurrency, idempotency receipts and reconciliation are unchanged.

### Regression Protection

- The Project save path is the most concurrency-sensitive code in the product. Do not modify
  `runOperation`'s receipt ordering, `inFlightRef`, `recoveredRef` or the conflict phase.
- `packages/domain/src/projects/rules.test.ts` and the contract tests must pass; extend them rather
  than relaxing them.
- The snapshot schema is versioned (`PROJECT_SNAPSHOT_SCHEMA_VERSION`). If your change requires a
  version bump, **stop and report** — a migration is a separate reviewed decision.
- Verify the local video editor still works unchanged; you are extending its render path, not
  replacing it.
- Both Project repositories persist the snapshot — verify round-tripping in each.

### Validation

```bash
bun run typecheck && npx vitest run packages/domain/src/projects packages/domain/src/video-editing packages/contracts apps/web/src/features/video-editor apps/web/src/features/projects apps/web/src/features/saved-videos apps/api/src/features/projects
```

Then:

```bash
npx playwright test e2e/successful-studio-journeys.spec.ts
```

### Completion Report

Report the placement options offered and their labels, how the aspect change maps onto `VideoEditSpec`,
the domain rule added and what it rejects, confirmation that `source` is a true no-op, how the
specification reaches the revision without bypassing concurrency control, the memory behaviour of the
new render, the degradation path, and every test extended. State explicitly whether the snapshot
schema version changed — it should not.

### Working rules

Audit the affected area before changing it. Confirm steps 4 and 5 have landed. Trace the full path —
UI → save controller → contract → service → domain rule → repository → snapshot — before editing any
of it. Reuse `renderVideoEdit` and `VideoEditSpec`; do not create a second render path. Make no
unrelated changes and remove no existing functionality. Do not guess: if the phase machine or the
snapshot version appears to need changing, stop and report instead. Maintain responsive behaviour,
accessibility and performance. Update the affected documentation and run `bun run check:docs`. Run
only the checks above. Report exactly what changed.
