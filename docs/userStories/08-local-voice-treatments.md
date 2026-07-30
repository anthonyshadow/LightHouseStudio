# Local voice treatments

**Outcome:** apply Warm, Clear, or Robot audio locally while retaining the immutable original take.

## Journey

1. From a take with a usable audio sidecar, select **Voice treatments**.
2. Choose **Original**, **Warm**, **Clear**, or **Robot**.
3. For an effect, Studio renders the original sidecar offline and remuxes it with the original
   encoded video. Playback and download stay locked during processing.
4. On success, the stage switches to the processed artifact and reports **Voice treatment ready**.
5. Choose another effect or **Original**. Every effect starts from the original, never a prior
   processed result.

## Guards and recovery

- **Cancel processing** preserves the last valid artifact.
- Missing sidecar audio leaves the original video usable.
- Missing Web Audio disables all replacement; missing Offline Audio disables local effects but may
  leave ElevenLabs available.
- Encoder/remux failure never overwrites the original. Replacement commits before an old processed
  URL is revoked.
- No local treatment contacts a provider.

## Evidence status

Immutable-original, cancellation, stale-result, remux, and object-URL behavior have deterministic
coverage. Physical browser codec/playback and long-take memory evidence remain pilot gates.
