# Recording memory policy

## Current runtime

Studio keeps one original recording, an optional audio sidecar, and at most one processed
replacement in browser memory so the take remains reviewable and downloadable.

The runtime:

- warns accessibly at 270 seconds and auto-stops at the 300-second maximum;
- coalesces duplicate/manual/limit Stop requests;
- settles final main-recorder data and the optional sidecar before releasing session-owned media;
- publishes a valid main video when the sidecar fails or times out; and
- releases artifact URLs only on processed replacement, Release, Discard, or unmount.

Automated domain and controller tests cover those rules, including source end, delayed sidecar,
finalization timeout, and unmount races. They do not qualify real browser memory, codecs, or
physical devices.

## Physical qualification

For every required device/browser row in
[`qualification/required-matrix.json`](qualification/required-matrix.json):

1. Record the exact release-candidate commit, browser/OS version, device class, selected recording
   MIME type, and main/sidecar byte sizes.
2. Complete the required 300-second Local, Character, and VTO paths. Confirm the warning,
   automatic finalization, playable original, responsive controls, and cleanup indicators.
3. Measure at idle, one minute, five minutes, finalization, after local Voice, after ElevenLabs
   Voice when qualified, and after Release/Discard.
4. Record finalization/processing duration and whether the browser evicted, terminated, or
   materially degraded the tab.
5. Play every downloaded result outside Studio and verify duration, video, and audio.

Use actual per-minute sizes with the planning estimator:

```bash
npm run recording:memory:estimate -- \
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

Re-run affected rows when MIME selection, sidecar/remux behavior, retained outputs, or the approved
device/browser matrix changes. The separate five-minute Decart session and ElevenLabs conversion
limits never substitute for the recording timer.
