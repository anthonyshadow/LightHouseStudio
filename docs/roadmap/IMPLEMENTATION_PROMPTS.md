# Lightframe Studio — Implementation prompt sequence

**Document type:** the complete, numbered sequence of copy-paste-ready prompts implementing the
[roadmap](PRODUCT_ROADMAP.md). Run them in order within a phase; phases in order. Each prompt is
run as a fresh agent task. **When copying a prompt, also copy the "Standing rules" section below —
every prompt references it.** Do not run an implementation (B) prompt until its audit (A) prompt's
plan has been approved. Finding IDs (e.g. `studio-1`) refer to the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md); D-numbers to
[Decisions required](../DECISIONS_REQUIRED.md).

---

## Standing rules (copy with every prompt)

**Canon:** read `docs/product/PRODUCT_VISION.md`, `docs/product/DOMAIN_MODEL.md`, the relevant
section of `docs/product/TARGET_USER_FLOWS.md`, `docs/architecture/TARGET_ARCHITECTURE.md`, and
the roadmap slice named by the prompt, before touching code. Treat actual code as the only
current-state authority; treat all docs as claims to verify. Follow `CLAUDE.md` and `AGENTS.md`.

**Standard constraints (all prompts):** implement only the approved scope; preserve unrelated
functionality and user data; no broad rewrites or opportunistic refactors; maintain backward
compatibility unless the scope says otherwise; keep AI strictly optional — no prompt in this
sequence may make an AI step mandatory or auto-started; remove superseded code within the approved
scope (no duplicate old/new pathways left behind); no new dependencies without stated
justification; strong types, no `any`/assertions to silence errors; keep components cohesive;
update the relevant canonical docs when observable behavior changes; never contact a paid provider
during validation; never report a skipped check as passing.

**API/DB checklist (prompts touching server or schema):** check for N+1 queries, missing
pagination, missing indexes for the queries you add, oversized payloads, duplicate requests,
unbounded work in request handlers, unsafe migrations (expand-first, never destructive without an
approved plan), missing ownership checks (owner comes from the session subject only), weak
validation at the boundary (Zod contract in `packages/contracts`, one owner per contract),
missing idempotency/CAS where peers have it, and missing log lines for new failure paths. Update
`apps/api/src/route-inventory.test.ts` and `shared-contract-parity.test.ts` when applicable.

**Media checklist (prompts touching media):** preserve originals; clean up object URLs, temp
files, worker instances, and MediaStreams; wire cancellation through to workers/providers; keep
retry behavior explicit and never auto-retry paid work; show progress states; provide failure
recovery with a next step; handle codec/rotation/VFR metadata via the existing mediabunny
inspection; bound memory (300 MB cap respected); run long work in workers/jobs, never on the UI
thread or inside a request handler beyond existing patterns.

**UI checklist (prompts touching UI):** first-time-user clarity; empty/loading/error/processing/
success/disabled states for every new surface; responsive behavior at the existing breakpoints;
keyboard operability and focus management via existing primitives (`OverlayPanel`,
`ConfirmationDialog` — never `window.confirm`); consistent terminology per
`docs/product/DOMAIN_MODEL.md` (deprecated names list included); clear primary/secondary actions;
no dead ends — every state carries a control; reduced-motion respected; bundle budgets green.

