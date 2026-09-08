# Phase 2 verification — the complete single-clip deliverable

**Document type:** acceptance record for [roadmap](../roadmap/PRODUCT_ROADMAP.md) Phase 2, executed
2026-09-07 as implementation prompt 24 (`IMPLEMENTATION_PROMPTS.md:275`). The candidate is
`ec060334`, verified on macOS Darwin 25.6.0. It records what was checked, what kind of check it was,
and what the check does not reach. Every claim about the current tree cites a file and a 1-indexed
line that was read for this document. Finding IDs refer to the
[current-state audit](CURRENT_STATE_AUDIT.md).

**Verdict: the Phase 2 implementation is accepted; the Phase 2 acceptance criteria are not.** All
six slices landed and every automated gate is green against this candidate. None of the four
acceptance criteria at `docs/roadmap/PRODUCT_ROADMAP.md:121-126` is established end to end as
written. Each is established in parts, and nothing joins the parts. Two of the four rest in their
strongest place on a path the roadmap itself excludes or on a test double. One contains a phrase
that has no definition anywhere in the repository.

## What each kind of evidence is worth

The value of this record is the distinction below. A criterion is not verified because a test named
after it passes; it is verified by whatever that test actually exercised. Five kinds appear in
Phase 2, in ascending order of what they prove.

| Kind                                       | What is real                                                                         | What is substituted                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit test                                  | One module's logic                                                                   | Every collaborator. The media runtime is a hand-written stub, for example `apps/web/src/features/video-editor/videoEditRender.worker.test.ts:93`                              |
| Component test against a stub              | A real React tree, real user events, real accessibility names                        | The network, through MSW, for example `apps/web/src/features/account/AiUsageSection.test.tsx:61`; or the whole API client module, for example `useSaveVideo.test.ts:45`       |
| API test against an in-memory or file fake | Real routes, real services, real domain rules, real file repositories                | The provider, the clock and the byte store, for example `apps/api/src/test/fakes.ts:42`, which pins the progression tick at zero so no suite grows a timer by building an app |
| Browser journey against in-page simulators | Real Chromium, real application code, real WebCodecs render work, real object graphs | The API, through `page.route` at `e2e/support/projectHarness.ts:165` and `:230`; the camera and recorder at `e2e/support/studioHarness.browser.ts:202` and `:206`             |
| Browser journey against the running stack  | Real login, real API, real bytes stored and served back                              | Nothing on the server side. One spec only, `e2e/real-stack-project-deliverable.spec.ts:124`, and it saves a single Version rather than a set                                  |

Nothing in this record contacted a live provider. The one journey that reaches a real server drives
only what needs no provider, which its own header states at `e2e/real-stack-project-deliverable.spec.ts:13`.

## Criterion 1 — a muted-autoplay-ready captioned vertical ad from a phone-shot HEVC clip, in three placements, from one save

**Position: partly established. No artifact anywhere composes it.**

The criterion is six things at once: HEVC intake, that clip becoming a Project source, captions,
audio level, three placements, and one save. Five of the six have evidence. The composition has
none.

**Three placements from one save is established, in a browser journey against in-page simulators.**
`e2e/app-routing.spec.ts:542` is an untagged Chromium journey titled "one Project save makes three
placements and saves them as siblings of one video". It performs three real re-frames in the
browser, which is why it budgets four minutes at `:546`. It asserts one output request at `:579`,
three renditions on it at `:580`, the chosen placement rendered first at `:581`, the aspect set
`9:16`, `1:1` and `16:9` at `:582-584`, and three distinct uploaded asset ids at `:586`, so no
member overwrote another. The render is genuine WebCodecs work over the committed H.264 fixture
loaded at `:549`. The server is not: `installProjectHarness` at `:548` intercepts `**/api/videos**`
and `**/api/projects**` at `e2e/support/projectHarness.ts:165` and `:230`.

**Caption burn-in renders once, in a browser journey, but its terminal assertion checks a filename
rather than a pixel.** `e2e/existing-video.spec.ts:507` is titled "subtitles added on the timeline
are burned into a local render". It adds a cue through the real editor, asserts the cue's accessible
name on the lane at `:529-531`, presses **Save edited video** at `:538`, and the worker really
renders. What it then checks, at `:544`, is
`upload.getByTitle(/captioned-source-edited-/u)`. That is the output's name. No assertion in the
repository reads a rendered frame and finds burned text on it. The suite that comes closest is the
rasterizer's own unit test, which draws into a stubbed canvas.

