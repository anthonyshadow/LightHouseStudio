# Recording memory policy

Studio deliberately retains the original recording, optional audio sidecar, and any processed
replacement in the active tab so a completed take remains reviewable and downloadable. This is a
product contract, not an accidental implementation detail. The approved supported maximum is 300
seconds. The runtime now announces the independent recording warning at 270 seconds and invokes
the existing coalesced Stop/finalize path at 300 seconds. It preserves a valid main take when the
optional sidecar fails or times out and releases live/provider owners only after finalization
settles. This deterministic runtime evidence does not by itself qualify a physical target.

## Runtime evidence

Accelerated domain, controller, stage, and review-flow tests cover:

- Local, Character, and VTO sources reaching the independent recording cap;
- simultaneous manual/cap Stop calls and duplicate recorder events;
- source end at the boundary, delayed sidecar settlement, terminal finalization timeout, and
  unmount during finalization;
- one playable original when the main recording succeeds, with the main video authoritative when
  the optional sidecar fails; and
- no early stop of borrowed recording tracks before session-owned cleanup.

Physical evidence remains open. No row in the approved browser/device matrix is supported until
the protocol below records a successful real 300-second take plus processing and cleanup results.

## What to measure

Before changing capture retention, run a representative take on each release browser/device target. Record the actual main and sidecar Blob sizes, then use the estimate command with their per-minute rates:

```bash
npm run recording:memory:estimate -- \
  --duration-seconds 300 \
  --main-mib-per-minute 12 \
  --sidecar-mib-per-minute 1
```

The command models retained encoded media, a decoded stereo 48 kHz PCM audio buffer, and a 1.1× processed-output allowance. It intentionally reports a conservative finalization peak rather than pretending that a browser's Blob or codec storage has a fixed heap cost.

For each target, capture browser performance-memory measurements at idle; 1 minute; 5 minutes;
finalization; after local processing; after ElevenLabs processing when that provider is configured;
and after Close/Discard. Record elapsed finalization time, processing outcome, and whether the
browser evicted, terminated, or materially degraded the tab. A 15-minute run may be useful as an
out-of-contract stress test, but it is not release evidence and must not expand the supported
duration. Do not use an emulator as evidence for a physical mobile target.

## Release policy

- Preserve the visible, accessible warning before 300 seconds and safe automatic Stop/finalize at
  300 seconds. Never terminate by dropping chunks, stopping borrowed source tracks early, or
  releasing live/provider resources before final recorder data and the optional sidecar settle.
- Treat the estimate as a planning budget only. Streaming upload or chunk eviction requires a
  separate product decision because either changes review/download guarantees.
- A supported target must complete a 300-second sample, safely auto-finalize a valid original take,
  and release its artifact URLs on Close/Discard without browser termination or sustained loss of
  control responsiveness.
- If the measurement exceeds the target's practical memory budget, document the target and sample in the release notes, narrow the supported workflow if needed, and choose an explicit mitigation. Do not silently degrade a take or discard source media.
- Re-measure whenever recorder MIME selection, sidecar behavior, remuxing, output retention, or supported device/browser matrix changes.

The Decart active-session scope and ElevenLabs conversion UI limit are also five minutes, but they
remain separate technical contracts. Sharing the same number does not permit one timer, provider
callback, or credential expiry to stand in for the app-owned recording cap.
