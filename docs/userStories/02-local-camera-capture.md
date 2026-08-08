# Local camera capture

**Outcome:** create a playable in-memory take using only browser camera, microphone, and recording.

## Journey

1. Optionally stage sources in **Device settings**, including **Landscape · 16:9** or
   **Portrait · 9:16** for both local preview and recording.
2. Entering Studio leaves camera and microphone off. Select **Record New Video** in the control
   bar (or Dock **Start local preview**) and grant browser permission.
3. Confirm **Live local camera preview**. Use the mic/camera toggles and any capability-gated
   front/rear or zoom controls.
4. Confirm that the session control bar is directly beneath the video frame in either landscape or
   portrait format. On large desktops the creative tools and session/device information flank the
   centered stage; tablet and mobile stack those same regions without duplicating controls.
5. With no Character or Virtual Try-On recipe selected, the stage control bar presents **Record**
   as its primary action and does not present **Start AI**. Select **Record**, or press Space while
   focus is outside interactive/editable content.
6. Select the dominant **Stop recording** action. It remains visible and focusable throughout
   recording.
7. If recording continues, Studio warns at 4:30 and invokes the same coalesced Stop/finalize path
   at 5:00.
8. Wait for the main recorder and optional audio sidecar to settle. Studio releases live tracks
   and shows **Recorded take playback** on the same stage.
9. Every finalized playback enables **Edit Video** in the creative tool rail. A control-bar
   **Record New Video** take is already retained as the post-recording editor source, where
   Character Swap, Virtual Try On, and Voice are available. A Dock-started local take keeps the
   compact Save, Discard, Voice, Release, and [detailed review](07-take-review-and-cleanup.md)
   path used by advanced live sessions; **Edit Video** opens the existing-video source chooser
   without silently adopting that take.

## Guards and recovery

- Permission/device failures show safe guidance and a **Capture settings** action; retry remains an
  explicit Start.
- An unsupported selected aspect ratio fails safely; Studio does not silently claim that a
  differently shaped negotiated track was recorded.
- **Close** before recording releases camera and microphone.
- A sidecar failure does not invalidate a playable main video.
- Invalid final output returns Studio to idle with an error instead of retaining a partial live
  session.
- The local path does not request a Decart token, load its SDK, open provider WebRTC, or send media
  externally.

## Evidence status

The no-key journey, network denial, control recovery, finalization ordering, and 270/300-second
policy are automated. Physical browser/device, codec, memory, interruption, and long-take behavior
remain pending manual validation.