**The HEVC decision is real code whose tests decode nothing.** The gate is at
`apps/web/src/features/existing-video/videoValidation.ts:193`, which lets an unsupported codec
through only when the file is convertible, and at `:199`, which asks this browser about these bytes
through `videoDecoderSupportsConfig(decoderConfig)`. Its test file says so in its own words at
`apps/web/src/features/existing-video/videoIntakeConversion.test.ts:9`: "the answer under test is
the decision, not a decode". The transcoder is mocked at `:14` and the media runtime at `:24`. No
HEVC bytes exist anywhere in `e2e/`, and no journey exercises the conversion.

**Audio level is established as a preview, not as a render.** `e2e/existing-video.spec.ts:319-323`
drives the editor's Level slider and Mute in a real browser and reads
`HTMLVideoElement.volume` off the stage element, and the spec's own comment at `:313` says this is
"before any render exists". The gain applied to the rendered output is asserted only at
`apps/web/src/features/video-editor/videoEditRender.worker.test.ts:300`, a unit test against the
mediabunny stub declared at `:93`.

**Whether a converted clip can become a Project source is unestablished by reading.** The Project
picker posts the raw file at `apps/web/src/features/projects/ProjectSourceSection.tsx:238`, and its
`accept` list at `:232` admits QuickTime, so a phone `.mov` can be chosen. The server then applies
the same shared codec rule at `apps/api/src/features/saved-videos/saved-video-inspection.ts:48`. The
converting intake lives on the Studio surface, and inside a Project the stage swaps in
`role="group" aria-label="Project recording controls"` at
`apps/web/src/studio/StudioWorkspace.tsx:214` instead of the control bar that opens it. No test
covers the join, and none was constructed here.

**The placement geometry bounds the claim.** `packages/domain/src/projects/projects.test.ts:1704`
asserts `cutRegions('16:9', portrait)` equals `['top', 'bottom']`, so widescreen discards the bands
a portrait caption sits in. A captioned vertical ad in three placements therefore means 9:16 plus
1:1 plus 4:5. The journey above ticks Widescreen at `e2e/app-routing.spec.ts:568`, so the set it
proves is not the captioned set.

**"Muted-autoplay-ready" has no definition, no rule and no check.** The phrase occurs exactly once
in the repository, at `docs/roadmap/PRODUCT_ROADMAP.md:121`, which is the criterion itself. There is
no domain rule, no contract field, no assertion and no operator-facing sentence that states what it
would mean. Recorded here as unverifiable rather than met. One fact is worth stating beside it
because it is the usual reading of the phrase: both MP4 writers set `fastStart: false` at
`apps/web/src/features/video-editor/videoEditRender.worker.ts:164`, so the moov atom is not at the
head of the file.

## Criterion 2 — a reload mid-upload resumes

**Position: both halves established separately; never joined; no browser evidence.**

**The browser half is established by a component-level hook test against a fully mocked API
client.** The persisted key store is at
`apps/web/src/features/saved-videos/uploadResumeStorage.ts:39`, and its own comment at `:36` states
the defect it closes: the key "lived in a ref". The test is
`apps/web/src/features/saved-videos/useSaveVideo.test.ts:185-200`. Its reload is an unmount at
`:195` and a fresh `renderHook` at `:196`, and it asserts the second call carries the first call's
idempotency key at `:200`. The whole API client module is replaced at `:45`, so nothing in it sends
or skips a byte.

**The server half is established by an API test against a fake storage adapter.**
`apps/api/src/features/saved-videos/direct-upload-service.test.ts:244` asserts that `listParts`
returns the one part already held, and `:248-256` completes the upload from both parts. The storage
adapter is a set of `vi.fn()` returns declared at `:186-196`, including the part list itself at
`:190`.

**The two halves are never joined.** No evidence anywhere shows fewer bytes sent after a reload. The
place where already-sent parts would be skipped is the uploader's `listParts` callback at
`apps/web/src/adapters/api-client/savedVideosApi.ts:168`, and no test invokes it, because the
adapter's own test substitutes a fake Uppy class at
`apps/web/src/adapters/api-client/savedVideosApi.direct.test.ts:22` and only inspects the options
handed to it.

**No browser journey reloads during a partial upload.** The nearest is
`e2e/app-routing.spec.ts:480`, "an uploaded Project source accepts once and resumes on the same
stage after refresh", whose reload at `:505` comes after the source was already accepted. Every
other `page.reload()` in the suite is after a settled state.

**The resumable path is configuration-gated, and the Project path does not use it.** Direct uploads
are wired only when direct R2 storage is configured, at
`apps/api/src/infrastructure/persistence-factory.ts:155`. Project mutations still mint their
idempotency keys into a ref at `apps/web/src/features/projects/useStableOperationKey.ts:21`, which
a reload discards. The upload a Project-path criterion 1 run performs therefore does not resume.

