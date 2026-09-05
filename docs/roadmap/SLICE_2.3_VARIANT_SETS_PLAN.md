# Slice 2.3 — Variant sets: one save, several placements — audit and plan

**Document type:** the audit-and-plan output of implementation prompt 17 (Phase 2, slice 2.3 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-05 against commit `f996f8cc`. Prompt 18 implements
it once approved; the slice has no separate verification prompt (prompts 17, 18 and 19 are A, B, B),
so §6 is left for prompt 18's own validation report. Findings PCD-3, DC-14 and db-11 are in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md); D10 is in
[Decisions required](../DECISIONS_REQUIRED.md). No code was changed by this prompt. **Approved
2026-09-05** with every recommendation in §5 taken as the answer; D10 is recorded as decided in the
same commit.

**In one paragraph.** One save is already shaped for several placements — the request carries a
`renditions` list and every Version records its own placement — but exactly one is let through, at
the contract cap, the service's `.at(0)`, the deterministic Version id, the single-Version unit of
work in both persistence modes, the single-valued receipt and result, and a browser that renders
once, uploads once and remembers one upload key in memory. The slice widens that one path rather
than adding a second: the request carries the set (cap raised from one to the four placement
aspects, distinct by aspect), the revision keeps its single chosen placement as the operator's
intent, the server derives which member is the _primary_ and writes it last so every existing
pointer — the Saved Video's current Version, the Project's `lastSuccessfulOutput`, the receipt's
scalars, the result's `output` — keeps its meaning and its validators unchanged, and the only new
server-side durable state is a nullable `variantSetId` on every Version, added by one expand-first
migration and a defaulted field in file mode. The browser renders placements strictly serially from
one held source, persists each placement's upload key in a browser-side preparation record before
the first render so a reload never renders or uploads a finished member twice, keeps going when one
member fails, saves the produced subset in one all-or-nothing request, and offers a retry that joins
the same set. Two decisions shape everything else — where the set lives and what a failed member
costs — and both are in §5 with the two that follow from them and one test-engine question.

## 1. Current behaviour, with evidence

### 1.1 One placement per save, at every layer

- **Contract.** `saveProjectOutputRequestSchema.renditions` is
  `z.array(projectOutputRenditionSchema).max(1).default([])`
  (`packages/contracts/src/projects.ts:977`). The comment above it already frames the list as "one
  day expected to produce several placements at once" and the default as what lets a receipt
  written before the field replay (`:972-976`). A rendition is always freshly uploaded bytes plus
  the specification they were made for (`:958-964`). Nothing tests the cap: the one request parse
  in `packages/contracts/src/projects.test.ts:636` omits the field and exercises only the default.
- **Service.** `#resolveRendition` reads `request.renditions.at(0)`
  (`apps/api/src/features/projects/project-output-service.ts:268`), requires it to be
  JSON-identical to the revision's single `exportSpecification` (`:272-279`). The comment at
  `:270-271` gives the reason as: bytes produced for some other placement "would put a shape on
  the Version that Project History never records"; one placement per revision is implied only by
  the single field read at `:272`. It then opens the asset, streams the whole file to a private
  temp directory for inspection, removed in a `finally`
  (`apps/api/src/features/projects/project-media-inspection.ts:27-35`), and checks the manifest
  and the frame (`:284-291`). The cut's own read and the rendition's read run concurrently under
  `Promise.all` (`:339-344`). One `StoredVideoVersion` is built with
  `ordinal = versions.length + 1` and the rendition's specification (`:372-397`);
  `presentsOutput = rendition === null` (`:357`); the domain transition takes that one id
  (`:424-438`). The try/catch that maps a `ProjectRuleError` to `AppError(409, 'conflict')` wraps
  only the `saveProjectOutput` call (`:439-444`); a non-throwing `!transition.ok` is returned as a
  conflict object (`:445`), and nothing thrown inside `#resolveRendition` is mapped.
- **Ids.** Every id a save mints is
  `deterministicUuid('lightframe:project-output:v1:${owner}:${operationId}:${purpose}')` with
  exactly three purposes (`:59-64`), so one operation can name one Saved Video, one Version and
  one post-save revision. No test asserts the id string.
- **Domain.** `saveProjectOutput` takes one `videoVersionId`
  (`packages/domain/src/projects/rules.ts:991`), appends one `ProjectOutputLink` and one post-save
  revision (`:1096-1135`), sets one `lastSuccessfulOutput` (`:1092`) and decides what is presented
  from `presentsOutput` (`:1082-1084`). It refuses a Version that already appears in
  `aggregate.outputLinks` (`:1069`), but that refusal is vacuous in production: the only caller
  hands it `projectAggregateForCurrent(current)` (`project-output-service.ts:425`), which
  hard-codes `outputLinks: []` (`apps/api/src/features/projects/project-repository.ts:83-90`).
  Duplicate provenance is actually refused by the repositories — file mode scans every Project's
  `outputLinks` (`file-project-repository.ts:2368-2374`) and Postgres relies on the
  `project_outputs` key with `onConflictDoNothing` on `video_version_id`
  (`apps/api/src/infrastructure/database/project-repository.ts:3832-3859`). The post-save revision
  clears the creative selections but keeps `exportSpecification` (`:1087`, `:480-500`) — which is
  why three placements cost three rounds that each clear the setup
  (`docs/DECISIONS_REQUIRED.md:124-125`).
- **Snapshot.** The revision records one placement:
  `exportSpecification: ProjectExportSpecification | null` (`packages/domain/src/projects/types.ts:168`),
  mirrored at `packages/contracts/src/projects.ts:251,259`, hand-compared by both checkpoint no-op
  matchers (`apps/api/src/features/projects/project-service.ts:45-59`,
  `apps/web/src/features/projects/projectSessionController.ts:43-49`), and part of
  `materialSnapshot` (`rules.ts:502-514`) so a placement change after a save clears
  `lastSuccessfulOutput` (`:1190-1196`). **`source` is not always null.** The comment at `:112-119`
  and the canonical producer `projectExportSpecificationForAspect` (`:175-186`, returns null for
  `source`; the chooser's only producer at `ExportPlacementChooser.tsx:230`) encode `source` as
  null, and null always reads back as `source` (`projectExportAspectOf`, `:188-190`) — but
  `source` is a member of `PROJECT_EXPORT_ASPECTS` (`types.ts:140`),
  `validateProjectExportSpecification` accepts a non-null `{ aspect: 'source', resolution: null }`
  (`:228-236`), `validateProjectSnapshot` validates only a non-null value (`:428-430`) and the
  contract allows the aspect (`packages/contracts/src/export-placements.ts:13`). A stored non-null
  `source` specification is therefore a legal snapshot and Version state, and
  `project-output-service.ts:273` tolerates it only by accident (it fails
  `projectExportMatchesFrame` because its resolution is null). Placement-ness must be tested with
  `isProjectExportPlacementAspect(spec.aspect)` / `projectExportAspectOf`, never with `!== null`.
  The four placement aspects each have exactly one size (`:135-142`) and one filename tag
  (`:144-149`, `:304-315`).
- **Persistence.** Both unit-of-work implementations assert exactly one Version per commit:
  Postgres refuses a create aggregate with `versions.length !== 1`
  (`infrastructure/database/project-repository.ts:3383`) and an append whose
  `ordinal !== currentVersion.ordinal + 1` or `sourceVersionId !== expectedVersionId`
  (`:3445-3455`); file mode asserts `ordinal !== current.versions.length + 1` and the same source
  rule (`file-project-repository.ts:270-279`). The port takes one `version` and one `output`
  (`features/projects/project-repository.ts:342-345`) and requires one authority transaction
  (`:312-316`).

### 1.2 What one save writes, and how it replays

- All metadata commits in one transaction, in this order in Postgres: lock and re-read the
  receipt (`infrastructure/database/project-repository.ts:3294-3300`), CAS project version and
  revision number (`:3352`, `:3362`), lock and CAS the append target on both `currentVersionId`
  and the video's `revision` (`:3420-3423`), insert the receipt (`:3579`), the Version (`:3630`),
  bump the video once (`:3637`), insert `project_outputs` (`:3647`), the revision (`:3660`).
  Validation aborts before any write; the commit is all-or-nothing. `validNextState` pins the
  receipt scalars, the result's `output` and `savedVideo.currentVersion`, and
  `lastSuccessfulOutput` to the one Version (`:3495-3532`); the hydration record must not claim the
  output's identity unless it presents it (`:3476-3482`). File mode has the same shape: append to
  the saved-video library (`file-project-repository.ts:2278`), write a prepared journal naming a
  single `videoVersionId` (`:2417`) whose `writes.savedVideos` embeds the whole saved-video library
  (`:2421`, `file-project-persistence-schema.ts:667`), validate the same way (`:2336-2374`), then
  commit; recovery replays the journal, proven at all three interruption hooks
  (`project-output-service.test.ts:452-504`).
- The receipt row carries scalar `savedVideoId`/`videoVersionId` and the whole result as JSON,
  keyed by `(ownerUserId, operationId)` (`apps/api/src/infrastructure/database/schema.ts:1158-1168`).
  The journal's `project-output-save` operation carries the same scalars
  (`file-project-persistence-schema.ts:655-663`); the journal check requires the receipt to name
  the operation's id and the embedded library to hold it (`:735-742`), and the library
  cross-check matches the receipt id with `outputLinks.some(...)` (`:451-456`). Nothing in either
  check counts Versions.
- Replay keys on the operationId plus a SHA-256 of the whole request —
  `{ version, operation, projectId, ...request }` (`project-output-service.ts:302-307`,
  `project-request-fingerprint.ts:4`) — computed over the zod-parsed body the route hands in
  (`apps/api/src/features/projects/routes.ts:560-573`). A matching receipt returns the stored
  result re-parsed through `saveProjectOutputResponseSchema` (`:308-317`); a mismatch is an
  operation-key conflict (`:318-321`). The stored result is re-parsed through
  `projectOutputSaveResultSchema` on read-back in both modes — `toProjectOutputReceipt`
  (`infrastructure/database/project-repository.ts:504-514`, the parse at `:512`), used by
  `findReceipt` (`:3284`) and by the in-transaction prior reads, and the journal schema
  (`file-project-persistence-schema.ts:380`) — so any field added to a Version must default or old
  receipts stop replaying. (`:3292` parses the _input_ receipt before writing; it is not the
  read-back.)
- The result is single-valued — one `output`, one `savedVideo`, one `contentUrl`
  (`packages/contracts/src/projects.ts:1094-1102`) — but `savedVideo` is a `SavedVideoDetail`,
  whose `versions` already lists every Version of that video
  (`packages/contracts/src/saved-videos.ts:111-113`). The refinement pins
  `savedVideo.currentVersion.id` to `output.videoVersionId` and derives the presenting rule from
  that Version's own `exportSpecification` (`projects.ts:1117-1135`).
- The Project-side CAS (`expectedVersion`, `expectedRevisionNumber`) and `Idempotency-Key` are
  validated at the route (`routes.ts:556-566`), enforced in the domain (`rules.ts:1021`) and again
  under the row lock; one request keeps one CAS pair and one operationId whatever it carries.
- Rendition uploads are independent of the save: the operation key _is_ the asset id
  (`project-rendition-service.ts:34-36`, `project-byte-acceptance.ts:26-40`), the upload
  serialises only on `${owner}:${operationKey}` (`:60`), validates the bytes against the
  header-stated specification (`:68-72`), answers 201 on first store and on replay (`routes.ts:538`),
  is capped at 300 MB (`:521`) and never touches a revision. A replay with different bytes is
  refused with 409 (`project-byte-acceptance.ts:36`). Uploaded bytes are retained only once a
  Version referenced by `project_outputs` or a version reference names their asset
  (`infrastructure/database/project-retention-policy.ts:81-92`, `file-project-repository.ts:2537`); an upload whose save
  never completes is an unswept orphan (register row 17, `docs/audits/CURRENT_STATE_AUDIT.md:377`).

### 1.3 The browser side: render, upload, receipt, recovery

- `begin` runs a fixed preflight — owner, unresolved receipt, session flush, authoritative
  re-read, ready media — then reads the single placement off the fresh snapshot and asks the
  capability at save time (`apps/web/src/features/projects/ProjectOutputSaveSection.tsx:446-497`).
  When the browser cannot re-frame, a single-placement save degrades to `renditions: []`
  (`:492-497`). The degrade is not silent: `ExportPlacementChooser` shows the "Local editor
  unavailable … can still be saved" warning and disables every re-framing placement whenever
  `supported === false` (`ExportPlacementChooser.tsx:204-239`, fed by `placementRender.supported`
  at `:766`), the comment at `:484-486` relies on that notice, and the success message drops its
  "Re-framed for" clause when the Version records null (`:226-228`). The one genuinely silent
  window is a Save pressed while the probe is still `null` — the trigger is not gated on
  `placementSupported` (`:799-805`). **Nothing pins the downgrade itself:**
  `ProjectOutputSaveSection.test.tsx:1094-1116` renders the default fixture whose snapshot has
  `exportSpecification: null` (`:117`), so the `:493` branch is never reached with a chosen
  placement and the posted body is never asserted; what it pins is the visible notice, the
  disabled placement, one save posted and a visible Download link.
- `produceRendition` (`:341-436`) describes the cut, reads the source bytes bounded at 300 MB
  (`:369-379`, `apps/web/src/adapters/api-client/readBoundedBlob.ts:37,60,64,82`,
  `apps/web/src/features/projects/projectsApi.ts:602-608`), renders through
  `useExportPlacementRender` (`:381-387`), uploads under
  `renditionOperation.keyFor(JSON.stringify({ projectId, expectedVersion,
expectedRevisionNumber, media: workingMedia, specification }))` (`:414-421`) — the Project CAS
  facts plus the working media and the specification, omitting `target`; the comment at
  `:409-412` says it rotates when the cut, the placement or the Project moves on — resets that key
  after success (`:428`) and returns one rendition (`:429`). There is no "save signature": the
  save's own operationId is a fresh `crypto.randomUUID()` (`:502`). It runs **before** the receipt
  exists, and that ordering is the idempotency argument (`:343-348`). The receipt is written only
  after every rendition exists (`:498-518`) and is a strict, exact-keys, `schemaVersion: 1` record
  whose `request` is re-parsed through the contract schema
  (`apps/web/src/features/projects/projectOutputOperationStorage.ts:30-49`); an unparseable
  record is deleted (`:69`). On mount a pending receipt is replayed unchanged (`:297-303`), so a
  reload after the receipt never renders or uploads again
  (`ProjectOutputSaveSection.test.tsx:1054-1092`).
- The recovery gap: between an upload's success and the receipt, the asset id lives in a local
  and the key in a ref (`apps/web/src/features/projects/useStableOperationKey.ts:21,27`), reset
  after the upload (`ProjectOutputSaveSection.tsx:428`). The hook remembers one signature, so a
  second placement in one attempt would evict the first's key (`useStableOperationKey.ts:23-28`);
  nine other files use it.
- The render hook refuses a second render while one is in flight by returning `null`
  (`apps/web/src/features/export-placements/useExportPlacementRender.ts:65`), which the section
  treats as a silent stop (`:393-400`); it re-asks the capability inside `render` (`:76-82`),
  exposes one phase and one 0..1 progress (`:12`, `:104-107`), and owns no bytes (`:24-27`). The
  section holds one instance of it (`:161`) — the comment at `:180-181` says a second probe would
  cost a second WebGL context — and `cancelPreparation` (`:438-444`) drives its `cancel`. Cancel
  propagates section → hook → `renderVideoEdit` (worker cancel with a 2 s force-reject,
  `apps/web/src/features/video-editor/renderVideoEdit.ts:62-64`) → mediabunny
  (`videoEditRender.worker.ts:263-265`); unmount aborts both (`ProjectOutputSaveSection.tsx:295`,
  `useExportPlacementRender.ts:41`).
- Memory: each render spawns a fresh Worker (`renderVideoEdit.ts:45`), terminated on completion
  (`:56`); it accumulates output in 4 MiB blocks capped at 300 MB
  (`videoEditChunkAccumulator.ts:1-2,14`), hands back one Blob and clears the accumulator
  (`videoEditRender.worker.ts:236-246`). The rendered Blob is held from render completion to upload
  completion (`ProjectOutputSaveSection.tsx:365,404-408`); it travels to the worker by structured
  clone and to the upload as a `File` body (`:406`), and no object URL is created anywhere in the
  section or in `features/export-placements`. The worker encodes H.264 and refuses otherwise
  (`videoEditRender.worker.ts:105,176`); the capability is one composed probe whose "silent"
  outcome is deliberately not memoized (`videoEditSupport.ts:116-138,147-148`).
- Focus is already a contract of the section: the destination heading receives focus on open
  (`:305-309`) and `restoreFocusRef` returns focus to `saveTriggerRef` when `busy` clears
  (`:322-326`). Awaitable confirmations exist as `useConfirmationRequest` +
  `ConfirmationRequestDialog` (`apps/web/src/ui/primitives/confirmationRequest.tsx:24,34`, exported
  from `ui/index.ts:18-19`; the pattern at `take-review/TakeReviewActions.tsx:79,200`). No checkbox
  primitive exists in `ui/primitives`; the five checkboxes in `apps/web/src` are native
  `<input type="checkbox">` elements (e.g. `CharacterWardrobeVariantEditor.tsx:188`).

### 1.4 Versions, their identity, and where a sibling could live

- A Version carries `ordinal` (unique per video, `schema.ts:266`), `origin`, attribution,
  `sourceVersionId`, and a nullable `exportSpecification` jsonb (`schema.ts:259-260`, migration
  `0022`) that carries no index (`:265-270`); nothing links it to a sibling made for another
  placement (db-11, `CURRENT_STATE_AUDIT.md:250`). `project_outputs` is keyed by
  `video_version_id` alone (`schema.ts:1105`), so N rows per producing revision are storable. The
  Saved Video's `currentVersionId` is the append CAS token (`schema.ts:213`,
  `infrastructure/database/project-repository.ts:3420`).
- The file-mode Version record defaults `exportSpecification` "rather than versioned", so the
  library stays `schemaVersion: 4`
  (`apps/api/src/features/saved-videos/saved-video-repository.ts:43-51,108-111`); legacy v1/v3
  libraries re-parse through it (`saved-video-service.test.ts:646-744`). That test asserts the
  defaulted `characterName`, `characterVariantName` and rounded `durationMs` on both the served
  `currentVersion` (`:710-716`) and the rewritten v4 manifest (`:723-729`), and byte-identical
  reopen (`:742`) — it never asserts `exportSpecification`, so the default that already exists is
  not covered there. The Postgres mappers enumerate columns explicitly
  (`apps/api/src/infrastructure/database/saved-video-repository.ts:30,94`), and one projection
  produces the wire Version for the gallery, the detail and Project output history
  (`saved-video-service.ts:60`, `project-history-service.ts:253`). Migration `0022` is the
  one-line precedent; the compatibility fixture applies every migration from `0020`
  (`infrastructure/database/project-migration.postgres.integration.test.ts:340`); `docs/CLOUD_PERSISTENCE.md:122-124`
  still says the chain ends at `0021` and names neither `0022` nor `export_specification`.
- Wire: `savedVideoVersionSchema` is strict with no defaults (`saved-videos.ts:62-85`);
  `versions` is capped at 100 in the contract (`:112`) and in file mode
  (`saved-video-repository.ts:81`); `savedVideoSummarySchema.versionCount` (`:94`) is what a
  destination picker already holds for an append target.
- Siblings are only ever read with their Saved Video: the aggregate read returns every Version of
  one video ordered by ordinal (`infrastructure/database/saved-video-repository.ts:175-180`); no
  query filters on a Version field other than the list's current-Version join (`:411-419`).
- Contracts cannot import the domain (`packages/contracts/src/project-processing.ts:63`;
  `packages/contracts/package.json` depends on zod alone); shared value sets are mirrored by hand
  and held by `apps/api/src/shared-contract-parity.test.ts` (export aspects at `:95`).
- Placement equality has two definitions: the domain owner `projectExportSpecificationsEqual`
  (`packages/domain/src/projects/relations.ts:24-36`) and the service's `JSON.stringify` at
  `project-output-service.ts:273`. The domain has no "rendition" vocabulary beyond a comment
  (`relations.ts:20`); its owners are named on specifications and placements. `outputAttribution`
  reads the producing revision's `selectedCharacter` (`project-output-service.ts:154-166`), which
  the post-save revision clears.
- The Studio save path re-frames before uploading but its metadata has no placement, so the
  service writes `exportSpecification: null` (`saved-video-service.ts:274-277`; the prod-9 residue).
  It already scopes upload keys per aspect (`apps/web/src/features/saved-videos/useSaveVideo.ts:130`).

### 1.5 The surfaces that show a Version

- Gallery card and preview derive Landscape/Portrait/Square from pixels
  (`apps/web/src/features/video-gallery/VideoGallery.tsx:143,295,1086`), never from the recorded
  placement; the Versions row is `Version N` plus a current marker (`:1040-1054`); a non-current
  Version is "Older Version" with history-oriented copy (`:1079,1104-1108`); Edit/Open-in-Studio
  gate on `selectedIsCurrent` (`:994`); the card shows only `currentVersion` and a count
  (`:239,292`); the format filter reads the current Version only (`saved-video-service.ts:598`,
  `docs/user-flows/feature-behavior/15-saved-video-gallery.md:44-45`). The bare word "Variant"
  already means Wardrobe variant on the preview (`:1096`) and the card (`:300`).
- The Export panel opens on the Version's recorded placement and offers the plain server file
  until a different placement is chosen (`VideoExportPanel.tsx:36-52,85-92`;
  `VideoGallery.test.tsx:307`; stated at `15-saved-video-gallery.md:72-75`) — prod-9 is closed for
  Project-produced Versions. It receives one Version (`:29`) and knows nothing of its siblings;
  the gallery holds `previewDetail.versions` beside it (`VideoGallery.tsx:700-706`).
- `ProjectDeliverableSection` (the Project overview's output card) fetches one output
  (`ProjectDeliverableSection.tsx:131-134`) and shows `outputs[0]` (`:159`), already labelling it
  with `exportPlacementLabel(projectExportAspectOf(item.version.exportSpecification))` (`:62`);
  outputs are ordered by producing revision then version-id text in both modes
  (`infrastructure/database/project-repository.ts:1580,1609`,
  `file-project-repository.ts:1553-1557`), so siblings of one revision would tie in uuid order.
  The outputs route parses `projectHistoryQuerySchema` (`routes.ts:613-615`), whose `pageSize`
  allows up to 40 (`contracts/projects.ts:699-704`). History renders one row per output with
  origin and dimensions but no placement (`ProjectHistorySection.tsx:164-183`) and one
  `Placement:` line per revision from `exportSpecificationSummary` (`:356-358`).
  `referenceRevisionFor` resolves a reference revision only for the output that
  `lastSuccessfulOutput` names (`project-history-service.ts:76-92`), and `isCurrentForProject`
  compares against that single pointer (`:256-258`); the page stays two batched reads (`:158-169`).
- Success surfaces name one Version. `SavedVideoSuccessActions` takes one `SavedVideoDetail` and
  at most one placement (`SavedVideoSuccessActions.tsx:21-31`) and renders a three-way Download
  control: a re-framing `Button` when a placement was chosen and `render.supported === true`
  (`:58-69`), a busy disabled `Button` while the probe is unresolved (`:70-76`), else the
  server-served `LinkButton` anchor to `downloadSavedVideoUrl` (`:77-85`), with "Download the
  original shape instead" as a second anchor in the re-framing case (`:113-124`). It has four call
  sites (`ProjectOutputSaveSection.tsx:741-747`, `ExistingVideoActionBar.tsx`, `TakeDock.tsx`,
  `SaveVideoSuccessPanel.tsx`), and the section passes a placement only when the current Version
  records none (`:743-745`).
- Download needs no new endpoint, but the Project content route is narrower than "any Version by
  id": `routes.ts:579-594` serves through `outputService.content`
  (`project-output-service.ts:543-565`), which first requires a `project_outputs` link for that
  Project and that Version (`:548`), then the retained Version, else 404 — so it serves exactly
  the Versions recorded as outputs of the Project, each with its stored filename. Every sibling
  gets a link, so every sibling is served. The gallery's own download is
  `downloadSavedVideoUrl` (`apps/web/src/adapters/api-client/savedVideosApi.ts:367`).

### 1.6 What the canon asks, and what does not need to change

- D10 recommends yes — raise the cap, render serially in the browser with per-placement progress
  (`docs/DECISIONS_REQUIRED.md:122-128`; still a recommendation, unlike D4's dated decision at
  `:55,60`). Slice 2.3 names three deliverables — the cap, serial browser renders with
  per-placement progress, sibling identity on Versions (`docs/roadmap/PRODUCT_ROADMAP.md:88-89`);
  the identity is a "variant-set key on versions" by "safe expand-only migrations" (`:101-103`);
  the acceptance criterion is three placements from one save (`:109-110`); a render-time budget
  and memory checks are required per slice (`:104-108`). Prompt 18 lists seven behaviours and four
  test classes, including "failures leave completed variants saved and name the failed ones with
  retry" (`docs/roadmap/IMPLEMENTATION_PROMPTS.md:232-238`). TARGET_ARCHITECTURE wants
  recognizable siblings by a shared key (`docs/architecture/TARGET_ARCHITECTURE.md:96-97`), the
  save kept as one cross-aggregate transaction (`:22`), and a direction that is "staged, additive —
  never destructive" (`:88`) where every schema step ships as expand → backfill → verify →
  switch-authority → contract with rollback evidence and "Production is never migrated
  automatically" (`:101-103`) — an expand-first sequence with a later contract phase, not an
  expand-only rule. Phase 4.3 says "variant sets from 2.3 apply to" the composition
  (`PRODUCT_ROADMAP.md:171-172`); it does not say whether unchanged, so nothing here leans on
  that. The standing rules say to ask before altering a contract or stored shape beyond the stated
  scope (`IMPLEMENTATION_PROMPTS.md:60-61`).
- Unchanged by this slice: the rendition upload route and service (N uploads under N keys are
  already N independently replayable operations); `useExportPlacementRender`,
  `ExportPlacementChooser` and `ExportPlacementProgress` for their Studio and gallery consumers;
  the Project CAS pair and `Idempotency-Key`; the hydration record and version references (a
  re-framed save keeps presenting the cut, `project-output-service.ts:466-476`); the retention
  rule; the route inventory; the snapshot schema, the proposal guard and both no-op matchers; the
  file journal schema; the pending-receipt store; `SavedVideoSuccessActions`; `projectsApi.ts`
  (it serialises the request verbatim, `:518-530`, and `JSON.stringify` drops an absent key).
- Docs that already contradict the code: `docs/user-flows/projects.md:352-355` and
  `feature-behavior/17-empty-project-lifecycle.md:159-163` say the placement is produced at
  Download; the code renders before upload (`ProjectOutputSaveSection.tsx:341-348`,
  `docs/ARCHITECTURE.md:453-454`). `IMPLEMENTATION_PROMPTS.md:225-226` cites stale line ranges
  (the cap is at `contracts/projects.ts:958-979`; the section's rendition path at
  `ProjectOutputSaveSection.tsx:341-436` and `:484-497`).

## 2. Affected code, contracts, storage and tests

| Layer                 | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                | `packages/domain/src/projects/{types,rules,index}.ts` — export `PROJECT_EXPORT_PLACEMENT_ASPECTS`, add `validateProjectExportPlacementSet` and `projectOutputPrimaryPlacement` (both on `readonly ProjectExportSpecification[]`), add optional `siblingVersionIds` to `saveProjectOutput`; `projects.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Contracts             | `packages/contracts/src/projects.ts` (`renditions` cap and refinement, optional `variantSetId`); `saved-videos.ts` (defaulted `variantSetId` on the Version); `projects.test.ts` (incl. the `:628` fixture), `saved-videos.test.ts`; `apps/api/src/shared-contract-parity.test.ts` (cap equals the placement-aspect count)                                                                                                                                                                                                                                                                                                                                                                                                        |
| API                   | `features/projects/project-output-service.ts` (`#resolveRenditions`, check order, primary derivation, N ids, set join, attribution copy), `features/projects/project-repository.ts` (list-shaped port), `infrastructure/database/project-repository.ts` and `features/projects/file-project-repository.ts` (validators widened by hand, batch inserts), `features/saved-videos/saved-video-repository.ts` (`appendStoredVideoVersions`), `saved-video-service.ts` (projection). Tests: `project-output-service.test.ts`, `routes.test.ts`, `file-project-repository.test.ts`, the Postgres integration test; `project-rendition-service.test.ts` unchanged and asserted so                                                        |
| Storage               | `infrastructure/database/schema.ts` (`video_versions.variant_set_id uuid NULL`), generated `drizzle/0023_*.sql` and `meta`; Postgres mappers `infrastructure/database/saved-video-repository.ts`; file-mode `storedVideoVersionSchema` default (saved-video library stays v4, project library stays v7, journal schema untouched); `schema.test.ts`; `saved-video-service.test.ts` legacy reopen                                                                                                                                                                                                                                                                                                                                  |
| Web save flow         | `features/projects/ProjectOutputSaveSection.tsx`; new `features/projects/useProjectOutputRenditionSet.ts`, `projectOutputRenditionPreparationStorage.ts` (built on `persistence/versionedRecord.ts`, unchanged) and `ExportPlacementSetProgress.tsx` (beside its only consumer, not in the `export-placements` barrel); tests beside each. Unchanged and asserted so: `projectOutputOperationStorage.ts`, `projectsApi.ts`, `features/saved-videos/SavedVideoSuccessActions.tsx`                                                                                                                                                                                                                                                  |
| Web Versions surfaces | `features/video-gallery/VideoGallery.tsx`, `VideoExportPanel.tsx`; `features/projects/ProjectDeliverableSection.tsx`, `ProjectHistorySection.tsx`; tests beside each (`exportPlacementLabel`, `projectExportAspectOf` and `exportSpecificationSummary` already exist and are already used this way, `ProjectDeliverableSection.tsx:62`, `ProjectHistorySection.tsx:357`)                                                                                                                                                                                                                                                                                                                                                          |
| Fixtures              | `contracts/projects.test.ts:628` (every Version gains `variantSetId: null`); `ProjectOutputSaveSection.test.tsx` `installPlacementProduction` (answer per specification with distinct asset ids and frames); `project-output-service.test.ts` helpers; Postgres integration fixtures; the legacy-reopen expectation gains `exportSpecification: null` and `variantSetId: null`; `e2e/support/projectHarness.ts` (rendition route; one Version per rendition)                                                                                                                                                                                                                                                                      |
| E2E                   | `e2e/app-routing.spec.ts` (new journey beside `:542`, untagged, `loadDecodableH264VideoFixture()`); `e2e/studio.visual.spec.ts` and `studioVisualMatrix.ts` (destination baselines); `e2e/accessibility-responsive.spec.ts:639` extended; `real-stack-project-deliverable.spec.ts` unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Docs                  | this plan; `DECISIONS_REQUIRED.md` (the D10 record, once §5 is answered); `DOMAIN_MODEL.md:78-81,170-173` and a new **Variant set** row under Supporting terms (`:182`) defining `variantSetId` as the one name for the canon's "deliverable key", "variant-set key", "sibling-variant identity" and "variant group"; `TARGET_USER_FLOWS.md:139`; `user-flows/projects.md:343,352-355`; `feature-behavior/15-saved-video-gallery.md:44-45,70-75`, `17-empty-project-lifecycle.md:149-163,213-216`; `user-flows/assets-and-libraries.md:104`; `CLOUD_PERSISTENCE.md` (0022 and 0023 — the doc names neither; the `:124` tail); `TESTING.md:167-176`; `IMPLEMENTATION_PROMPTS.md:225-226`; `CURRENT_STATE_AUDIT.md:123-125,250,375` |

## 3. Design and implementation plan (in order)

### The model — what a variant set is, and where it lives

**Cardinality: N sibling Versions of one Saved Video.** A create writes ordinals `1..N`; an
append writes `current+1..current+N`, every member with `sourceVersionId = target.expectedVersionId`
and one `revision` bump. Two bounds, stated separately because they differ: **renditions per
request ≤ 4** (the placement-aspect count) and **Versions per save ≤ 5** (under Q2 the cut itself
joins its four renditions as an as-is member). N Saved Videos was rejected: every list surface would
show N cards with one title, "New version of an existing video" would have no single target, and
grouping would need an index and an extra gallery query — while every aggregate read already
returns the Versions of one video together (`saved-video-repository.ts:175-180`).

**Identity: `variantSetId`**, the one name for the canon's "deliverable key", "variant-set key",
"sibling-variant identity" and "variant group". It is `string | null` on `StoredVideoVersion`,
`video_versions.variant_set_id uuid NULL` in Postgres (migration 0023, no index, no backfill),
`z.uuid().nullable().default(null)` in the file-mode record and on `savedVideoVersionSchema`, and
emitted once by `publicSavedVideoVersion`. Every Version a Project output save writes gets
`variantSetId = request.variantSetId ?? operationId` — including a zero-rendition save, so any
Project-saved Version can later be joined; null therefore means exactly "written before this slice,
or by a Studio save". Surfaces group only when two or more Versions of one video share a non-null
id. User-facing copy says "placements" and "Saved together"; it never says "variant" (Wardrobe
collision, `VideoGallery.tsx:300,1096`), "deliverable" (`DOMAIN_MODEL.md:201`) or "batch".

**Placement-ness has one test.** Wherever this plan says "the chosen placement is a placement" it
means `isProjectExportPlacementAspect(projectExportAspectOf(spec))` — a null specification and a
stored `{ aspect: 'source' }` specification are both "no placement" (§1.1). Distinctness within a
set has one rule too: **distinct by `projectExportAspectOf`** — for the request refinement, the
domain validator, the join refusal and the surfaces' "already made" state — because filenames are
tagged by aspect alone (`rules.ts:304-315`) and two Phone Versions in one set would collide.

**The set travels on the save request; the revision keeps one chosen placement.** The snapshot's
`exportSpecification` stays what it is — the placement the operator chose, what `session.propose`
sends, what the Save trigger and History's `Placement:` line state — and gains one precise role: it
names the set's _primary_. Recording the set on the snapshot (a list field or a v3 type change) was
rejected: it would touch the proposal schema and its stale-tab guard
(`contracts/projects.ts:828-837`), both hand-mirrored no-op matchers, `materialSnapshot`, the
history-revision contract and UI, both readers and every snapshot fixture, for a truth the outputs
list already carries per Version — and the identity should survive the snapshot v3 the composition
brings (`TARGET_ARCHITECTURE.md:92-95`).

**The primary is derived, not asserted — one owner in the domain,
`projectOutputPrimaryPlacement(chosen, specifications, { joining })`**, taking the revision's
`exportSpecification` and the renditions' specifications (never `media.assetId`) and returning the
canonical order of the specifications plus which index is the primary, or `null` when the cut
itself is; the service maps indices back to request renditions. For a fresh set (`joining: false`):

1. `chosen` is a placement and a specification shares its aspect → that rendition is the primary
   (the service's `JSON.stringify` at `:273` is replaced by this rule); the cut is not stored.
2. `chosen` is not a placement ("Keep as it is") → the cut itself is the primary, stored as-is
   with `exportSpecification: null` and presented; every rendition is a sibling (Q2). With zero
   renditions this is today's plain save.
3. `chosen` is a placement and `specifications` is empty → today's degrade path, unchanged: the cut
   is the primary, `exportSpecification: null`, presented.
4. `chosen` is a placement and no specification shares its aspect (its render failed) → the last
   specification in canonical order is the primary and nothing is presented.

**A join is a distinct branch (`joining: true`), and the cut is never stored again.** Cases 2 and
3 are unreachable: a join with zero renditions is refused (409), the primary is the rendition
sharing the chosen aspect if any else the last in canonical order, and `presentsOutput` is always
false — the post-save revision keeps presenting whatever the current revision presents (after a
Keep-as-it-is set that is the as-is Version; `rules.ts:1080-1084` carries `workingMedia` forward).
Without this branch every Retry after a Keep-as-it-is set would fall into case 2 and mint a second
as-is Version of the same cut as the new primary. `presentsOutput` is therefore
`!joining && (chosen is not a placement || specifications.length === 0)`.

Siblings are the rest, in `PROJECT_EXPORT_PLACEMENT_ASPECTS` order. The comment at
`project-output-service.ts:270-271` is rewritten: the revision's placement is the intent; the
Versions, each carrying its own `exportSpecification`, are the record of what was produced.

**Write order: siblings first, primary last.** Because the primary is the last Version written it
is `currentVersionId`, the receipt's `videoVersionId`, `lastSuccessfulOutput`, the result's `output`
and `contentUrl`, and `isCurrentForProject` — so `validNextState`, the file validator, the append
CAS and the result refinement (`contracts/projects.ts:1117-1135`) hold verbatim. Setting the
current pointer to any other member would break the Postgres append rule at `:3450` on the next
save. Three orders are in play, deliberately different: the browser **renders** the chosen
placement first (fail fast), **sends** the stored renditions in canonical aspect order (a stable
fingerprint however the loop ran), and the server **writes** siblings in canonical order and the
primary last (pointer invariants). Ordinals follow write order: for a chosen 9:16 with 1:1 and 4:5
extras appended to a video at Version 2, the members are Version 3 · Square post, Version 4 · Tall
post, Version 5 · Phone, full screen (current). The placement the operator watched render as
"1 of 3" is not Version 3.

**Ids.** The Version holding the cut keeps purpose `'video-version'`; every rendition Version
uses `` `video-version:${aspect}` `` regardless of which member is primary — distinct because
aspects are distinct, independent of array order, and independent of the derivation. A
one-rendition save's Version id therefore changes from today's, which nothing observes: replay
returns the stored result (`:308-317`), journal recovery replays stored writes, and no test asserts
the id string (§1.1). `'saved-video'` and `'project-revision'` are unchanged.

**Receipt, result and journal keep their shape.** The receipt scalars name the primary; the
sibling Versions are already in `result.savedVideo.versions` with their `exportSpecification` and
`variantSetId`, so no `outputs`/`members` field is added to the result (that would be a contract
change beyond the stated scope with nothing to show for it). The file journal's operation keeps its
single `videoVersionId`: its checks match that scalar and `writes.savedVideos` already carries every
sibling (`file-project-persistence-schema.ts:667,735-742`).

**Server: all N Versions or none. Browser: the produced subset.** Validation aborts before any
write and the commit is one transaction in both modes; a request never yields a subset. Which
renditions reach the request is the browser's decision (§ The browser).

**Joining a set.** A request may carry `variantSetId` only with `target.kind === 'version'` and
at least one rendition. It is accepted only when the Version that the current revision's
`lastSuccessfulOutput` names (`rules.ts:1092`; cleared by any later material change,
`:1190-1196`) **is the target's current Version** — the `expectedVersionId` the append already
CASes on, found in the target aggregate the save already loads (`:364-367`) — and that Version's
`variantSetId` equals the request's; otherwise 409 "This Project has changed since those
placements were saved — save again to make new ones." One rule, one comparison on loaded data,
and it says three things at once: the set exists on this owner's video, the Project has not moved
on since the set was made, and no unrelated Version has landed in between — so members of one set
are always consecutive ordinals, which is what the surfaces' grouping relies on. An incoming aspect
already held by a set member is refused 409 ("This video already has a Version for Square post.").
Because the producing revision of a join is the post-save revision whose creative selections were
cleared, `outputAttribution` would return null; a join copies `characterName` and
`characterVariantName` from that same current Version. Ownership still comes from the session
subject alone — `variantSetId` is checked against that owner's aggregate, never trusted.

### The contract — widen, default, do not import the domain

- `renditions: z.array(projectOutputRenditionSchema).max(4).default([])` with a hand-written
  `superRefine` refusing `aspect: 'source'` and two members sharing an aspect (contracts cannot
  import the domain; the parity test asserts the cap equals the domain's placement-aspect count
  and the refinement agrees with the domain validator on fixtures).
- `variantSetId: z.uuid().optional()` on the request — **optional with no default**: the
  fingerprint hashes the parsed body (`routes.ts:560-573` → `project-output-service.ts:302-307`),
  so a defaulted field would turn every pre-slice receipt into an operation-key conflict. The
  section omits the key on ordinary saves (never sends null); `projectsApi.ts` needs no change.
- `variantSetId: z.uuid().nullable().default(null)` on `savedVideoVersionSchema` — the default is
  what lets receipts stored before the slice re-parse in both modes.
- The result schema is unchanged. Rewrite the comment at `projects.ts:972-976`.

### Storage — one nullable column, one defaulted field

`videoVersions.variantSetId: uuid('variant_set_id')` beside `exportSpecification` (`schema.ts:260`);
`bun run --filter @studio/api db:generate` produces 0023; `db:check` verifies it; the compatibility
fixture applies it without edits. **No index:** no query in this slice filters or joins on the
column — grouping is a filter over `versions` already loaded per Saved Video
(`saved-video-repository.ts:175-180`) — and the `export_specification` column from 0022 carries
none either (`schema.ts:265-270`); an `(owner_user_id, variant_set_id)` index becomes required the
moment a cross-video sibling query is introduced. **Expand-first, no backfill, no contract step:**
null already means what an old row means, so the backfill is empty and nothing is contracted.
**Rollback** is to leave `variant_set_id` in place — the Postgres mappers enumerate columns
explicitly (`infrastructure/database/saved-video-repository.ts:30,94`), so an older API ignores it;
no down-migration is written or run. `toVersion` and `savedVideoVersionValues` name the column.
File mode: `storedVideoVersionSchema.variantSetId: z.uuid().nullable().default(null)`, library
stays v4 (the `exportSpecification` precedent at `saved-video-repository.ts:43-51`); the legacy
v1/v3→v4 reopen expectation gains `exportSpecification: null` and `variantSetId: null` (the former
was never asserted, §1.4). `publicSavedVideoVersion` emits it. The Studio save path keeps writing
null. No production database is migrated by prompt 18 (`TARGET_ARCHITECTURE.md:103`).

### The unit of work — list-shaped in both modes, journal unchanged

Port (`project-repository.ts:322-352`): `savedVideo.append.version` → `versions: readonly
StoredVideoVersion[]` (non-empty, at most 5, primary last); `output` → `outputs: readonly
ProjectOutputLink[]` (same order); `receipt` unchanged. Both validators are widened **by hand and
mirrored line for line** — the Postgres commit inserts rows directly (`:3630,3647`) and does not
call the file-mode helper, so the N-append rule has two owners held together by one shared
three-rendition fixture run in both test files (the pattern
`apps/api/src/infrastructure/database/project-repository.postgres.integration.test.ts:1174-1178`
already states): create asserts `versions.length === outputs.length`, ordinals `1..N`,
`currentVersionId === versions.at(-1).id`; append asserts ordinals `current+1..current+N`, every
`sourceVersionId === expectedVersionId`, `revision + 1` once; `validNextState` keeps every existing
line about the primary and adds: every output names a Version in `versions` in order, and the
hydration record's "does not claim the output's identity" excludes every sibling id. Insert
Versions and outputs as batch `values(list.map(...))`. Refuse an append that would exceed 100
Versions before writing. File mode gets `appendStoredVideoVersions(current, versions)` in
`saved-video-repository.ts` — a fold of the existing helper (`:116-128`) bumping `revision` once —
used by the file commit and by the service to build the response aggregate
(`project-output-service.ts:420`). The prepared journal is not changed:
`file-project-persistence-schema.ts` is not edited.

### The service — bounded resolution, derived primary, N ids

`#resolveRendition` → `#resolveRenditions`, with the checks in this order so a request that will be
refused never streams an asset: **set validator** (`validateProjectExportPlacementSet` on the
request's specifications) → **join rule** against the already-loaded target aggregate and current
revision → **100-cap** (`targetAggregate.versions.length + N > 100` → 409) → then the per-member
open/inspect loop. A `ProjectRuleError` from the validator is caught where it is thrown and mapped
to 409 with the placement label — the existing catch at `:439-444` wraps only `saveProjectOutput`,
and `#resolveRendition` runs earlier inside the `Promise.all` at `:341-344`, so relying on it would
turn the refusal into a 500. The contract already refused the same shapes with 400 at the route.
The loop opens and inspects the renditions **one at a time** in a `for…of` that runs concurrently
with the single `#resolveReadyMedia` read; each member's temp copy is removed by the inspection
helper's `finally` (`project-media-inspection.ts:30-35`) before the next member is opened, so temp
disk is bounded to the cut plus one member — at most two full-asset copies in flight per request,
each ≤ 300 MB, N ≤ 4 — with 404/409 messages naming the placement label, never the asset id.
Derive `{ order, primary }`, build the Versions in write order, assign ordinals from the target
length, set `variantSetId` on all, call `saveProjectOutput` with `videoVersionId` = primary and
`siblingVersionIds` = the rest. The result's singular fields describe the primary; the fingerprint
is unchanged and already covers the whole request. **Logging:** the service has no logger today (no
`logger` or `console` use; the runtime logs through `this.log`,
`application/application-runtime.ts:546,849,1068`), and every refusal it makes is a 4xx `AppError`
answered to the caller without a log line. The new refusals — set validation, join, cap, per-member
404/409 — keep that peer pattern; no logger is introduced. `project-history-service.ts` is not
changed: `referenceRevisionFor` resolves the primary only, by design (§ The surfaces).

### The browser — one source, serial members, persisted keys, honest partial failure

- **Choosing.** `ExportPlacementChooser` stays single-select and keeps proposing the chosen
  placement through `session.propose` (`:768`) — it is the primary. The destination form gains a
  group "Also save for" listing the other placements in canonical order: a `fieldset` of native
  `<input type="checkbox">` controls following `CharacterWardrobeVariantEditor.tsx:188` with the
  `FormControls` label and help styles — no new primitive, none exists. Each extra's specification
  is `projectExportSpecificationForAspect(aspect)` (`rules.ts:175-186`, the same owner the chooser
  uses at `ExportPlacementChooser.tsx:230`), so resolution and `includeAudio` agree with a
  single-placement save; each row carries `exportPlacementHint(aspect)` and the same
  `exportPlacementDescription(spec, source, subtitlePlacements)` sentence the chooser shows
  (`:233`, `:251-253`), so a member that would crop the captions says so before Save. The group is
  disabled with the existing "Local editor unavailable" notice when `placementSupported === false`
  and inert while `null`. Extras are save-time input like the title, not Project state; a reload
  before Save loses them (stated in the copy). When the destination is an existing video and
  `appendTarget.versionCount + members.length > 100` (`savedVideoSummarySchema.versionCount`) the
  form says so and disables submit; the server refusal remains the authority. The trigger keeps
  `Save video · <placement>` (`:827`) so `/^Save video ·/` selectors hold; the form's submit names
  the count ("Save 3 placements").
- **`begin` takes its members explicitly:** `begin({ target, members, variantSetId? })` where
  `members: ProjectExportSpecification[]`. The ordinary save passes the snapshot's chosen
  placement (when it is a placement) plus the ticked extras; Retry and Continue pass only the
  members still to make. The loop never adds the snapshot's placement on its own — the post-save
  revision keeps `exportSpecification` (`rules.ts:1087`), so a Retry for a missing sibling would
  otherwise re-render the already-made chosen placement and be refused 409 after a full upload.
- **Refusing a set the browser cannot make.** In `begin`, when extras are ticked and
  `videoEditSupported()` is false, refuse before any bytes with a notice naming the placements;
  the single-placement degrade at `:492-497` stays, and step 8 pins it for the first time.
- **Preparation record** (new `projectOutputRenditionPreparationStorage.ts`) is built on
  `createVersionedRecordStore` (`apps/web/src/persistence/versionedRecord.ts:30-67`), whose
  docstring says per-feature copies are how the existing stores drifted: `storageBase`
  `` `lightframe.project-output-renditions.v1.${projectId}` `` (owner- and environment-scoped by
  the store), `version: 1`, and a `parse` that validates members through
  `projectExportSpecificationValueSchema` and the uuid keys. The value is
  `{ attemptId, projectId, basis: { expectedVersion, expectedRevisionNumber, media }, variantSetId,
members: [{ specification, operationKey, outcome: 'pending' | 'stored' | 'failed', assetId,
reason }] }`. Written when the loop starts with **every member's upload key minted up front**;
  every later update and the clear are read-compare-write and touch only a record with the same
  `attemptId` — a foreign record (another tab's loop) is left alone, that tab continues in memory,
  and its save is refused by the Project CAS as today. On mount a pending receipt takes precedence
  and any preparation record for that Project is discarded. A failed initial write refuses the set
  before any render, with the receipt-store failure copy (`:512-518`). The record is cleared when
  the receipt is written, when the basis no longer matches, and when a loop ends with zero stored
  members and no upload landed. It is the single owner of rendition upload keys for the Project
  save; the section stops using `useStableOperationKey` for renditions.
  `projectOutputOperationStorage.ts` is untouched — its exact-keys v1 parser keeps an in-flight
  single save alive across the deploy, and the raised cap already lets it carry N renditions.
- **The loop** (new `useProjectOutputRenditionSet`, extracted from `produceRendition` at
  `:341-436`) takes the section's `placementRender` (render and cancel) and the shared
  `AbortSignal` — one render-hook instance, one probe — and owns only the member list, the source
  read and the persisted keys. It describes the cut once, reads the source bytes **once** (≤ 300
  MB, held for the loop), then for each member — the chosen placement first so the placement the
  revision chose fails fast, then the rest in canonical order — checks the signal, skips a member
  whose record already holds an `assetId`, `render`s (awaited; the hook's one-at-a-time guard is
  respected), uploads under the member's persisted key, records the `assetId`, and lets the
  rendered Blob go out of scope before the next render. No object URL is created: Blobs travel to
  the worker by structured clone and to the upload as a `File` body. Strictly serial render →
  upload → drop: **peak memory = source + one output**; no overlap of upload_k with render_k+1
  (which would double it). A failed render or upload marks the member `failed` with the hook's or
  `ApiClientError` message and **continues**; a `null` render (hook refused, cancelled) is
  distinguished from a thrown failure. `cancelRemaining()` aborts the in-flight member through the
  existing chain, marks the rest `cancelled`, and resolves with what was stored. Unmount still
  aborts; stored members survive in the record.
- **Progress.** New `ExportPlacementSetProgress` in `features/projects/`, beside its only consumer
  and not exported from the `export-placements` barrel that `SaveVideoDialog.tsx:9` and
  `VideoExportPanel.tsx:11` import: a `role="status"`, `aria-live="polite"` list, one row per
  member — queued / re-framing 2 of 3 · Phone, full screen with % / storing / stored / failed +
  reason / cancelled — an aggregate `(k−1+p)/N` bar, and one "Cancel remaining" button whose helper
  reads "Placements already made will still be saved." It declares no transition or animation — a
  native `<progress>` and static row states, as `ExportPlacementProgress.tsx:5-14,46` does — and
  `apps/web/src/ui/StudioDesignProvider.tsx:75` neutralises motion app-wide under `prefers-reduced-motion` besides.
  The existing `ExportPlacementProgress` is not changed (three single-placement consumers).
- **Saving what was produced.** When the loop ends with at least one stored member — or with none
  stored while the chosen placement is Keep as it is — build the request from the stored renditions
  in canonical order, write the v1 receipt, POST once, clear the preparation record. The server
  derives the primary from what arrived. The **section** composes the success rows itself, one per
  Version of the response sharing the current Version's `variantSetId` (placement label,
  `Version N`, Download via `downloadSavedVideoUrl`, the primary marked Current);
  `SavedVideoSuccessActions` is unchanged and keeps rendering the zero-rendition and Keep-as-it-is
  results as today. Then "Not produced: Phone, full screen — <reason>" with one **Retry**. Retry
  re-reads the Saved Video (`getSavedVideo`, `savedVideosApi.ts:324`) and the Project before any
  render: while `latest.revision.snapshot.lastSuccessfulOutput` names the set's primary and that
  Version is still the video's `currentVersion`, it calls
  `begin({ target: { kind: 'version', savedVideoId, expectedVersionId: currentVersion.id },
members: <the missing placements>, variantSetId })`; otherwise the control says why ("This
  Project changed" / "Another Version was added to this video since") and offers a plain save
  that starts a new set — the render never happens for a join the server would refuse. When
  nothing was stored and the chosen placement is a placement, nothing is saved: the section says
  so, lists every member's reason, and offers Retry as a fresh save (no `variantSetId`; the
  persisted keys make a member whose upload did land replay as the same asset). Poster generation
  fires once per Saved Video, as today.
- **Focus.** On loop end — saved, partial, cancelled or nothing saved — focus moves to the first
  actionable control of the terminal notice (the first Download or Retry) through the existing
  `restoreFocusRef` pattern (`:322-326`). The resume prompt renders as a `StatusNotice` with
  **Continue save** primary and **Discard** secondary; Discard goes through
  `useConfirmationRequest` + `ConfirmationRequestDialog` naming what is discarded ("1 placement
  already made stays stored until cleanup"), because it throws away persisted, already-uploaded
  work.
- **Resume.** On mount with a preparation record whose basis matches the authoritative re-read,
  the section shows "A save with 3 placements was interrupted — 1 already made." (or, from the
  recorded outcomes, "3 placements could not be made") with Continue save / Discard rather than
  starting a multi-minute render on every return to the Project. Continue checks the basis against
  the authoritative re-read **before** `session.flush()`: if the session holds pending changes,
  the prompt says continuing would discard them and offers "Discard changes and continue" /
  "Keep changes and discard the interrupted save" (a flush would move the Project on and the basis
  would silently mismatch otherwise). Continue skips stored members, re-renders the rest under
  their persisted keys, then saves. An ordinary Save with a matching-basis record and the same
  member selection reuses the record (same keys, stored members skipped); a differing selection or
  a changed basis discards it (its stored members stay until cleanup). A pending receipt (stage
  after the loop) replays automatically as today. Never rendered twice: any member whose upload
  completed. Never uploaded twice: any member, because keys exist before the first render. Never
  saved twice: the operationId is fixed when the receipt is written, and a retry with a different
  rendition list is a new operation.

### The surfaces — siblings recognised where a Version is shown

- Gallery preview: label each Version `Version N · <placement label>` from
  `exportPlacementLabel(projectExportAspectOf(version.exportSpecification))`, group consecutive
  Versions sharing a non-null `variantSetId` under a "Saved together" sub-legend, and say "Saved
  together with the current Version" instead of "Older Version" for a member of the current
  Version's set; Edit/Open-in-Studio gating stays on `selectedIsCurrent`. Card chip and format
  facet keep reading the current Version — stated in `15-saved-video-gallery.md`, not changed.
- Export panel: receive `previewDetail.versions`; substitute a sibling's `downloadSavedVideoUrl`
  for the local re-frame **only** when `selected.variantSetId !== null`,
  `candidate.variantSetId === selected.variantSetId` and the aspects are equal. A Version with a
  null `variantSetId` (a Studio save, a pre-slice Version) keeps today's local re-frame — without
  the set check, choosing Square on a Studio-saved Version would offer set 1's Square file, a
  different cut presented as the re-frame of this one.
- `ProjectDeliverableSection` (the Project overview's output card): `pageSize: 5` (the outputs
  route parses `projectHistoryQuerySchema`, max 40), group the rows sharing the newest row's
  `variantSetId`, show the primary's poster with one line per member (placement label, Download);
  the header copy stops saying "the video".
- History: output rows add `exportSpecificationSummary(item.version.exportSpecification)` and a
  "Saved together" marker. `referenceRevisionFor` and `isCurrentForProject` stay primary-only: a
  sibling row shows "Saved at change N" from its own link and no "made current at" suffix, which is
  true — the post-save revision points at the primary. The revision row's `Placement:` line keeps
  stating the chosen placement (intent); the outputs beneath it state what was produced.
- No new query, no new endpoint: siblings arrive in reads that already return them, and the route
  inventories are unchanged.

### Order of changes for prompt 18

0. **Confirm before editing:** which built chunk carries `ProjectOutputSaveSection.tsx` (it is
   imported only by `ProjectWorkspaceSurface.tsx:12,365`); run `scripts/check-build-manifest.mjs`
   on a fresh build and record the shell and Studio closure sizes against their budgets (`:64,71`)
   so the measurement after step 8 can verify the section's chunk — with the new hook, record and
   progress list — stays outside both closures; and that `project_outputs` has no uniqueness on
   `producing_revision_id` (`schema.ts:1105`). No code changes.
1. Domain: `PROJECT_EXPORT_PLACEMENT_ASPECTS` — defined once as `PROJECT_EXPORT_ASPECTS`
   without `'source'`, in the existing order `16:9, 9:16, 1:1, 4:5` (`types.ts:140`) —
   `validateProjectExportPlacementSet`, `projectOutputPrimaryPlacement` with its join branch,
   additive `siblingVersionIds`; tests for the four fresh-set cases and the join branch (chosen
   present, chosen absent, zero renditions refused), set refusals (source, duplicate aspect, five
   members), a three-output transition writing three links from one revision, the `:1069`
   provenance refusal on a sibling (a domain test only — the enforcement point in production is
   the repositories, §1.1); existing single-output tests untouched.
2. Contracts: cap, refinement, optional `variantSetId`, defaulted `variantSetId` on the Version;
   tests — four accepted, five refused, duplicate and source refused, a request without
   `variantSetId` parses to an object **without that key**, a pre-slice stored result parses
   verbatim, the `:628` fixture gains `variantSetId: null`; parity test row. **Deploy order:**
   contracts and API before web, because a new bundle against an old API is refused 400 and the
   receipt would replay that refusal on every mount; and no web rollback after a set has been
   started, because the old parser deletes a 2+-rendition receipt
   (`projectOutputOperationStorage.ts:69`).
3. Storage: column, 0023 via `db:generate` + `db:check`, mappers, file default,
   `appendStoredVideoVersions`, projection; legacy-reopen (`exportSpecification: null`,
   `variantSetId: null`) and schema-oracle tests; the rollback statement in `CLOUD_PERSISTENCE`.
4. Unit of work: port (≤ 5), both validators, batch inserts, 100-cap refusal; file-repository test
   and Postgres integration test share the three-rendition fixture (integration test only against
   the throwaway compose-5433 database, never the developer's).
5. Service: check order, `#resolveRenditions`, primary derivation, ids, join with attribution copy
   and duplicate-aspect refusal, `variantSetId` on every Version, the validator's 409 mapping.
   Tests: three renditions → three Versions with consecutive ordinals, primary last and current,
   shared `variantSetId`, three links, cut still presented; Keep as it is + two renditions → as-is
   primary presented plus two siblings; **partial failure (prompt 18):** chosen placement absent →
   last canonical sibling primary, nothing presented (so the service, both validators and the
   result refinement are proven to agree); **partial failure (prompt 18):** one of three assets
   missing → 404, nothing written; **partial failure (prompt 18):** join after a partial save
   appends the missing member under the new current with copied attribution; duplicate aspect →
   409, nothing written; unknown set with three renditions → 409 with no asset opened; replay
   returns identical ids and `versionCount 3`; reordered array → operation-key conflict;
   `variantSetId` on a `new` target → 409; join with zero renditions → 409; join against a target
   whose current Version is not in the set → 409; join after the Project changed
   (`lastSuccessfulOutput` cleared) → 409; incoming aspect already in the set → 409; join after a
   Keep-as-it-is set appends exactly one sibling, no second as-is Version, current pointer moves
   to the sibling, presented media unchanged; the three interruption hooks with three renditions
   yield exactly three Versions once. Rewrite "refuses a rendition made for a placement the
   Project has not chosen" (`:308`) as "names the rendition for the chosen placement as the output
   and the rest as siblings". Routes: three renditions accepted, five refused 400.
   Rendition-service tests unchanged — assert so.
6. Web preparation record and its tests (round-trip, malformed ignored, basis mismatch cleared by
   the section, a foreign `attemptId` left untouched by update and clear, pending receipt takes
   precedence on mount, per-member outcomes recorded, failed initial write refuses the set).
7. Web loop hook and its tests (one source read, serial renders never overlapping an upload,
   per-member keys stable across a retry, continue past a failure, cancel-remaining, skip stored
   members, one render-hook instance).
8. Web section, checkbox group, progress list, success rows, retry, resume UX, focus. Section
   tests: three placements → one media read, three serial renders with the chosen placement
   first, three uploads with distinct persisted keys, one POST with three renditions in canonical
   order and no `variantSetId` key; three extras each naming their size and, with a subtitled cut,
   their caption outcome; second render fails → two stored, one POST with two, failed placement
   named with Retry, Retry renders and uploads exactly the missing member and POSTs
   `target.kind === 'version'` + `variantSetId` + one rendition; Retry after another Version was
   added offers a plain save and renders nothing; cancel-remaining after member 1 → one saved, two
   listed; seeded preparation record → member 1 skipped; seeded v1 receipt with three renditions →
   zero renders, zero uploads, three Download links; browser cannot render + extras → refusal, no
   POST; form refuses an append beyond 100 Versions; focus lands on the first Download or Retry
   after completion; Tab and Escape through the checkbox group; Discard asks for confirmation;
   and the existing degrade test extended with `currentValue: placedCurrent()` and
   `renderCapable` false, asserting the posted body carries `renditions: []` (the downgrade
   `:1094-1116` does not pin); every existing `renditions: []` and single-placement case unchanged.
9. Surfaces and their tests (grouping, labels, sibling download only within a set — a Studio-saved
   Version on a video holding a set still re-frames locally — the overview card with five rows,
   history placement summaries).
10. E2E: harness rendition route (asset id = `Idempotency-Key`, echo the header's specification, 201) and one Version per rendition; the journey beside `app-routing.spec.ts:542`, parametrised
    on the member count so two or three placements is one fixture change — tick two extras in the
    destination form, watch the status list advance through each member, assert the body carries
    three renditions in canonical order, three sibling Versions in "Saved video Version history"
    labelled by write order (for chosen 9:16 with 1:1 and 4:5 extras: Version 1 · Square post,
    Version 2 · Tall post, Version 3 · Phone, full screen · Current), `Download <title>, Version N`
    for each; then reload mid-set, assert the interrupted-save notice names 1 of 3 already made,
    click Continue save, and assert the harness receives no second upload for the finished member
    and one POST with three renditions. Untagged, on Chromium, with the same
    `loadDecodableH264VideoFixture()` the untagged existing-video journey already renders three
    times (`e2e/existing-video.spec.ts:359-373`); budget `test.setTimeout` per render as that
    journey does. Re-baseline the two destination captures by the safe-update procedure; extend the
    small-mobile 200% case (`accessibility-responsive.spec.ts:639`) to the checkbox group and the
    status list; the real-stack journey stays as it is — it never opens the chooser and saves under
    the untouched default (`real-stack-project-deliverable.spec.ts:190,194`), asserting one output
    (`:210`) and `versionCount: 1` (`:219`).
11. Docs listed in §2; the D10 record once §5 is answered.

**Validation (per `CLAUDE.md`), strictly sequential — never Vitest and Playwright together:**
`vitest run packages/domain packages/contracts apps/api/src/features/projects
apps/api/src/features/saved-videos apps/api/src/shared-contract-parity.test.ts`; `vitest run
apps/web/src/features/projects apps/web/src/features/export-placements
apps/web/src/features/video-gallery`; `bun run typecheck`; `bun run --filter @studio/api db:check`;
the Postgres integration test against the compose-5433 throwaway database; `bun run build` with
`scripts/check-build-manifest.mjs`; the targeted Playwright specs; `bun run format:check` and
`bun run check:docs`. Because the unit of work, the contracts and a migration are shared
foundational code, finish with `bun run quality`. **Render-time budget:** a set costs at most
N × today's single-placement render plus N uploads on the reference clip, N ≤ 4 renders and ≤ 5
Versions, measured in prompt 18 and recorded in §6; the server side streams at most five 300 MB
assets per request with two in flight, and its wall-clock is measured against the request timeout
the same way.

## 4. Risks and dependencies

- **Bundle budgets are a measurement, not an assumption.** `ProjectOutputSaveSection` is imported
  only by `ProjectWorkspaceSurface`, so the new hook, record and progress list land outside the
  shell and Studio closures as long as nothing in `export-placements`' barrel imports them —
  `ExportPlacementChooser`/`ExportPlacementProgress` are in the Studio `SaveVideoDialog` and are
  therefore left untouched (a `sequence` prop on the existing progress component would put the set
  UI inside the Studio closure, which is why there is no such fallback). Step 0 records the closure
  sizes and step 8's build verifies them; any raise that is nevertheless needed is written into the
  manifest ledger like the entries before it.
- **Server work per request grows to N + 1 full-asset copies.** Serial member inspection beside
  the one cut read, with each temp copy removed before the next is opened, bounds it to two temp
  copies at a time, N ≤ 4, 300 MB per rendition unchanged; the wall-clock must be measured.
- **Two validators, one rule.** The Postgres and file commit validators are hand-mirrored; the
  shared fixture and the integration test's "both must agree" comment are what hold them together.
- **Old receipts must keep replaying.** `variantSetId` defaults on the Version and is optional
  with no default on the request; contract tests parse a pre-slice result verbatim. Whether
  receipts written between 0020 and 0022 (Versions without `exportSpecification`) exist in
  candidate data should be stated before release; this plan raises it, `CLOUD_PERSISTENCE.md`
  does not yet.
- **Client-supplied `variantSetId` is identity from the body.** It is accepted only against the
  session owner's target aggregate and the Project's own `lastSuccessfulOutput`, never trusted on
  its own; ownership stays with the session subject.
- **A join is only valid while the Project and the video stand still.** Any material change to
  the Project, or any Version added to the video from elsewhere, makes the join a 409; the browser
  checks both before rendering and offers a plain save instead, so the cost is a new, ungrouped
  set rather than a wasted render.
- **The 100-Version cap is reached five times faster.** Refused in the destination form before
  any render and by the server before writing, with a 409.
- **Peak browser memory is source + one output for the whole loop** instead of one render;
  strict serial order and dropping the Blob before the next render are what keep it there, and a
  component test asserts renders never overlap an upload.
- **Orphaned rendition bytes multiply** (a discarded interrupted set, a member stored but not
  saved): bounded to one set per attempt, reduced by persisted keys, and still the STOR-1/D14
  sweep's job — not pulled into this slice; the copy says files already made stay until cleanup.
- **Primary-only pointers are visible.** `currentVersionId`, `lastSuccessfulOutput`,
  `isCurrentForProject` and `referenceRevision` name one member; after a join the retried sibling
  becomes current. The surfaces say "Saved together" so this reads as designed, not as a mistake.
- **Gallery filters and the card format read the current Version only**; a set whose primary is
  16:9 is invisible under Portrait. Documented, not changed.
- **The Studio save dialog cannot produce sets** and its re-framed Versions carry no placement
  (prod-9 residue): out of scope, recorded in the audit register.
- **The e2e journey renders H.264 in the worker.** The evidence that this runs on the Linux
  runner's Chromium is measured, not assumed: the Quality workflow's "Browser journeys" job
  (`quality.yml:69-94`, ubuntu-latest, `bun run test:e2e`) passed on develop at `eeb9a6ec` and
  `f58e5248` (2026-09-04) with the untagged existing-video journey rendering the decodable fixture
  three times. The matrix note that Linux Chromium cannot decode H.264
  (`e2e/studioVisualMatrix.ts:3-14`) is about the API's own fixture (`loadH264VideoFixture`);
  `loadDecodableH264VideoFixture()` reads `e2e/fixtures/decodable-h264-video.base64`
  (`existingVideoHarness.ts:22-28`), made for that runner. If the placement path nevertheless fails
  there, tag the journey `@cross-browser` knowingly (`TESTING.md:270-272`) and keep the section
  tests as the Chromium coverage.
- **A "silent" capability trial** (`videoEditSupport.ts:123-129`) can refuse a set at Save time;
  the refusal is explicit rather than a downgrade, but the operator sees it only after clicking.
- **Docs drift is already present** (`projects.md:352-355`, `17-empty-project-lifecycle.md:159-163`,
  `CLOUD_PERSISTENCE.md:124`, `IMPLEMENTATION_PROMPTS.md:225-226`) and is corrected in the same
  change.

## 5. Questions whose answers change the implementation

Only these five change what prompt 18 builds; each carries a recommendation and what the other
answer costs. **Answered 2026-09-05: every recommendation is approved as written** — the set travels
on the save request (Q1), "Keep as it is" may be the presented primary of a set (Q2), a later save
may join a set under a validated `variantSetId` (Q3), a failed member leaves the produced subset
saved and is named with Retry (Q4), and the journey runs untagged on Chromium (Q5). Prompt 18
implements exactly those answers; D10 is recorded as decided in
[Decisions required](../DECISIONS_REQUIRED.md) in the same commit.

**Q1 — Where does the set live: on the save request, with the revision keeping one chosen
placement as intent and the primary derived server-side (recommended), or on the revision
snapshot?** The recommendation touches no snapshot, proposal, matcher, history-revision schema or
persistence reader, and keeps History's `Placement:` line and the Save trigger meaningful; its cost
is that extra placements chosen before Save are not Project state (lost on a reload before Save) and
that History states intent while the outputs beneath it state what was produced. The alternative — a
list beside `exportSpecification` or a v3 type change — changes the proposal guard, both no-op
matchers, `materialSnapshot`, the history contract and UI, both readers and every snapshot fixture
(and, for v3, migration 0023 becomes a CHECK change with a V2→V3 read map and file library v8).

**Q2 — May a set include the cut itself — "Keep as it is" as the presented primary plus ticked
placements (recommended: yes)?** It is the natural "keep the original and also make Phone and
Square"; it costs one derivation case, one Version more per save (≤ 5), one service test, and the
join branch's rule that the cut is never stored again — without which every Retry after such a set
would mint a second as-is Version. The result refinement already asserts a null-placement current
Version is presented. Answering no keeps today's refusal of renditions when nothing is chosen,
bounds a save at four Versions, and removes that case, its test and the join's special handling.

**Q3 — May a later save join an existing set with a client-supplied `variantSetId`, validated
against the target Saved Video and the Project's `lastSuccessfulOutput` (recommended: yes)?** This
adds an optional field to the save request, which the standing rules say to ask about
(`IMPLEMENTATION_PROMPTS.md:60-61`) — the stated scope is "raise the cap". It is what makes "name
the failed ones with retry" true on the gallery and the overview card after a partial save; it
costs the optional request field, one validation rule on already-loaded data, the duplicate-aspect
refusal, the join branch of the primary rule and the attribution copy. Answering no makes the set id
server-only, so prompt 18's retry deliverable becomes a second, ungrouped set on the same video
that "gallery shows variants together" would not group, and the request schema stays exactly
`renditions` plus the cap.

**Q4 — When member k fails or is cancelled: continue to the remaining members and save the
produced subset automatically, naming the failed ones with Retry (recommended, as prompt 18 asks),
or stop at the first failure and ask "Save 2 of 3 / Retry first"?** The recommendation writes one
revision per set plus one per retry and leaves no member waiting on a dialog; the alternative adds a
confirmation step, keeps uploaded bytes waiting, and turns the loop's continue-on-failure into
stop-on-failure with different tests. Either way the server stays all-or-nothing per request.

**Q5 — Which engine runs the one-save-several-placements journey: untagged Chromium with the
existing decodable H.264 fixture (recommended), or `@cross-browser` on WebKit?** Chromium keeps the
only end-to-end coverage of the loop on the default project and needs no new fixture; the runner
has been measured doing exactly this work — the Browser journeys job passed at `eeb9a6ec` and
`f58e5248` with three renders of that fixture (§4) — and the matrix note about Linux Chromium and
H.264 concerns the other fixture, not this one. The cost is that a change in the pinned browser
would surface here first. Tagging it hands the journey to WebKit and leaves Chromium with component
tests only. The real-stack journey stays as it is in both cases; extending it to a set (N on-device
renders inside its 60 s budgets) is a follow-up once the render time on the runner is measured.

Everything else in §3 — `variantSetId` on every Project-saved Version including zero-rendition
saves, the Continue-save resume, the checkbox group in the destination form, the primary-only
pointers, the id purposes — is a routine call made the way the nearest existing code makes it, and
prompt 18 proceeds on those defaults.

## 6. Validation (prompt 18)

Left for prompt 18's own validation report, since the slice has no verification prompt: the
render-time and memory measurements against the budget stated in §3, the shell and Studio closure
sizes before and after, cross-mode persistence of `variantSetId` (Postgres against the throwaway
database, file mode with a reopened library), the three interruption hooks with three renditions,
and what was not established.
