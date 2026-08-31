# Take review and cleanup

**Outcome:** preserve one finalized take long enough to inspect, optionally process, save, and
deliberately release or discard it.

## Journey

1. Select **Record** from a ready local source or usable transformed video. Studio pins the chosen
   track identities and source metadata.
2. Select **Stop recording**, or let the independent 5:00 maximum invoke the same coalesced Stop
   path after the 4:30 warning.
3. Wait for the main recorder and optional audio sidecar to settle, then for on-device MediaBunny
   transcoding to finish. Studio forces H.264 video and AAC audio when present into MP4; the raw
   recorder container is never downloadable.
4. After the converted MP4 becomes authoritative and live/provider resources release, confirm
   **Recorded take playback** on the Studio stage. Local and live AI recordings retain compact
   Save, Discard, Voice, and Close actions directly beneath the video. They never overlay the take or
   its native playback controls, and the narrowest supported viewport wraps them into a second row.
5. Confirm **Edit video** is enabled in the creative tool rail for any finalized playback. An
   editor-backed upload reopens its retained editor state; a local/live-AI take is adopted into
   the existing-video workflow, whose panel opens already holding it. While playback is
   retained, the rail's live-only **Select Character** and **Select Outfit** actions
   are disabled. This rail lock does not disable Character Swap, Virtual Try-On, Voice, or other
   controls inside the open existing-video editor.
   From that editor, **Edit video** enters the stage-owned local editing workspace without
   remounting the stage video. A confirmed validated export replaces the immutable source; discard
   or failure preserves the take shown when editing began.
6. When the detailed **Latest take** surface opens after finishing an editor flow or returning from
   Voice, duration and dimensions are inline; mode, sources, start time, frame rate, size and MIME
   type are behind a collapsed **Details** disclosure. `Save to Assets` is the only primary and
   `Discard` the only destructive control; `Replace Saved Version`, `Edit video`, `Voice treatments`
   and `Close without saving` are in the panel's action menu. Below 40rem the panel is a bottom
   sheet at `min(45dvh, 24rem)`, so the stage it refers to stays visible above it. The panel does
   not create another player and has no dedicated tool-rail launcher.
7. Optionally apply a voice treatment. Playback and saving remain locked until processing
   settles or is cancelled.
8. Select **Save Video**, optionally name it, and confirm. A blank name keeps the existing generated
   artifact name. Save reports progress and publishes the final validated artifact to the
   authenticated local gallery without changing review ownership. Repeated submission of the same
   artifact is idempotent.
9. After Save succeeds, review acknowledges completion by name and Version and offers **Download**
   and **View in Assets** for that exact retained Version, plus **Create another**, which releases
   the take and clears save state so the next recording starts from a clean stage. A Project video
   context keeps its own attach-and-return behavior and shows no completion surface.
10. Select **Close without saving** (**Close** on the compact control bar). The durable gallery copy
    remains available for preview, reuse, and download. Or select **Discard** and confirm
    irreversible removal of the take without saving it.

## Guards and recovery

- Close stays unavailable until the current artifact is saved to the gallery.
- Playback, Voice, and Save Video remain unavailable while device-local transcoding is
  active.
- Main video remains available if the optional sidecar fails, provided the required H.264 MP4
  conversion succeeds.
- Conversion cancellation, encoder failure, or a dropped video/audio track publishes no raw
  fallback and no saveable artifact.
- Processing failure/cancel preserves the original and last valid playable artifact.
- Dirty local edits require confirmed discard. Active local render/validation must be cancelled
  before route exit and cannot be abandoned by navigation.
- Edited output with source audio is not published unless its AAC track and newly extracted audio
  sidecar validate; a silent source remains silent.
- Source end, manual Stop, provider end, and maximum-duration Stop coalesce into one finalization.
- A before-unload warning and discard confirmation reduce accidental loss, but refresh, crash, tab
  closure, or device restart still loses the in-memory take.
- No new camera or provider activity starts while review owns the take.

## Evidence status

Automated journeys cover finalization/transcode ordering, required codec configuration,
track-preserving failure, local-edit history/cancellation/replacement, maximum-duration races,
voice locking, gallery save, release, and discard. Gallery download completion, real codecs,
memory, and interruption recovery remain manual/physical evidence.
