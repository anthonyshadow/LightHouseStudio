# Slice 3.4 — Workspace media area: audit and plan

**Document type:** the audit-and-plan output for implementation prompt 31 (Phase 3, slice 3.4 of
the [roadmap](PRODUCT_ROADMAP.md)), written 2026-09-13 against commit `e8d0890d`, followed by the
implementation record. Slice 3.4 has no (A) prompt of its own; the operator asked for the standard
audit-and-plan procedure before the (B) prompt's code. Finding studio-3 and PCD-5 are in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md). The storage half landed in
[slice 3.2](SLICE_3.2_MULTI_SOURCE_PLAN.md).

**In one paragraph.** The API has been able to hold a hundred videos per Project since 2026-09-13
and no surface offers a second one. Three things stand in the way, and only one of them is the
missing list. First, **the capture affordance is switched off by the wrong fact**: three separate
gates — the launch guard, the stage's Record/Stop control group, and the exit guard — all read
`ProjectSourceActivity.accepted`, which means "this Project has an original", as a proxy for
"another capture would be pointless". That proxy was true when a Project could hold one video; now
it is the whole of studio-3. Second, **the exit guard's use of that proxy is load-bearing in a way
that is easy to get wrong**: `hasTemporaryTake` is true for a URL-backed Project source sitting on
the stage, so simply deleting the `accepted` term would make every Project with a source prompt
"discard temporary work?" on the way out. The fact it was standing in for is _owned bytes_, which
the codebase already names (`ownedRecordingArtifact`). Third, **`AddVideoToProjectDialog` refuses
in the browser** what the server now allows, with a sentence telling the operator to find an empty
Project. The plan below adds one surface (`ProjectMediaSection`) with one controller, replaces the
three gates' proxy with the fact, promotes attached-membership videos to the top of the workspace
pickers, and changes no HTTP contract and no schema — everything it needs is already in the
collection response.

## 1. Current behaviour, with evidence

### 1.1 The collection is complete and unreachable

Five endpoints are live and covered by `route-inventory.test.ts:105–109`:

| Endpoint                                         | Answers                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `GET /api/projects/:id/sources`                  | `projectSourceListResponseSchema` — project, revision, every source |
| `POST /api/projects/:id/sources`                 | upload; takes a first source too (`refuseWhenOccupied: false`)      |
| `POST /api/projects/:id/sources/reuse`           | borrow one exact Saved Video Version                                |
| `POST /api/projects/:id/sources/:assetId/remove` | let go of one named source                                          |
| `GET /api/projects/:id/sources/:assetId/content` | ranged bytes for one named source                                   |

No file under `apps/web/src` names any of them. `grep -rn "/sources" apps/web/src` is empty.

### 1.2 Everything the prompt asks a row to show is already in the response

Canon flow 7 asks for "posters, durations, and states".
[`projectSourceCollectionItemSchema`](../../packages/contracts/src/projects.ts) carries
`assetId`, `kind`, `savedVideoId`, `videoVersionId`, `durationMs`, `width`, `height`, `filename`,
`sizeBytes`, `acceptedAt` and `contentUrl`, and the response carries the `revision` whose
`snapshot.sourceAssetId` names the original. So:

- **poster** — `savedVideoThumbnailUrl(savedVideoId, videoVersionId)` for a borrowed Version;
  nothing for an uploaded or recorded one, because `project_sources` stores no thumbnail asset and
  neither does `media_assets`. `WorkPosterTile`'s icon fallback is what every other surface shows
  for media with no poster, and this one shows the same.
- **duration** — `formatDuration(durationMs)`, the same call the picker rows make.
- **state** — the _stored_ state is always ready: the service inspects and stores before it writes
  a row, so "uploading / processing / failed" have no stored representation. They are states of
  the operator's in-flight act, which the surface owns and the server never sees.

**No contract change, no schema change, no migration.** This slice is `apps/web` plus the three
capture gates.

### 1.3 studio-3: the Record affordance dies on `accepted`

