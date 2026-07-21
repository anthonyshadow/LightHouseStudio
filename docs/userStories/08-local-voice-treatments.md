# Local voice treatments

## User story

As a creator, I want to audition local voice effects on a completed take, so that I can change the sound without sending the recording to a provider or degrading the original.

## Starting state

- A latest take is under review and has a usable audio sidecar.
- The browser supports Web Audio, offline rendering, and a compatible final remux path for local effects.

## End-to-end steps

1. From **Latest take**, select **Voice treatments**.
2. Read the compatibility notice and confirm that the original take remains available throughout processing.
3. Select **Original** to keep/revert to untouched capture, or select **Warm**, **Clear**, or **Robot** to request an effect.
4. Wait while the app renders the original sidecar offline and remuxes the new audio with the original encoded video. During this interval, stage playback and download are locked.
5. If the result succeeds, confirm **Voice treatment ready**. The stage now plays the processed version, restored to a safe equivalent playback time and paused.
6. Compare treatments by selecting another local effect. Each request begins from the original audio/video, not the prior processed result.
7. Select **Original** at any time for an immediate no-network restore. Return to take review to download, close, or discard.

## Failure and alternate paths

- If an effect is still rendering, select **Cancel processing**; the last valid playable artifact remains intact.
- If the audio sidecar is unavailable, the feature explains that the original video remains usable; do not expect an effect to be created.
- Missing Web Audio disables local and provider replacement. Missing offline rendering disables local effects but may leave provider conversion available.
- Encoder/remux failures never overwrite the original. A new object URL is created before the prior processed URL is revoked.

## Completion criteria

The take is playing as an intentionally chosen local treatment or as the immutable original, and is ready for the normal download/close/discard flow.

## UX investigation cues

- Time from choosing an effect to a confident playable result.
- Whether the “always starts from original” guarantee is understood.
- Whether compatibility explanations distinguish unavailable audio, Web Audio, offline rendering, and remuxing clearly enough.
