# Projects

Projects are the resumable, server-authoritative half of the product. Everything else (Studio,
Assets) is local-first with an explicit save. A Project wraps **one source video** in a
linear revision chain plus durable media pointers.

## Data model

From `packages/domain/src/projects/types.ts` and `apps/api/src/infrastructure/database/schema.ts`.

```text
Project (id, ownerUserId, campaignId?, title, status, version, currentRevisionId,
         currentRevisionNumber, archivedAt, deletedAt, timestamps)
 ├── ProjectRevision[]           append-only; each holds a full ProjectSnapshot
 ├── ProjectAssetLink[]          revision-scoped media lineage
 ├── ProjectAssetMembership[]    non-owning organizational "attached assets"
 ├── ProjectVersionReferenceLink[]  used-by relation to Saved Video Versions
 ├── ProjectJobLink[]            provider operations, bound to the initiating revision
 └── ProjectOutputLink[]         immutable producer provenance for saved Versions
```

`ProjectSnapshot` (`types.ts:151-168`) is the entire creative state of a revision:
`sourceAssetId`, `workingMedia`, `presentedMedia`, `selectedCharacter`, `selectedOutfit`,
`selectedVoice`, `visualTreatment`, `liveMode`, `creativeIntent`, `localEdit`,
`exportSpecification`, `lastSuccessfulOutput`, `workflowPhase`.

### The three media pointers — this is the concept a new user must grasp

| Pointer                      | Meaning                                                                                                                                                                                                                                  | Set by                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Source** (`sourceAssetId`) | The one video the Project is built from. Immutable _while attached_ — `acceptProjectSource` returns an `immutable-source` conflict rather than overwriting it — but `removeProjectSource` can detach it so a different one can be chosen | Upload · finalized recording · reuse of a Saved Video Version             |
| **Working media**            | The current derived result being worked on                                                                                                                                                                                               | Local render adoption, provider job promotion, or reuse of retained media |
| **Presented media**          | What the review surface shows                                                                                                                                                                                                            | Kept equal to working media by every current command                      |

An output can only be saved when `sourceAssetId !== null` **and** `workingMedia` deep-equals
`presentedMedia` (`rules.ts:939-950`, mirrored client-side in
`ProjectOutputSaveSection.tsx:44-51`).

### Statuses

`draft | ready | processing | needs-attention | completed | archived | deleted`. Status is
**derived**, not stored by the client: `deriveProjectStatus` (`rules.ts:610-634`) folds lifecycle
flags, the current provider attempt, source availability, and a validated last output. Transitions
are constrained by `PROJECT_STATUS_TRANSITIONS` (`rules.ts:636-648`).

### Concurrency

Every mutation is optimistic-concurrency controlled by two tokens:

- `project.version` — a CAS token bumped on **every** aggregate mutation
- `project.currentRevisionNumber` — the expected head of the revision chain

Mutations that create side effects also require an `Idempotency-Key` UUID header and are recorded in
receipt tables (`project_operation_receipts`, `project_output_operation_receipts`), so a lost
response can be safely replayed. Conflicts return `409` with a typed `ProjectConflict` body
(`apps/api/src/features/projects/routes.ts:119-127`).

## API surface

