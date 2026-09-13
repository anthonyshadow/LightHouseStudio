# Slice 3.1 — Composition domain model (snapshot v3): audit and plan

**Document type:** the audit-and-plan output of implementation prompt 25 (Phase 3, slice 3.1 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-12 against commit `229ae1e5`. Prompt 26 implements
it; prompt 27 verifies. Findings db-2, db-3 and DC-1/2/3 are in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md); D1, D2 and D3 are in
[Decisions required](../DECISIONS_REQUIRED.md). **Prompts 25 and 26 were run in one pass on the
operator's instruction to "audit, plan and implement"**: the design below was written first, the
recommendations in §5 were taken as the answers, D1–D3 were recorded as decided with the
recommendation each entry already carried, and the code in §6 was written against this plan. The
decisions in §5 are therefore the ones to review; nothing here was separately approved.

**In one paragraph.** The Project snapshot is version 2: one source, one working cut, one local edit
spec, and five first-class AI fields (`selectedCharacter`, `selectedOutfit`, `selectedVoice`,
`visualTreatment`, `creativeIntent`) that make AI the spine of the workspace; an output save forces
status `completed` at the storage boundary in both persistence modes. Snapshot **v3** adds a
`composition` (ordered clips referencing media the Project holds, each with a trim in its own media
time and its own audio level, plus one list of sequence-time subtitle cues), demotes the five AI
fields to one nullable `transform` sub-object whose empty form is `null`, and turns "completed" from
a word the storage layer demands into the status the domain derives. Old revisions are read through
an explicit v2→v3 map that fabricates nothing (v1 rows go v1→v2→v3 through the map that already
exists), the Postgres check constraint widens from `in (1, 2)` to `in (1, 2, 3)` in one additive
migration, file mode needs no format bump, the checkpoint contract carries `transform` in place of
the five fields, and every existing single-clip flow reads and writes v3 with no observable change.
Nothing in this slice writes a non-null composition; that is 3.3's write path and 4.1's editor. Two
choices shape the rest and are recorded in §5: where the "empty transform is null" rule is
enforced, and that composition clips are made retention-safe now rather than when the first writer
lands.

## 1. Current behaviour, with evidence

### 1.1 The snapshot and its rules (domain)

- `ProjectSnapshot` is version 2 (`packages/domain/src/projects/types.ts:4-5`) with sixteen fields
  (`:156-172`): `schemaVersion`, `sourceAssetId`, `workingMedia`, `presentedMedia`,
  `selectedCharacter`, `selectedOutfit`, `selectedVoice`, `visualTreatment`, `liveMode`,
  `creativeIntent`, `localEdit`, `exportSpecification`, `lastSuccessfulOutput`, `workflowPhase`,
  `createdAt`, `updatedAt`. There is no clip, sequence or composition-level cue anywhere in the
  domain (db-2); `VideoEditSpec` (`video-editing/types.ts:68-83`) carries the single clip's trim,
  crop, rotation, flips, adjustments, filter, `subtitles` (slice 2.1) and `audio` (slice 2.2).
- `validateProjectSnapshot` (`projects/rules.ts:424-543`) refuses any version but 2 (`:425`),
  validates ids/labels/timestamps of the five AI fields and their two cross-field rules
  (character swap needs a character, saved-outfit try-on needs an outfit), and returns a copy with
  canonical timestamps (`:543`). It does not validate `localEdit`; that is the contract's job.
- `createEmptyProjectSnapshot` (`:545-574`) writes `userIntent: ''` and `visualTreatment.kind
'none'`. `clearedProjectCreativeConfiguration` (`:587-607`) is what a save spreads onto the
  post-save revision: all four selections reset, the prompt reset, **`userIntent` kept**. It
  arrived in commit `3ff62dd7` (2026-08-24), before the roadmap.
- `materialSnapshot` (`:609-621`) is the JSON projection whose change clears
  `lastSuccessfulOutput` on the next revision (`appendProjectRevision`, `:1264-1352`, comparison at
  `:1314-1319`). It lists the five AI fields explicitly.
- `deriveProjectStatus` (`:623-647`) already derives `completed` from one fact only: the snapshot's
  `lastSuccessfulOutput` equals the validated output the facts carry. The transition table
  (`:649-658`) lets `completed` move back to `draft`/`ready`/`processing`/`needs-attention`; nothing
  in the domain gates a mutation on `completed` as an input (`removeProjectSource` refuses only
  `processing`, `:1479`).
- `saveProjectOutput` (`:1127-1262`) spreads the cleared configuration, sets `workflowPhase:
'complete'` and derives the status with `validatedLastSuccessfulOutput = outputReference`, so the
  domain itself never _demands_ `completed`; it arrives at it.
- `removeProjectSource` (`:1447-1515`) nulls the source, both media pointers, the output pointer
  and `localEdit` ("the edit describes media that is going away") and returns the phase to
  `source`. `duplicateProjectSnapshot` (`:807-819`) spreads the whole snapshot, so any new field is
  carried by reference automatically; its doc comment (`:797-804`) enumerates the five flat fields.

### 1.2 The storage rule that forces `completed` (db-3, D2)

- `projectOutputCommitInconsistency` (`apps/api/src/features/projects/project-repository.ts:438`)
  is the one predicate both persistence modes hold an output commit to. Among its clauses:
  `nextProject.status !== 'completed'` (`:508`) — the storage boundary pins the word rather than
  the derivation. It is called by `file-project-repository.ts:2402` and by
  `infrastructure/database/project-repository.ts:3482`.
