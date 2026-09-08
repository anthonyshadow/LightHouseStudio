# Phase 2 verification — the complete single-clip deliverable

**Document type:** acceptance record for [roadmap](../roadmap/PRODUCT_ROADMAP.md) Phase 2, executed
2026-09-07 as implementation prompt 24 (`IMPLEMENTATION_PROMPTS.md:275`) against candidate
`ec060334` on macOS Darwin 25.6.0, and **re-walked the same day** against the gap-closure work
described below. It records what was checked, what kind of check it was, and what the check does
not reach. Every claim about the tree cites a file that was read for this document. Finding IDs
refer to the [current-state audit](CURRENT_STATE_AUDIT.md).

**How to read the two walks.** The first walk's judgements stand where nothing changed and are
rewritten where something did; a claim it made that this work falsified is replaced rather than
left beside its correction, because a record that keeps both is a record that decides nothing. What
is never removed is a limit: everything either walk found out of reach is still stated, and the
gap-closure work added limits of its own under
[what Phase 2 did not establish](#what-phase-2-did-not-establish). Line citations from the first
walk were dropped in the rewritten passages, since the files they pointed into have moved; file
paths are cited instead, and they resolve. The gap-closure work has no candidate hash of its own —
it was walked as a working tree, not as an immutable candidate — so the [gates table](#gates-run)
below still belongs to `ec060334` alone and is not re-claimed for it.

**Verdict: the Phase 2 implementation is accepted; the Phase 2 acceptance criteria are still not.**
All six slices landed. None of the four acceptance criteria at
`docs/roadmap/PRODUCT_ROADMAP.md` is established end to end as written. But the shape of the
shortfall changed, and it is worth saying exactly how, because the first walk's most important
finding turned out to be that criteria 1 and 2 were blocked by product defects — three defects
between them — rather than by missing tests. A test written for either before this work would have
passed against a product that did the wrong thing.

Those defects are fixed. A reload mid-upload really did re-send every byte, because the client
never asked the server which parts it already held; it asks now. An operator who captioned a phone
cut and ticked a wider shape really did get a silently uncaptioned member of the set; the save form
now says so under each extra placement. A phone's HEVC clip really could not become a Project
source at all, because the picker uploaded raw and the server refused the codec; the picker now
runs the same converting intake the Studio surface uses. On top of those, criterion 1's caption
evidence is now a pixel rather than a filename, criterion 3's unattended copy on the Project path
now executes under a real timer, and criterion 4 now has a Project submission's ledger row read
back through the account's own route.

What is still not established: no single artifact composes criterion 1 on one clip — the HEVC half
and the captioned-set half are proven on different clips, and the join cannot run on a GPU-less CI
runner at all. Criterion 2's halves now agree at the contract but still never meet in one process,
and no browser journey reloads mid-upload. Criteria 3 and 4 stop at the application boundary, with
no live provider, no browser closed, and no relational ledger.

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
| Browser journey against the running stack  | Real login, real API, real bytes stored and served back                              | Nothing on the server side. One spec only, `e2e/real-stack-project-deliverable.spec.ts`, which now saves a captioned three-placement set and decodes all three back           |

A sixth kind entered the record with the gap-closure work and outranks all five: **a browser
journey that decodes the bytes it produced**. `e2e/support/browserMediaProbe.ts` fetches a rendered
output inside the page, decodes frame 0 with mediabunny's `CanvasSink`, and counts bright and dark
pixels in two bands of it. Nothing is substituted between the render and the assertion. It proves
that ink arrived where a caption lays out and that the rest of the frame is untouched; it proves
nothing about what the text says, because there is no OCR here.

Nothing in this record contacted a live provider. The one journey that reaches a real server drives
only what needs no provider, which its own header states.

## Criterion 1 — a captioned vertical ad from a phone-shot HEVC clip, in three placements, from one save, every member keeping the caption regions the cut uses

**Position: substantially narrowed, still not composed. One join is missing rather than five, and
that join cannot run on the CI runner.**

**The criterion was amended on 2026-09-07, and the amendment is recorded rather than absorbed.** It
read "muted-autoplay-ready captioned vertical ad …" until this walk. That phrase occurred exactly
once in the repository — in the criterion itself — with no domain rule, no contract field, no
assertion and no operator-facing sentence saying what it would mean, so the first walk recorded it
as unverifiable rather than met. Defining it would have meant inventing a `mutedAutoplayReadiness`
with one consumer, which replaces an undefined phrase with a confidently wrong one. It was deleted
and replaced by the one clause the product can decide: **every member of the saved set keeps the
caption regions the cut uses.** That is not a softer bar. It fails a set whose square member lost
its captions, which the old wording left arguable — "captioned vertical ad … in three placements"
never said whether the word reached past the primary, and the product's behaviour at the time was
that it did not. What was given up with the phrase is a claim about the
container, and that claim is still open: both MP4 writers set `fastStart: false`, so the metadata
sits at the end of the file rather than the head. The reason, and the three ways the old statement
of it was stale, are in [recording memory policy](../RECORDING_MEMORY_POLICY.md). Flipping it needs
a physical-device memory run at the 300 MB ceiling that this environment cannot produce, so it was
not flipped.

Read as amended, the criterion is five things: HEVC intake, that clip becoming a Project source,
captions surviving into the delivered bytes, three placements, and one save. All five have
evidence, and four of them moved up an altitude in this work. The composition still has none.

**Caption burn-in is now asserted at the pixel, twice.** The first walk found that
`e2e/existing-video.spec.ts`, "subtitles added on the timeline are burned into a local render",
ended by matching the output's _filename_. It no longer does. After the render replaces the source,
the journey reads `currentSrc` off the stage `<video>`, fetches that blob URL inside the page, and
decodes frame 0 through `readRenderedFrameInk` in `e2e/support/browserMediaProbe.ts`. It asserts
the decoded frame is the full 1280×720 output, that the control band above the cue is still exactly
the fixture's flat colour with zero bright and zero dark pixels, and that the caption band holds
both halves of what a cue draws — the translucent box and glyphs on it — against floors well under
the counts measured on the pinned Chromium. That exercises the real rasterizer, the real WebGL
composite and the real H.264 encode, and finds ink in the frame that the source did not have.

Decoding is done with mediabunny rather than `drawImage` on a video element deliberately:
`e2e/studioVisualMatrix.ts` records that Playwright's Linux Chromium cannot decode H.264 in a video
element, which is why several visual scenarios are skipped there. The floors are floors rather than
equalities because `apps/web/src/features/video-editor/subtitleRasterizer.ts` asks for Inter first
and nothing in the repository loads it, so glyph widths differ per platform.

**Three placements from one save is now established twice, and the second time on the running
stack with the captioned vertical set.** The simulator journey was deliberately left exactly as it
was: `e2e/app-routing.spec.ts:542`, "one Project save makes three placements and saves them as
siblings of one video", still ticks Widescreen at `:568` and still asserts `9:16`, `1:1` and `16:9`
at `:582` over `installProjectHarness`. Re-labelling it to the vertical trio would have been four
lines and the wrong four: on its 1280×720 fixture the domain says every caption region dies for all
three members, so it would have proven a captioned set by asserting on files that carry no caption.

The new evidence is in `e2e/real-stack-project-deliverable.spec.ts`, against the stack CI
provisions. It uploads a 1080×1920 portrait fixture as a real Project source, adds a subtitle cue
in the in-Project editor, renders and adopts that cut as working media, and then saves it once for
Phone full screen plus Square post plus Tall feed post. It asserts three outputs on one Saved Video
with the shapes `9:16 1080x1920`, `1:1 1080x1080` and `4:5 1080x1350` — dimensions the **server**
measured from the bytes it received in `saved-video-inspection.ts`, where a file that did not match
the placement it claimed would have been refused before the assertion ran. Then it decodes each of
the three back through the same frame probe and requires ink in the lower band and an untouched
upper band in every one. That is the amended criterion's own clause, checked on the delivered
files: three shapes, one save, captions still present in all three.

**The HEVC decision is no longer tested only against a description of a video.** The gate in
`apps/web/src/features/existing-video/videoValidation.ts` still lets an unsupported codec through
only when the file is convertible, and still asks this browser about these bytes through
`videoDecoderSupportsConfig`. Three cases in
`apps/web/src/features/existing-video/videoIntakeConversion.test.ts` keep their stubs on purpose,
because what they are about is the decision. A fourth does not: `intake of a real HEVC clip` reads
the committed `e2e/fixtures/phone-hevc-video.base64`, confirms through real mediabunny that it is a
QuickTime file carrying an `hevc` track at 1080×1920, and drives the real
`validateExistingVideo` to the refusal with the transcoder never called.

That case is named for what it proves. In jsdom the support gate short-circuits at
`typeof VideoDecoder === 'undefined'` in
`apps/web/src/adapters/media-processing/videoDecodeSupport.ts` and never reaches
`isConfigSupported`, so it proves the refusal is reachable from real HEVC bytes — not that a
browser said no.

**A browser is asked, in a journey, and the journey reports which answer it got.**
`e2e/existing-video.spec.ts`, "a phone HEVC clip takes whichever intake branch this browser can
actually take", puts the same fixture through the real picker. Before it does, it asks the page
itself through `readVideoDecoderSupport` and annotates the run with the codec and the branch. Where
the browser can decode, it asserts the panel ends holding `phone-clip.mp4` at 1080 × 1920 as
MP4 · H.264 — converted once, on device. Where it cannot, it asserts both halves of the refusal:
the codec this product will not publish, and the honest admission that converting it here is not on
offer either. Both branches assert; neither is skipped. This is deliberate and is the only correct
shape for it — Chromium ships no software HEVC decoder, so a GPU-less runner refuses where a laptop
with VideoToolbox converts, and a journey hard-coding either answer would be lying on the other
platform. It follows that **the conversion branch is proven only where a platform decoder exists**,
and a skipped case would have been no evidence at all.

**A phone HEVC clip can now become a Project source, which it could not before.** The first walk
recorded this as "unestablished by reading". It was establishable by reading, and the answer was
no: the Project picker uploaded the raw file and the server refused the codec through the shared
rule in `packages/domain/src/video-processing/rules.ts`. That was a product gap, not a test gap —
the criterion is explicitly the Project path, and no test could have closed it.

`apps/web/src/features/projects/ProjectSourceSection.tsx` now routes a chosen file through the same
`validateExistingVideo` the Studio surface uses, holding the wait itself and naming its two halves
apart — **Checking video** for the moment it takes to read a format, **Converting video** for the
minutes it takes to re-encode, because under one sentence the second is indistinguishable from a
stuck upload. `apps/web/src/features/projects/ProjectSourceSection.test.tsx` covers all three
outcomes: a clip this browser can decode is converted and the H.264 that came back is what is
uploaded; a clip it cannot is refused with the intake's own words and nothing is sent; a file that
needs nothing is uploaded exactly as chosen. That is component-level evidence against a stubbed
intake, not a journey.

**What is still missing is the composition, and it is now one join.** No artifact carries an HEVC
clip through a Project to a captioned three-placement set. The real-stack journey starts from an
H.264 portrait fixture; the HEVC journey ends at the Studio panel. Writing the join is not simply
more work: it cannot run on the CI runner, which has no HEVC decoder to convert with, so it would
have to be a locally-proven or macOS-only artifact. That decision was deferred rather than taken —
see [what Phase 2 did not establish](#what-phase-2-did-not-establish).

**Audio level left the criterion with the phrase, and its evidence is unchanged.** The old wording
implied a claim about audio; the amended one does not. Slice 2.2 is still a slice, so its position
is recorded here rather than dropped: `e2e/existing-video.spec.ts` drives the editor's Level slider
and Mute in a real browser and reads `HTMLVideoElement.volume` off the stage element, which the
spec's own comment marks as being before any render exists. The gain applied to a rendered output
is asserted only in `apps/web/src/features/video-editor/videoEditRender.worker.test.ts`, against
its hand-written mediabunny stub. Neither the new pixel probe nor the real-stack journey touches
audio, because both fixtures are video-only on purpose — audio would pull `ensureAacEncodingSupport`
into those journeys for the first time.

**The per-extra caption sentence is the one thing in this work a user experiences.** The domain
already knew the answer: `subtitlePlacementsCutByCrop` in
`packages/domain/src/video-editing/subtitleLayout.ts` decides which caption regions a crop removes,
and `packages/domain/src/projects/projects.test.ts` pins that a widescreen re-frame of a portrait
cut takes both the top and bottom bands. The chooser said it for the _chosen_ placement and the
save form said nothing for the extras, which rendered each extra as a bare label. So an operator who
captioned a phone cut and ticked Widescreen got a silently uncaptioned deliverable.
`apps/web/src/features/export-placements/placements.ts` now exports
`exportPlacementSubtitleOutlook` beside the description that already used it, and
`apps/web/src/features/projects/ProjectOutputSaveSection.tsx` renders it under each extra
placement's checkbox, wired through `aria-describedby`. It informs and never blocks: a warned
placement can still be ticked, because an uncaptioned product shot or a music-led cut is a
deliverable somebody meant to make. No new domain rule was added for it — `subtitlePlacementsCutByCrop`
already is the rule, and a second one in `projects/rules.ts` would have broken the bundle boundary
that module states in its own header.

## Criterion 2 — a reload mid-upload resumes

**Position: this was a product defect, and it is fixed. Both halves now assert a byte count in one
process each — the client's with the real uploader — and they agree at the contract. They still
never meet in one process, and there is still no browser evidence.**

**The first walk understated this, and the correction is the point.** It recorded that "no evidence
anywhere shows fewer bytes sent after a reload" and that no test invoked the uploader's `listParts`
callback. Both were true, and the reason was worse than a coverage gap: **that callback was
unreachable in the running product.** `apps/web/src/adapters/api-client/savedVideosApi.ts` added the
file to Uppy with no `s3Multipart` state, and `@uppy/aws-s3` takes its restoring branch — the only
branch that asks `listParts` which parts the server holds — only for a file that already carries
that identity. So every attempt at the same bytes created the upload afresh and sent all of it. What
survived a reload was the _server's_ replay, not a skipped byte: the same idempotency key returned
the same staged upload, and the client then re-sent everything into it. The code's own comment in
`apps/web/src/features/saved-videos/uploadResumeStorage.ts` claimed more than that, saying the parts
"are listed back, so the uploader continues from where it" left off.

**The fix is three lines and one corrected comment.** `savedVideosApi.ts` now captures the id from
`addFile` and calls `uppy.setFileState(fileId, { s3Multipart: { uploadId, key } })` before
`uppy.upload()`, so the multipart identity is known before a byte is sent and the uploader takes the
restoring branch. It has to be after `addFile`, which rebuilds the descriptor from the fields it
knows. The extra `GET /uploads/:id/parts` this adds to every direct upload is legal immediately
after staging — `direct-upload-service.ts` sets `status: 'uploading'` together with the provider
upload id, so a fresh upload gets an empty list rather than a rejection. The stale comment in
`uploadResumeStorage.ts` was rewritten in the same change to say what the key actually buys and to
name `savedVideosApi` as the owner of the other half.

**The key-persistence half is unchanged and still holds.**
`apps/web/src/features/saved-videos/useSaveVideo.test.ts` renders the hook, starts a save, unmounts
it, renders a fresh one and asserts the second call carries the first call's idempotency key — with
a third case pinning that a later, unrelated save does not. That is the half the first walk
credited; the whole API client module is replaced in that file, so nothing in it sends or skips a
byte. It was never the defect, and it is not what was fixed.

**The client half asserts a byte count, and it does so with the real uploader. This paragraph said
otherwise, and the correction is a rewrite rather than a note beside it.** It read "**This is not
real Uppy** … that the real plugin takes the restoring branch for a file in that state is
established by reading `@uppy/aws-s3`, not by running it." That was read off one of the two client
tests. The other, `apps/web/src/adapters/api-client/savedVideosApi.resume.test.ts`, runs the plugin,
and this record cited it nowhere — the two cases are titled a word apart, which is how one stood in
for both. The whole method here is that a criterion is not verified because a test named after it
passes; understating the strongest evidence in the tree costs the record exactly as much, and it is
the one error this framing cannot absorb.

`savedVideosApi.resume.test.ts`, "puts only the part the staged upload does not already hold",
substitutes nothing on the client side of the boundary: `saveVideoDirect` imports the real
`@uppy/core` and `@uppy/aws-s3`, and they chunk the blob at the adapter's fixed 8 MB — so 20 MB is
three parts — decide what to send, and PUT it. Only the far side is a fake: an object store that
keeps what it is given and lists it back, and an API that replays a staged upload for an idempotency
key it has seen before. Two properties make it evidence rather than a description.

- **The bytes are marked by part.** Every byte carries the number of the part it belongs to, and the
  fake store records the first byte of each body it receives. An attempt that resumed at the wrong
  offset — or re-sent the head under the tail's number — is therefore caught by the body rather than
  only by the part number it claimed.
- **The count is one, not three.** The first attempt is interrupted with the tail in flight, held
  open so that body is never acknowledged and never stored. A second `saveVideoDirect` over fresh
  bytes and the remembered idempotency key then puts exactly one part on the wire — part 3, its own
  4 MB, carrying the tail's own marker — and completes the whole file by claiming parts 1 and 2
  under the ETags the server listed back, which it could only have learned by asking. One staged
  upload served both attempts.

Its own header is careful about what that is not, and agrees with
[the limits below](#what-the-gap-closure-work-of-2026-09-07-still-does-not-establish): no body
leaves the process, so it does not show the network carried less and it measures no time saved, and
R2's own promises are assumed rather than tested.

**The second client test is the cheaper one, and is where the `FakeUppy` remark belongs.**
`apps/web/src/adapters/api-client/savedVideosApi.direct.test.ts`, "sends only the parts the staged
upload does not already hold", stages against a server that already holds part one and asserts the
adapter's whole request sequence: stage, list parts, complete — with no `signPart` call for part
one, and a completion body naming the already-held ETag. A companion case pins the opposite sequence
when nothing is held. That file does substitute a hand-written `FakeUppy`, modelled on the branch
`@uppy/aws-s3` takes for a file carrying `s3Multipart`: restore, list, send only what is missing. It
proves the adapter's contract on both branches cheaply, and it is not the client half on its own.

**The server half is now proven over the real routes, with bytes.**
`apps/api/src/features/saved-videos/direct-upload-routes.test.ts` builds the app with a byte-holding
fake of the storage interface and drives all five direct-upload routes through `app.inject` — five
routes that had no HTTP-level coverage at all before, since the route oracle declares its own fakes
`unreachable`. Its resume case stages, PUTs part one through a signed URL, then stages again under
the same idempotency key: the same upload id comes back, exactly one multipart upload was ever
created, the listing names part one with its real size and ETag, and only the tail's bytes are sent
after the second staging. It completes from both parts and serves the reassembled file back through
the content route, byte-identical to the committed fixture. The test's own comment is careful about
what that measures: it is what the test sent, having asked the server the question a client asks —
not a measurement of the running client.

The service-level case the first walk cited,
`apps/api/src/features/saved-videos/direct-upload-service.test.ts`, is unchanged and still runs
against `vi.fn()` returns.

**The halves still never meet in one process.** A single test joining the real client to the real
server is refused by `scripts/check-module-graph.mjs`, and the exempt root area is not collected by
`vitest.config.ts`. So the client's byte count and the server's byte count are each proven, against
the same contract, in two processes.

**No browser journey reloads during a partial upload.** Unchanged from the first walk. The nearest
is `e2e/app-routing.spec.ts:480`, "an uploaded Project source accepts once and resumes on the same
stage after refresh", whose reload comes after the source was already accepted. Every other
`page.reload()` in the suite is after a settled state. Writing one is not a small matter of will:
`bun run dev` sets `LIGHTFRAME_ENV=development`, where `.env.development` selects `postgres` and
`r2`, so the Playwright stack on a developer machine advertises direct uploads and would sign live
R2 URLs. Such a journey must use the Studio harness — whose capability payload declares
`directMultipartUpload: false` today — and must never be pointed at the real stack.

**The resumable path is configuration-gated, and the Project path still does not use it.**
Unchanged. Direct uploads are wired only when direct R2 storage is configured, in
`apps/api/src/infrastructure/persistence-factory.ts`. Project mutations still mint their idempotency
keys into a ref in `apps/web/src/features/projects/useStableOperationKey.ts`, which a reload
discards. The upload a Project-path criterion 1 run performs therefore still does not resume.

## Criterion 3 — a submitted swap completes and is retrievable after closing the browser, read as the Project path

**Position: now established on the Project path the criterion names, at the application boundary.
The unattended copy into the owner byte store executes under a real timer, and a second process
serves the result back. No browser is closed and no provider was paid.**

The criterion is explicit about which path counts. `docs/roadmap/PRODUCT_ROADMAP.md` reads it as the
Project path, where the result lands in the owner byte store and the workspace shows it on return,
and says the standalone path "has no browser route back to a result, which is Phase 4".

**The first walk's strongest evidence exercised the excluded path, and still does — it is simply no
longer the strongest.** `apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts`,
"progresses an accepted job to a retrievable, retained result with no client watching", is an API
test against file repositories and a scripted provider, unusually well built: the absence of a
status request is enforced through an `onRequest` hook rather than assumed, readiness is read from
the durable trace on disk rather than from the API, and it survives a process restart over the same
data directory. All of that is about `submitStandalone`, not about a Project. It is the model the
new Project-path case was built to, and it keeps its value as the standalone record.

**The Project restart case the first walk credited is unchanged, and its limit stands.**
`apps/api/src/features/projects/project-processing-routes.test.ts` also asserts that after a restart
the Project's own snapshot points working and presented media at the result asset and serves the
result bytes back — but the attempt reaches that state under a polling loop, with the progression
tick disabled by the shared configuration. That case proves durability across a restart, not
progression with nobody watching. What follows is the case that proves the second thing.

**The unattended copy into the owner byte store now executes, on the Project path, under a real
timer.** The first walk found that the only test calling the real `retainResultBytes` pre-stored
the result bytes, so the service's already-durable short-circuit returned before `#storeLeasedResult`
was reached, and that every other reference to it was a `vi.fn()`. That is closed.
`apps/api/src/features/projects/project-processing-routes.test.ts`, "lands a finished result in the
owner store with nobody watching, and bills it to the ledger", builds the app with a **non-zero**
`videoJobProgressionIntervalMs` — the shared `testConfig` pins it at zero precisely so no other
suite grows a timer — submits through the real route, and then makes no further request until the
result has appeared in the owner byte store on disk.

Four properties make it evidence rather than a description:

- **"Nobody watching" is recorded, not assumed.** An `onRequest` hook collects every request the app
  serves, and the test asserts the list is exactly the four writes it made: create Project, upload
  source, post revision, submit. No status poll, no `/processing/current`. With no request served
  after the submission, the timer is the only thing that can have polled the provider and fetched
  what it produced, which the test confirms by requiring the provider's status calls to be non-zero.
- **The landing is observed off disk**, through `LocalAssetByteStore.exists`, not through the API.
- **Retention stops at the bytes.** It asserts `outputAssetId` and `resultRevisionId` are still null
  and the Project's own revision is still the operator's last edit — the invariant the service
  states in a comment and nothing checked before. Promoting the result to what the Project shows
  stays the operator's decision on their next visit.
- **A second process serves it.** The app is closed and a fresh one built over the same data
  directory, which then reaches `complete` and returns the exact fixture bytes from the result
  content route, with the provider still recording one submission. That is the nearest honest local
  stand-in for closing the browser: the process that paid for the result is gone, and a later one
  serves it from the owner's store rather than from the provider.

The neighbouring release case is also now honest about its own setup: it pre-stores the bytes
deliberately, to prove that a retention finding the result already durable releases the lease
without copying again, and says so.

**No test closes a browser.** Unchanged. The nearest journey is `e2e/app-routing.spec.ts:704`, "an
accepted Project operation reconnects after refresh and presents its retained result without
resubmission", which reloads a page against the in-page simulator.

**The two durability claims are about different stores, and the distinction matters.**
`docs/roadmap/SLICE_2.5_DURABLE_AI_OUTCOMES_PLAN.md:1489` states that the job service wipes its temp
root at construction, so a restart destroys the _retained temporary_ bytes and recovery re-downloads
them. That is still true. What the new case restarts across is the _owner byte store_ under the data
directory, which the wipe does not touch. So: a finished result reaches the owner's own storage
before any process restarts, and survives one; the job service's temporary copy does not.

**No live provider was contacted, and none should have been.** Establishing this criterion in the
running product means a billable Character Swap. That was not authorized and was not run. Criterion
3 is recorded at the application boundary only.

## Criterion 4 — Account answers what AI ran this month

**Position: a Project submission is now joined to a ledger row, read back through the account's own
route. The boundaries either side are still established against doubles, the repository under it is
still the file-backed one, and no browser evidence exists at all.**

**The read route is established by an API test against an in-memory reader.**
`apps/api/src/features/ai-usage/routes.test.ts:156` answers the caller's own window with derived
durations and `no-store`, over a `FakeLedgerReader` registered at `:151`. The route never meets a
real repository in that file.

**The panel is established by a component test against an MSW stub.**
`apps/web/src/features/account/AiUsageSection.test.tsx:127` sums the month, names every outcome and
keeps the provider as trailing text, with the HTTP response written by the test at `:129`.

**Real write-then-read now exists on both paths.** The standalone one is unchanged:
`apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts` waits for the row to
close as `succeeded`, asserts exactly one row, and reads the outcome counts back through a real
`FileAiUsageLedgerRepository`. The Project one is new and is described below. Both run over a
file-backed repository in a temp directory — a real repository rather than a fake, and still not the
relational one the account runs on in `postgres` mode. The relational case is conditionally gated in
`apps/api/src/infrastructure/database/ai-usage-ledger.postgres.integration.test.ts`, and it was run
for candidate `ec060334` under that gate; it has not been re-run for the gap-closure work, which did
not touch it.

**A Project submission is now asserted to leave a ledger row.** The first walk recorded that no test
did, and that the word "ledger" occurred nowhere in `apps/api/src/features/projects/`. Both are now
false. The unattended-retention case in
`apps/api/src/features/projects/project-processing-routes.test.ts` submits a Character Swap through
the Project route and then reads `GET /api/account/ai-usage` back over the same application, parsed
through the shared `aiUsageLedgerResponseSchema`. It asserts exactly one entry, carrying the
submission's own operation id, `character-swap`, `decart`, and outcome `succeeded`, with the
month's counts at running 0, succeeded 1, failed 0.

Two details make it worth its length. It reads back **through the account's own route** rather than
through the repository, because that route is the only thing an operator can see. And it **waits for
the outcome** rather than assuming the row is closed, because no request awaits the close — the job
settles it in the background — so a test that read once would be asserting on a race.

The write was always shared code: the Project path enters `startPrelinked` in
`apps/api/src/features/projects/project-processing-service.ts`, which opens the usage row through
the same `#openUsageRow` in `apps/api/src/features/video-jobs/video-job-service.ts` that the
standalone path reaches. Shared code was a reason to expect the behaviour; this is the evidence of
it, on the path the criterion names.

**There is no browser evidence at all.** No `e2e` spec references `ai-usage` or the Account panel's
AI activity section.

**The answer is partial by design, and says so.** The panel's own footer states that image and voice
transformations are not listed, at `apps/web/src/features/account/AiUsageSection.tsx:200-203`. The
criterion's word is "what AI ran"; the surface answers "what video AI ran".

## Gates run

Every command below was run against candidate `ec060334` on macOS Darwin 25.6.0. Vitest and
Playwright were run sequentially throughout, per [TESTING.md](../TESTING.md).

**This table belongs to `ec060334` and is not re-claimed for the gap-closure work.** That work adds
tests and journeys, so the counts in it — 2400 tests, 91 e2e — were stale the moment it landed, and
a stale count reported as current is exactly the kind of overstatement this record exists to
prevent. The gap-closure work was validated by the targeted suites its own changes name, not by a
full re-run against an immutable candidate. The next candidate re-runs this table in full and
records the new counts, in this row and in [MVP acceptance](../MVP_ACCEPTANCE.md), whose
`bun run test:e2e` count is stale for the same reason and for the same duration.

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
cites where the slice said it. Where the gap-closure work of 2026-09-07 changed one, the line is
marked rather than deleted, so that the slice's own statement and its later correction stay
readable together. The work's own limits follow in
[its own subsection](#what-the-gap-closure-work-of-2026-09-07-still-does-not-establish).

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
extended to a set (`:913`) — **superseded 2026-09-07**: it now saves a captioned portrait cut as
9:16, 1:1 and 4:5 in one save and decodes all three back. The Studio save dialog cannot produce sets and its re-framed Versions
carry no placement (`:842`). Gallery filters and the card format read the current Version only, so a
set whose primary is 16:9 is invisible under Portrait (`:840`).

**Slice 2.5, durable AI outcomes.** The billing assumption for status polls and result egress
remains an assumption (`SLICE_2.5_DURABLE_AI_OUTCOMES_PLAN.md:1475`). The app-level within-TTL
assertion is vacuous, because the case runs in about a tenth of a second against a one-hour deadline
(`:1485`). Retrievability across a restart inside the TTL is untested (`:1489`) — **narrowed
2026-09-07**: a Project result that reached the owner byte store unattended is now served back by a
second process over the same data directory. The job service's own temporary copy still does not
survive its construction-time wipe, which is what that line is about. The second
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

### What the gap-closure work of 2026-09-07 still does not establish

Written down at the same time as the work, so that the narrowing above cannot be read as more than
it is. Nothing here was left out for lack of time alone; each is a thing this environment cannot
honestly produce.

**Real R2 multipart semantics.** Direct uploads are wired only where `assetStoreProvider` is `r2`,
and every local test uses a fake. That R2 returns from `ListParts` what `UploadPart` stored, that a
re-PUT under the same part number replaces rather than duplicates, and that an upload survives the
service's TTL, all stay unproven. The substitute proves the client stopped sending and that the two
contracts agree; it does not prove the network carried less, and it measures no time saved.

**What the caption text says.** The frame probe proves ink arrived in a band and that the rest of
the frame is untouched. It cannot distinguish the right string from the wrong one — there is no OCR
here — and it checks layout only to a generous fraction, because a Playwright spec cannot
value-import `subtitleRegionBox` from the domain.

**An actual iPhone file.** `e2e/fixtures/phone-hevc-video.base64` is an `ffmpeg` clip wearing an
`hvc1` tag. It carries no display-rotation matrix, no camera metadata, no HDR variant and no Apple
`hvcC`. It is evidence about the codec branch, not about phone intake, and its own
`e2e/fixtures/README.md` says so.

**HEVC conversion in the automated suite.** Chrome ships no software HEVC decoder, so a GPU-less
`ubuntu-latest` runner is expected to take the refusal branch and never the conversion. The journey
branches on the browser's own answer and reports which branch ran, which is the only honest shape
for it. Wider than a CI property, and recorded as such in the
[testing strategy](../TESTING.md#browser-and-visual-scope) so that a reader of the suite meets it
before a green run misleads them: Playwright's bundled Chromium carries no proprietary codecs on a
workstation either, and a macOS run of this journey on 2026-09-07 also annotated
`hev1.1.6.L120.90 refused here`. So the conversion branch is proven by the decision-level case and
by manual validation on a browser with a platform decoder, and by no automated run here.
No fourth Playwright project was added; adding one would change the recorded e2e count and put a
second Chromium binary in every run, and that decision is deferred rather than taken.

**The composed criterion 1 artifact.** Following from the two entries above: an artifact carrying an
HEVC clip through a Project to a captioned three-placement set could not run on the CI runner at
all. Until that is faced, criterion 1 is proven in two halves on two clips.

**A live provider.** Criterion 3 in the running product means a billable Character Swap. The API
test writes the committed fixture back as the "result". Nothing about Decart's acceptance, latency,
output geometry or failure modes is touched.

**Closing a browser.** The API restart proves the bytes survive the server process. It does not
prove a workspace shows them on return; the nearest journey reloads against the in-page simulator.

**Cross-browser export.** The chromium Playwright project carries `grepInvert: /@(cross-browser|touch)/`
and both new journeys are untagged, so Safari and Firefox export stay exactly where this record's
slice 2.1 line leaves them.

**The relational ledger.** The new Project-path assertion runs against `FileAiUsageLedgerRepository`,
not the Postgres one the account runs on, which stays behind the gated suite. It also covers video
AI only, which the panel says in its own footer.

**Flipping `fastStart`.** Both MP4 writers still set `fastStart: false`. The reason was corrected in
[recording memory policy](../RECORDING_MEMORY_POLICY.md) — it was stale in three ways: stated only
in the recording-finalization paragraph though the local-edit worker applies it too, silent on the
fact that MediaBunny's own default already chooses `false` for the worker's stream target, and
silent on what it costs a player. Correcting the reasoning is not a licence to flip the flag:
justifying that needs a physical-device memory run at the 300 MB ceiling, which this environment
cannot produce.

**Container layout as an assertion.** Both committed MP4 fixtures were walked and both are already
faststart, so any "the metadata is at the head" test over a committed fixture would pass today and
say nothing about either writer. Such a pin would have to read bytes captured live from the upload
body, which the Project harness currently discards. It was deliberately left out.

**Whether the visual baselines still match.** The save form gained a sentence under each warned
extra placement, and that form is the `project-output-destination` case, captured at the two
viewports registered in `e2e/studioVisualMatrix.ts`. `bun run test:visual` is not part of
`bun run quality` — the same fact that let two baselines drift through four slices before this
phase — so a green quality gate says nothing about those two images. Whether they were re-captured
after this change is **not established by this record**, and it should be checked before the next
candidate rather than assumed either way.

**What a placement set costs.** The real-stack journey prints its wall clock per phase on every run
and its budget is argued from that measurement — 15.6s in total on a workstation, of which the
three-placement save was 4.9s and reading all three back 1.3s, against an unchanged 240s ceiling
that exists for a colder CI runner. Finishing inside a budget is still evidence that it works, not a
measurement of what it costs a user, which slice 2.3's own plan already said.

## Exit-criteria verdict

Phase 2's exit criteria are two, in `docs/roadmap/PRODUCT_ROADMAP.md`.

**"Vision Stage A satisfied end to end" is still not met, and is much nearer.** Stage A is the
criterion 1 sentence, and no artifact composes it. What changed is the distance. At the first walk
the nearest thing to an end-to-end proof was a Project save of three widescreen-inclusive placements
from an H.264 fixture with no captions, against an in-page server simulator. It is now a running-stack
journey that uploads a portrait source through the real route, captions it in the in-Project editor,
saves it once for three vertical placements, and decodes burned ink out of all three files the server
itself measured and stored. Everything in that sentence is real except the clip's codec. The single
remaining gap in the composition is the phone HEVC clip at the front of it — and that gap is now a
platform question rather than a product one, because the picker converts and the CI runner cannot.

**"MVP acceptance re-run recorded (DOCS-8)" is met at candidate `ec060334`.** Every command the
runbook requires was re-run against one immutable candidate and recorded in the gates table above,
with the PostgreSQL row corrected to a throwaway database and eleven files, and with the visual row
split into its Darwin and Linux halves. The same run is recorded in
[`MVP_ACCEPTANCE.md`](../MVP_ACCEPTANCE.md) as a new dated candidate beside the 2026-08-14 one,
which is what that record's own rule asks for before a conclusion may be quoted as current. That
record decides the local automated boundary only. It does not decide the four criteria above, and it
says so. It is met for that candidate and is not carried forward to the gap-closure work, which is
not a candidate.

**What Phase 2 delivered.** Six slices of real product capability, and — in slices 2.3, 2.5 and 2.6
and in this record — evidence that names its own gaps rather than implying coverage. The gap the
first walk closed is that the phase's acceptance criteria had never been walked as written, so the
parts were mistakable for the whole. The thing worth keeping from that walk is not the verdict but
the method: two of the four criteria turned out to be blocked by product defects — three defects
between them — and every one of those defects was invisible behind a passing test. A test written
for criterion 2 before this work would have passed while the product re-sent every byte.

**What was done about it, and what was not.** The first walk recommended four things before Phase 3.

- _One journey that composes criterion 1 on a single clip._ **Not done, and now precisely bounded.**
  The captioned three-placement half exists on the running stack; the HEVC half exists as a
  branch-on-answer journey. Joining them needs a decision about a macOS-only or locally-proven
  artifact, because a GPU-less runner has no HEVC decoder.
- _One journey that reloads during a partial upload and asserts the byte count._ **Not done as a
  journey; the underlying defect it would have caught is fixed and asserted at both boundaries.**
  A journey still needs a harness that advertises direct uploads without signing live R2 URLs.
- _One test that drives `retainResultBytes` without pre-storing the bytes._ **Done**, under a real
  progression timer, with the absence of any watching request recorded rather than assumed.
- _One assertion that a Project submission leaves a ledger row._ **Done**, read back through the
  account's own route with the outcome waited for.

**Recommended before Phase 3, restated.** Decide how the HEVC clip and the captioned set are joined,
and where that artifact is allowed to run. Give the resume journey a harness it can honestly use.
Both remaining items are decisions about the automated boundary rather than about the product, which
is a better place for them to be than where this record found them.