| Method   | Path                                                                                 | Purpose                                                                      |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| GET      | `/api/projects`                                                                      | List, `lifecycle=active\|archived`, `campaignId=<uuid>\|none`, cursor paging |
| POST     | `/api/projects`                                                                      | Create (Idempotency-Key required)                                            |
| GET      | `/api/projects/:id`                                                                  | Current project + head revision                                              |
| PATCH    | `/api/projects/:id`                                                                  | Rename (expectedVersion)                                                     |
| POST     | `/api/projects/:id/archive` · `/restore` · `/tombstone`                              | Lifecycle; tombstone requires archived + explicit confirmation               |
| POST     | `/api/projects/:id/campaign`                                                         | Attach/detach campaign membership                                            |
| POST     | `/api/projects/:id/revisions`                                                        | Semantic checkpoint (creative setup autosave)                                |
| GET/POST | `/api/projects/:id/assets`                                                           | List / attach asset memberships                                              |
| DELETE   | `/api/projects/:id/assets/:membershipId`                                             | Detach                                                                       |
| POST     | `/api/projects/:id/source`                                                           | Upload the source (spooled, ≤300 MB, MP4/MOV/WebM)                           |
| POST     | `/api/projects/:id/source/reuse`                                                     | Adopt an exact Saved Video Version as the source                             |
| POST     | `/api/projects/:id/source/remove`                                                    | Detach the current source (CAS body, no Idempotency-Key)                     |
| GET      | `/api/projects/:id/source` · `/source/content`                                       | Metadata / bytes (range-capable)                                             |
| POST     | `/api/projects/:id/working-media`                                                    | Upload a locally rendered edit                                               |
| POST     | `/api/projects/:id/working-media/reuse`                                              | Adopt retained media                                                         |
| GET      | `/api/projects/:id/working-media` · `/working-media/:revisionId/content`             | Metadata / bytes                                                             |
| POST     | `/api/projects/:id/outputs`                                                          | Save the current media as a Saved Video Version                              |
| GET      | `/api/projects/:id/outputs` · `/outputs/:versionId` · `/outputs/:versionId/content`  | Output history and bytes                                                     |
| GET      | `/api/projects/:id/history`                                                          | Revision history                                                             |
| POST     | `/api/projects/:id/processing/submit` · `/retry` · `/cancel` · `/reconcile`          | Provider operations                                                          |
| GET      | `/api/projects/:id/processing/current` · `/history` · `/:operationId/result/content` | Operation state and result bytes                                             |

The source/working-media/output routes are only registered when a project repository exists for the
configured `DATABASE_MODE`; otherwise the routes are absent and the client sees 404
(`app.ts:327,412,507`). `registerProjectRoutes` also throws `503 feature_unavailable` from
`requireService` when the repository is missing.

## Flow: Projects list

**Entry** `/projects` — nav item, dashboard "All Projects", Quick Create ▸ New Project (with
`createIntent` state), or `useRouteBack` fallbacks.

**Journey**

1. `ProjectRouteSurface` sees no project id in the pathname and renders `ProjectsWorkspace`
   (`ProjectRouteSurface.tsx:1196-1200`).
2. Header: `h1` "Projects", subtitle, and one create action — **New Project** (primary).
3. A group filter with two options: **All Active** and **No Campaign** (`:352-369`).
4. Two `ProjectListSection`s render — `lifecycle="active"` and `lifecycle="archived"` — and the
   group filter applies to **both**. Selecting "No Campaign" retitles them "No Campaign" and
   "Archived · No Campaign" and issues `campaignId=none` for each; the archived section used to
   ignore the filter, so half the screen contradicted the other half.
5. Each row shows title, status label, "Updated <date>", and actions:
   - active: **Open** · **Rename** · **Archive**
   - archived: **Open** · **Restore** · **Delete**
6. "N loaded" is shown, not a total; **Load more** appears while `hasNextPage`.

**System behaviour** — `useProjectList` issues
`GET /api/projects?lifecycle=…&pageSize=20[&campaignId=none]`. `NewProjectDialog` owns both create
paths: **Create Project** calls `createNamedMutation`, and **Create without a name** calls
`createMutation.mutateAsync(campaignId)` with a retained idempotency key, posting
`{ title: 'Untitled Project' }`. Both navigate to `/projects/{id}`. The unnamed action reuses the
Campaign already picked in the dialog, which the former standalone **Quick project** header button
could not do.

**States** — loading, error+retry, and distinct active/archived empty states are all present
(`:147-165`).

**Exit** — `/projects/{id}`.

## Flow: Project overview (`/projects/{id}`)

**Entry** — a list row, dashboard Continue Project or Recent Work, a campaign project row, or a
deep link.

**Journey**

1. `useProjectSession(projectId)` hydrates: `GET /api/projects/{id}`. While
   `session.current === null && phase === 'hydrating'`, a `role="status"` "Loading Project…" renders.
   On failure a danger notice offers **Back to Projects** and **Retry** (`:773-798`).
2. Header: a breadcrumb button labelled "← All Projects" or "← {campaign name}", the title, status,
   "Updated", "Revision N", campaign state, a one-line workflow hint —
   _"No source yet • Choose the original video below to begin."_ or
   _"Source ready • {Phase} workflow active."_ — and a `ProjectWorkflowProgress` strip showing
   **Source → Create → Save → History** with the current step marked `aria-current="step"`. The
   strip reports where the Project stands; it is deliberately not a control, because the workspace
   tablist already owns moving between those four tasks.