| Where                                                                                           | Reads                                                       | Effect                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`useStudioRecordingLaunch.ts:43`](../../apps/web/src/studio/useStudioRecordingLaunch.ts)       | `!projectSourceActivity?.accepted` in `launchableProjectId` | A Record press in a Project with a source returns `null` and starts nothing.                                                              |
| [`StudioApp.tsx:729`](../../apps/web/src/studio/StudioApp.tsx)                                  | `!activeProjectSourceActivity.accepted`                     | `projectRecordingAvailable` is false, so `StudioWorkspace` renders no Project recording control group at all — no Record **and no Stop**. |
| [`ProjectSourceSection.tsx:267`](../../apps/web/src/features/projects/ProjectSourceSection.tsx) | `controller.accepted` in `controlsDisabled`                 | The section's own Record/Upload/Use-a-saved-video are disabled. Correct for that section: the original is immutable.                      |

The first two are the finding. The third is right and stays.

### 1.4 The exit guard reads the same proxy, and the obvious fix breaks it

[`StudioExitGuard.tsx:58`](../../apps/web/src/studio/StudioExitGuard.tsx):

```ts
hasTemporaryTake &&
  (currentProjectId === null ||
    (projectSourceActivity?.projectId === currentProjectId && !projectSourceActivity.accepted));
```

`hasTemporaryTake` is `Boolean(recording.presented)`
([`useStudioSessionLifecycle.ts:105`](../../apps/web/src/studio/useStudioSessionLifecycle.ts)) —
**true for a Project source streamed from the server and presented on the stage**, which is the
steady state of every Project with a video. Only `!accepted` keeps that from blocking navigation.
Delete the term and every Project workspace prompts on exit.

The fact the proxy stood in for is stated three files away, in `startProjectRecording`: "Only owned
bytes raise the question: a URL-backed presentation is a Project source streamed from the server,
durable there, and clearing it loses nothing." So the replacement is
`ownedRecordingArtifact(recording.presented) !== null`, which `StudioApp` already computes for
`retakeAvailable`.

That is also a **fix**, not just a refactor: once a take can become a Project's second video, a
take standing in a Project that already has one is losable work, and today's guard lets it go
silently.

### 1.5 PCD-5: the workspace pickers ignore memberships

[`ProjectSavedVideoList`](../../apps/web/src/features/projects/ProjectSavedVideoPicker.tsx) queries
`savedVideoQueryKeys.lists` and nothing else. Four surfaces mount it or its panel: the source
picker, the current-cut picker, the Save destination chooser, and `ProjectAssetsSection`'s attach
picker. The first three are workspace pickers that should promote attachments; the fourth is where
attachments are _made_, so promoting already-attached videos there would be backwards.

The membership data needs no new query:
[`useProjectAssetsController(projectId, 'video')`](../../apps/web/src/features/projects/useProjectAssetsController.ts)
returns `videoSummaries` — full `SavedVideoSummary` objects — beside the memberships.

### 1.6 `AddVideoToProjectDialog` refuses what the server allows

[`AddVideoToProjectDialog.tsx:46–58`](../../apps/web/src/features/projects/AddVideoToProjectDialog.tsx)
throws `ProjectSourceOccupiedError` — "already has an original video. Choose an empty Project
instead." — for any Project with a source, unless the video is already that source.

### 1.7 What happens to the stage when a take is adopted as additional media

`recordingCandidate` is `recordingLifecycle === 'recorded' ? ownedRecordingArtifact(original) : null`
([`useStudioProjectBridge.ts:143`](../../apps/web/src/studio/useStudioProjectBridge.ts)), and
`commitPresentedTake` sets the lifecycle back to `'recorded'` on every re-presentation
([`useRecording.ts:561`](../../apps/web/src/orchestration/recording/useRecording.ts)). So
**accepting a take does not clear the candidate today** — `ProjectSourceSection` simply stops
rendering the button once `controller.accepted` flips. A second surface offering the same take has
to remember for itself that it already added it, or the operator can add the same recording twice:
`projectUploadAssetId(ownerUserId, operationKey)`
([`project-byte-acceptance.ts:39`](../../apps/api/src/features/projects/project-byte-acceptance.ts))
derives the asset id from the operation key, not the checksum, so a re-upload is a _different_
asset and `acceptSource`'s held-media check does not catch it.

## 2. Affected code

