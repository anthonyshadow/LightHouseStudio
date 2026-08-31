# Local camera capture

**Outcome:** create a playable in-memory take using only browser camera, microphone, and recording.

## Journey

1. Optionally stage sources in **Capture settings** on desktop or **Device settings** on tablet
   and mobile, including **Landscape · 16:9** or **Portrait · 9:16** for both local preview and
   recording.
2. Entering Studio leaves camera and microphone off. Select **Start camera** in the control
   bar and grant browser permission.
3. Confirm **Live local camera preview**. Use the mic/camera toggles and any capability-gated
   front/rear or zoom controls.
4. Confirm that the session control bar is directly beneath the video frame in either landscape or
   portrait format. On large desktops the creative tools and session/device information flank the
   centered stage; tablet and mobile stack those same regions without duplicating controls.
5. With no Character or Virtual Try-On configuration selected, the stage control bar presents **Record**
   as its primary action and does not present **Start AI**. Select **Record**, or press Space while
   focus is outside interactive/editable content.
6. Select the dominant **Stop recording** action. It remains visible and focusable throughout
   recording.
7. If recording continues, Studio warns at 4:30 and invokes the same coalesced Stop/finalize path
   at 5:00.
8. Wait for the main recorder and optional audio sidecar to settle. Studio releases live tracks
   and shows **Recorded take playback** on the same stage.
9. Every finalized playback enables **Edit video** in the creative tool rail — until then it is
   disabled and says it needs a recorded or uploaded video — and keeps the compact
   Save, Discard, Voice, Release, and [detailed review](07-take-review-and-cleanup.md) path.
   **Edit video** adopts the presented take into the existing-video workflow and opens its panel
   already holding that take; a refused adoption surfaces the workflow's own error and opens
   nothing.
10. In an open empty Project, **Record** uses this same local preview, recorder, Stop/finalization,
    and artifact owner. The Project remains **No source yet** until the operator chooses **Use
    finalized recording** and the API durably stores, inspects, and atomically accepts it. A failed
    acceptance leaves a replaceable local take; an accepted recording becomes that Project's
    immutable original and returns after refresh without contacting a provider.

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
- Switching Projects is blocked while recording/finalization owns the take. A finalized but
  unaccepted Project take requires explicit discard before switching; acceptance completion stays
  bound to its initiating Project.

## Evidence status

The no-key journey, network denial, control recovery, finalization ordering, and 270/300-second
policy are automated. Physical browser/device, codec, memory, interruption, and long-take behavior
remain pending manual validation.