3. Actions: **Add source** when the Project has no source, **Continue editing** once it does, or
   **View workspace** when archived · **Move Project** · **Rename** · **Archive/Restore** ·
   **Delete Project** (archived only).
4. **Project source.** An active Project with no source renders the Source task directly on the
   overview: Record · Upload · Use Saved Video, the same `ProjectSourceSection` the workspace uses.
   **Record** routes through `startProjectRecording`, which navigates to the workspace before
   opening the camera, and accepting a source from the overview also lands in the workspace, where
   the media stage holding the accepted original is visible. The section is mounted **only** while
   `sourceAssetId === null`; mounting it on a source-bearing Project would make the overview
   re-download the source bytes into a hidden stage.
5. Below that, `ProjectAssetsSection` lists attached asset memberships with a kind filter
   (All / Videos / Characters / Outfits / Voices), thumbnails, and an add flow per kind. A standing
   line under the heading states that attached Assets are not the Project source.

**Create, Save and History still exist only in the workspace.** The overview surfaces the Source
task and the workflow shape; the rest is behind the primary action.

**Exit** — `/projects/{id}/workspace` (via **Add source** / **Continue editing**, or automatically
once a source is accepted from the overview), `/campaigns/{id}`, `/projects`,
`/studio/create?projectId=…`.

## Flow: Project workspace (`/projects/{id}/workspace`)

This is the only organization route that mounts the Studio runtime (`isStudioRuntimePath`), so
recording and preview happen in place.

**Layout** — a masthead (Overview breadcrumb, title, status, a compact `ProjectWorkflowProgress`
strip, and a live "All changes saved / Saving changes / Resolve conflict / Changes not saved"
indicator) plus a four-tab inspector: **Source · Create · Save · History**. The tabs are a proper
ARIA tablist with arrow/Home/End keyboard support.

The masthead strip is the compact `variant="masthead"` of the same component the overview uses, and
the tablist derives its four tasks from the same `PROJECT_WORKFLOW_STEPS` list, so progress and
navigation cannot drift apart. The masthead row is a fixed `3rem`, so the compact variant never
wraps and drops its step labels below `64rem`, leaving ordinals plus per-step `aria-label`.

**Which task opens.** The workspace opens on the step the Project is actually up to, derived from
`workflowPhase` by `stepForSnapshot` — a Project with no source opens on Source, one with a source
on Create, one in `review` on Save, one `complete` on History. That choice is latched on entry: a
phase change mid-session does not move the open panel out from under the operator. An explicit
choice writes `?task=<id>` and outranks both.

`?task=` is a query parameter rather than a path segment because `PROJECT_WORKSPACE_PATH` is
anchored — a `/workspace/create` segment would break `projectIdFromPath`, `isProjectWorkspacePath`,
`isProtectedAppPath` and `canonicalizeLegacyAppPath` at once. It is also invisible to
`StudioExitGuard`, which keys on pathname alone, so switching task cannot read as leaving a Project
with unsaved changes. Task changes `replace` rather than push, or `useRouteBack` would walk back
through tasks instead of leaving the workspace. The parameter survives the login round-trip, so a
deep link to a task returns to that task after re-authenticating.

### Task 1 — Source

Three ways to give the Project its source, plus one way to take it back (`ProjectSourceSection`,
inside `ProjectRouteSurface.tsx`):

| Action                    | Behaviour                                                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Record**                | Calls `startProjectRecording` (`StudioApp.tsx`): discards local work, navigates to the workspace path, focuses the stage, and starts local capture. Stopping produces a finalized artifact; the button then becomes **Use finalized recording**, which posts the file to `/api/projects/{id}/source` |
| **Upload**                | Hidden `<input type="file" accept="video/mp4,video/quicktime,video/webm">`; the file is validated and posted to `/api/projects/{id}/source` with `x-lightframe-project-source` metadata and an Idempotency-Key                                                                                       |
| **Use Saved Video**       | `ProjectSavedVideoPicker` → `POST /api/projects/{id}/source/reuse` with the exact `savedVideoId` + `videoVersionId`. Each row shows a poster thumbnail and duration, and **Preview** plays the exact Version inline before it is committed                                                           |
| **Remove original video** | Shown only once a source exists. A `ConfirmationDialog` explains that the video itself is not deleted, then `POST /api/projects/{id}/source/remove` with both CAS tokens. The Project returns to `draft` on the Source step with its creative setup intact                                           |

