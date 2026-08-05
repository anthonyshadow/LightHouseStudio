# Recording memory policy

## Current runtime

Studio keeps one immutable recorded or uploaded source, an optional source-audio sidecar, and one
latest healthy Result in browser memory. During a combined visual-plus-voice edit, the healthy
visual remains the Result while voice work runs; a healthy voiced replacement commits before the
visual URL is revoked. Replacing the source invalidates every downstream layer.

The runtime:

- warns accessibly at 270 seconds and auto-stops at the 300-second maximum;
- coalesces duplicate/manual/limit Stop requests;
- settles final main-recorder data and the optional sidecar before releasing session-owned media;
- temporarily retains the settled raw main Blob while MediaBunny builds a complete H.264/AAC MP4;
- publishes only that converted MP4 and never exposes the raw recorder Blob for download;
- publishes a valid converted main video when the sidecar fails or times out;
- commits a healthy visual or voiced replacement before revoking the superseded URL; and
- releases artifact URLs only on downstream invalidation, Release, Discard, or unmount.

Local video editing pins the displayed artifact and sidecar while a dedicated worker renders. The
worker writes MediaBunny `StreamTarget` offsets into sparse 4 MiB blocks rather than repeatedly
growing one `ArrayBuffer`, rejects output above 300,000,000 bytes before publication, and clears all
blocks on completion, cancel, or error. The candidate Blob and extracted audio sidecar coexist with
the pinned source only until explicit replacement or discard. The UI thread has no synchronous
encoding fallback.

**Use existing video** also has the sole secondary `<video>` element. It borrows the existing
source/result artifact URL and adds no encoded copy, track, or provider session. It never handles
live preview, recording, or finalization; it pauses, detaches `src`, and removes its binding on
close, replacement, or unmount.

Peak finalization memory therefore includes recorder chunks, the raw assembled input, the
in-progress encoded output, the final MP4 Blob, and the optional sidecar until conversion returns
and prior temporaries become collectible. MP4 Fast Start is disabled to avoid an additional
in-memory media-chunk staging copy. Conversion is cancellable on ownership loss but raw chunks are
never silently evicted to relieve pressure.

Peak local-edit memory includes the pinned source and sidecar, decoded worker frames/GPU surfaces,
offset-aware encoded blocks, the finalized candidate Blob, and validation/extracted-sidecar data.
A successful atomic replacement commits the candidate before revoking superseded artifact URLs;
failure and cancellation keep the prior artifact and draft intact while releasing worker output.

Uploaded source limits are decimal bytes: 300,000,000 for local/Lucy-only workflows and
200,000,000 when VTO is planned. Downloaded provider output is capped at 300,000,000 bytes.
Server-side upload and result files are streamed to the dedicated temporary video-job root rather
than buffered in process memory. They are not a recovery store.

Automated domain and controller tests cover those rules, including source end, delayed sidecar,
finalization timeout, and unmount races. They do not qualify real browser memory, codecs, or
physical devices.

## Physical qualification

For every required device/browser row in
[`qualification/required-matrix.json`](qualification/required-matrix.json):

1. Record the exact release-candidate commit, browser/OS version, device class, selected
   intermediate recording MIME type, raw main/sidecar byte sizes, final MP4 byte size, and confirmed
   H.264/AAC output codecs.
2. Complete the required 300-second Local, Character, and VTO paths. Confirm the warning,
   automatic finalization, playable original, responsive controls, and cleanup indicators.
3. Complete maximum-size uploaded local, local-edited, Lucy, and VTO paths as separate workflows.
   For local edit, exercise render cancellation and 1:1, 4:5, 16:9, 9:16, and representative
   Freeform output, then verify external H.264/AAC playback and expected provider compatibility.
   Measure before
   submission, after the visual result, during ordered visual-plus-voice replacement, after local
   Voice, after ElevenLabs Voice when qualified, and after Release/Discard.
4. Record recorder-settlement, H.264/AAC transcode, and Voice-processing durations plus whether the
   browser evicted, terminated, or materially degraded the tab.
5. Play every downloaded result outside Studio and verify duration, video, and audio.

Use actual per-minute sizes with the planning estimator:

```bash
pnpm recording:memory:estimate \
  --duration-seconds 300 \
  --main-mib-per-minute 12 \
  --sidecar-mib-per-minute 1
```

The estimate includes encoded media, decoded stereo 48 kHz PCM, and a conservative processed-output
allowance. It is not a measured browser heap limit.

## Release rule

A row passes only when its physical run completes without take loss, browser termination,
sustained loss of control responsiveness, early source-track release, or leaked artifact URLs.
Never reduce pressure by dropping chunks or silently evicting originals. Streaming upload, chunk
eviction, or a shorter supported workflow requires an explicit product decision.

Re-run affected rows when MIME selection, upload inspection, sidecar/remux behavior, retained
layers, or the approved device/browser matrix changes. Do not reduce pressure by deleting the
immutable source or intermediate artifact while it is the last valid result. The separate
five-minute Decart session and ElevenLabs conversion limits never substitute for the recording
timer.