## Criterion 3 — a submitted swap completes and is retrievable after closing the browser, read as the Project path

**Position: established on the standalone path, which the roadmap excludes. The Project path is
partly established. The unattended copy into the owner byte store is never executed by any test.**

The criterion is explicit about which path counts. `docs/roadmap/PRODUCT_ROADMAP.md:123-125` reads
it as the Project path, where the result lands in the owner byte store and the workspace shows it on
return, and says the standalone path "has no browser route back to a result, which is Phase 4".

**The strongest evidence exercises the excluded path.**
`apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts:236` is titled
"progresses an accepted job to a retrievable, retained result with no client watching". It is an API
test against file repositories and a scripted provider. It is unusually well built: the absence of a
status request is enforced rather than assumed, through an `onRequest` hook installed at `:242` and
asserted empty at `:267` and `:273`, and readiness is read from the durable trace on disk at `:253`
rather than from the API. It survives a process restart over the same data directory at `:359`. All
of that is about `submitStandalone`, not about a Project.

**The Project half is partly established, by an API test whose progression is client-driven.**
`apps/api/src/features/projects/project-processing-routes.test.ts:313-321` asserts that after a
restart the Project's own snapshot points working and presented media at the result asset, and
`:328-329` serves the result bytes back. The attempt reaches that state under a polling loop at
`:245-251`, and the shared test configuration disables the progression tick at
`apps/api/src/test/fakes.ts:42`. So this proves durability across a restart, not progression with
nobody watching.

**The unattended copy into the owner byte store is never executed.** The only test that calls the
real `retainResultBytes` is `apps/api/src/features/projects/project-processing-routes.test.ts:599`,
and it pre-stores the result bytes at `:571-579`. The service's already-durable short-circuit at
`apps/api/src/features/projects/project-processing-service.ts:655-661` therefore returns before
`#storeLeasedResult` at `:664` is reached. Every other reference to `retainResultBytes` is a
`vi.fn()` declared at `apps/api/src/features/video-jobs/video-job-progression.test.ts:70`. The copy
does run on the attended reconcile path, at
`apps/api/src/features/projects/project-processing-service.ts:725`, which is a different caller
under a different condition.

**No test closes a browser.** The nearest journey is `e2e/app-routing.spec.ts:704`, "an accepted
Project operation reconnects after refresh and presents its retained result without resubmission",
which reloads a page against the in-page simulator installed at `:708`.

**Retention does not survive an API restart, by the slice's own record.**
`docs/roadmap/SLICE_2.5_DURABLE_AI_OUTCOMES_PLAN.md:1489` states that the service wipes its temp
root at construction, so a restart destroys the retained bytes and recovery re-downloads them.

**No live provider was contacted, and none should have been.** Establishing this criterion in the
running product means a billable Character Swap. That was not authorized and was not run. Criterion
3 is recorded at the application boundary only.

## Criterion 4 — Account answers what AI ran this month

**Position: partly established at both boundaries, against doubles. No test joins a Project
submission to a ledger row. No browser evidence exists at all.**

**The read route is established by an API test against an in-memory reader.**
`apps/api/src/features/ai-usage/routes.test.ts:156` answers the caller's own window with derived
durations and `no-store`, over a `FakeLedgerReader` registered at `:151`. The route never meets a
real repository in that file.

**The panel is established by a component test against an MSW stub.**
`apps/web/src/features/account/AiUsageSection.test.tsx:127` sums the month, names every outcome and
keeps the provider as trailing text, with the HTTP response written by the test at `:129`.

**One real write-then-read exists, on the standalone path.**
`apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts:326-342` waits for the
row to close as `succeeded`, asserts exactly one row, and reads the outcome counts back through a
real `FileAiUsageLedgerRepository` at `:341`. That is a file-backed repository over a temp
directory, which is a real repository rather than a fake, and it is still not the relational one the
account runs on in `postgres` mode. The relational case is conditionally gated at
`apps/api/src/infrastructure/database/ai-usage-ledger.postgres.integration.test.ts:12-16`, and it
was run for this candidate under that gate.

**No test asserts that a Project submission writes a ledger row.** There is no occurrence of the
word "ledger" anywhere in `apps/api/src/features/projects/`. The write itself is shared code and
would happen: the Project path enters `startPrelinked` from
`apps/api/src/features/projects/project-processing-service.ts:517`, and that method opens the usage
row at `apps/api/src/features/video-jobs/video-job-service.ts:1225`, which is the same
`#openUsageRow` at `:703` that the standalone path reaches at `:1259`. Shared code is a reason to
expect the behaviour, not evidence of it.

