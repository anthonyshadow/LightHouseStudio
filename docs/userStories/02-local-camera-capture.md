# Local camera capture

## User story

As a creator, I want to preview and record my camera locally, so that I can produce a take without enabling any AI or cloud-voice service.

## Starting state

- The studio is open in a secure, supported browser with a camera, microphone, and MediaRecorder.
- There is no recording and no take in review.

## End-to-end steps

1. Optionally open **Device settings** and stage the desired sources/quality.
2. Select **Start Camera + Mic** on the stage. The Recipe Dock’s **Local Camera** → **Start local preview** action is an equivalent direct-control entry.
3. Respond to the browser camera/microphone permission prompt. If granted, verify that the main stage changes from its idle Local Camera message to a mirrored **Live local camera preview**.
4. Check framing and microphone readiness on the stage. Creative tools and cross-model recipe insertion remain available because a ready local preview can be reused across modes. Use the stage mic/camera toggles if needed; incompatible changes lock only after AI starts connecting, during recording, or while a take is under review.
5. Select **Record**. Alternatively, press Space only while focus is outside a text field, select, editor, or overlay control.
6. Confirm the controls collapse to the dominant **Stop recording** action and the recording timer
   advances. Stop remains visible, focusable, and operable for the entire recording rather than
   participating in live/playback auto-hide.
7. Perform the take, then select **Stop recording**. At 4:30, Studio announces that 30 seconds or
   less remain. If no manual Stop occurs, the app invokes the same Stop/finalize path at the
   independent 5:00 recording maximum. Outside recording, stage pointer, touch,
   focus, mouse-pointer, or keyboard activity restores timed-out live controls and restarts their
   single idle timer.
8. Wait on the finalizing stage state. The app stops the main recorder and optional audio sidecar, receives final chunks, creates the take, and only then releases live device tracks.
9. Verify that the same persistent stage becomes **Recorded take playback** with compact Download, Discard, Voice, and Close actions. Latest Take must remain closed until **Take** is selected; open it for details, then continue with [Take review and cleanup](07-take-review-and-cleanup.md).

## Failure and alternate paths

- If permission is denied, a device is busy/missing, or constraints cannot be met, the stage
  displays a sanitized explanation and a **Capture settings** recovery action. That action
  acknowledges the handled error and opens the existing settings overlay; retry remains an
  explicit Start action. No provider work starts.
- Select **Close** before recording to release local tracks and return to private idle.
- If recording cannot create a valid artifact, the studio releases live resources and returns to idle with an error instead of leaving a partially live state.
- At the recording maximum, Studio explains why the take ended and preserves playback, Voice,
  Download, Close, and confirmed Discard. This timer does not depend on an AI provider session.

## Completion criteria

A playable latest take is visible, or local tracks have been deliberately stopped. This flow does not request a Decart token, load the Decart SDK, open a provider WebRTC connection, or send media/prompt/image data to Decart.

## UX investigation cues

- Time permission prompt → confident preview → recording start.
- Whether the difference between live-session **Close**, **Stop recording**, and take-review **Close take** is clear.
- Whether the local-only guarantee is visible at the decision point, rather than only in documentation.