**New:** `ProjectMediaSection.tsx`, `useProjectMediaController.ts`, and their tests.

**Changed:** `projectsApi.ts` (four collection calls), `useProjectsController.ts` (one query key),
`ProjectWorkspaceSurface.tsx` (mounts the section; panel header), `ProjectSavedVideoPicker.tsx`
(optional attached-first grouping), `ProjectSourceSection.tsx` (current-cut/source pickers pass
`projectId`), `ProjectWorkingMediaSection.tsx`, `ProjectOutputSaveSection.tsx` (same),
`AddVideoToProjectDialog.tsx` (stop refusing), `projectProcessingPresentation.ts` (one copy key),
`useProjectSourceController.ts` (drop `accepted` from the reported activity; export the artifact
helpers), `useStudioRecordingLaunch.ts`, `StudioApp.tsx`, `StudioExitGuard.tsx`.

**Docs:** `DOMAIN_MODEL.md` (source media status), `TARGET_USER_FLOWS.md` (flows 7 and 8),
`TARGET_ARCHITECTURE.md`, `PRODUCT_ROADMAP.md`, `CURRENT_STATE_AUDIT.md`,
`17-empty-project-lifecycle.md`.

**Tests:** `ProjectMediaSection.test.tsx` (new), `ProjectSavedVideoPicker` coverage via the
sections that mount it, `useStudioRecordingLaunch.test.tsx`, `useStudioProjectBridge.test.tsx`,
`StudioApp.test.tsx`, `ProjectRouteSurface.test.tsx`, `AddVideoToProjectDialog.test.tsx`, and the
real-stack e2e.

## 3. The plan, in order

1. **Client calls.** Add `listProjectSources`, `addProjectSourceUpload`,
   `addSavedVideoAsProjectSource`, `removeProjectSourceById` to `projectsApi.ts`, sharing the
   request construction with the legacy pair rather than restating it. Add
   `projectQueryKeys.sources`.
2. **The controller.** `useProjectMediaController` owns the list query and four acts: add by
   upload, add by finalized take, add from Videos, remove one. Each flushes the session first (the
   pattern `ProjectWorkingMediaSection` already uses for a revision-appending mutation), carries an
   idempotency key from `useStableOperationKey`, CASes on the session's freshest version,
   reconciles, and invalidates the list.
3. **The surface.** `ProjectMediaSection` renders one row per source — poster, title, duration,
   dimensions, state — with an inline preview (one at a time, like the picker), Remove on
   everything but the original, and four ways to add. It mounts only where the Project has an
   original, so the empty case keeps its single owner in `ProjectSourceSection`.
4. **Capture.** Drop `accepted` from `ProjectSourceActivity` and from the launch guard and
   `projectRecordingAvailable`; give the exit guard `hasOwnedTake` instead.
5. **Pickers.** `ProjectSavedVideoList` takes an optional `projectId` and renders attached videos
   first under their own heading, excluded from the paginated list below.
6. **The dialog.** `AddVideoToProjectDialog` adds to the collection instead of refusing.
7. **Docs and tests.**

## 4. Risks and decisions

| #   | Risk                                                                                                        | Decision                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Deleting `accepted` from the exit guard blocks every Project exit (§1.4).                                   | Replace with `hasOwnedTake`, not with nothing. Covered by a test that a presented remote source does not block.                                                                                                                                                                            |
| 2   | The same take added twice (§1.7).                                                                           | The controller remembers the signature of the take it added and withholds the control for it.                                                                                                                                                                                              |
| 3   | The original appears both in `ProjectSourceSection` and in the media list.                                  | Two different acts. The list marks it **Original** and never offers Remove on it; "Remove original video" keeps one owner. The server agrees: `removeProjectSourceById` on the original with siblings returns a `primary-source` conflict.                                                 |
| 4   | Attached-first grouping could show a video twice.                                                           | The paginated list excludes ids already promoted. Only the first page of memberships is promoted; everything else is still in the list below, so nothing is hidden.                                                                                                                        |
| 5   | Adding media bumps the Project version under an unresolved provider attempt.                                | The run overlay already covers the workspace while a run is in flight; for an unresolved attempt the section reuses `projectProcessingBlockedReason` with its own copy.                                                                                                                    |
| 6   | Recording into a Project that already holds media leaves the take on the stage rather than the current cut. | Accepted, and stated in the UI. The source controller's hydration marker is keyed on the snapshot's `presentedMedia`, which an added source does not change; leaving the workspace and returning re-hydrates. Restoring the cut in place needs the stage-ownership work Phase 4 owns (§6). |