**Validation:** the narrowest set proving the change (per `CLAUDE.md`'s table): typecheck, lint on
affected code, the touched feature's unit/component/API tests, the targeted e2e spec when a
journey changes, build verification when bundling/config changes. `bun run quality` only for
shared-foundational changes. Never run vitest and Playwright concurrently.

**Completion report (every prompt):** files changed; decisions made; validation commands run and
their actual results; checks deliberately not run and why; risks and assumptions left open;
follow-ups discovered but out of scope (list, do not do).

**Ask before proceeding when:** the code contradicts the canon or the prompt's stated current
behavior; the change would alter an HTTP contract or stored data shape beyond the stated scope; a
migration would touch production data; removing something with untraced consumers; or two
plausible interpretations of scope differ materially. Otherwise choose the narrowest conservative
interpretation and proceed.

**Standard audit-and-plan procedure (all A-prompts):** for the named slice — read the canon and
the cited findings; inspect every file the slice names plus what tracing reveals
(UI → handler → hook → state → API → service → repository → storage); write up: (1) current
behavior with file:line evidence, (2) affected components/services/APIs/tables/tests,
(3) a small step-by-step implementation plan with the order of changes, (4) risks and
dependencies, (5) only the specific questions whose answers change the implementation. Make **no
code changes**. Deliver the plan for approval.

---

## Phase 1 — Coherence and trust

**01 (A) — Editor promotion: audit.** Run the standard audit-and-plan procedure for roadmap slice
1.1 (findings studio-1, arch-1, ev-6). Inspect `apps/web/src/studio/useStudioRecordingLaunch.ts`
(the project-context-only adoption at 262–268), `StudioApp.test.tsx:1213` (the test asserting a
fresh take is NOT adopted), `useStudioSavedVideoController.ts` (`openVideoAdjust`,
`commitVideoEdit`), `StudioExistingVideoOverlay.tsx`, `StudioToolOverlays.tsx`,
`features/video-editor/VideoEditWorkspace.tsx`, and every user-facing string naming the editor
("Adjust video", "Edit video", "Render preview", "Use existing video"). Answer specifically:
is the non-adoption intentional design or hardened accident; what is the minimal path to (a) adopt
the presented take when Edit Video is pressed standalone and (b) open the editor on a Project's
current cut without the wizard; which strings change to the single name "Edit video".

**02 (B) — Editor promotion: implement.** Implement the approved plan for slice 1.1: pressing
Edit Video with a fresh finalized take adopts it into the editor (mirroring the Project-context
branch); the Project workspace's "Adjust video" opens the editor directly on the current cut with
the wizard step skipped; one user-facing name ("Edit video") across entry card, workspace heading,
and Project-mode labels; update the test that asserted non-adoption to assert adoption. Apply
Standing rules + UI checklist + Media checklist. Required tests: `useStudioRecordingLaunch`,
`StudioApp` interaction tests, existing-video controller tests; the e2e journey
"provider-free Adjust video renders locally" extended to start from a fresh take.

**03 (A) — Deliverable visibility: audit.** Standard audit-and-plan for slice 1.2 (PCD-8,
prod-9). Inspect `ProjectOverviewSurface.tsx`, the snapshot's `lastSuccessfulOutput`
(`packages/contracts/src/projects.ts:190`), `ProjectHistorySection.tsx:219–228` (existing
download path), `VideoExportPanel.tsx:34` (chooser opening with `placement=null`), and the
Version's stored `exportSpecification`. Plan: overview deliverable card (poster, placement chip,
Download, View in Assets) and placement preselection in the re-export panel.

