# Local camera capture

## User story

As a creator, I want to preview and record my camera locally, so that I can produce a take without enabling any AI or cloud-voice service.

## Starting state

- The studio is open in a secure, supported browser with a camera, microphone, and MediaRecorder.
- **Local Camera** is selected in the Recipe Dock.
- There is no recording and no take in review.

## End-to-end steps

1. Open **Dock** if the Recipe Dock is closed and confirm **Local Camera** is selected.
2. Optionally open **Capture settings** and stage the desired sources/quality. Return to the Dock.
3. Select **Start local preview**.
4. Respond to the browser camera/microphone permission prompt. If granted, verify that the main stage changes from its idle Local Camera message to a mirrored **Live local camera preview**.
5. Check framing and microphone readiness on the stage. The creative tools remain available for browsing, but Character Workshop and cross-model recipe insertion are disabled until camera and microphone are released.
6. Select **Record a take** in the capture control strip. Alternatively, press Space only while focus is outside a text field, select, editor, or overlay control.
7. Confirm the control changes to **Finish take** and the recording timer advances.
8. Perform the take, then select **Finish take**.
9. Wait on the finalizing stage state. The app stops the main recorder and optional audio sidecar, receives final chunks, creates the take, and only then releases live device tracks.
10. Verify that the same persistent stage becomes **Recorded take playback** and the **Latest take** panel opens. Continue with [Take review and cleanup](07-take-review-and-cleanup.md).

## Failure and alternate paths

- If permission is denied, busy, missing, or cannot meet requested constraints, the stage displays a sanitized explanation and a **Capture settings** recovery action. No provider work starts.
- Select **Stop camera** before recording to release local tracks and return to private idle.
- If recording cannot create a valid artifact, the studio releases live resources and returns to idle with an error instead of leaving a partially live state.

## Completion criteria

A playable latest take is visible, or local tracks have been deliberately stopped. This flow does not request a Decart token, load the Decart SDK, open a provider WebRTC connection, or send media/prompt/image data to Decart.

## UX investigation cues

- Time permission prompt → confident preview → recording start.
- Whether the difference between **Stop camera**, **Finish take**, and take-review **Close take** is clear.
- Whether the local-only guarantee is visible at the decision point, rather than only in documentation.
