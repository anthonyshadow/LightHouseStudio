# Slice 4.2 — Stitched rendering: audit, plan, record

**Document type:** the audit and plan prompt 34 (B) of the
[implementation sequence](IMPLEMENTATION_PROMPTS.md) requires, followed by the record of what was
built. Slice 4.2 has no (A) prompt of its own, so the standard audit-and-plan procedure was run
first, on the operator's instruction to audit, plan and implement in one pass, 2026-09-15, at
branch `phase4` from commit `543dcd73`. The audio half of the normalization policy landed the same
day, ahead of this prompt; its record is [the mixed-audio plan](SLICE_4.2_MIXED_AUDIO_PLAN.md) and
this document does not restate it.

**What prompt 34 asks for:** the worker renders ordered clip sequences (mediabunny concatenation)
with an explicit normalization policy for mixed resolution, frame rate and codec; the stitched
preview is accurate; progress and cancellation per render; memory bounded. Tests: worker concat
tests including mixed-fixture normalization and cancellation; render-budget measurements recorded.

---

## 1. Current behaviour, with evidence

Everything below was verified at head by reading the code and mediabunny 1.55.5's source
(`apps/web/node_modules/mediabunny/src`), not inferred from names or documents.

### 1.1 One render path, single input by construction

`videoEditRender.worker.ts` renders exactly one `Blob` through mediabunny's `Conversion` — one
`Input`, one trim window, one `process` hook that draws through the WebGL shader and composites the
subtitle overlay (`:70-253`). `Conversion` cannot take a second input (`conversion.ts:912-926`,
`:1552`), so a stitched render is a new loop beside it, not a parameter on it. The request type
(`types.ts:60-77`) carries a `Blob`; a Project's clips are reachable only as HTTP-range content
URLs (`CurrentCut.contentUrl`, `useProjectCurrentCut.ts:7-15`), so the request shape widens — which
the 4.1 plan already assigned to 4.2 (`SLICE_4.1_TIMELINE_UI_PLAN.md:336-337`).

### 1.2 The arrangement exists, renders nothing, and previews one still

`CompositionSurface.tsx` takes the stage over, lists the clips, splits, trims, reorders, mutes and
removes, and shows the selected clip at its in-point as a still (`:327-337`). Its own caption
promises that playing through the cuts "comes with stitched rendering". It never asks whether the
browser can render (`useVideoEditExportSupport` is not imported), has no busy state, and reports
nothing to the exit guard: `videoRenderingActive` is derived from the single-clip editor and the
Media area only (`useStudioSessionLifecycle.ts:112-115`).

### 1.3 The product cannot make a two-source arrangement

The only seed is one clip over the presented cut (`useCompositionSession.ts:162-166`,
`compositionOverMedia`); every other gesture preserves the media set, and `appendClip` has no web
caller. So today every arrangement is splits of one video. Prompt 34's "mixed resolution/framerate"
normalization is reachable from tests, and from the product only once a clip can be added from the
Project's media — a control no slice was given (the 4.1 out-of-scope list omits it; the target flow
names it, `TARGET_USER_FLOWS.md:130`). This audit records the gap and does not fill it (§5).

### 1.4 What mediabunny will and will not do for a concat loop

- **One fixed canvas is mandatory.** The video encoder wrapper refuses any coded-size change
  (`sizeChangeBehavior` defaults to `'deny'`, `media-source.ts:300-313`) and odd H.264 dimensions
  (`:707-716`). Every clip must be drawn into one even-sized `OffscreenCanvas`.
- **`drawWithFit(ctx, { fit: 'contain' })` applies the track's display rotation itself**
  (`sample.ts:1291`; the decoder stamps it, `media-sink.ts:1243`) and draws only the fitted
  rectangle — it does not clear the bars (`:1335-1349`). The loop fills black first. The output
  track is added with no rotation, as `Conversion` does when it re-renders
  (`conversion.ts:1533`).
- **Timestamps must be strictly increasing across clips.** The muxer rejects a timestamp below the
  previous key packet's maximum (`muxer.ts:66-75`); equal timestamps pass the muxer but corrupt the
  precise-timing map and produce a zero-length sample (`media-source.ts:557-566`). Every sample's
  duration is derived from the next sample; only the last sample keeps its own
  (`isobmff-muxer.ts:955-995`). `CanvasSource.add(timestamp, duration, { keyFrame })` snapshots
  the canvas synchronously (`media-source.ts:1350-1351`, `sample.ts:542-556`), so the canvas may be
  redrawn as soon as `add` has been called; awaiting it is encoder backpressure only.
