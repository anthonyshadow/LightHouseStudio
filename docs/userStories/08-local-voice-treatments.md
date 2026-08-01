# Local voice treatments

**Outcome:** apply Warm, Clear, or Robot audio locally while retaining the immutable original take.

## Journey

1. From Latest Take, or the existing-video editor when the corresponding option is available, open
   **Voice** for a source with a usable audio sidecar. Both entries use the same Voice workspace;
   the existing-video editor does not open a second Voice flow.
2. Choose **Original**, **Warm studio**, **Clear presenter**, or **Signal robot** from the treatment
   rail. The source summary remains **Original audio**, and the video remains on the persistent
   stage.
3. In Latest Take, confirm **Apply treatment**. Studio renders the selected treatment from the
   original sidecar offline and
   remuxes it as AAC with the original H.264 video in MP4. Playback and download stay locked during
   processing.
4. In the existing-video editor, confirm **Use this treatment for the edit**. This changes only the
   captured edit plan; rendering waits for the outer **Start edit** action.
5. On success, the stage switches to the processed artifact and reports **Voice treatment ready**.
   Choose another effect or **Original**. Every effect starts from the original, never a prior
   processed result.

## Guards and recovery

- **Cancel processing** preserves the last valid artifact.
- Missing sidecar audio leaves the original video usable.
- Missing Web Audio disables all replacement; missing Offline Audio disables local effects but may
  leave ElevenLabs available.
- Selecting a treatment never starts work by itself; the workspace's explicit confirmation or the
  existing-video editor's outer Start action owns processing.
- Encoder/remux failure never overwrites the original. Replacement commits before an old processed
  URL is revoked.
- No local treatment contacts a provider.

## Evidence status

Immutable-original, cancellation, stale-result, remux, and object-URL behavior have deterministic
coverage. Physical browser codec/playback and long-take memory evidence remain pilot gates.
