# Slice 4.2, pulled forward — mixed audio into one encoder: audit, plan, record

**Document type:** the audit and plan for one hazard slice 4.1's review found and slice 4.2 would have
hit after paid work, plus the record of the fix. Run on the operator's instruction to audit, plan and
implement in one pass, 2026-09-15, at branch `phase4` from commit `8f58f4ad`.

**The claim under audit:** _mediabunny's `AudioEncoderWrapper.add` throws on any sample-rate or
channel change before the resample branch, so `transform.sampleRate` does not handle mixed audio._

---

## 1. Audit — the claim holds, and it is narrower than it reads

Verified against `mediabunny@1.55.5` source (`apps/web/node_modules/mediabunny/src`), which is
what the web build consumes.

**1.1 The guard runs first.** `AudioEncoderWrapper.add` (`media-source.ts:1866-1885`) compares each
incoming sample's `numberOfChannels` and `sampleRate` against the first sample it ever saw and throws
`Audio parameters must remain constant …` — before the `needsResample` branch at `:1889` and before
`processAndEncode` at `:1908`, which is where `transform.process` runs (`:1938`). So neither library
seam can rescue a changing input: `transform.sampleRate` is applied _after_ the guard, and a
`process` callback is called _after_ the guard.

**1.2 The resampler assumes it too.** `AudioResampler.add` (`resample.ts`) fixes its source rate and
channel count from its first sample and never re-initialises. It is not exported (`src/index.ts`
lists `AudioBufferSource`, `AudioSampleSource`, `AudioSampleSink`, `AudioSample`, `Conversion` —
no resampler), and the package `exports` map exposes only `"."`, so it cannot be deep-imported.

**1.3 `Conversion` is single-input by construction.** `_processAudioTrack` (`conversion.ts:1602`)
sets `transform.sampleRate`/`numberOfChannels` only relative to _one_ track's original format
(`:1757-1762`). "Different clips, different formats, one encoder" is a shape `Conversion` never
produces; it is the shape a stitched render produces.

**1.4 The encoder pads gaps and tolerates overlap.** `encodeSample` (`media-source.ts:2010-2041`)
inserts silence when consecutive samples leave a gap of ≥64 frames, measured by
`Math.round(timestamp × rate)`; an overlap is not corrected. A stitched stream must therefore arrive
contiguous in sequence time, at the target rate, or it drifts.

**1.5 Nothing live can hit it today.** `replaceRecordingAudio` adds exactly one `AudioBuffer`
(`replaceAudioTrack.ts:134`); `transcodeRecording` and the edit worker use single-input
`Conversion`. The hazard is latent, in the path prompt 34 builds. That is precisely why it is worth
fixing now: it fails after the video has been decoded, scaled and encoded, and the failure mode is
an exception out of a worker with the operator's whole render behind it.

**1.6 It can be reproduced without WebCodecs.** `AudioSampleSource({ codec: 'pcm-s16' })` takes
the `initPcmEncoder` branch (`media-source.ts:2211-2212`), which needs no `AudioEncoder`; with an
`Output` over `WavOutputFormat` + `BufferTarget` started, `add` reaches the guard in plain Node.
`videoValidation.test.ts` already loads real mediabunny under vitest. So the hazard — and its fix —
can be proven against the real library rather than a mock.

---

## 2. The fix

Two pieces, at two depths, because the hazard has a policy half and a mechanism half.

**2.1 Policy, in the domain.** `packages/domain/src/composition/audio.ts` owns the audio half of
the normalization target slice 4.2 was told was "decided": given each clip's audio profile
(`{ sampleRate, numberOfChannels }`, or `null` for a clip with no audio track),
`compositionAudioTarget` answers one format for the whole output, and `clipAudioConformance` names
what happens to each clip on the way there — the fact the timeline will owe the operator as a
notice. The rule: **the highest sample rate among the clips, and the highest channel count capped at
two.** Upsampling loses nothing, so the common case — every clip from the same phone — is left
exactly as it was; a two-channel deliverable is what every placement expects; a wider source is
folded down with the Web Audio matrix. `null` when no clip carries audio, which means the output
carries none.

The rule can legitimately choose a target an encoder refuses — every clip at 16 kHz picks 16 kHz,
and AAC below 24 kHz is a different profile not every browser encodes. mediabunny's own fallback
(48 000 / 2, `conversion.ts:525-526`) applies **only inside its single-input conversion**; on the
`AudioSampleSource` path a stitched render feeds, `ensureEncoder` throws at the first sample with no
fallback at all. So encodability needs an owner, and it is stated here: `COMPOSITION_AUDIO_FALLBACK_TARGET`
is the domain's rule, and prompt 34's concat loop probes its chosen target with `canEncodeAudio`
before any paid work and, on refusal, conforms every clip to the fallback instead — the conformer
already handles that case as "resampled" or "remixed". `compositionAudioFrames` is the third piece:
the sequence is kept in milliseconds and the encoder counts frames, and the rounding between them
lives in the domain, once.

**2.2 Mechanism, in the browser adapter.** `apps/web/src/adapters/media-processing/audioSampleConformer.ts`,
beside `replaceAudioTrack.ts` and `transcodeRecording.ts` where the repo keeps its
mediabunny-adjacent media code. One conformer **per clip**, created with the target and the clip's
sequence-time offset. It fixes its source format from the clip's first sample (the same assumption
mediabunny makes, legitimately, within one source), and for each decoded sample it:

