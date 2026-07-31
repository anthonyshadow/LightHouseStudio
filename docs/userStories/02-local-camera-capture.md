# Local camera capture

**Outcome:** create a playable in-memory take using only browser camera, microphone, and recording.

## Journey

1. Optionally stage sources in **Device settings**.
2. Select **Start Camera + Mic** (or Dock **Start local preview**) and grant browser permission.
3. Confirm **Live local camera preview**. Use the mic/camera toggles and any capability-gated
   front/rear or zoom controls.
4. With no Character or Virtual Try-On recipe selected, the stage control bar presents **Record**
   as its primary action and does not present **Start AI**. Select **Record**, or press Space while
   focus is outside interactive/editable content.
5. Select the dominant **Stop recording** action. It remains visible and focusable throughout
   recording.
6. If recording continues, Studio warns at 4:30 and invokes the same coalesced Stop/finalize path
   at 5:00.
7. Wait for the main recorder and optional audio sidecar to settle. Studio then releases live
   tracks and shows **Recorded take playback** on the same stage.
8. Use the compact Download, Discard, Voice, and Release actions, or select **Take** for
   [detailed review](07-take-review-and-cleanup.md).

## Guards and recovery

- Permission/device failures show safe guidance and a **Capture settings** action; retry remains an
  explicit Start.
- **Close** before recording releases camera and microphone.
- A sidecar failure does not invalidate a playable main video.
- Invalid final output returns Studio to idle with an error instead of retaining a partial live
  session.
- The local path does not request a Decart token, load its SDK, open provider WebRTC, or send media
  externally.

## Evidence status

The no-key journey, network denial, control recovery, finalization ordering, and 270/300-second
policy are automated. Physical browser/device, codec, memory, interruption, and long-take evidence
remain pending for the controlled pilot.