- **`transform.frameRate` is not a resampler.** It quantizes to slots, drops a frame that lands in
  the previous slot — with that call's `keyFrame` request — and pads a gap by re-encoding the
  previous frame per slot (`media-source.ts:376-407`, `:637-649`). `Conversion` never sets it
  unless asked (`conversion.ts:1523-1525`), so the single-clip render already emits each source's
  own frame timing, and an MP4 with per-sample durations is valid (`isobmff-muxer.ts:1091-1096`).
- **`VideoSampleSink.samples(start, end)`** yields the frame at or before `start` first
  (`media-sink.ts:503-513`) and stops at the first sample at or past `end` (`:494-501`); the pump
  keeps decoding until then, so the loop must break out itself (which calls the iterator's
  `return()`, closing queued samples and the decoder) before disposing the `Input`. Disposing
  first makes `next()` throw `InputDisposedError` (`:601-605`).
- **`AudioSampleSink.samples`** has the same head semantics, and with a trim start of 0 the first
  sample can carry a negative timestamp (AAC priming, `media-sink.ts:2107-2109`). `copyTo`
  honours `frameOffset` (`sample.ts:2667-2674`) but throws when the offset reaches the frame count,
  and `toAudioData` hands the _whole_ underlying buffer to `AudioData` (`:2980-2989`), so a trimmed
  sample must be built over a fresh buffer, never a subarray.
- **The audio encoder counts frames, not time.** After the first sample it advances by frame count;
  a gap of 64 frames or more is padded, an overlap or a smaller gap is absorbed
  (`media-source.ts:2010-2041`). Contiguous frame budgets are the sync invariant — exactly what the
  conformer was built to provide. The encoder is configured from the first sample and throws with
  no fallback if that configuration is unsupported (`:2162-2176`, `:2222-2233`), which is why the
  domain owns `COMPOSITION_AUDIO_FALLBACK_TARGET`. `canEncodeAudio`'s memo key is the whole
  configuration including bitrate (`encode.ts:1236`), so the probe and the source must share one
  `Quality`; the registered WASM AAC fallback additionally requires a bitrate
  (`@mediabunny/aac-encoder/src/encoder.ts:59`).
- **`canEncodeVideo('avc')` defaults to 1280×720** (`encode.ts:1046-1051`); the wrapper's real
  configuration is built from the first sample's size (`media-source.ts:657-665`). The existing
  worker's probe therefore proves nothing about a 1080×1920 or 4K target; the stitched path probes
  at its target size.
