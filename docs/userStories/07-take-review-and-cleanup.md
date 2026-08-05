# Take review and cleanup

**Outcome:** preserve one finalized take long enough to inspect, optionally process, download, and
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
   **Recorded take playback** on the persistent stage. Primary **Record New Video** opens the
   post-recording editor; Dock-started local and live AI recordings retain compact Download,
   Discard, Voice, and Release actions directly beneath the video. They never overlay the take or
   its native playback controls, and the narrowest supported viewport wraps them into a second row.
5. Confirm **Edit Video** is enabled in the creative tool rail for any finalized playback. An
   editor-backed upload or recording reopens its retained editor state; a Dock/live-AI take opens
   the existing-video source chooser without automatically adopting the take. While playback is
   retained, the rail's live-only **Select Character**, **Select Outfit**, **Workshop**, and
   **Shelf** actions are disabled. This rail lock does not disable Character Swap, Virtual Try On,
   Voice, recipe selection, or other controls inside the open existing-video editor.
   From that editor, **Adjust video** enters the stage-owned local editing workspace without
   remounting the stage video. A confirmed validated export replaces the immutable source; discard
   or failure preserves the take shown when editing began.
6. When the detailed **Latest Take** surface opens after finishing an editor flow or returning from
   Voice, inspect mode, sources, start time, dimensions/frame rate when known, duration, size, and
   MIME type. The panel does not create another player and has no dedicated tool-rail launcher.
7. Optionally apply a voice treatment. Playback and download remain locked until processing
   settles or is cancelled.
8. Select **Download**. Studio records only that download initiation was requested; it cannot
   verify browser save completion.
9. Verify the browser saved the file, then select **Release**. Or select **Discard** and confirm
   irreversible removal without a download.

## Guards and recovery

- Release stays disabled until download initiation. A click can still be blocked or mishandled by
  the browser, so verify the downloaded file before release.
- Playback, Voice, and Download remain unavailable while device-local transcoding is active.
- Main video remains available if the optional sidecar fails, provided the required H.264 MP4
  conversion succeeds.
- Conversion cancellation, encoder failure, or a dropped video/audio track publishes no raw
  fallback and no download URL.
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
voice locking, download initiation, release, and discard. Browser download completion, real codecs,
memory, and interruption recovery remain manual/physical evidence.
