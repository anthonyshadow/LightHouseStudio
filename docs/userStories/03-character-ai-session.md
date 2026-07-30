# Character AI session

**Outcome:** deliberately start, refine, and optionally record a `lucy-2.5` transformation while
retaining local preview as the fallback.

## Journey

1. Create or choose a saved character. Saving preloads it but never starts AI.
2. Select **Start Camera + Mic**, then **Start AI** and the primary **Character Transformation**
   experience.
3. Review the Decart disclosure and select **Start with [character]**. If no character is ready,
   use Character Builder or open Shelf directly on **Characters**.
4. Studio validates the complete recipe, obtains a short-lived model-scoped credential, and
   connects with cloned local input tracks.
5. Recording stays unavailable until usable transformed video appears. Once connected, the stage
   shows the independent 5:00 AI-session timer.
6. Edit the Dock draft, then select **Apply changes** to send one complete prompt/reference/
   enhancement snapshot. **Revert draft** restores the last applied snapshot.
7. Select **Record** and **Stop recording** for a transformed take. Recording has its own 4:30
   warning and 5:00 maximum, independent of the AI timer.
8. Select **Stop AI** to release Decart while retaining local preview and the draft, or **Reset AI**
   to stop and clear the model recipe.

The Dock is also a direct path: choose **Character · Lucy 2.5**, provide text or a reference,
optionally check camera/mic, then select **Start Character AI**. Empty input is rejected before
camera, token, or provider work.

## Guards and recovery

- Start can be cancelled while connecting.
- Missing, ended, or disconnected transformed video returns to local fallback with safe recovery
  copy; raw provider details never reach the UI.
- Expected completion at 300 active seconds preserves local preview and the working recipe. An
  early provider end remains an error.
- If AI ends while recording, take finalization settles before provider/local resources release.
- Mode, source, and cross-model changes lock during AI start/live, recording, and take review.

## Evidence status

Synthetic start/apply/fallback/reset, safe-error, timing, and finalization races are covered. Live
Decart entitlement, output, maximum-duration, and physical-device evidence remain release gates.