Phases render as notices: `hydrating` → "Preparing source", `preparing` → "Uploading and checking
your video…", `saving` → "Saving the source video and this change to your Project", `removing` →
"Removing source", `conflict` →
warning, `error` → danger. Once accepted, the three add-controls are disabled and **Remove original video**
appears beside them. Removal is refused — with the reason stated in the dialog — while a provider
attempt is unresolved, while working media is being adopted, and while a recording is in flight.

On reload, an accepted source is re-hydrated: `GET /api/projects/{id}/source`, then the bytes are
fetched with a 300 MB bound and pushed onto the stage as a recording artifact
(`useProjectSourceController.ts:98-119`).

### Task 2 — Create

Contains three stacked blocks:

1. **`ProjectCreativeCheckpointPanel`** — the bridge between the local Studio creative state and
   the durable Project. Local configuration (character, outfit, voice, prompt, reference) is _not_
   persisted until **Save progress**, which posts `/api/projects/{id}/revisions`. If a
   referenced creative resource has disappeared, a per-issue warning with **Choose another** is
   shown (`ProjectCreativeCheckpointPanel.tsx:52-59`).
2. **`ProjectWorkingMediaSection`** — adopt a locally rendered edit (`POST …/working-media`) or
   reuse retained media (`POST …/working-media/reuse`).
3. **`ProjectProcessingStatusPanel`** — the recoverable provider operation surface, or a neutral
   "Recoverable Project processing ready" explainer. When no processing service is configured the
   panel is replaced by "Processing unavailable" (`ProjectRouteSurface.tsx:942-948`).

### Task 3 — Save

`ProjectOutputSaveSection` (`ProjectOutputSaveSection.tsx`), the most defensively written flow in
the app:

1. Renders only when a source exists (`:243`).
2. Describes the current review media (original / working media / retained Version).
3. **Save as New Video** opens a title dialog whose field is proposed as the Project title plus
   the change being saved (`defaultProjectOutputTitle`), so successive saves from one Project do
   not all reach the library under one name; **Add Version** opens a Saved Video picker then a
   confirm dialog showing the target's current Version ordinal.
4. `begin()` flushes any pending session checkpoint, re-fetches the authoritative project, re-checks
   that ready media still matches, mints an operation id, **persists the pending operation to
   `localStorage`**, and only then posts `/api/projects/{id}/outputs`.
5. On reload, a stored pending operation is replayed in "reconciling" mode so a lost response can
   never produce a duplicate save (`:163-170`).
6. Client failures (4xx/conflict) clear the pending record and refresh authoritative state;
   transport failures keep it and offer **Reconcile saved operation**.
7. A settled save renders `SavedVideoSuccessActions` inside the same polite notice that names the
   Saved Video and Version — **Download** (`downloadSavedVideoUrl` and the retained filename) and
   **View in Assets** (`savedVideoLibraryPath`, the Videos library focused on that record). They
   belong to the settled operation and clear when the next save starts.

Both actions are disabled when archived, busy, `readyMedia === null`, or the project is
`processing`.

### Task 4 — History

`ProjectHistorySection` lists retained revisions and outputs and exposes per-output **Download**
links to `/api/projects/{id}/outputs/{versionId}/content?download=true`
(`ProjectHistorySection.tsx:311, 449`). The Save tab's post-save actions are the other download
affordance inside a Project, reached through the Saved Video content route rather than this
Project-scoped one.

## Flow: Project-scoped provider processing

Distinct from the standalone Studio path because it must survive reload.

1. Preconditions: an accepted source, a saved creative checkpoint, and a configured provider.
2. Submission goes through `POST /api/projects/{id}/processing/submit` with an Idempotency-Key.
   The route requires a trusted origin **and** an explicit video-provider intent header
   (`project-processing-routes.ts:38-45`). The response is `202` for a new operation, `200` for a
   replay.