**04 (B) — Deliverable visibility: implement.** Implement slice 1.2 per the approved plan. The
Project overview shows the current final deliverable when one exists (empty state: "No saved
output yet" with the Save step linked); the gallery export panel preselects the Version's recorded
placement when present. Apply Standing rules + UI checklist. Tests: overview component tests
(with/without output, archived project), export-panel preselection test.

**05 (B) — Truth fixes bundle.** Implement slice 1.3 (assets-3, assets-5, STOR-3, studio-4,
PCD-11, plus removing truncated UUIDs from Project asset cards). (a) Delete dialog copy comes
from the deployment's real behavior via capabilities (`mediaPersistence`): R2 mode says bytes are
deleted; local mode says the record is removed and bytes remain until cleanup — verify against
`apps/api/src/app.ts:370` and `saved-video-service.ts:652–682`. (b) Thread the producing operation
into `originForArtifact` (`useSaveVideo.ts:36–50`) so VTO saves carry `virtual-try-on`; verify
gallery labels. (c) Change the server poster re-encode (`saved-video-service.ts:722–729`) to
aspect-preserving `fit:'inside'` bounded at 480 long-edge, matching `thumbnailClient.ts`'s stated
contract. (d) Replace the three "Release" strings (`studioStageNotices.ts:77`,
`studioPolicies.ts`, `studioActivityPolicy.ts:38,111`) with the real action names. (e) Make
"Replace the original video" either a true replace (chooser opens on confirm) or rename to
"Remove original video" per the approved audit answer. (f) Remove truncated UUID captions from
`ProjectAssetsSection` cards. (g) Replace any user-facing provider brand names ("Decart API",
"Pruna API") with capability names per the domain model's deprecated-names table. Apply Standing
rules + UI checklist; API/DB checklist for (c).
Tests: each touched surface's component tests; poster-shape unit test on the sharp path.

**06 (B) — Dead ends bundle.** Implement slice 1.4 (shell-1, shell-4, ev-1-honesty, ev-3).
(a) Add a workspace key for `/studio/<uuid>` in `StudioExitGuard.tsx:42–47` so dirty local edits
prompt before in-app navigation; add the route to guard tests. (b) Authenticated unknown paths
render a small "That page doesn't exist" surface with a Dashboard link instead of silently
redirecting (`AppRouter.tsx:213`); keep unauthenticated behavior. (c) In Project context, hide or
disable voice selection affordances with the stated unavailability reason (audit ev-1 lists the
exact components); remove the attachable-Voice "Add Voice" entry from Project context or annotate
it with the same reason (PCD-4) per the approved plan. (d) Add a `beforeunload` guard while an
unsaved server-approved standalone AI result is presented (`useExistingVideoWorkflow` /
`ExistingVideoActionBar` area). Apply Standing rules + UI checklist. Tests: exit-guard unit tests
incl. the new route; router not-found test; existing-video workflow guard test.

**07 (B) — Identity and IA.** Implement slice 1.5 (prod-5, D13/shell-5). (a) Rewrite
`EntryPage.tsx` capability copy and `index.html` meta description to lead with
make/edit/deliver (AI third), aligned with `docs/product/PRODUCT_VISION.md`; update
`AppRouter.tsx` STUDIO_DESCRIPTION. (b) Swap the compact bottom-nav slot from Campaigns to Assets
(`StudioHeader.tsx:240–256`), updating its rationale comment and the visual baselines the change
touches. (c) Give navigation destinations real link semantics where they are semantically links
(the authenticated app currently renders almost everything as buttons; keep buttons for actions,
use anchors with router links for navigation so middle-click/copy-link work). Apply Standing
rules + UI checklist. Tests: entry-page copy test if one exists; navigation tests; affected
visual cases only.

**08 (B) — Documentation canon adoption.** Execute the approved
[pruning manifest](../audits/DOCUMENTATION_PRUNING_REPORT.md): delete the listed files; make the
listed corrections to kept docs (DOCS-1 status columns, DOCS-2/3 stale claims, DOCS-8 caveat
header, DOCS-11 env-profile paragraph, DOCS-13 self-contradiction); update every reference to a
deleted path (`grep` each deleted filename repo-wide); keep `bun run check:docs`,
`bun run format:check`, and `bun run check:retired-program` green. **Do not run this prompt until
the manifest is approved.** Apply Standing rules. Validation: `check:docs`, `format:check`,
`check:script-references`.

**09 (A) — Hygiene bundle: audit.** Standard audit-and-plan for slice 1.7's code items (web-1/2,
assets-8, api-7, DC-4, DC-5, DC-6, api-1, shell-2/3, edit-4, studio-7, tci-11, api-12, SEC-2).
For each: confirm the finding still holds at head, trace consumers, and classify the removal
candidates (safe / needs-verification). Produce one ordered plan with per-item validation scope.