**There is no browser evidence at all.** No `e2e` spec references `ai-usage` or the Account panel's
AI activity section.

**The answer is partial by design, and says so.** The panel's own footer states that image and voice
transformations are not listed, at `apps/web/src/features/account/AiUsageSection.tsx:200-203`. The
criterion's word is "what AI ran"; the surface answers "what video AI ran".

## Gates run

Every command below was run against candidate `ec060334` on macOS Darwin 25.6.0. Vitest and
Playwright were run sequentially throughout, per [TESTING.md](../TESTING.md).

| Check                                                                                            | Result                                                                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `bun run quality` (types, lint, format, dead code, modules, docs, retired words, Vitest, builds) | Pass — 289 files passed, 5 skipped; 2400 tests passed, 10 skipped                                              |
| `bun run test:coverage`                                                                          | Pass — same counts; 82.67% statements, 74.22% branches, 83.83% functions, 85.14% lines                         |
| `bun run test:e2e`                                                                               | Pass — 91 passed across Chromium and the focused WebKit and mobile cases                                       |
| `bun run test:production`                                                                        | Pass — 1 passed against the built candidate on its own port                                                    |
| `bun run test:visual`                                                                            | Pass — 50 of 50 on Darwin, after two stale baselines were regenerated (below)                                  |
| `bun run test:visual:linux`                                                                      | Pass — 31 of 31 in the pinned image, after one stale baseline was regenerated (below)                          |
| `bun run screenshots:prune`                                                                      | Pass — 81 curated baselines retained across 2 platforms, 0 removed                                             |
| `bun run audit:prod` and `bun run audit:all`                                                     | Pass — both exit 0                                                                                             |
| `bun run --filter @studio/api db:check`                                                          | Pass — migration history valid                                                                                 |
| `bun run db:smoke:development`                                                                   | Pass                                                                                                           |
| Gated PostgreSQL suites                                                                          | Pass — 11 files, 65 tests, against a throwaway database on the development compose port, migrated then dropped |

Two things about the PostgreSQL row are corrections to the older recorded command at
the 2026-08-14 candidate's own PostgreSQL row, and both matter. The run was pointed at a database created for this
candidate and dropped afterwards, which is what `docs/TESTING.md:83-84` requires and what that
recorded command does not do, because it passes `--env-file=.env.development`. And the run covered
the whole of `apps/api/src/infrastructure/database`, which is eleven test files, so all five gated
PostgreSQL files listed at `docs/TESTING.md:75-79` ran, including
`ai-usage-ledger.postgres.integration.test.ts`, which the recorded command omits.

## Two stale visual baselines, and why no gate caught them

Two baselines were stale when this candidate was checked, one of them at two viewports, so three
image files were regenerated. All three were inspected before regeneration, and the diffs were the
expected product changes rather than capture noise.

- `screenshots/chromium-darwin/01-full-desktop-1440x960/09-projects/output-destination.png` and
  `screenshots/chromium-darwin/05-small-mobile-320x568/09-projects/output-destination.png` predated
  slice 2.3's **Also save for** group. Those are the two viewports the
  `project-output-destination` case runs at, registered at `e2e/studioVisualMatrix.ts:243-244`.
- `screenshots/chromium-linux/05-small-mobile-320x568/00-entry/initial.png` still carried
  pre-Phase-1 entry copy.

**Why they drifted: `bun run test:visual` is not part of `bun run quality`.** The `quality` script
at `package.json:82` runs typecheck, Storybook typing, lint, format, dead code, module, script,
document and retired-word checks, Vitest, the builds, the build manifest and the Storybook build. It
does not run any Playwright config. `docs/screenshot-test-coverage.md:159` states the same fact from
the other direction. Four Phase 2 slices therefore shipped without the visual suite running, and
nothing between slice 2.1 and this candidate compared these images.

Two further properties of this suite are worth recording beside the drift, because they bound what
its green result means. A change smaller than the 0.5 percent `maxDiffPixelRatio` leaves a stale
baseline behind a green suite, which `docs/screenshot-test-coverage.md:111-113` says has happened in
this repository three times. And on at least one macOS host a re-capture with no code change
rewrites roughly 23 of the 50 images, all within tolerance, per `:114-117`, which is why the three
images above were regenerated case by case and inspected rather than swept.

## What Phase 2 did not establish

Gathered from the slices' own records so that this re-acceptance cannot overstate them. Each line
cites where the slice said it.