- A second pin lives in the contract: `projectOutputSaveResultSchema` requires
  `project.status === 'completed'` on every save result and on every stored save receipt
  (`packages/contracts/src/projects.ts:1124`; receipts re-parse through it at
  `infrastructure/database/project-repository.ts:508` and `file-project-persistence-schema.ts:409`).
- Outside those two, nothing in either app refuses editing, checkpoints, source removal or
  working-media adoption because a Project is `completed` (verified by grep, both apps).

### 1.3 Both snapshot validators and the migration pattern

- `packages/contracts/src/projects.ts:11-12` mirror the version constants. `projectSnapshotV2Schema`
  (`:323-389`, not exported) is strict, refines timestamps and the AI cross-field rules (four
  checks, `:335-383`), and canonicalises `createdAt`/`updatedAt` in a `.transform` (`:384-388`).
  `legacyProjectSnapshotSchema` (`:391-434`) is the v1 shape; `migrateLegacyProjectSnapshot`
  (`:436-491`) fills the fields v1 never had with `null` — "without fabricating missing applied
  provenance" (`projects.test.ts:199`) — and parses the result through the v2 schema.
  `projectSnapshotSchema` is `z.union([v2, legacy.transform(migrate)])` (`:493-496`): zod returns
  the first member that parses, and both members are strict, so the version literal routes the row.
- `projectSessionProposalSchema` (`:821-853`) is the checkpoint write: `workflowPhase`, `liveMode`,
  the five AI fields, `localEdit` (through `proposedVideoEditSpecSchema`, `:816-819`, which refuses
  a spec that omits a defaulted field with "This tab is out of date…") and `exportSpecification`;
  strict; it mirrors two of the four cross-field rules.
- **Postgres.** Every write parses through `projectSnapshotSchema` (`project-repository-mappers.ts`
  `revisionValues`, `:341-355`, which also writes `snapshotSchemaVersion: revision.snapshot.schemaVersion`);
  every read goes through `parseSnapshot` (`:58-66`), which admits versions `1` and
  `PROJECT_SNAPSHOT_SCHEMA_VERSION` — a literal list, so bumping the constant silently drops `2`.
  The column is guarded by `check (snapshot_schema_version in (1, 2))` (`schema.ts:752-755`),
  installed by `drizzle/0018_stormy_darkhawk.sql:35,43` as a DROP CONSTRAINT + ADD CONSTRAINT pair
  and pinned by `project-migration.test.ts:170`.
- **File mode.** `storedRevisionSchema.snapshot` is `projectSnapshotSchema`
  (`file-project-persistence-schema.ts:52`), so a v1 row on disk migrates on read and is rewritten
  in the current version on the next write; the library envelope is version 7 (`:431`, `:643`) and
  independent of the snapshot version.
- The developer database holds 2 v1 and 284 v2 revisions today (read-only count on 2026-09-12); a
  read-back of all of them through the new union is a cheap verification for prompt 27.

### 1.4 Who reads the five AI fields

- **API (five modules).** `project-service.ts:45-59` `sessionProposalMatches` — a JSON.stringify of
  a nine-field projection against the proposal, whose silent failure appends a duplicate revision
  on replay; `checkpoint` (`:306-309`) merges `{ ...snapshot, ...proposal, updatedAt }`.
  `project-snapshot-relations.ts:49-53` derives `reference` asset links from the three reference
  ids; `project-asset-memberships.ts:51-70` derives Character/Outfit/Voice memberships (and runs
  inside the file-mode envelope migration, `file-project-persistence-schema.ts:593-632`);
  `project-output-service.ts:167-190` derives a Version's origin and attribution;
  `project-processing-service.ts:250-300` builds the paid recipe from the transform and gates
  submission on `visualTreatment.kind`.