## 5. Questions whose answers change the implementation

1. **Should the Media area be a fifth workspace task?** No — taken as: it belongs in the existing
   `source` task, whose progress step is "Original". A fifth tab would change
   `PROJECT_WORKFLOW_STEPS`, the progress strip, both route oracles and the e2e journey for a
   presentational choice. The panel's heading becomes **Media**; the tab stays **Original**.
2. **Can the original be removed from the Media list?** No (§4.3).
3. **Does the Save destination chooser get attached-first too?** Yes — canon flow 8 says "the
   workspace's pickers", and it is one.

## 6. Follow-ups discovered, not done here

- **Promoting a sibling to original.** The domain refuses changing the original while other media
  is held, and no surface can ask. Needs a rule and a contract; Phase 4.
- **Stage authority inside a Project.** §4.6: after a capture, the stage holds the take while the
  snapshot's `presentedMedia` names the cut, and only leaving the workspace reconciles them. This
  is the same seam as prod-4 (the run overlay) and web-3 (StudioApp decomposition).
- **Resumable uploads.** Canon flow 7 asks for uploads that survive a reload. Still a gap.
- **Composition pruning is written but unreachable.** `compositionWithoutMedia` runs on every
  per-source removal and no writer produces a composition yet (slice 3.3/4.1).
- **A take added to the collection stays "unclaimed" on the stage.** It is never re-presented as
  Project media, so leaving the workspace afterwards asks to discard a recording the Project already
  holds. One extra confirmation, in the safe direction; fixing it properly is the stage-authority
  seam above.
- **The browser now speaks two source contracts.** Every legacy client call has a collection
  equivalent that is a superset of it, so `useProjectSourceController` could drop the `source` half
  entirely — at the cost of no longer exercising `POST /source`'s refusal of a second acceptance.
  Named here rather than done: it moves stage hydration, which this slice deliberately did not.
- **The blocked-reason matrix is still pairwise.** Four writers of Project revisions guard each
  other by hand in three idioms; slice 3.4 added the fifth clause to two of them. One
  `activeRevisionWriter` derived in the workspace would collapse all of it, and would also give the
  merged activity in §7.4 an owner that is not one producer impersonating another.
