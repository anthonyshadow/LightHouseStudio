# Character AI session

**Outcome:** deliberately start, refine, and optionally record a `lucy-latest` transformation while
retaining local preview as the fallback.

## Journey

1. Create or choose a saved character. On desktop, **Select Character** is the first AI preparation
   action in the creative-tool rail, immediately before **Select Outfit** and **Workshop**. On
   phones and tablets, header **Select AI** opens a provider-free chooser and **Character** routes
   to the same Character panel. Saving preloads the character but never starts AI. The responsive
   trigger shows the selected name, and the Character panel exposes **Unselect character**.
   Unselecting returns the session draft to **Local Camera**, removes **Start AI** from the stage
   controls, and restores local **Record**.
2. Explicitly start local media from **Record New Video** or Dock **Start local preview**, then
   select **Start AI** and the advanced **Character Transformation** experience.
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
- Character unselection follows the same lock and is unavailable until AI, recording,
  finalization, or take review releases its current owner.

## Evidence status

Synthetic start/apply/fallback/reset, safe-error, timing, and finalization races are covered. Live
Decart entitlement, output, maximum-duration, and physical-device evidence remain release gates.
