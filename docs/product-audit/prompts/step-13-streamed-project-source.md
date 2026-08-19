## Implementation Prompt — Step 13: Open a Project without downloading the whole video

### Objective

Make a Project with an existing source become interactive without first buffering the entire video
into browser memory, while keeping every operation that genuinely needs complete bytes correct.

### Context

Lightframe Studio is a local-first, single-operator browser video studio.

When a Project with a source is opened, `apps/web/src/features/projects/useProjectSourceController.ts`
hydrates it by downloading the **entire** video into a `Blob` before presenting anything:

```ts
const blob = await mediaBlob(response.source, signal);   // :176
signal.throwIfAborted();
const file = new File([blob], response.source.filename, { … });
runtime.present(projectId, artifactInput(file, response.source));
```

Sources are bounded at 300 MB (`VIDEO_INPUT_MAX_BYTES`). The workspace shows a `hydrating` phase for
the whole download.

The server already supports ranged reads: `apps/api/src/features/saved-videos/byte-range.ts`
(`sendRangedAsset`) serves partial content, and the project source/working-media content routes use
it. The capability exists and the client does not use it.

**The hard constraint is media ownership.** The Studio runtime's artifact lifecycle assumes it owns a
`Blob` — see `docs/RECORDING_MEMORY_POLICY.md`, `apps/web/src/features/recording/types.ts` and the
artifact URL revocation rules. Local editing, provider submission and saving all need complete,
validated bytes.

### User Problem

Resuming work on a Project with a large source is a wait that looks like a hang.

### Required Behavior

- The stage becomes playable from the ranged content route shortly after the Project opens.
- Full bytes are fetched only when an operation requires them: local editing, provider submission and
  save.
- That deferred fetch shows progress, is cancellable, and its failure is recoverable.
- Byte caps, media validation and the memory policy are unchanged.

### Existing Areas to Inspect

Read all of these before writing anything:

- `apps/web/src/features/projects/useProjectSourceController.ts` — `mediaBlob`, `presentAccepted`,
  `presentCurrent`, `hydratedMediaRef` and the hydration effect's identity requirements
- `apps/web/src/features/projects/useProjectWorkingMediaController.ts`
- `apps/web/src/features/recording/types.ts` — `RecordingArtifact` and the ownership contract
- `apps/web/src/studio/useStudioProjectBridge.ts` — `runtime.present`, `artifactInput`
- `apps/web/src/features/live-stage/MediaStage.tsx` — how the stage consumes an artifact
- `apps/web/src/adapters/api-client/readBoundedBlob.ts` — the bounded reader and its guarantees
- `apps/api/src/features/saved-videos/byte-range.ts` — `sendRangedAsset`
- `apps/api/src/features/projects/routes.ts` — the source and working-media content routes
- `apps/web/src/features/video-editor/useVideoEditSession.ts` — what the editor requires
- `apps/web/src/features/existing-video/useExistingVideoWorkflow.ts` — what provider submission
  requires
- `apps/web/src/studio/StudioExitGuard.tsx` — what it treats as unsaved work
- `docs/RECORDING_MEMORY_POLICY.md` — the constraint this change must not weaken

### Scope

- Present the Project stage from the content URL rather than an owned `Blob`.
- Introduce a media representation that is explicitly either **URL-backed presentation** or **owned
  bytes**, and make every consumer declare which it needs.
- Acquire owned bytes on demand for editing, provider submission and save, with visible progress and
  cancel.

### Out of Scope

- The byte store, the size caps, or the memory policy's limits.
- Server-side transcoding or adaptive streaming.
- The recording path — a freshly recorded take is already owned bytes and must stay that way.
- Saved-video playback in the Videos library, which already streams.
- Any change to provider submission semantics, validation or cost handling.

### UX Requirements

- The stage should be interactive as soon as the first frames are available.
- When an operation needs full bytes, say so with progress and a cancel — do not silently block.
- A cancelled or failed acquisition must leave the Project in a usable state, not a broken one.
- Preserve the existing `ProjectSessionNotice` and source-activity messaging semantics.
- Maintain responsive behaviour and accessibility on the workspace.

### Technical Requirements

- **Do not weaken `docs/RECORDING_MEMORY_POLICY.md`.** The goal is to fetch **later**, not to hold
  more. Peak memory must not increase.
- Owned-byte acquisition must still go through `readBoundedBlob` with the existing caps and content
  type checks. Do not introduce a second, unbounded read path.
- `hydratedMediaRef` currently prevents re-hydration and is cleared deliberately when media is
  re-accepted. Preserve that logic exactly under the new model.
- `acceptOverviewSource` has a deliberately stable identity because the hydration effect depends on
  it. Do not destabilise it.
- Artifact URL lifetime rules must be preserved: a replacement commits before the superseded URL is
  revoked.
- `StudioExitGuard` must continue to treat the same conditions as unsaved work. A URL-backed
  presentation is not unsaved work; an in-flight acquisition is not either — verify both.
- If any consumer cannot be made to declare its requirement without a broad refactor, **stop and
  report** rather than partially converting the ownership model.

### Acceptance Criteria

1. A Project with a large source becomes interactive without a full download.
2. Local editing, provider submission and save all still receive complete, validated bytes.
3. The deferred acquisition shows progress, can be cancelled, and recovers from failure.
4. Byte caps, content-type validation and media-fact validation are unchanged.
5. Peak memory does not increase for any workflow.
6. Re-accepting media still re-hydrates correctly, and the exit guard behaves identically.
7. The recording path is untouched.

### Regression Protection

- This step touches the artifact ownership model that the exit guard, the editor and the save path
  all depend on. **Do it alone. Do not combine it with any other change.**
- All Project, video-editor and orchestration tests must pass without weakening.
- Verify the take-review, existing-video and voice flows still receive owned bytes.
- Verify that leaving a Project mid-acquisition is safe and does not leak a reader or a listener.

### Validation

```bash
bun run typecheck && npx vitest run apps/web/src/features/projects apps/web/src/features/video-editor apps/web/src/features/existing-video apps/web/src/orchestration apps/web/src/studio apps/api/src/features/projects
```

Then:

```bash
npx playwright test e2e/successful-studio-journeys.spec.ts
```

### Completion Report

Report the media representation introduced, every consumer and which mode it declares, how
`hydratedMediaRef` and `acceptOverviewSource` semantics were preserved, the measured or reasoned
peak-memory comparison, the cancellation and failure behaviour, and confirmation that the exit guard
and the recording path are unchanged. If you stopped short of full conversion, say exactly where and
why.

### Working rules

Audit the whole media-ownership path before changing any of it. Confirm step 6 has landed. This is
the highest-risk step in the roadmap for its size — understand the artifact lifecycle from the code
and from `docs/RECORDING_MEMORY_POLICY.md` before editing. Make no unrelated changes and remove no
existing functionality. Do not guess: if a consumer's requirement is unclear, trace it; if it cannot
be resolved, stop and report. Maintain responsive behaviour, accessibility and performance. Update
`docs/RECORDING_MEMORY_POLICY.md` if the change affects what it describes, and run
`bun run check:docs`. Run only the checks above. Report exactly what changed.
