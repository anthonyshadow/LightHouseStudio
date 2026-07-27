# Recording memory policy

Studio deliberately retains the original recording, optional audio sidecar, and any processed replacement in the active tab so a completed take remains reviewable and downloadable. This is a product contract, not an accidental implementation detail. There is currently no automatic duration limit for ordinary recording, and this policy does not add one.

## What to measure

Before changing capture retention, run a representative take on each release browser/device target. Record the actual main and sidecar Blob sizes, then use the estimate command with their per-minute rates:

```bash
npm run recording:memory:estimate -- \
  --duration-seconds 300 \
  --main-mib-per-minute 12 \
  --sidecar-mib-per-minute 1
```

The command models retained encoded media, a decoded stereo 48 kHz PCM audio buffer, and a 1.1× processed-output allowance. It intentionally reports a conservative finalization peak rather than pretending that a browser's Blob or codec storage has a fixed heap cost.

For each target, capture browser performance-memory measurements at: idle; 1, 5, and 15 minutes while recording; finalization; after local processing; and after Close/Discard. Record elapsed finalization time, processing outcome, and whether the browser evicted, terminated, or materially degraded the tab. Do not use an emulator as evidence for a physical mobile target.

## Release policy

- Keep the current uncapped ordinary-recording behavior until those measurements identify a target-specific limit or a user-visible failure.
- Treat the estimate as a planning budget only. A warning, duration limit, streaming upload, or chunk eviction requires a separate product decision because each changes review/download guarantees.
- A supported target must complete the planned release-duration sample, finalize a valid original take, and release its artifact URLs on Close/Discard without browser termination or sustained loss of control responsiveness.
- If the measurement exceeds the target's practical memory budget, document the target and sample in the release notes, narrow the supported workflow if needed, and choose an explicit mitigation. Do not silently degrade a take or discard source media.
- Re-measure whenever recorder MIME selection, sidecar behavior, remuxing, output retention, or supported device/browser matrix changes.

The five-minute provider credential scope and ElevenLabs conversion UI limit are separate provider policies; they do not impose an ordinary-recording limit.