**Slice 2.1, subtitles.** Real Safari and Firefox export, and burned-text fidelity on a physical
device, are not established (`SLICE_2.1_SUBTITLES_PLAN.md:423`). A 300 MB source was never pushed
through a render; what is proven is the cap and the accumulator, not a measurement under that load
(`:425`). A landscape cut loses every caption region to any narrower re-frame, and a portrait cut
loses its ends to widescreen (`:405-407`).

**Slice 2.2, audio level.** This slice has no plan, no audit prompt and no verification prompt. Its
entire specification is one implementation step at `docs/roadmap/IMPLEMENTATION_PROMPTS.md:219`.
There is no evidence record for it to contradict, which is itself the finding.

**Slice 2.3, variant sets.** Render time for a set was never measured; the journey's three
placements finishing inside a budget is evidence that it works, not a measurement of what it costs
(`SLICE_2.3_VARIANT_SETS_PLAN.md:954`). The 100-Version refusal is server-side only, so an operator
learns at the save rather than before it (`:957`). The real-stack journey was deliberately not
extended to a set (`:913`). The Studio save dialog cannot produce sets and its re-framed Versions
carry no placement (`:842`). Gallery filters and the card format read the current Version only, so a
set whose primary is 16:9 is invisible under Portrait (`:840`).

**Slice 2.5, durable AI outcomes.** The billing assumption for status polls and result egress
remains an assumption (`SLICE_2.5_DURABLE_AI_OUTCOMES_PLAN.md:1475`). The app-level within-TTL
assertion is vacuous, because the case runs in about a tenth of a second against a one-hour deadline
(`:1485`). Retrievability across a restart inside the TTL is untested (`:1489`). The second
retention case was not implemented, so the operator-visible cost of retention is unverified
(`:1493`). The standalone criterion is met as a server capability rather than a user journey
(`:1496`). Cross-process journal writing remains unguarded (`:1502`). Shadow mode is verified in
neither direction (`:1509`). That record's own verification ran against an earlier commit than the
tree it describes (`:1528`).

**Slice 2.6, capture iteration.** Framing state is lost across the retake loop: mic mute, camera off
and zoom all reset (`SLICE_2.6_RETAKE_LOOP_PLAN.md:989`). The confirmation added before a Project
recording may guard nothing reachable from the interface, so it is defence in depth rather than a
fixed bug (`:1017`). The call sites that now read a discard's answer changed behaviour on a refusal
that is effectively unreachable from the UI, and are covered at the hook and component level rather
than through the interface (`:1020`, and §6.2 of that plan). No test pins the order of the take
review action list (`:1029`).

**The automated boundary itself.** Physical devices, real codec and memory behaviour, assistive
technology, live Neon and R2, and paid providers are outside it
(the runbook's "Manual and live limits"), and emulation or deterministic fakes cannot validate a physical
target (`docs/BROWSER_SUPPORT.md:221`).

## Exit-criteria verdict

Phase 2's exit criteria are two, at `docs/roadmap/PRODUCT_ROADMAP.md:131`.

**"Vision Stage A satisfied end to end" is not met.** Stage A is the criterion 1 sentence, and no
artifact in the repository composes it. HEVC intake, captions, audio gain and three placements each
have evidence, on different clips, in different surfaces, at different altitudes. The nearest thing
to an end-to-end proof is a Project save of three widescreen-inclusive placements from an H.264
fixture with no captions and no gain, against an in-page server simulator. That is a real and
valuable journey. It is not the criterion.

**"MVP acceptance re-run recorded (DOCS-8)" is met.** Every command the runbook requires was re-run
against one immutable candidate and recorded in the gates table above, with the PostgreSQL row
corrected to a throwaway database and eleven files, and with the visual row split into its Darwin
and Linux halves. The same run is recorded in
[`MVP_ACCEPTANCE.md`](../MVP_ACCEPTANCE.md) as a new dated candidate beside the 2026-08-14 one,
which is what that record's own rule asks for before a conclusion may be quoted as current, and the
rows Phase 2 moved carry their new evidence there. That record decides the local automated boundary
only. It does not decide the four criteria above, and it says so.

**What Phase 2 did deliver.** Six slices of real product capability, a green quality gate at a
larger test count than Phase 1 recorded, and, in slices 2.3, 2.5 and 2.6, evidence records that name
their own gaps rather than implying coverage. The gap this record closes is that the phase's
acceptance criteria had never been walked as written, so the parts were mistakable for the whole.

**Recommended before Phase 3.** One journey that composes criterion 1 on a single clip. One journey
that reloads during a partial upload and asserts the byte count. One test that drives
`retainResultBytes` without pre-storing the bytes. One assertion that a Project submission leaves a
ledger row. None of the four needs a paid provider.