- **Nothing declares whose media is on the stage.** Three components keep a private copy of artifact
  ids and compare them — the bridge's `presentedArtifactId`, the source controller's
  `hydratedMediaRef`, and the guard's composition of three booleans. The deeper move is to stamp the
  artifact where it is committed (`useRecording`'s two entries into `recorded`) with whether it is a
  capture or a presentation, which would retire `presentedByProject`, `stageHoldsSource` and the
  `claim` channel together.
- **The collection endpoints answer in the single-source shape.** `POST /sources` returns
  `projectSourceResponseSchema`, which has no `assetId` and forces the primary's `contentUrl`, so
  the accepted source's identity is discarded at the boundary and the browser rebuilds the answer by
  diffing the collection. Answering with `projectSourceCollectionItemSchema` would retire the whole
  `landed`/`before`/`loaded` apparatus in §7.4.

## 7. What was built, and what the review changed

Landed 2026-09-13 on `phase3`. §3's order held; §5's three answers all stood.

### 7.1 Validation

`bun run quality` — 2,470 tests passed, 16 skipped, across typecheck, Storybook typecheck, lint,
format, dead code, module graph (zero cycles), script references, doc links, retired-program words,
the full unit/integration suite, the production build, the bundle manifest and the Storybook build.

`bunx playwright test` against a stack pointed at a throwaway database with `ASSET_STORE_PROVIDER=local`
and no provider credentials — **93 passed, exit 0**, including the new second-source journey. The
throwaway database was dropped afterwards and only `lightframe_development` remains, untouched.

### 7.2 Two bundle ceilings were already red, and this slice says so

A clean build at `e8d0890d` measures the shell closure at 750_547 against a 750_000 ceiling, and
Studio's at 1_093_398 against 1_093_000. Slice 3.2's switch stage crossed both and was reported
green because `check:build-manifest` reads whatever `apps/web/dist` holds and nothing had rebuilt
it — `0f819c9e` and `245aa415` both measure 749_092 and 1_091_943, which is what the stale manifest
was still answering with. Both ceilings are raised with that recorded in the ledger, and 253 bytes
of this slice's own growth were recovered first.

### 7.3 What the cleanup review changed

Four reviews ran over the diff. Five findings were behavioural and are fixed here:

1. **The exit guard blocked without prompting.** Whatever blocks a navigation is what the dialog
   then offers to discard, and the two conditions had come apart: a take saved to the library made
   `hasUnsavedTake` false while the block's own term stayed true, so the navigation stopped with
   nothing on screen to answer it. The prompt now reads the same fact.
2. **"Owned bytes" was the wrong fact.** A source uploaded from this browser is owned bytes _and_
   already durable on the server, so the first fix asked to discard temporary work on the way out of
   every Project whose source was uploaded in that session — caught by the real-stack e2e, not by a
   unit test. What tells a take apart from the Project's own media is which door it came through:
   media the Project puts on the stage goes through `ProjectStageSourceRuntime.present`, and a
   capture never does. The bridge already tracked that id for its own use; it now renders it.
3. **The panel showed three dead controls above three live ones.** With an original in place,
   `ProjectSourceSection` rendered a disabled Record, Upload and Use-a-saved-video directly above
   the Media area's working equivalents. They are withdrawn rather than disabled — the original is
   immutable while it is attached, so they were never going to act again.
4. **Starting an AI run was not blocked while media was changing.** The guard was added to the
   original-video removal and not to the Create task's launchers, which is what a pairwise matrix
   guarantees; the fifth clause is now in both.
5. **A recording could be added twice.** Identity came from a reconstructed file signature rather
   than the artifact id the capture graph holds one file away. `ProjectRecordingCandidate` carries
   the id.

Six more were reuse and efficiency, and are also fixed: the double list read and double
`reconcileProject` on every change (`acceptCurrent` already publishes); per-row styles rebuilt
inside the `map`; the picker's derived lists unmemoised; a locally re-implemented `apiErrorMessage`;
the duration badge, inline preview and list reset copied a third time (now
`projectVideoRow.styles.ts`); and the removal reassurance copied word-for-word into a second dialog.

Deliberately skipped, and why: one shared idempotency-signature builder across three controllers
(the client signature only decides when this browser rotates its own key, so the two shapes cannot
drift into a defect); shared test fixtures across four suites (real duplication, but the fix reaches
well outside this diff); a `VideoPreviewRow` component (shape alone is not a reason to abstract);
`staleTime` on the attachments query (an optimisation with a staleness trade this slice did not
ask for); and the three structural findings now recorded as follow-ups in §6.

### 7.4 What the code review changed

A full-recall review of `eb12f77d` found fifteen defects, fourteen of them correctness. All are
fixed in the same branch; the four that mattered most were in the reconciliation this slice wrote.

**Three ways the product asserted something untrue.** `landed` asked whether the collection held
something rather than whether it had _changed_, so a failed upload was announced as added to any
Project that already held anything, and a failed re-pick of a Version already held was announced as
added too. Both predicates are now differences against what was held before the request, and the
controller refuses to conclude anything when the collection was never read — which is also why Add
is now withheld until it has been. The third: a cancel asserted "nothing moved" without asking,
when a cancel stops this browser waiting and does not reach a server that may have committed the
moment before. It now reconciles like every other unknown answer, and no longer resets the
idempotency key, which was inviting the retry that stores a second copy.

**Two controls that could not work.** "Remove original video" stayed live in exactly the state this
slice makes ordinary — the domain refuses it while other media is held — so the only way to learn
was a round trip that always failed; the workspace now reads the domain's own
`projectOriginalIsRemovable` before the press. And a capture launched in a Project with media could
leave the stage blank for good, because the source controller's hydration marker had no way to hear
that something else had taken the stage.

**Two facts that never settled.** A take adopted through the Media area stayed "unclaimed" forever,
so every navigation out of the workspace asked to discard a video already on the server; the claim
now goes through the stage runtime to the bridge, which is the one place that can tell a capture
from media the Project put there. And logout and session expiry still read the broad take fact this
slice had just proved wrong — they read the narrow one now, so logging out of a Project whose video
is merely on the stage no longer offers to discard it.

The rest: the Media area's in-flight work was invisible to the exit guard and excluded its own
multi-minute conversion; two acts could overlap because the busy flag was raised after an awaited
checkpoint; "Record more" swallowed the one refusal it is meant to speak for, and the
unsupported-capture explanation had become unreachable for every Project with an original; add and
remove shared one failure message, so a failed removal said the video could not be added; focus fell
to the document body after removing a row; a stale intake refusal outranked a removal's own outcome;
and the removal dialog ignored a block that arrived while it was open.

The cleanup pass that followed found one regression in the fixes themselves — invalidating the media
collection from `reconcileProject` meant every creative autosave refetched up to a hundred rows, and
the hydration effect could abort and restart its own fetch — plus four duplications worth one owner
each: the Record control's state, the busy-activity shape, the held-Version predicate, and the
original-removal rule, which now lives in the domain beside the rule that enforces it.

### 7.5 What the second cleanup pass changed

A `/simplify` over the fix commit took seven changes and declined six. The declines are recorded
with their evidence, because four of them were argued convincingly and are still wrong.

**Taken.** The media controller's `phase`, `act` and `message` were three states written together
at six call sites and separable only into nonsense — a phase from one act beside the noun of
another is the drift `act` was added to prevent — so they are one `ProjectMediaStatus`, stamped by
a single `report` per transition. The Record control's markup was still duplicated after its state
was given one owner, and the duplicated half was the `aria-describedby` wiring that tells a screen
reader why the control is off; it is a `ProjectRecordingNotices` component now, and the hook
publishes one id rather than an id and a flag. The failure title was spelled in two places that are
read together and had already disagreed on `conflict`. The held-media count rode the Media area's
activity record up into a parent's state so the section next door could apply a domain rule to it —
arriving a render late, and not at all while that section was unmounted; both surfaces observe the
same cache entry through `useProjectHeldSourceCount` instead, and `ProjectMediaActivity` is about
work in flight again. `projectsApi` re-exported three asset calls nothing imported, keeping alive
the module edge the split was made to cut. The add dialog awaited two disjoint invalidations in
series, delaying its own navigation. And an activity effect handed React its callback's return
value as a cleanup.

**Declined.** Putting the presented media's identity on the stage runtime is the right shape — it
would delete the hydration marker, the rehydration counter and the `stageHoldsSource` prop threaded
through four layers — but `mediaArtifactMetadata` mints a fresh `crypto.randomUUID()` per
presentation, so it needs a stable media-derived artifact id first, and that reaches into the
recorder and take review. Dropping `phase` from `ProjectSourceActivity` was argued as a lie in a
dead field; it is asserted in two suites and travels in the record the shell reads.
`projectHoldsSavedVideoVersion` takes a contracts type and the domain is contracts-free, so moving
it there buys a mapper for one predicate. Making `run` call `ensureQueryData` would make the
unknown-collection case impossible rather than merely disabled, but it puts a fetch inside the act
and reopens reconciliation this commit had just settled. A shared `projectApiErrors` module would
draw the api seam at ownership instead of at bundle closure, but both ceilings now sit within a
thousand bytes and that change wants its own measurement. The third hand-rolled
`ProjectSourceCollectionItem` fixture is worth a shared one, but two of the three predate this diff.

**Recorded, not acted on.** The release effect fires when `stageHoldsSource` goes false, which a
Record press does immediately — the capture discards the presentation before any camera starts — so
a Project with an original re-reads and re-presents its media on every press, not only on a capture
the operator abandons. The re-presentation is deliberate and covered
(`ProjectRouteSurface.test.tsx`, "puts the Project back on the stage when a capture takes it away
and leaves nothing"); whether the live preview masks the re-presented media, and what the two round
trips cost on a slow connection, is unmeasured. It is the same mechanism as the first decline above
and should be settled with it.