- **`UrlSource` in a dedicated worker** sends same-origin cookies (fetch's default), streams by
  HTTP ranges with a 64 MiB cache (`source.ts:905-910`), aborts in-flight requests on
  `Input.dispose()` (`:2619-2640`) — but its default retry policy backs off forever in a worker
  (the CORS short-circuit needs `window`, `:661-684`) and its non-206 fallback constructs
  `new URL(relative, undefined)` (`:999-1002`). So: absolute URLs and a finite `getRetryDelay`,
  whose return value is in **seconds** (`misc.ts:610-624`).
- **Non-fragmented MP4 with a chunked `StreamTarget`** (what the worker uses) writes each track's
  0.5 s chunk and drops its bytes (`isobmff-muxer.ts:1054-1067`, `:1181-1189`), so feeding a clip's
  video and then its audio buffers no bytes across tracks. Fragmented mode would queue a whole
  clip's video until audio arrived (`:1206-1215`) — do not switch modes.
- **Packet passthrough is not an option.** The muxer freezes the decoder configuration from the
  first packet (`isobmff-muxer.ts:371-458`), so two sources with different SPS/PPS or sizes cannot
  share a track, mixed codecs cannot at all, and burned-in subtitles need decoding anyway.

### 1.5 Where the pieces already are

`compositionPlacements` and `clipMediaMsAt` (`sequence.ts`) give every clip's sequence span and the
media→sequence clock's inverse; `compositionDurationMs` the total; `videoEditAudioGain` the level;
`compositionAudioTarget`, `COMPOSITION_AUDIO_FALLBACK_TARGET`, `compositionAudioFrames` and
`clipAudioConformance` the audio half; `createAudioSampleConformer` and `silentAudioSamples` the
per-clip audio stage; `createSubtitleOverlaySync` the cue rasterizer, which already takes a time
and a frame; `subtitleCuesAt` the intersection of sequence-time cues with an instant — no
re-basing, because composition cues are already sequence time (the single clip's
`outputSubtitleCues` exists for source-time cues). `VideoEditChunkAccumulator` bounds the output at
300,000,000 bytes. `renderVideoEdit.ts` owns the worker protocol (operation ids, 2 s cancel grace,
terminate). `VideoPlayer` is the one player for finished video and attaches blob URLs imperatively.

### 1.6 The bundle edge, measured

The shell closure sits at 748,716 of 749,000 bytes and Studio at 1,099,536 of 1,100,000. The
ledger's mechanism holds on the current dist: `composition/operations.ts` is in
`assets/apiClient-*.js` inside both closures although its only consumer is the lazy arrangement
chunk; `composition/audio.ts` is in no chunk because nothing in the main build consumes it; the
worker is built outside the manifest graph (`renderVideoEdit.ts:45-47`), so what only the worker
imports costs the shell nothing.

### 1.7 Documentation debt this slice inherits

`DOMAIN_MODEL.md` still says the composition is "modelled, not yet written" and "null on every
Project" (`:111-117`, `:129-130`), false since 4.1. No feature-behaviour document describes the
arrangement surface at all.

---

## 2. Affected code

| Area            | Files                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain          | `composition/video.ts` (new), `composition/sequence.ts`, `composition/audio.ts` (comment), `composition/index.ts`, `video-editing/rules.ts` (`evenDimension` exported)                                                                                                     |
| Media adapter   | `adapters/media-processing/audioSampleConformer.ts` (`scaledAudioSample` added; `silentAudioSamples` becomes lazy)                                                                                                                                                         |
| Worker          | `features/video-editor/stitchComposition.ts` (new), `videoEditRender.worker.ts`, `types.ts`                                                                                                                                                                                |
| Client and hook | `features/video-editor/videoEditWorkerClient.ts` (new), `renderVideoEdit.ts`, `renderComposition.ts` (new), `useCompositionRender.ts` (new)                                                                                                                                |
| Surface         | `CompositionSurface.tsx`, `CompositionSurface.styles.ts`, `ProjectCompositionSurface.tsx`                                                                                                                                                                                  |
| Studio wiring   | `studio/StudioWorkspace.tsx`, `studio/StudioApp.tsx`, `studio/useStudioSessionLifecycle.ts`                                                                                                                                                                                |
| Build gate      | `scripts/check-build-manifest.mjs`                                                                                                                                                                                                                                         |
| Tests           | domain tests, conformer tests, `stitchComposition.test.ts`, worker test, client tests, hook test, surface tests, lifecycle test, `e2e/stitched-render.spec.ts` (new), `e2e/real-stack-project-deliverable.spec.ts`                                                         |
| Docs            | this file, `IMPLEMENTATION_PROMPTS.md`, `PRODUCT_ROADMAP.md`, `DOMAIN_MODEL.md`, `TARGET_USER_FLOWS.md`, `docs/user-flows/feature-behavior/20-project-arrangement.md` (new) and its index, `13-local-video-editing.md`, `docs/TESTING.md`, `SLICE_4.2_MIXED_AUDIO_PLAN.md` |

---

## 3. The plan, in order

**Step 1 — the video half of the policy, in the domain.** `composition/video.ts`, mirroring
`audio.ts`: `ClipVideoProfile { width, height }` (display dimensions, rotation applied — what the
catalogue carries), `CompositionVideoTarget`, and `compositionVideoTarget(profiles)`: **the largest
frame by pixel area, earliest wins ties, both dimensions evened** (`evenDimension` exported from
`video-editing/rules.ts` so evenness keeps one owner). Every clip is drawn into it with a contain
fit over black; nothing is downscaled, a smaller same-aspect clip is scaled up, a different aspect
gets bars. `clipVideoConformance(profile, target)` names it: `'kept' | 'scaled' | 'letterboxed'`,
aspect equality by exact integer cross-multiplication. The module header states all three halves:
frame as above; **frame rate carried** — each clip keeps its own frame timing re-based onto the
sequence clock, no frame dropped or duplicated, which is what the single-clip render already
produces; **codec not a target dimension** — every render transcodes to the one output the
validator gates, so the domain states no codec constant. `sequence.ts` gains `sequenceMsAt`, the
inverse of `clipMediaMsAt`, whose doc comment carries the frame-timing rule; it is the number every
output frame is stamped with and every cue looked up at.

**Step 2 — the adapter helpers the loop needs.** In `audioSampleConformer.ts`:
`scaledAudioSample(Sample, sample, { frameOffset, gain, timestamp })` copies a decoded sample to a
fresh interleaved `f32` buffer from an offset and applies a gain — one owner of copy, trim and
level for both the stitched path and the single-clip worker's gain hook, which delegates to it.
`silentAudioSamples` becomes a generator so a long silent clip allocates one second at a time; the
conformer's own contract is unchanged.

**Step 3 — the protocol.** `types.ts` gains a `render-composition` request (`composition`, plus
per-clip `media: { url, mimeType, filename, width, height, hasAudio }`, index-aligned with
`composition.clips`) and a `plan` response posted once, before any paid work: the video target and
per-clip video conformance, the audio target with per-clip conformance and whether the fallback was
taken, or `null` when the output carries no audio. `progress`, `complete`, `canceled` and `error`
are unchanged, so the single-clip path and its tests are untouched.

**Step 4 — the loop.** `stitchComposition.ts`, imported statically only by the worker and driven by
the worker with the mediabunny module it already imports dynamically:

1. Placements from the domain; refuse an empty arrangement or a media list of the wrong length.
2. Video target and per-clip labels from the request's catalogue dimensions — the same numbers
   the surface holds, so the plan and the canvas cannot disagree.
3. Register the cancel closure **before** anything opens: dispose the open `Input`, cancel the
   `Output`.
4. Metadata pass, one `Input` open at a time, each distinct URL opened once: video track present
   and decodable; audio track present → decodable unless the clip is muted, plus its rate and
   channel count from the header. An unmuted clip whose video or audio cannot be decoded refuses
   the render by name, before paid work.
5. Probe H.264 **at the target size** with `Quality('high')` (what `Conversion` gives the
   single-clip path); audio target from the profiles of clips that contribute sound (a muted clip
   contributes `null`); probe AAC at that target with the same `Quality`, via the app's existing
   AAC fallback registration; on refusal, `COMPOSITION_AUDIO_FALLBACK_TARGET` and probe again.
6. Post the plan. Create the canvas, the 2D context, the overlay sync, the `Output`
   (non-fragmented MP4, chunked `StreamTarget` over the 300 MB accumulator), a `CanvasSource` and,
   when audio exists, an `AudioSampleSource`; start.
7. Per clip, video: iterate `samples(trimStart, trimEnd)`, clamp the first sample's media time up
   to the trim start, **hold one frame back** so each frame's duration is the next frame's start
   minus its own and the clip's last frame lands exactly on the cut; stamp each frame with
   `sequenceMsAt`; fill black, `drawWithFit(contain)`, sync the overlay at that sequence time,
   draw it; `add(timestamp, duration, first ? { keyFrame: true } : undefined)`; break at the trim
   end; close every sample. Then audio: placement in frames from the cumulative sequence edges —
   `offset = compositionAudioFrames(startMs)`, `budget = compositionAudioFrames(endMs) − offset` —
   so budgets telescope to offsets and audio-to-video drift is bounded by half a frame for any
   clip count. A muted clip or one without audio emits silence; otherwise a conformer per clip,
   fed head-trimmed and gained samples, with any gap before or inside the clip stated as
   source-format silence pushed first, then flushed.
8. Progress as sequence time over total, quantized to whole percents. Finish: dispose, finalize,
   return the mime type. Any throw cancels the output and disposes the input.

**Step 5 — the worker.** Dispatch on `request.type`; share the output-target construction; keep the
existing operation and cancel state machine; map `InputDisposedError` to the cancel outcome. The
worker imports the conformer for the first time, which clears the production dead-code finding.

**Step 6 — the client.** Extract the runner from `renderVideoEdit.ts` (`videoEditWorkerClient.ts`)
so the spawn, cancel grace and terminate protocol has one owner; `renderVideoEdit` keeps its
export and behaviour; `renderComposition.ts` runs the new request, makes each clip's URL absolute,
and resolves the Blob with the plan.

**Step 7 — the hook and the surface.** `useCompositionRender`: `idle | rendering | validating |
ready | error`, progress, plan, the rendered Blob and an object URL derived in an effect and
revoked on change, discard and unmount; the output is validated with the existing validator against
the plan's frame and the sequence duration before it is shown, the way the single-clip editor
validates before offering adoption. `CompositionSurface`: a **Render arrangement** control gated on
the existing export probe, refused with a stated reason while a clip's media is unresolved; the
editor's progress block with **Cancel render**; gestures (Undo and Redo included) disabled while
rendering; the ready state plays the file through `VideoPlayer` with a caption naming the frame and
length, says the preview is kept nowhere, and offers **Render again** and **Back to editing**; a
stale notice when the arrangement changes after a render; per-clip notices from the plan for a
scaled, letterboxed, resampled, folded or silent clip; an archived Project may still render.
Rendering is reported up so the existing exit guard, `beforeunload` and logout block cover it.

**Step 8 — gates, measurement, docs.** `bun run quality` (shared adapter, domain export, build
budgets). `check:dead-code:production` separately. The e2e measurement runs on an isolated stack
(§7). Documents per §2.

---

## 4. Risks and dependencies

- **Bundle budgets.** `video.ts` is consumed by the worker only, so the shell should not move; the
  Studio closure may grow by the runner extraction. Both are measured after `bun run build`, and
  a raise, if any, is recorded in the ledger's format. A shell delta would mean a main-build
  module imported a value from the new domain module and is a bug to fix, not a budget to pay.
- **Cancel while `add` awaits backpressure** relies on `output.cancel()` releasing it; the client's
  2 s grace and terminate remain the backstop, as for the single-clip path.
- **HE-AAC sources** report header rates that differ from decoded output; the conformer follows
  the decoded format so encoding is right, and only the notice could be off. Recorded, not fixed.
- **Playwright's Linux Chromium cannot decode H.264 in a `<video>`**, so measurements taken on a
  workstation read the player, while a runner reads the file through WebCodecs.
- **The render budget** is measured, not assumed; the real number decides whether `Quality('high')`
  is right for a preview (§7).

---

## 5. Decided here, not asked

The operator asked for audit, plan and implementation in one pass, so the questions whose answers
change the implementation are decided under the Standing rules' "narrowest conservative
interpretation" and recorded with the alternative refused.

1. **The accurate preview is the rendered file.** Render through the worker and play the MP4. Live
   multi-element playback across cuts was refused: 4.1 recorded it as non-gapless, it would need a
   second implementation of the video policy and could not apply the audio conformer, so its stage
   would disagree with the file it claims to preview. Consequence accepted: nothing to watch until
   the render finishes; progress, cancel and the stale notice carry it.
2. **Frame rule: largest area, earliest wins ties.** "First clip sets the frame" was refused
   because it downscales a later, larger clip and flips on reorder; "most common" because it has no
   honest sentence for two clips. For the common portrait-beside-landscape conflict all three
   collapse to the first clip, so the rule costs nothing there and never throws pixels away.
3. **Frame rate carried, not normalized to a constant rate.** No frame-rate fact exists anywhere the
   render can read; a "highest source rate" would need new server inspection and would re-encode
   6 fps material five times over; a fixed 30 drops frames from 60 fps phone footage. "Explicit"
   is satisfied by stating the rule once, as the function the worker calls per frame.
4. **No codec constant in the domain.** Nothing varies per clip; the output validator owns the
   gate; a domain constant would be a second owner carrying mediabunny's vocabulary.
5. **No "add a clip from the Project's media" control in this slice.** It is the smallest item that
   would make a mixed-format arrangement reachable in the product (about 120 lines across the
   catalogue, the domain, the session hook and the surface), no slice owns it, and prompt 34's text
   is about the worker and the preview. Building it in passing would widen a domain seam and a
   surface under a prompt that does not name it. **This is the first thing to do before prompt 35
   runs**, and the product consequence is stated plainly: until then every arrangement is splits of
   one video, the mixed-format policy is exercised by the worker tests and the Chromium fixture
   render, and the real-stack two-clip journey is same-media.
6. **Notices come from the worker's plan, not from a pre-render computation in the surface.** The
   surface would need `compositionVideoTarget`, which puts the module in the shared chunk through
   the barrel edge the ledger documents and spends the shell's last 284 bytes. The plan arrives
   within the metadata pass, before any paid work, and the operator sees the frame and each clip's
   fit while the render runs. If the ledger's chunk rule ever lands, the frame line can move ahead
   of the press.
7. **A muted clip contributes no audio profile.** It is labelled `silence`, it neither raises the
   target nor is checked for decodability, and a fully muted arrangement renders without an audio
   track — which is what the operator asked for. The fixed audio half's comment is amended to say
   `silence` covers "no track, or muted".
8. **Undecodable media refuses the render by name before paid work**, rather than rendering silence
   with a notice: no conformance label exists for the latter and the policy is not decided.
9. **`Quality('high')`**, matching what `Conversion` defaults the single-clip render to, so 4.3 can
   save the same bytes the operator previewed. If the measured budget says a preview cannot afford
   it, that is a recorded number to argue from, not a guess.
10. **Archived Projects may render a preview.** A render writes nothing; `archived` keeps guarding
    mutations only, and the archived notice says so.
11. **Placement in frames from cumulative sequence edges** rather than summing per-clip budgets:
    the prompt's "offset is the sum of the budgets before it" holds by telescoping, and drift is
    bounded by half a frame for any clip count instead of growing with it.
12. **Progress quantized in the worker**; the hook writes plain state. The export-placement hook's
    animation-frame throttle is left where it is rather than extracted for one more consumer.
13. **The runner is extracted, not duplicated** — the media lifecycle rule in `CLAUDE.md` — with the
    single-clip client's public API and tests unchanged.

---

## 6. Out of scope

Moves to **4.3**: composition-aware save, "Use as the current cut" for a stitched render (the adopt
path's only provenance field is `localEdit`, which would misdescribe the bytes), and export
placements over the arrangement — the render function returns a Blob and a plan that 4.3 can use
as they are. Deferred with the reason: the add-clip control (§5.5); a gain option inside the
conformer (one copy saved per attenuated sample; the helper is enough for now); packet passthrough
(unsafe across sources); a chunk rule for the domain barrel edge (a build-config change, per the
ledger); a frame cap; live scrubbing across cuts as a non-authoritative aid; the two pre-existing
`check:dead-code:production` findings in `apps/api` test-support files, which are unrelated.

---

## 7. Validation

- **Domain:** target choice for equal, same-aspect-different-size, equal-area-different-aspect and
  4K-beside-portrait cases in both orders; evening of odd dimensions; refusals; conformance labels;
  `sequenceMsAt` as the inverse of `clipMediaMsAt` across three placements with non-integer trims,
  clamped, and landing the next clip's start exactly on the previous end.
- **Adapter, real mediabunny in Node:** `scaledAudioSample` trims by frame offset, halves at 0.5,
  gives exact zeros at 0, allocates a fresh buffer; a head-trimmed sample through a conformer into
  a PCM output lands on its budget; the lazy silence still chunks by the second.
- **The loop, with a fake runtime (no WebCodecs):** ordering and strictly increasing timestamps
  across three clips of different rates with non-integer trims; each frame's duration equal to the
  next frame's start minus its own, the last frame of each clip ending on the cut, the last frame
  of the last clip on the sequence end; a key frame on each clip's first frame; no frame rate and
  no rotation on the track; the first pre-start sample clamped to the trim start; the iterator
  returned at the trim end; the canvas sized to the evened target with a black fill before every
  `drawWithFit(contain)`; a cue spanning a cut rasterized once and drawn on both sides, a cue
  starting exactly on a cut appearing on the next clip's first frame; audio budgets summing to the
  sequence and contiguous across clips, a head gap stated as silence, a pre-start sample trimmed by
  the exact frame count, a wholly-early sample skipped; a muted clip and a clip without audio
  emitting silence at the target, a level-50 clip halved uniformly; the fallback taken when the
  first probe refuses and refused when both do; the video probe at the target size before any sink
  exists; undecodable media refusing before the output starts with every `Input` disposed; cancel
  mid-clip leaving no further `add`, the iterator returned, the held frame closed, the output
  cancelled, every `Input` disposed; `InputDisposedError` after the cancel closure not converted
  into a completion; at most one `Input` open across a 100-clip arrangement; progress
  non-decreasing within [0, 1] and at most 101 distinct values.
- **The worker:** the new request routes, posts the plan, progress and a non-empty completion;
  cancel mid-composition posts `canceled` exactly once and never `complete`; a second request while
  one is active is refused; the single-clip gain case still passes after its helper delegates.
- **The client, hook and surface:** request shape (absolute URLs, per-clip media, the composition
  and its subtitles); the plan forwarded once; abort → cancel → `AbortError`; phases idle →
  rendering → validating → ready with a created and later revoked URL; unresolved media disables
  the control with the reason; the probe's `null` disables silently and `false` shows the warning;
  gestures disabled while rendering; the player and caption in the ready state; a gesture after
  ready shows the stale notice; a failure shows an alert saying nothing was changed; per-clip
  notices from a plan; busy reported up and folded into `videoRenderingActive`.
- **Real encode, Chromium, on the isolated stack (never with vitest running):** a module-level
  spec renders the three committed fixtures — 1280×720, 1080×1920 at 6 fps, 320×180 with AAC —
  through `renderComposition` in the page, asserts the plan (target 1080×1920; letterboxed, kept,
  letterboxed; silence, silence, kept), the output's frame and duration, black bars on a
  letterboxed frame and a caption across the first cut, and prints wall time, output bytes and
  milliseconds per output second — the render-budget measurement, recorded in §8 with the
  machine and browser. A second case aborts after the first progress event. The real-stack
  journey arranges an uploaded source, splits it, renders it through the surface and reads the
  player back, printing its phase timings.
- **Gates:** `bun run quality`; `bun run check:dead-code:production` separately (the conformer
  finding cleared; two pre-existing `apps/api` findings remain and are reported as such);
  `bun run check:docs` and `bun run format:check` after the documents.

---

## 8. What was built

Implemented in the same pass, 2026-09-15. `bun run quality` exits 0; the record of each check is
in the completion report. Everything in §3 landed; the deviations from it are named below rather
than smoothed over.

### 8.1 The render budget, measured

Taken from the two Chromium journeys on the isolated stack — a throwaway PostgreSQL database, the
API on a spare port with every provider unconfigured, and a Vite instance proxied to it — on an
Apple M1 Pro (16 GiB, macOS Darwin 25.6.0), Playwright 1.62.1's bundled Chromium, software H.264
(`prefer-software`), `Quality('high')`, 2026-09-15:

| Journey                                                                                                                                                            | Measured                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/stitched-render.spec.ts` — 1280×720, 1080×1920 at 6 fps, 320×180 with AAC, one cue across the first cut, into one 1080×1920 file                              | **457 ms for 2.20 s of output (208 ms per output second)**; 49,805 bytes; 14 progress reports. Four runs measured 427–504 ms.  |
| `e2e/real-stack-project-deliverable.spec.ts` — the surface's own path: a one-second portrait source uploaded, arranged, split, rendered at 1080×1920 and validated | upload source 4.1 s, arrange and split 2.0 s, **stitched render 1.0 s** (worker and validation), read back 0.1 s; total 7.2 s. |
| The same spec's cancel case — abort on the first progress report                                                                                                   | settles as a cancel within the client's two-second grace; measured well under it.                                              |

At a fifth of a second per output second for a 1080×1920 mixed arrangement, `Quality('high')`
stays (§5.9): the preview is affordable, and 4.3 can save the same bytes the operator watched. The
memory bound is structural and asserted by the fake runtime — one input open across a hundred
clips, silence produced a second at a time, the 300 MB accumulator — not measured in the page, where
`measureUserAgentSpecificMemory` is unavailable without cross-origin isolation.

### 8.2 Built as planned

The domain video half (`compositionVideoTarget`, `clipVideoConformance`, `sequenceMsAt`, the
shared `requirePositiveWholeNumber`); the adapter helpers (`scaledAudioSample`, lazy
`silentAudioSamples`); the protocol (`render-composition`, `plan`); the loop (`stitchComposition`)
with the metadata pass, both probes at the formats actually used, the plan before paid work, the
held-frame write, audio placed from the cumulative edges, per-clip conformers with head gaps stated
as silence; the worker dispatch sharing the operation and cancel contract; the runner extracted into
`videoEditWorkerClient.ts` with `renderVideoEdit` and its tests unchanged; `renderComposition`;
`useCompositionRender` with validation against the plan; the surface's states; the busy report
through the bridge into `videoRenderingActive`, so the existing exit guard, `beforeunload` and
logout block cover an arrangement render. Tests as §7 lists them, plus an `EditRange` test.

### 8.3 Deviations from §3, and why

- **The object URL is made where the render settles, not derived in an effect.** The repo's React
  rule forbids setting state synchronously inside an effect; the URL is created as the ready state
  is set and revoked by the next render, a discard or the unmount, through one `letGo`.
- **The render's live-region text is derived from the phase**, for the same rule, rather than set
  from an effect.
- **`CompositionRenderMedia` carries no `hasAudio`.** The worker reads each clip's audio track
  itself — the only place its format is known — so the field was posted and never read; it went.
- **The video probe carries `hardwareAcceleration: 'prefer-software'`**, the same option the
  source is configured with, because the probe's answer is keyed by everything it is asked.
- **The surface claims the whole takeover grid and hides the stage.** Found by the real-stack
  journey, not by any unit test: the 4.1 surface, auto-placed into the stage column's grid, landed
  in one cell at the width of its header row, so its preview column had no width at all and its
  lower half was clipped with no way to scroll — and the persistent stage figure sat under it and
  took the pointer. The section now spans every column and row and scrolls within the stage, and
  the stage column carries `data-arranging` so its stage steps aside while arranging; the
  single-clip editor keeps the stage because the stage is its preview. A pre-existing defect of
  4.1's, fixed here because the render's result is what it hid.
- **`EditRange` gained `disabled`**, and gates only its gesture openers, so a greyed slider pressed
  during a render cannot open a transaction that nothing closes.

### 8.4 What the adversarial review changed

Four lenses and a refuter per finding, over the diff. Six findings held and were fixed:

1. A cancel that landed as the worker finished left the hook in `rendering` for good, with a dead
   Cancel and the exit guard armed — the client resolves a completion that arrives after the abort,
   and the hook returned without a phase. Both post-await guards now `throwIfAborted`, so the one
   cancel branch handles it; two hook tests pin the resolve-after-cancel and cancel-during-validation
   paths, including that the next press starts a render.
2. A disabled `EditRange` still opened gestures on pointerdown (above).
3. The record this section is, which the canon already pointed at.
4. The loop's cancel case never exercised the library's own refusal of a read on a disposed input;
   the fake now throws `InputDisposedError` the way mediabunny does, and the case is two — a cancel
   that disposes mid-read, and a cancel seen between frames — each pinning exactly which frames were
   written and closed and that the output is cancelled once.
5. The hundred-clip case compared the domain's rounding with itself; it now reads the emitted
   stream, with a clip length that is not a whole number of frames, so summing budgets would fail it.
6. The worker's cancel case waited on a property access and never proved the slot was released; it
   now waits for the rejection to settle and renders a second arrangement afterwards, and a sibling
   case pins that a disposed-input refusal after a cancel posts only `canceled`.

Of the low findings, fixed: the double `output.cancel()` on a cancel, a decoded frame left unowned
when a write threw, the probe's acceleration option, the retry-policy comment's overclaim,
plan-derived notices shown against a changed arrangement, and an unused exported type. Recorded
rather than fixed: the validator applies the intake's five-minute duration limit to the preview,
so an arrangement longer than that renders fully and is then refused with the intake's copy — no
arrangement can reach that length today, and the honest fix is a refusal before paid work in 4.3,
where the save is decided.

### 8.5 Deliberately not done

Everything §6 names, unchanged: composition-aware save and adoption (4.3); the add-clip control
(§5.5 — the first thing to do before prompt 35); a conformer gain option; packet passthrough; the
barrel chunk rule; a frame cap; live scrubbing. `bun run check:dead-code:production` now reports
only the two pre-existing `apps/api` test-support files; the conformer finding it carried since the
mixed-audio slice is cleared by the worker's import.