3. The operation is linked to the exact initiating revision (`ProjectJobLink`).
4. `useProjectProcessingController` polls `/processing/current`.
5. On success, `promoteProjectJobResult` (`rules.ts:1262-1308`) advances working/presented media —
   **only** if the operation is still current and the initiating revision is still head. Otherwise
   the result is retained as `stale` and the UI explains it "cannot replace the current media"
   (`ProjectProcessingStatusPanel.tsx:41-46`).
6. If a submission response is lost, `unverifiedOperationId` renders a warning with **Check same
   operation** rather than a retry, to avoid double provider billing (`:18-30`).
7. **Remove from processing queue** cancels tracking with an explicit warning that the provider may
   still finish and charge.
8. Archiving is blocked while an attempt is active or ambiguous, with a specific reason string
   (`ProjectRouteSurface.tsx:1137-1143`).

Project provider **voice** and **live** starts are deliberately unavailable
(`PROJECT_PROVIDER_START_BLOCKED_REASON`, `ProjectCreativeCheckpointPanel.tsx:14`).

## Getting media into a Project — every path found in code

| Path                                              | Where                             | Result                                                                                              |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace ▸ Source ▸ Upload                       | `/projects/{id}/workspace`        | Source                                                                                              |
| Workspace ▸ Source ▸ Record                       | `/projects/{id}/workspace`        | Source from a finalized take                                                                        |
| Workspace ▸ Source ▸ Use Saved Video              | `/projects/{id}/workspace`        | Source referencing an exact Version                                                                 |
| Overview ▸ Source ▸ Record/Upload/Use Saved Video | `/projects/{id}` (empty Project)  | Source; then lands in the workspace                                                                 |
| Overview ▸ Assets ▸ Import Saved Video            | `/projects/{id}`                  | Asset **membership** only — not the source                                                          |
| Overview ▸ Assets ▸ add video ▸ new/record/upload | → `/studio/create?projectId={id}` | Saves to Assets, then auto-attaches and redirects back to `/projects/{id}` (`StudioApp.tsx`)        |
| Overview ▸ Assets ▸ attached Video ▸ adopt        | `/projects/{id}`                  | **Use as Project source** on an empty Project (confirmed), **Use as working media** once it has one |
| Videos library ▸ ⋯ ▸ Use as Project source        | `/assets/videos`                  | Source of an empty Project — **not** a membership                                                   |
| Quick Create ▸ Video (with a project in context)  | anywhere on a project route       | Same as the Studio path above                                                                       |

The distinction between _source_ and _attached asset_ is load-bearing, so the UI names it: every
action that sets the source says "source", the attached-assets section states that memberships
never change the source, and adopting an attached Video as a source is confirmed because it changes
what the whole Project is built from.

## State and persistence map

| State                                  | Lives in                                              | Survives reload?        |
| -------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Project, revisions, links, outputs     | API + Postgres or local JSON files                    | Yes                     |
| Source / working-media / output bytes  | Local asset store or Cloudflare R2                    | Yes                     |
| Pending output-save operation          | `localStorage` (`projectOutputOperationStorage.ts`)   | Yes — replayed on mount |
| Creative setup before checkpoint       | React state in the Studio shell                       | **No**                  |
| Characters / outfits / prompts         | IndexedDB (+ optional `/api/creative-library` mirror) | Yes, per browser        |
| Recording artifact / presented take    | In-memory blobs                                       | **No**                  |
| Active workspace tab, dialogs, filters | React state                                           | No                      |
| Dashboard onboarding dismissal         | `localStorage`, account-scoped                        | Yes                     |

## Exit points

- Overview ↔ workspace
- `/campaigns/{id}` via the breadcrumb when the project belongs to a campaign
- `/projects` after deleting from the overview (replace)
- `/studio/create?projectId=…` and back again after a save
- Saved Videos library (outputs appear there)

## Unverified

- `GET /api/projects` ordering. `projectsResponseSchema` guarantees no ordering, and the Dashboard
  "Continue Work" panel simply takes `projects[0]`. Whether that is genuinely the most recently
  updated project depends on the repository implementation for the configured `DATABASE_MODE`;
  this was not exercised end-to-end during the audit.
- Behaviour of the archived project list when a campaign filter is active — the code always
  requests all archived projects, but no test asserts the intended behaviour.