- **Web (three modules, one presentation).** `projectSessionController.ts:34-44`
  `proposalFromCurrent` (the proposal shape's one web owner; `proposalsMatch` at `:46-49` is a
  JSON.stringify equality); `projectCreativeSessionAdapter.ts` (84 hits: the proposal builder at
  `:402-427` and the hydration/issue readers at `:67-85`, `:435-578`);
  `useProjectCreativeSessionAdapter.ts` (42 hits, three JSON.stringify keys: `creativeChoices`
  `:45-58`, `creativeHydrationKey` `:83-94`, the effect's `configKey` `:387-392`);
  `projectCreatePresentation.ts:47,143`. `ProjectCreateTaskPanel.tsx` reads only `sourceAssetId`,
  `workflowPhase` and `lastSuccessfulOutput`. Nothing outside `features/projects` reads the five
  fields; the `selectedVoice`/`selectedCharacter` hits elsewhere are unrelated local state.
- **Six key-order-sensitive JSON equalities** exist in total (the four above, `materialSnapshot`,
  and `sessionProposalMatches`). Zod output follows shape order, so every parsed value agrees
  automatically; only domain-built literals can drift.
- **Fixtures.** Seventeen web test files carry their own `schemaVersion: 2` literal (no shared
  helper exists), plus `e2e/support/projectHarness.ts:58`, `contracts/projects.test.ts:73,221`,
  `file-project-repository.test.ts:630`, the scripted Postgres rows in
  `infrastructure/database/project-repository.test.ts:71,121,170,201,349`, and the v1 rows the
  Postgres integration tests insert directly (`project-migration.postgres.integration.test.ts:86`,
  `project-repository.postgres.integration.test.ts:927,1650,1758`).

### 1.5 What does not need to change

- The revision/CAS/receipt machinery, both repositories' transaction shapes, the route inventory,
  the file library envelope (stays 7), and every request contract other than the checkpoint
  proposal. `localEdit` keeps its meaning: the single-clip edit that made the working media.
- `deriveProjectStatus`, the transition table, `workflowPhase` vocabulary (`complete` after a save
  is UI-visible and out of this slice's scope; recorded as a follow-up).
- The web parses every Project response through `projectCurrentResponseSchema`
  (`projectsApi.ts:118-429`), so a v2 body from a not-yet-upgraded API still parses to v3 in the
  browser.

## 2. Affected code, contracts, storage and tests

| Layer     | Files                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain    | `projects/{types,rules,index}.ts`, new `projects/media-reference.ts` and `projects/transform.ts`, new `composition/{types,rules,index}.ts`, `src/index.ts`; tests `projects/projects.test.ts`, new `projects/transform.test.ts`, `composition/composition.test.ts`                                                                                                                            |
| Contracts | `projects.ts` (constants, `projectTransformSchema`, `compositionSchema`, v3 schema, v2 read map, union, proposal); `projects.test.ts`; new `projects.snapshot-migration.property.test.ts`; `apps/api/src/shared-contract-parity.test.ts`                                                                                                                                                      |
| API       | `features/projects/{project-repository,project-service,project-snapshot-relations,project-asset-memberships,project-output-service,project-processing-service,routes,file-project-persistence-schema}.ts`; `infrastructure/database/{schema,project-repository-mappers}.ts`; new `drizzle/0027_*.sql` + meta; tests beside each, `project-migration.test.ts`, both Postgres integration tests |
| Web       | `features/projects/{projectSessionController,projectCreativeSessionAdapter,useProjectCreativeSessionAdapter,projectCreatePresentation}.ts`; the seventeen fixture-bearing tests                                                                                                                                                                                                               |
| E2E       | `e2e/support/projectHarness.ts` (v3 fixture); `e2e/app-routing.spec.ts:912,1027`                                                                                                                                                                                                                                                                                                              |
| Docs      | `DECISIONS_REQUIRED.md` (D1–D3), `product/DOMAIN_MODEL.md`, `CLOUD_PERSISTENCE.md`, `ARCHITECTURE.md`, `architecture/TARGET_ARCHITECTURE.md`, `audits/CURRENT_STATE_AUDIT.md`, `decisions/0002-durable-project-aggregate.md`, `PRIVACY_AND_TEMPORARY_DATA.md`, `user-flows/projects.md`, `user-flows/feature-behavior/{11,17}-*.md`, `roadmap/{PRODUCT_ROADMAP,IMPLEMENTATION_PROMPTS}.md`    |

## 3. Design and implementation plan (in order)

### The model — snapshot v3

```ts
export const PROJECT_SNAPSHOT_SCHEMA_VERSION = 3 as const;
export const PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION = 2 as const; // read-migrated
export const LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION = 1 as const; // read-migrated, via v2

export interface ProjectTransform {
  // Key order is load-bearing (six JSON.stringify equalities); mirrored by the contract.
  readonly selectedCharacter: ProjectCharacterSelection | null;
  readonly selectedOutfit: ProjectOutfitSelection | null;
  readonly selectedVoice: ProjectVoiceSelection | null;
  readonly visualTreatment: ProjectVisualTreatment;
  readonly creativeIntent: ProjectCreativeIntent;
}

export interface ProjectSnapshot {
  readonly schemaVersion: 3;
  readonly sourceAssetId: string | null; // the primary (first-accepted) source; see §5
  readonly workingMedia: ProjectMediaReference | null;
  readonly presentedMedia: ProjectMediaReference | null;
  readonly composition: Composition | null; // null: no arrangement yet, the current cut stands in
  readonly transform: ProjectTransform | null; // null: no AI configured
  readonly liveMode: ProjectLiveModeMetadata | null; // capture metadata, not a treatment
  readonly localEdit: VideoEditSpec | null;
  readonly exportSpecification: ProjectExportSpecification | null;
  readonly lastSuccessfulOutput: ProjectOutputReference | null;
  readonly workflowPhase: ProjectWorkflowPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

Why these shapes. **`transform` nullable, with `null` as the canonical empty form.** "AI is an
optional attachment, not the spine" is a claim the type should make: a Project with no AI has
`transform: null`, and one check answers "is anything configured". Two spellings of the same state
would be a bug source (the six equalities), so the empty form is canonical: an all-empty transform —
all three selections `null`, `visualTreatment.kind === 'none'`, `creativeIntent` all-`null` with
`userIntent === ''` (no trimming, matching the contract, which does not trim intent) — is always
stored, sent and compared as `null`. Where that is enforced is decision Q1 (§5). `liveMode` stays
top-level: it records how the source was captured, the post-save reset already leaves it alone, and
D12 mothballs the live model it names. **`composition` nullable rather than an empty list**: a
composition with no clips is not a composition, and `null` mirrors `localEdit: null` — "the current
cut stands in". The v2→v3 map writes `null`; synthesising one clip from `sourceAssetId` and
`localEdit.trim` would claim an arrangement the operator never made and would disagree with the
working media, which is the _rendered_ cut (the seed rule for the first real composition is in §5).

### The composition module — `packages/domain/src/composition`

```ts
export const COMPOSITION_CLIP_LIMIT = 100;

export interface CompositionClip {
  readonly id: string; // app-generated UUID: the editor's selection key; a split keeps one half's id
  readonly media: ProjectMediaReference; // a source, an adopted result, or a borrowed Library Version
  readonly trim: Readonly<{ startMs: number; endMs: number }>; // media time; ≥ VIDEO_EDIT_MINIMUM_TRIM_MS
  readonly audio: VideoEditAudio; // level 0..100 + mute; gain via videoEditAudioGain
}

export interface Composition {
  readonly clips: readonly CompositionClip[]; // ordered; 1..COMPOSITION_CLIP_LIMIT
  readonly subtitles: readonly SubtitleCue[]; // sequence time; sorted by start then id; ≤ SUBTITLE_CUE_LIMIT
}
```

- **Clip media is a `ProjectMediaReference`** (`asset | saved-video-version`), not a source id that
  does not exist yet: it names sources, adopted job results and borrowed Library Versions with the
  one vocabulary the snapshot already uses, and `project_sources` already indexes by asset. The type
  moves to a leaf file `projects/media-reference.ts` (re-exported from `types.ts`) so the
  composition module can import it without a file-level cycle, which `check:modules` refuses.
- **Trim is in the clip's own media time**, like `VideoEditSpec.trim`, so a clip survives its
  neighbours changing. The domain enforces order and the minimum (`VIDEO_EDIT_MINIMUM_TRIM_MS`);
  the upper bound needs the media's duration, which the domain does not have — it is validated
  where the media record is known (the 3.3 write path), as `normalizeVideoEditSpec` does with its
  source geometry today.
- **Subtitles are one list in sequence time** — milliseconds from the start of the stitched output
  — because cues span cuts, and the render worker already consumes output-time cues. One list with
  per-cue caption regions is the "subtitle track" the roadmap names; wrapping it into named tracks
  later is a defaulted addition (one default track), not a rewrite. **Cues are not clamped to the
  composition's duration** (decision Q3, §5): the same rules as the single-clip list apply (unique
  ids, minimum duration, start order, the cap, text bounds) via the existing `normalizeSubtitleCues`
  over an unbounded timeline; intersecting with the composition's length happens at render, as
  `outputSubtitleCues` does for the trim today.
- **Per-clip audio reuses `VideoEditAudio`** and its rules (`normalizeVideoEditAudio`,
  `videoEditAudioGain`), so the file and the stage cannot disagree by a decibel across clips
  either. No composition-level master level in this slice; a defaulted field later has precedent.
- Rules, all pure: `validateComposition(composition)` (returns the composition, or throws
  `CompositionRuleError` naming the first violated invariant, which `validateProjectSnapshot`
  rethrows as `ProjectRuleError('invalid-snapshot')` — the aggregate keeps its own error taxonomy,
  as `requireOpaqueId`'s callers already do), `normalizeComposition` (identity-preserving, like
  every normalizer in `video-editing`) and `compositionDurationMs` (the sum of the trims — the
  timebase the cues are anchored to). The module imports only `video-editing`, `common/identity`
  and the media-reference leaf. Cue order is checked on the start alone, which is what the wire
  checks: a list the contract admits must not be one the domain refuses on its next write.

### The transform helpers — `packages/domain/src/projects/transform.ts`

`EMPTY_PROJECT_TRANSFORM` (a plain object in contract key order — no `Object.freeze`, for the bundle
reason recorded in `video-editing/rules.ts`), `projectTransformIsEmpty(t)`,
`normalizeProjectTransform(t)` (returns `null` when empty, **otherwise `t` itself**, never a rebuilt
literal — a rebuilt object would reorder keys and make `materialSnapshot` see a change on a no-op
checkpoint, which nulls the output pointer), and `projectTransformOf(snapshot: Pick<ProjectSnapshot,
'transform'>): ProjectTransform` (`null` → the empty view, for **reading only, never for
equality**; typed on a `Pick` so the web can call it with the contract's snapshot type).

### Rule changes — `packages/domain/src/projects/rules.ts`

- `validateProjectSnapshot`: version 3; the transform's existing checks run when it is non-null;
  `compositionIssue` when the composition is non-null; the returned copy is
  `{ ...snapshot, transform: normalizeProjectTransform(snapshot.transform), createdAt, updatedAt }`
  — the single choke point (Q1), covering `createProject`, `appendProjectRevision`,
  `saveProjectOutput` and `duplicateProjectSnapshot` with one edit.
- `createEmptyProjectSnapshot`: `composition: null`, `transform: null`.
- `clearedProjectCreativeConfiguration` becomes `clearedProjectTransform`: the empty transform with
  `userIntent` kept, normalised — so a save whose intent was `''` stores `transform: null` and one
  whose intent was typed stores a one-field transform. Behaviour is otherwise unchanged: the
  post-save reset stays (see D2 in §5 for why it is not this slice's call to remove).
- `materialSnapshot`: `composition` and `transform` replace the five fields.
- `removeProjectSource`: `composition: null` beside `localEdit: null` — the media it arranges is
  going away; single-source semantics, which 3.2 narrows to pruning the clips that name the removed
  source. `transform` is kept, as the creative setup is today.
- `duplicateProjectSnapshot` needs no code change; its comment is refreshed.
- `PROJECT_ASSET_ROLES` gains `'clip'` and `ProjectVersionReferenceRole` gains `'clip'` (Q2, §5).

### D2 in storage — derive, do not pin

`projectOutputCommitInconsistency` replaces `nextProject.status !== 'completed'` with
`nextProject.status !== deriveProjectStatus(revision.snapshot, { sourceStatus: 'ready',
currentAttempt: { status: 'none' }, validatedLastSuccessfulOutput: { savedVideoId, videoVersionId:
primary.id } })` — the same facts `saveProjectOutput` derives from, so both repositories keep one
oracle and the storage boundary no longer knows the word. The result is the same status today
(`completed`, meaning "the current cut is saved"); what changed is who decides. The contract pin at
`projects.ts:1124` stays, because it states the same derivation for the save response, and is named
in the D2 note as the one remaining place the word is spelled.

### The contract — one transform schema, a total proposal, an explicit read map

- Constants mirrored by hand and pinned in `shared-contract-parity.test.ts`:
  `PROJECT_SNAPSHOT_SCHEMA_VERSION`, `COMPOSITION_CLIP_LIMIT`, `VIDEO_EDIT_MINIMUM_TRIM_MS`, the
  transform's key order (`Object.keys(EMPTY_PROJECT_TRANSFORM)` against the schema's shape) and the
  emptiness predicate (domain `projectTransformIsEmpty` against the contract's fold).
- `projectTransformSchema`: strict object, the four cross-field refinements the v2 snapshot carried,
  then a `.transform` that **folds an all-empty transform to `null`**, then `.nullable()`. One
  instance, used by both `projectSnapshotV3Schema` and `projectSessionProposalSchema`, so the
  stored value and the incoming proposal are canonical by construction and compare equal. Folding
  rather than refusing keeps the contract total: a refusal in the snapshot schema would throw inside
  an output commit, and one in the proposal schema would throw inside a React effect (the web parses
  each staged proposal synchronously in `propose`).
- `compositionSchema`: strict; clip ids `z.uuid()`, media through `projectMediaReferenceSchema`,
  trim order and minimum, audio through the extracted `videoEditAudioSchema` (no default), cue list
  through the extracted `refineSubtitleCueList` the edit spec already applies, unique clip ids,
  `min(1).max(COMPOSITION_CLIP_LIMIT)`. **No `.default()` anywhere** in the new schemas, so the
  proposal path needs no new "state every defaulted field" guard.
- `projectSnapshotV3Schema`: the shared shape split into a media part and a state part, with
  `composition` and `transform` between them; the same timestamp refinement and canonicalising
  `.transform` as v2. `projectSnapshotV2Schema` stays as a strict, un-refined intermediate.
  `migrateProjectSnapshotV2` regroups the five fields, sets `composition: null`, and returns
  `projectSnapshotV3Schema.parse(...)` so migrated rows are canonicalised; `migrateLegacyProjectSnapshot`
  builds the v2 shape as today and passes it through the v2 map.
  `projectSnapshotSchema = z.union([v3, v2.transform(migrateV2), v1.transform(migrateV1)])`; the
  v2 literal is written as `2` explicitly, and a test pins that a v2 body carrying a stray
  `transform` key is refused, not half-migrated.
- `projectSessionProposalSchema` becomes `{ workflowPhase, liveMode, transform, localEdit,
exportSpecification }`, strict, preceded by a refinement that answers a flat pre-v3 body with the
  existing out-of-date message (`PROJECT_STALE_CLIENT_MESSAGE`, now a named export the localEdit
  guard uses too). `routes.ts` surfaces that message on the 400 when it is the reason, so a stale tab
  reads "reload" instead of a validation code. The GET side of a stale tab is not a contract problem
  this slice can solve — an old bundle's strict `z.literal(2)` refuses every v3 response — so the
  deploy order is **API first, then reload the tab**, recorded in §4.

### Storage — one widened check, one derived column, no format bump

- `schema.ts`: `in (1, 2, 3)`; `'clip'` added to `project_asset_role` and
  `project_version_reference_role`. One generated migration `0027_*` (DROP + ADD CONSTRAINT, two
  `ALTER TYPE … ADD VALUE`, no data statements), asserted by a new `project-migration.test.ts` block
  with the 0018 regex (which allows DROP). `ADD CONSTRAINT … CHECK` validates existing rows under a
  lock; safe, since the set only widens.
- `project-repository-mappers.ts`: `parseSnapshot` admits an explicit
  `READABLE_PROJECT_SNAPSHOT_SCHEMA_VERSIONS` set (`1, 2, 3`, exported by the contract so the
  three statements of the supported set — check, mappers, union — move together);
  `revisionValues` derives `snapshotSchemaVersion` from the _parsed_ snapshot so the column and the
  JSON cannot disagree.
- File mode: `storedRevisionSchema` is unchanged; the version-reference role enum gains `'clip'`;
  the library format stays 7. **Rollback boundary differs by mode:** Postgres keeps v2 rows as v2
  until a Project is next written; file mode rewrites a migrated Project's whole history as v3 on
  its first write (author and source untouched, no fabricated `migration` revision). Rolling back
  the code after either has written v3 requires the v3 read map, which is why the write can be
  held behind the deploy order rather than a flag: no old code path needs to read v3. **File mode
  moves a whole owner at once:** the repository serialises the owner's entire library on every
  write, so the first write of any one Project rewrites every Project and every revision in that
  file as v3 — there is no per-Project boundary to roll back to.

### Relations — composition media held like any other media

`projectAssetLinksForRevision` and `projectVersionReferenceLinksForRevision` walk
`composition?.clips` and emit `'clip'` links; `projectHeldMedia` includes clip media. Both
retention policies (`DrizzleProjectRetentionPolicy` over `project_assets` and
`project_version_references`; the file repository over `assetLinks`) therefore retain clip bytes
from the first non-null composition, and a Library Version a clip borrows is held against deletion
the way a working-media reference is. `deriveProjectAssetMemberships` reads the transform for
Character/Outfit/Voice memberships and clip media for Video memberships.

### The browser — mechanical, with the six lists collapsed to one field

- `proposalFromCurrent` → `{ workflowPhase, liveMode, transform, localEdit, exportSpecification }`
  in schema order. `createProjectCreativeProposal` returns
  `transform: normalizeProjectTransform({...})` — normalisation is a property of the builder, and a
  test asserts an empty Studio yields `transform: null`. Readers go through
  `projectTransformOf(snapshot)`; the three JSON keys (`creativeChoices`, `creativeHydrationKey`,
  `configKey`) and `proposalFromCurrent` read raw `snapshot.transform`, so `null` and the empty view
  never sit on opposite sides of an equality. `effectiveCreativeSnapshot`'s shallow overlay keeps
  working: a proposal's `transform` replaces the whole group, which is the intended semantics.
- Fixtures: the seventeen literals become v3 (`composition: null`, `transform: null`, or a
  transform literal where the test configures AI); the e2e harness serves v3; the two
  `app-routing.spec.ts` assertions read `proposal.transform?.selectedCharacter`.

### Order of changes for prompt 26

1. Domain: media-reference leaf, composition module, transform helpers, types, rules, barrels,
   tests. Validate `vitest run packages/domain`, `check:modules`, `check:dead-code`.
2. Contracts: constants, schemas, migration maps, proposal, tests (incl. a v1→v3 and a v2→v3
   property test), parity suite. Validate `vitest run packages/contracts` and the parity file.
3. API: schema + `db:generate` + `db:check`, mappers, the five readers, the D2 predicate, the route
   message, tests; then the throwaway-Postgres recipe (never the development database).
4. Web + e2e: the four modules, the fixtures, the harness, the two spec assertions. Validate the
   projects feature tests, `bun run typecheck`, then — vitest finished — the three checkpoint
   journeys of `app-routing.spec.ts` on Chromium against the running 4173 stack.
5. Docs (§2 table). Validate `format:check`, `check:docs`, `check:retired-program`.
6. `bun run quality` once at the end (shared-foundational row); then `db:migrate:development` on
   the developer database and a package rebuild, deliberately, so the running API and the
   real-stack journey see the widened check.

## 4. Risks and dependencies

- **Deploy order.** An old bundle cannot open any Project once the API emits v3 (strict
  `z.literal(2)` on the GET), and a new bundle gets a 400 on every checkpoint against an old API. For
  a single-operator local-first deployment the rule is: API first, then reload the tab; the 400 now
  says so. The web keeps the read union, so a v2 body still parses in the browser.
- **Key order.** Six JSON equalities depend on the transform's key order. Every parsed value is
  zod-ordered; the two domain-built literals (`EMPTY_PROJECT_TRANSFORM`, the cleared transform) are
  written in schema order and pinned by the parity test. The identity-preserving normaliser is what
  keeps a no-op checkpoint from nulling `lastSuccessfulOutput`.
- **Bundle budgets.** The domain barrel grows (composition rules, transform helpers) and every
  authenticated route pays for it; the shell and Studio closures have historically sat within a few
  KB of their ceilings. New rule tables are plain objects, not frozen; a trip is raised by the
  measured delta with a dated ledger entry.
- **Postgres validation needs a migrated throwaway database** (0027 applied) before the repository
  suites; the migration suites create their own. The development database is migrated separately
  and deliberately, after the code is green, or the running API's next read fails on the old
  check.
- **`ALTER TYPE … ADD VALUE`** has precedent (`0020`), and drizzle emits it outside the constraint
  statements; the migration test asserts both.
- **D1–D3** are recorded as decided with this plan (recommendation (a) each), per the roadmap's
  "decisions before starting". The prompt was issued on the assumption they would be; that is a
  recording step, and the entries say so.
- Phase-forward statements this shape presupposes (cheap now, a v4 later): (1) `sourceAssetId` in
  v3 means the primary, first-accepted source retained for the single-clip flows; source
  _membership_ is relational (`project_sources`, already revision-linked) and never snapshot state,
  so 3.2 relaxes the single-source guards without touching the snapshot. (2) A composition renders
  to exactly one output frame chosen by policy from its clips; every caption and placement
  computation runs on that frame; a stored `frame` is a defaulted addition in 4.2 if policy is not
  enough. (3) The first real composition is seeded as one clip over the working media (trim
  `0..duration`, default audio); `localEdit` stays that media's provenance and is not re-applied.
  (4) Cues stay anchored to sequence time when an upstream clip changes; a ripple policy is 4.1's
  and is additive. (5) A composition save needs its own `SavedVideoOrigin` value (a pg enum
  addition) in Phase 4. (6) When `project_sources` becomes `(project_id, source_id)`, add a unique
  `(project_id, asset_id)` so a `ProjectMediaReference` resolves to at most one source row.

## 5. Decisions (recorded 2026-09-12)

**D1, D2, D3 — recorded as decided, recommendation (a) each.** Multi-clip composition Projects;
`completed` as a derived milestone; the composition in the revision snapshot as v3. The entries in
[Decisions required](../DECISIONS_REQUIRED.md) carry the consequences. On D2 specifically: what this
slice changes is the storage boundary (§3, "derive, do not pin") and the vocabulary of the model;
the post-save reset of the transform (`3ff62dd7`, a product choice made before the roadmap, with
its own test and user-flow prose) is **kept**, because this slice must leave the single-clip flow
observably unchanged, and because whether a save should carry the setup forward is a question
about what Save operates on — which becomes the composition in 4.3. The `workflowPhase` value
`complete` and the status word `completed` (UI-visible in the workflow strip and the Projects list)
are follow-ups for the same reason.

**Q1 — Where is "an empty transform is `null`" enforced? Decided: in the domain's
`validateProjectSnapshot` and in one shared contract schema that folds, never refuses.** The
alternative — a contract that refuses a non-null empty transform — fails exactly where it must not:
the post-save reset yields the all-empty object whenever the operator typed no intent, every
persisted revision re-parses through the contract in both modes, and the browser parses each staged
proposal synchronously. Folding on both sides keeps stored and proposed values comparable, which is
the whole point of a canonical form; the builder normalises too, and a test proves the three agree.
Emptiness does not trim `userIntent`, because the contract does not.

**Q2 — Are composition clips made retention-safe in this slice? Decided: yes.** `'clip'` joins
both role enums in the same additive migration, the relation functions walk clips, and
`projectHeldMedia` includes them. The alternative — a validator that refuses a non-null composition
until 3.3 — would advertise a field the domain rejects, and would leave the retention invariant
(domain model §"Invariants", 3) to be remembered by the first writer. The migration is being cut
anyway; the cost is two enum values and two loops.

**Q3 — Composition cue timebase. Decided: sequence time, not clamped to the composition's
duration.** Clamping is destructive under the very edits Phase 4 adds (shorten clip 1 → every
trailing cue permanently truncated), which is the loss the single-clip design avoided by keeping
cues in source time. Per-clip cues in media time were the other option; they cannot span a cut,
which is the reason a composition has cues of its own.

Everything else in §3 is a routine call made the way the nearest existing code makes it.

## 6. Validation (prompt 26), 2026-09-12

What was run, and what it established. Every command below was run from the repository root
against the working tree this plan describes.

| Command                                                                                                   | Result                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `vitest run packages/domain`                                                                              | 15 files, 205 tests pass                                            |
| `vitest run packages/contracts`                                                                           | 6 files, 68 tests pass (incl. both migration properties)            |
| `vitest run apps/api/src/features/projects apps/api/src/infrastructure/database`                          | pass, 7 Postgres files skipped without the gate                     |
| `vitest run apps/api/src/shared-contract-parity.test.ts apps/api/src/route-inventory.test.ts`             | pass                                                                |
| `vitest run apps/web/src/features/projects apps/web/src/features/campaigns/CampaignRouteSurface.test.tsx` | 26 files, 248 tests pass                                            |
| `bun run typecheck` (all workspaces + `typecheck:e2e`)                                                    | exit 0                                                              |
| `eslint --max-warnings 0` over every changed and new file                                                 | clean                                                               |
| `bun run format:check`, `check:docs`, `check:retired-program`, `check:modules`, `check:dead-code`         | all pass                                                            |
| `bun run --filter @studio/api db:check`                                                                   | migration chain intact through `0027`                               |
| The five gated Postgres suites on a throwaway migrated database                                           | 5 files, 10 tests pass; database dropped afterwards                 |
| `playwright test e2e/app-routing.spec.ts --project=chromium` (the three checkpoint journeys)              | 3 passed; Playwright stopped the stack it started                   |
| `bun run db:migrate:development` against `lightframe_development`                                         | applied; the check reads `1, 2, 3` and `clip` is in both role enums |
| `bun run quality` (the whole gate)                                                                        | 298 files, 2,453 tests pass; one budget raise, below                |

Two things were established that no suite asserts. **Every stored revision in the developer
database reads as v3**: a read-only pass parsed all 286 rows (2 stored v1, 284 stored v2) through
the new union — 286 read as v3, 227 with no transform, 59 with one, none with a composition, zero
failures. And **the migration property generator reaches the arms it is meant to**: sampled on the
two seeds the tests fix, 200 runs each, the v2 bodies carry ~100 Projects with nothing configured,
3 and 5 saved-outfit try-ons, and both Variant shapes — before the generator was given explicit
arms, all four counts were zero and the fold and coupling rules were untested.

**The one budget this cost.** `check:build-manifest` failed the first `quality` run: the Studio
closure measured 1,092,103 bytes against a 1,092,000 budget. Raised to 1,093,000 with the dated
ledger entry the file's convention asks for. The 421 bytes are the domain's transform helpers,
which every Project surface now reads its creative setup through instead of reading five fields
directly; the composition rules sit in the same barrel and cost this closure nothing, because
nothing on a Studio route calls them yet. The shell closure did not move (749,099 of 750,000).

**Deliberately not run.** The full Playwright suite: this slice changes no journey but the three
checkpoint ones, and the repository's rule is never to run Playwright beside vitest. The real-stack
journey `e2e/real-stack-project-deliverable.spec.ts`: it needs the API restarted on the rebuilt
packages, which is the operator's call, not this pass's.

**Left for the operator.** The running API must be restarted on the rebuilt `packages/*/dist`
before it serves v3; the deploy order is API first, then reload any open browser tab (§4).

**Findings closed during this pass.** An adversarial review of the diff (five lenses) raised 22
items; the ones confirmed against the code were fixed here rather than filed: the empty-transform
fold was unreachable in the property generator; the composition's cue-order rule was stricter than
the wire's, so a stored list the contract admits would have failed on its next write; the v2 read
map turned a refinement failure into a thrown `ZodError` instead of a failed `safeParse`, which the
file library's envelope recovery reads through; the browser's existing-video configuration effect
was keyed on the whole transform, so an intent-only change would have rewritten the editor's step
while the operator typed; the output-commit rule reported the vaguer reason for a save pointing at
the wrong Version; and four domain files failed `format:check`. The remaining items were test-gap
and documentation corrections, also made here.

## 7. Verification (prompt 27), 2026-09-13

The gate's five checks, each with what was run and what it established. Nothing here was taken on
faith from §6: every claim below was re-run against the committed tree.

### 7.1 Every stored v1 and v2 snapshot reads as v3

Two kinds of evidence, because the fixtures and the real data can fail differently.

**The repository's own fixtures**, all exercised by suites that run in the ordinary gate:
`packages/contracts/src/projects.test.ts` (a v1 body and a v2 body, each asserted to regroup
without fabricating provenance, plus the refusal of a v2 body carrying a v3 key);
`projects.snapshot-migration.property.test.ts` (200 generated v2 bodies and 200 generated v1 bodies
per run, on fixed seeds); `apps/api/src/infrastructure/database/project-repository.test.ts` (a
stored v2 row and a stored v1 row through `toRevision` and `mapProjectAggregate`, plus an
unsupported version refused); `apps/api/src/features/projects/file-project-repository.test.ts` (a
v1 snapshot inside a v3 library envelope, a v2 snapshot inside a v6 one, and a v2 snapshot on disk
read as v3 without being rewritten); `project-migration.postgres.integration.test.ts` (v1 rows
inserted as SQL and read back through the migrated schema);
`apps/web/src/features/projects/projectsApi.test.ts` (a v2 response body from a not-yet-upgraded
API, parsed by the browser).

**The developer database**, which is the only place real rows of unknown shape exist. A read-only
pass parsed all 286 `project_revisions` rows — 2 stored as v1, 284 as v2 — through the union:
286 read as v3, 227 with no transform, 59 with one, none carrying a composition, zero failures.
No row was written; the pass only reads.

### 7.2 Round-trip write and read, in both persistence modes

**File mode** is covered by `file-project-repository.test.ts`, which writes through the service and
re-reads across a process restart, and by the on-disk assertions that a read migrates without
rewriting while the next write records v3.

**Postgres** was verified on a throwaway database created for the purpose, migrated through `0027`
and dropped afterwards: the five gated suites pass (5 files, 10 tests), which exercise the
repository's own write and read paths against a real server. The developer database was never used
for test rows.

### 7.3 No behaviour change in the untouched interface

The Project journeys run unchanged: the three checkpoint journeys in `e2e/app-routing.spec.ts` on
Chromium, and the whole Playwright suite as part of the CI gate run recorded in §8 below. The
browser's own suites — 26 files, 248 tests across the Projects and Campaigns surfaces — pass with
fixture shapes updated and no assertion weakened.

### 7.4 The `completed` decoupling, in the status-derivation tests

Three levels now pin it. `deriveProjectStatus` keeps its own table-driven test. A new domain case,
`reaches, leaves, and returns to the completed milestone through ordinary work`, walks the real
mutation path: accept a source (`ready`), save (`completed`), edit (`ready`, pointer cleared), save
again (`completed`), with both saves keeping their own producing provenance. And at the storage
boundary, `routes.test.ts` proves a save succeeds against the derived status rather than the word,
and that re-sending the post-save proposal converges without appending a revision or dropping the
output pointer.

### 7.5 The rollback point

**Measured, not assumed.** The pre-slice contract was checked out at `229ae1e5` and asked to read
what today's code writes. The result is one-directional: today's code writes v3; the pre-v3
contract **refuses** a v3 snapshot; today's code accepts a v2 row and reads it as v3; the pre-v3
contract accepts a v2 row. So the rollback point is exact — **the last moment before the first v3
write** — and it is a property of the data, not of the deployment.

After that moment, rolling the code back needs the data rolled back with it. What that costs
differs by mode, and the difference is the one recorded in §4: Postgres keeps every untouched row
at v2, so only the Projects actually written are affected; file mode serialises the owner's whole
library on each write, so one write moves that owner entirely.

**On the roadmap's suggestion that the v3 write be feature-flagged off until a switch: evaluated
and not built, deliberately.** A flag that suppresses v3 writes has to keep a v2 writer alive — the
domain building the five flat fields, the contract accepting and emitting them, the checkpoint
carrying them — which is the duplicate old/new pathway the standing rules forbid, and it doubles
the matrix every test in §6 covers. It also buys nothing the deploy boundary does not: reads are
already backward-compatible in the direction that matters, so there is nothing to soak behind a
flag; with the flag on the slice is inert, and the moment it is off the boundary has been crossed.
The rollback point above is therefore the mechanism, and it is stated rather than implemented.
This is a deliberate deviation from the parenthetical in prompt 27, recorded here because a
verification gate reports what it finds rather than papering over it.

### 7.6 The CI gates, run locally

Every job in `.github/workflows/quality.yml` was run on this machine with the job's own
environment. The four the `quality-gate` job requires all pass: **quality** (`audit:all` clean,
`bun run quality` green at 298 files and 2,454 tests, `test:production` 1 passed), **coverage**
(83.27% statements against an 81% threshold, and above the gate on all four metrics), **e2e**
(`test:e2e` on the CI path, 92 passed), and **database** (`db:migrate:development`, `db:check`,
`db:smoke:development`, then the five gated Postgres suites). The **visual** job passes too: 50
curated cases.

**`broad-captures` fails, and it failed before this slice.** The job builds a screenshot artifact,
runs only on `workflow_dispatch`, and is not among the jobs `quality-gate` requires. 55 of its 85
captures fail one assertion — that a captured screen contacts no API beyond `/api/capabilities` —
and the extra request, read out of a failure trace, is `/api/creative-library`. That is the
Characters and Outfits store syncing; this slice touches no file in it, and the failing scenarios
are Studio, AI-settings, capture-settings and take-review screens, none of which read a Project
snapshot. Confirmed rather than argued: the same scenario was run at `229ae1e5`, the commit before
this slice, and fails identically, five for five. It is recorded here as a pre-existing failure in
a dispatch-only job, not fixed, because fixing it is neither this slice's scope nor its cause.

### 7.7 What this gate did not establish

The real-stack journey `e2e/real-stack-project-deliverable.spec.ts` exercises the API over
Postgres, but every Project it creates is new, so no v3 read migration runs in it — the migration's
coverage is the fixture and developer-database evidence in §7.1, not that journey. And nothing here
tests a rollback being performed; §7.5 measures the boundary that makes one safe or unsafe, which
is what the gate asked for.
