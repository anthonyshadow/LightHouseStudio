# Live character transformation

**Outcome:** deliberately start, refine, and optionally record a live character transformation
while retaining local preview as the fallback. The current configured implementation uses the
pinned `lucy-latest` model.

## Journey

1. Create or choose a saved Character. On desktop, **Select Character** is the first AI preparation
   action in the creative-tool rail, immediately before **Select Outfit** and **Workshop**. At any
   viewport, **Quick Create → Create Asset → Character** opens the same Character Builder; the
   canonical Characters library is `/assets/characters`. Saving selects the Character but never
   starts AI. The Character panel exposes **Unselect character** when opened from the desktop rail.
   Unselecting returns the session draft to **Local Camera**, removes **Start AI** from the stage
   controls, and restores local **Record**.
2. Explicitly start local media from **Record New Video**, then select **Start AI** and the
   **Character Transformation** experience.
3. Review the Decart disclosure and select **Start with [character]**. If no Character is ready,
   use Character Builder or **Choose Saved Character**.
4. Studio validates the complete configuration, obtains a short-lived model-scoped credential, and
   connects with cloned local input tracks.
5. Recording stays unavailable until usable transformed video appears. Once connected, the stage
   shows the independent 5:00 AI-session timer.
6. When AI Settings are open, edit the working settings and select **Apply changes** to send one
   complete prompt/reference/enhancement snapshot. **Revert draft** restores the last applied snapshot.
7. Select **Record** and **Stop recording** for a transformed take. Recording has its own 4:30
   warning and 5:00 maximum, independent of the AI timer.
8. Select **Stop AI** to release Decart while retaining local preview and the settings, or
   **Reset AI** to stop and clear them. Empty settings are rejected before camera, token, or
   provider work.

Inside an open source-bearing Project, the same Character/Variant selectors configure the one
Project session beside current working media. **Save creative setup** records the stable Character
and Variant IDs plus exact applied labels, resource revisions, immutable reference ID, prompt, and
treatment settings as one semantic checkpoint. It does not copy or take lifecycle ownership of the
Character record. If that owner-scoped record later disappears or changes, the Project retains its
historical applied explanation and offers **Choose another**. Project advanced-live **Start**
remains disabled. The Project existing-video editor may explicitly **Start Project Character
Swap** through the recoverable exact-revision command; saving configuration alone never requests a
token, SDK connection, or provider job. The standalone live journey above is unchanged.

## Guards and recovery

- Start can be cancelled while connecting.
- Missing, ended, or disconnected transformed video returns to local fallback with safe recovery
  copy; raw provider details never reach the UI.
- Expected completion at 300 active seconds preserves local preview and the working settings. An
  early provider end remains an error.
- If AI ends while recording, take finalization settles before provider/local resources release.
- Mode, source, and cross-model changes lock during AI start/live, recording, and take review.
- Character unselection follows the same lock and is unavailable until AI, recording,
  finalization, or take review releases its current owner.

## Evidence status

Synthetic start/apply/fallback/reset, safe-error, timing, and finalization races are covered. Live
Decart entitlement, output, maximum-duration, and physical-device evidence remain release gates.