- reads interleaved `f32` through `copyTo` — every mediabunny format converts to it;
- remixes channels with the matrix mediabunny and Web Audio share (mono ↔ stereo, quad and 5.1 down
  to one or two, a discrete drop/zero-fill fallback);
- resamples by linear interpolation that is **continuous across sample boundaries**: the last
  mixed frame is carried, and the phase is recomputed exactly from integer positions rather than
  accumulated — a per-sample resample clicks at every boundary, a float accumulator drifts by a
  frame at exactly the whole-second boundaries that are common, and mediabunny's resampler solves
  the seam with a five-second buffer;
- **lands on a frame budget.** The caller states where the clip starts and exactly how many target
  frames it occupies, both from `compositionAudioFrames`; `push` stops at the budget and `flush`
  pads to it with the held last frame (or silence, for a clip that decoded nothing). Timestamps are
  `(offsetFrames + framesEmitted) / targetRate`, so the frames the encoder receives are contiguous
  by construction (§1.4) and consecutive clips meet exactly by arithmetic — the first draft promised
  this in words while the millisecond sequence clock and the conformed frame count could still
  disagree by a fraction of a frame per seam;
- is a **passthrough** when the source already matches the target: same frames, re-timestamped,
  no interpolation on the common path.

`flush` emits the tail once the clip's last sample is in. `silentAudioSamples` produces the frames a
clip without audio owes the timeline, so the encoder's own gap-filler (§1.4) is never relied on.

The module takes the `AudioSample` class as a parameter rather than importing it, as the worker's
private `audioGainProcessing` helper does (its adapter siblings `await import('mediabunny')` inside
the function instead; either keeps the library out of the static closure): mediabunny is dynamically
imported in every media path, and a static import here would put it in whichever closure imports
this module. Emitted samples are the caller's to close after `add`, the way the library's own
contract works. A target wider than two channels is refused at construction, which is what makes
the mixer table's restriction to one- and two-channel targets safe.

**2.3 What it is not.** It is not the stitched render, not the video normalization target, not a
call site — `Conversion` has no seam for a per-clip stage and the single-clip worker does not need
one. It is the primitive prompt 34's concat loop feeds into one `AudioSampleSource`, proven against
the guard it exists to satisfy. Until 34 imports it, `bun run check:dead-code:production` names
`audioSampleConformer.ts` as an unused file — the module's only importer is its own test — and that
is the truthful state: the target rule and conforming stage exist and are proven; the render that
wires them is 34's. `clipAudioConformance` ships for the same consumer, named in the prompt: the
notice 34's surface owes an operator whose clip was resampled or folded.

---

## 3. Validation

- **The hazard, pinned against the real library:** a WAV/`pcm-s16` output _with a resampling
  transform set_ accepts a 48 kHz stereo sample and then rejects a 44.1 kHz mono one with the exact
  message — the transform is what proves the guard runs before the resampling it names. If a mediabunny upgrade ever
  lifts the guard, this test says so and the conformer's justification can be re-read.
- **The fix, end to end against the same encoder:** the same two clips through per-clip conformers
  to the domain's target both `add` cleanly, the output finalizes, and the WAV header reads back the
  target format with a data size equal to the expected frame count.
- **The arithmetic:** a sine split unevenly across three samples conforms to the same frames as the
  whole sine conformed in one — the seam test; mono doubles and stereo averages; an equal-format
  clip passes through with identical data and contiguous timestamps from its offset; every mixer
  branch against its Web Audio coefficients; a clip lands on its budget whether it decoded long,
  short, or not at all; three consecutive spans of awkward lengths place end to end; a non-integer
  placement is refused with the module's own message rather than the library's; silence chunks and
  stamps correctly.
- **The policy:** same-format clips keep their format; mixed clips take the highest rate and at most
  two channels; no audio anywhere is `null`; each conformance label.
- Repo gates: `typecheck`, `lint`, `format:check`, `check:modules`, `check:docs`, and
  `bun run quality` — a domain export was added, so the bundle closures are measured, not assumed.

---

## 4. Decided here, not asked

- Linear interpolation without a low-pass on downsampling: the same trade mediabunny makes and
  names (`resample.ts`, "AudioContext doesn't do this either"). A phone-shot deliverable is not
  where a windowed-sinc resampler earns its bytes.
- No clamp after a 5.1 → 2 fold: the same as mediabunny; the encoder clips.
- The target is chosen by the domain, not the conformer. A conformer that picked its own target
  would make two clips disagree, which is the whole hazard again one layer up.
- Per-clip conformers rather than one that re-initialises on a format change: a clip's format is
  constant, a change is a new clip, and "one per clip" is what makes the placement a constructor
  argument rather than a per-sample one.
- The two-channel cap is a decision made in the domain, not read from the placement rules — those
  say only whether an output keeps audio at all. It is stated as such in the constant's comment.
- Placement in frames, not seconds. A frame budget makes "clips meet exactly" a property of integer
  arithmetic; an offset in seconds made it a property of two clocks agreeing.
