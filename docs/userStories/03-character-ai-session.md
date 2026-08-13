# Live character transformation

**Outcome:** deliberately start, refine, and optionally record a live character transformation
while retaining local preview as the fallback. The current configured implementation uses the
pinned `lucy-latest` model.

## Journey

1. Create or choose a saved character. On desktop, **Select Character** is the first AI preparation
   action in the creative-tool rail, immediately before **Select Outfit** and **Workshop**. On
   phones and tablets, **Dock** accepts a direct Character recipe and **Shelf** exposes saved
   characters plus **New character recipe**. Saving preloads the character but never starts AI.
   The Character panel exposes **Unselect character** when opened from the desktop rail; Shelf and
   Dock remain the compact-layout entry points.
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

Inside an open source-bearing Project, the same Character/Variant selectors configure the one
Project session beside current working media. **Save creative setup** records the stable Character
and Variant IDs plus exact applied labels, resource revisions, immutable reference ID, prompt, and
treatment settings as one semantic checkpoint. It does not copy or take lifecycle ownership of the
Character record. If that owner-scoped record later disappears or changes, the Project retains its
historical applied explanation and offers **Choose another**. Project **Start** remains disabled;
this configuration never requests a token, SDK connection, or provider job. The standalone live
journey above is unchanged.

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