**10 (B) — Hygiene bundle: implement.** Implement the approved slice 1.7 plan: add
`detail`/`history` members to the query-key factories and migrate the ad-hoc literals; invalidate
`savedVideoQueryKeys.total` and the voices saved-count key on their mutations; add
`expectedRevision` CAS to saved-video rename (contract + route + client); align
`savedVideoStatusSchema` with domain/persistence and add it to the parity test; create
`packages/contracts/src/creative-library.ts` and consume it in both apps; extend
`shared-contract-parity.test.ts` to every hand-mirrored list DC-6 names; add the real cloud
configuration case (projects + directVideoUploads) to `apps/api/src/route-inventory.test.ts`;
delete the `creationIntent` chain, `isStudioPath`, `lastApplied`, TakeDock `view='all'`,
`decorateRequest`, and the dead vitest include; rename `SpooledAudioUpload` → `SpooledUpload`
(temp-file prefix included); make `VoiceService`'s `ownerUserId` required and fix tests. Apply
Standing rules + API/DB checklist. Validation: affected feature tests + `bun run typecheck`;
route-oracle and parity suites.

**11 (B) — Test-foundation bundle.** Implement slice 1.7's test items (tci-1, tci-2, tci-3-doc,
tci-8, tci-11-covered-above). (a) Enact the approved coverage decision: either run coverage in
the PR gate or delete the thresholds — no half state. (b) Add one real-stack e2e spec (mirroring
`local-first-preparation.spec.ts`'s real-login pattern) driving create Project → upload source →
adopt working media → save output → download against the CI-provisioned API+Postgres; keep the
simulators for failure-injection. (c) Document the vitest/Playwright sequencing rule in
`docs/TESTING.md`. (d) Tag the upload→edit→save journey `@cross-browser`. Apply Standing rules.
Validation: the new spec in the e2e job; full e2e suite unchanged otherwise.

**12 (C) — Phase 1 verification.** Verify Phase 1 end to end: walk the seven Phase-1 acceptance
criteria in the running dev product and record evidence (screenshots/notes per criterion); run
`bun run quality`; run the targeted e2e specs (not concurrently with vitest); grep for the
deprecated names (`docs/product/DOMAIN_MODEL.md` list) in user-facing strings and report
stragglers; confirm no copy contradicts behavior in `local` vs `postgres`+R2 modes (delete
dialog, storage claims). Report per the standard format. Fix nothing beyond trivial copy misses;
file everything else as follow-ups.

## Phase 2 — The complete single-clip deliverable

**13 (A) — Subtitles: audit.** Standard audit-and-plan for slice 2.1 (edit-2, prod-2; decision
D4 = burn-in). Inspect `packages/domain/src/video-editing/{types,rules}.ts`, the render worker
(`videoEditRender.worker.ts`, `videoEditShader.ts`), `VideoEditWorkspace.tsx`/`VideoEditTimeline.tsx`,
the snapshot `localEdit` contract (`packages/contracts/src/projects.ts:124–155`), and both
persistence paths for revision snapshots. Design for approval: the cue model (text, startMs,
endMs, placement region), editor interaction on the existing timeline, canvas rasterization in
the worker, WYSIWYG parity in the preview shader path, and the contract/schema extension —
additive only, one owner in domain.

**14 (B) — Subtitles: implement.** Implement approved slice 2.1: domain cue types + validation
rules; Subtitles tool in the editor (add/edit/retime/reposition cues on the timeline; keyboard
accessible); preview renders cues exactly as export will; worker burns cues into the rendered
output; cues persist in the revision's edit state and survive save/reopen; captions apply to
placement renditions too. Apply Standing rules + UI + Media checklists; API/DB checklist for the
contract extension. Required tests: domain rule tests (overlap/clamp), worker render test with a
cue fixture, editor component tests, contract parity, one e2e caption journey.

**15 (C) — Subtitles: verification.** Verify cross-mode persistence (file + Postgres) of cue
data on revisions; render fidelity spot-check at all five placements; memory bound respected on a
300 MB source; reduced-motion and keyboard paths in the editor; report evidence.

**16 (B) — Audio level.** Implement slice 2.2 (prod-2-audio): add gain to the edit spec (domain +
contract, additive), an Audio tool in the editor (level slider + mute; keep-or-drop preserved),
worker applies gain at render, WYSIWYG preview honors it. Apply Standing rules + UI + Media
checklists. Tests: domain clamp rules, worker gain test, editor component test.

**17 (A) — Variant sets: audit.** Standard audit-and-plan for slice 2.3 (PCD-3, DC-14, db-11;
decision D10). Inspect `saveProjectOutputRequestSchema.renditions` (`contracts/projects.ts:850–863`,
currently `max(1)`), `ProjectOutputSaveSection.tsx:337–429/480–486`,
`useExportPlacementRender.ts`, `project-rendition-service.ts`, `project-output-service.ts`,
`video_versions.export_specification`, and where a variant-set identity could live (shared
deliverable key). Plan the serial-render UX (per-placement progress, partial-failure semantics)
and the additive schema for sibling-variant grouping.

**18 (B) — Variant sets: implement.** Implement approved slice 2.3: one save accepts several
placements; the browser renders them serially with visible per-placement progress and
cancel-remaining; versions record their variant group; gallery shows variants together; failures
leave completed variants saved and name the failed ones with retry. Apply Standing rules + UI +
Media + API/DB checklists. Tests: contract tests for the raised cap; output-service tests for
multi-rendition saves incl. partial failure; save-section component tests; e2e one-save-three-
placements journey.

**19 (B) — Resilient intake.** Implement slice 2.4 (STOR-2, ev-2/D11): persist upload
idempotency keys/upload ids (keyed by file fingerprint) in sessionStorage/IndexedDB and resume
staged uploads on return (server replay already exists — `direct-upload-service.ts:117–250`,
`project-byte-acceptance.ts`); offer local transcode-on-upload for HEVC/ProRes where
`VideoDecoder` supports it (capability-probed, via the existing `transcodeRecordingToMp4`
machinery) with honest fallback copy otherwise. Apply Standing rules + Media + UI checklists.
Tests: resume unit tests (key persistence + replay), transcode-intake test with an HEVC fixture
where the environment allows, validation-copy tests.

**20 (A) — Durable AI outcomes: audit.** Standard audit-and-plan for slice 2.5 (prov-2, prov-3,
prov-6, prod-7). Inspect `VideoJobService` (`#refresh` reachable only from `status()`/
`reconcileActiveJob()`, TTL/expiry, `#settleDelivery` delete-after-download),
`ProcessingJobTraceWriter`/repositories, `project-processing-service.ts` retention paths, and the
Account panel. Design for approval: a bounded server-side progression tick (poll + retrieve for
accepted jobs, Project-linked first), retention-until-TTL after delivery, and the per-account AI
usage ledger (schema: job id, operation, provider, outcome, duration, timestamps — no prompts, no
media, no cost claims) with its Account surface.

**21 (B) — Durable AI outcomes: implement.** Implement approved slice 2.5. Apply Standing rules +
API/DB checklist (new table = expand-only migration + repository + tests both modes; tick must be
single-instance-safe per prov-7). Tests: tick unit tests (job progresses without client polling),
retention tests, ledger API tests, Account component test.

**22 (C) — Durable AI outcomes: verification.** Verify with providers mocked: submit → close
client → job completes and result retrievable within TTL; ledger rows appear exactly once per
submission (idempotent under tick+poll races); no automatic paid retry introduced (audit the tick
path explicitly against the cost rules); migration verified in both modes; report evidence.

**23 (B) — Retake loop.** Implement slice 2.6 (studio-2): "Record another take" on take review —
one action that discards (with the existing confirmation when unsaved) and restarts capture;
camera-release-after-review remains the default; fix the silent programmatic discard (studio-8:
`recording.discard()` returns a boolean; assert at call sites) and confirm before
`startProjectRecording` drops a presented take (studio-9). Apply Standing rules + UI + Media
checklists. Tests: take-review flow tests; recording-launch tests.

**24 (C) — Phase 2 verification / MVP re-acceptance.** Walk the Phase 2 acceptance criterion
end to end in the running product (phone-HEVC clip → captioned, level-adjusted, three placements,
one save; reload mid-upload resumes; submitted swap survives browser close; Account shows the
ledger). Re-run the MVP acceptance runbook flow (DOCS-8) against this candidate and record the
result in the runbook. Run the broader regression suite for the affected areas (`bun run test`,
targeted e2e; never concurrently). Report evidence per criterion.

## Phase 3 — The composition model

**25 (A) — Composition domain model: audit.** Standard audit-and-plan for slice 3.1 (db-2, db-3,
DC-1/2/3; decisions D1–D3 must be recorded first). Inspect `packages/domain/src/projects/types.ts`
(snapshot v2), `video-editing/types.ts`, both snapshot validators
(`contracts/projects.ts:321–426` v1→v2 pattern; `drizzle` check `snapshot_schema_version in (1,2)`),
`projects/rules.ts` (`saveProjectOutput` forcing cleared config; status derivation), and the
repository commit path (`project-repository.ts:3483–3567`, incl. the `completed` requirement at
:3497). Design snapshot **v3** for approval: `composition` (ordered clips: source ref + trim +
gain; subtitle tracks from 2.1), `transform` as the optional AI sub-object, `completed` as derived
milestone (D2), v2→v3 read migration, and the exact validator/check-constraint changes.

**26 (B) — Composition domain model: implement.** Implement approved slice 3.1 in domain +
contracts + both repositories: snapshot v3 types/rules/validators; v2→v3 read migration
(provenance-preserving, mirroring v1→v2); check constraint extended to version 3; output save no
longer requires `completed`; existing single-clip flows read/write v3 unchanged in behavior.
Apply Standing rules + API/DB checklist. Tests: property tests for the migration; rules tests for
composition validation; repository tests both modes; full projects API suite.

**27 (C) — Snapshot v3 verification.** Verify: every stored v1/v2 fixture reads correctly as v3;
round-trip write/read in file and Postgres modes; no behavior change in the untouched UI (run the
projects e2e specs); the `completed` decoupling reflected in status derivation tests; rollback
point documented (v3 write can be feature-flagged off until switch). Report evidence.

**28 (A) — Multi-source storage: audit.** Standard audit-and-plan for slice 3.2 (db-1, STOR-7;
D1). Inspect `project_sources` (PK `project_id`, schema.ts:839+), `acceptSource`/`removeSource`
(`project-repository.ts:1778–2045`), `project-source-service.ts`, the file-mode source shape
(`file-project-persistence-schema.ts`), and every consumer of "the source". Design for approval
the expand→backfill→verify→switch plan: new keyed collection (project id + source id), idempotent
receipted backfill of existing rows, dual-read verification, read-authority switch, and the
contract additions (list sources, accept-additional, remove-specific) — all additive; the legacy
single-source endpoints keep working against the collection.

**29 (B) — Multi-source storage: implement (expand + backfill).** Implement the approved expand
stage of slice 3.2: new schema + migration (no drops), backfill with receipts, dual-read
verification tooling, repositories (both modes) writing the collection while reads stay on the
old path. Apply Standing rules + API/DB checklist. Tests: migration tests, repository tests both
modes, backfill idempotency tests.

**30 (C) — Multi-source switch: verify and cut over.** Run the dual-read verification across all
existing data (counts, owners, byte facts); on clean results, switch read authority, migrate the
contracts (new endpoints live; legacy endpoints delegating), and remove the superseded single-source
read path within this scope. Rollback plan stated and tested before the switch. Apply Standing
rules + API/DB checklist. Tests: full projects API + e2e regression; both persistence modes.

**31 (B) — Workspace media area.** Implement slice 3.4 (studio-3, PCD-5-adjacent): the Project
workspace gains a Media area listing all sources (poster, duration, state) with add (upload /
record / from Videos), preview, and remove; the capture bridge targets the collection so recording
stays available after the first source; attached-membership videos surface first in pickers
(closing PCD-5). Apply Standing rules + UI + Media checklists. Tests: media-area component tests;
capture-bridge tests; e2e add-second-source journey (real stack).

## Phase 4 — The composition editor and one pipeline

**32 (A) — Timeline UI: audit.** Standard audit-and-plan for slice 4.1 (edit-1, web-7). Inspect
the editor stack (`VideoEditWorkspace/Timeline/StagePreview`, `useVideoEditSession`), the v3
composition model, and the worker request shape. Design for approval: timeline data flow
(composition ↔ session), split-at-playhead, drag/keyboard reorder, per-clip trim and tools,
selection model, and how the single-clip tools scope to the selected clip. Include the
StudioApp-decomposition steps (web-3) strictly needed to mount the editor as a Project surface.

**33 (B) — Timeline UI: implement.** Implement approved slice 4.1. Apply Standing rules + UI +
Media checklists. Tests: timeline interaction tests (split/reorder/trim, keyboard), session state
tests, visual cases for the new surface.

**34 (B) — Stitched rendering.** Implement slice 4.2: the worker renders ordered clip sequences
(mediabunny concatenation) with an explicit normalization policy for mixed
resolution/framerate/codec (decided in 32's plan); stitched preview is accurate; progress and
cancellation per render; memory bounded. Apply Standing rules + Media checklist. Tests: worker
concat tests incl. mixed-fixture normalization and cancellation; render-budget measurements
recorded in the report.

**35 (C) — Composition end-to-end verification.** Verify the vision's target items 3, 6–11
without AI in the running product: two-clip stitch, split, reorder, captions across the cut,
audio level, preview, save, reopen, export variants. Run the real-stack e2e composition journey.
Record evidence per item; file follow-ups rather than fixing beyond trivial issues.

**36 (A) — Pipeline convergence: audit.** Standard audit-and-plan for slice 4.4 (prov-1, prod-3,
DC-9, prod-4, D5, D6). Inspect the standalone existing-video workflow, `/api/video-jobs` routes

- `VideoJobService`, `ProjectProcessingService` (incl. `startPrelinked`), the Project run overlay
  (`ProjectRunOverlay`), and the voice pipeline (server gate at
  `project-processing-service.ts:342–348`; client dead ends per ev-1). Design for approval: the
  converged flow (standalone = thin entry to the durable engine + "make this a Project"), the fate
  of the public video-jobs API per D5, the durable Project voice operation per D6 (job type on the
  existing model; original audio preserved as the immutable composition input), and unblocking the
  workspace during runs (results land as adoptable Project assets; overlay becomes a status chip).

**37 (B) — Pipeline convergence: implement.** Implement the approved convergence plan. All AI
outputs — standalone included — land durably; voice works in Projects as a reconcilable job; the
workspace stays usable during runs; superseded pathways removed within scope. Apply Standing
rules + API/DB + Media + UI checklists. Tests: converged-flow API tests; voice-job lifecycle
tests incl. ambiguous reconciliation; existing-video regression suite; e2e voice-in-project
journey.

**38 (C) — Convergence verification.** Verify: no orphanable AI output remains (submit each
capability, walk away, return — result present and adoptable); no automatic paid retry anywhere
in the new paths; the one-active-job policy still enforced (or the approved D8 change applied);
cost ledger covers converged flows; the retired pathway is gone (grep for its entry points).
Report evidence.

## Phase 5 — Libraries, storage, and operational hygiene

**39 (A) — Library system-of-record: audit.** Standard audit-and-plan for slice 5.1 (assets-1/2/11,
D7). Inspect the creative repository (IndexedDB schema v7, whole-store CAS mirror in
`useCreativeLibraryCloudSync.ts`, pick-a-side recovery), `creative-library` routes/repository,
reference-image purge (`reference-image-asset-store.ts:245–268`), and membership resolution
(`ProjectAssetsSection`). Design for approval: per-record sync protocol (create/update/delete with
per-record revisions), conflict semantics that never destroy a whole store, cache-mode IndexedDB,
migration from the whole-store mirror, and the purge keyed to real owner activity.

**40 (B) — Library system-of-record: implement.** Implement the approved D7 design for cloud
modes; local mode keeps browser authority. Include search parity for the Characters and Outfits
libraries (same pattern Videos/Voices use). Apply Standing rules + API/DB checklist. Tests:
sync-protocol tests incl. conflicts and offline queues; migration tests from whole-store data;
purge tests proving a referenced image survives.

**41 (C) — Library sync verification.** Two-client simulation: character saved on A, outfit on B,
both survive; conflict on one record never touches others; reference images referenced by either
client survive purge windows; report evidence.

**42 (B) — Storage maintenance.** Implement slice 5.2 (STOR-1/5/8/11, STOR-4, api-8, D14): one
periodic maintenance sweep (age-bound removal of `failed`/unreferenced byte assets, terminal
jobs/receipts past the approved horizon, expired reference images) honoring the retention policy;
local-mode delete performs retention-checked byte deletion (or the approved reclamation control);
`private, immutable` caching + ETags on version-addressed media routes; re-verification trusts
recorded checksums with full inspection only on mismatch; retire `ShadowAssetByteStore` +
backfill tooling if the cutover criterion is met (else record the criterion). Apply Standing
rules + API/DB + Media checklists. Tests: sweep idempotency (never deletes referenced bytes —
property test against the retention oracle), caching-header tests, local-delete tests.

**43 (C) — Storage maintenance verification.** Run the sweep against seeded fixtures containing
every referenced/unreferenced permutation; verify zero referenced bytes removed and all orphans
gone; verify delete semantics per mode match the Phase-1 copy; confirm cache headers only on
immutable-addressed routes. Report evidence.

**44 (B) — DB hygiene.** Implement slice 5.3 (db-5/6/7/12/13/14, DC-7): drop `outbox` and
`resource_references` via migration (grep-verified unreferenced; re-verify at head); align
file-mode caps with contract limits (remove the 100-version write cliff in favor of a typed
refusal); generate both codec CHECK constraints from one constant; add the two missing tables to
`schema.test.ts`; drop or implement `creative_assets.deleted_at`; owner-scope
`markReady`/`markFailed`; narrow or comment the phantom enum members (`workflowPhase`
processing/export, asset roles) after verifying no stored rows carry them. Apply Standing rules +
API/DB checklist. Tests: migration tests, schema oracle, repository suites both modes.

**45 (B) — Campaigns that help.** Implement slice 5.4 (PCD-6/7): campaign list/detail cards show
project counts (and a preview reference where cheaply available — extend the campaigns list
contract additively); the Projects page group filter accepts a specific Campaign (reusing
`useProjectList(lifecycle, campaignId)`); record the evaluation (build/don't-build) of
campaign-level target placements with evidence from usage. Apply Standing rules + UI + API/DB
checklists. Tests: campaigns API tests for the extended response; list-filter component tests.

**46 (C) — Phase 5 / roadmap-exit verification.** Final sweep: re-run the audit's §9 register —
every P1/P2 either closed (evidence) or explicitly accepted in `docs/DECISIONS_REQUIRED.md`;
`bun run quality` green; docs updated where behavior changed; the target-experience checklist in
`docs/product/PRODUCT_VISION.md` walked end to end in the running product with evidence per item.

---

**Sequence integrity notes.** Prompts 08 and 12 are gates: 08 must not run before manifest
approval; 12/24/35/38/43/46 are verification gates whose failures pause the sequence rather than
being papered over. Nothing in this sequence makes AI mandatory; prompts 20–22 and 36–38 must
re-verify the cost rules they touch. Any prompt discovering that its cited finding no longer
matches head stops and reports per the Standing rules.
