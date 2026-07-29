# Take review and cleanup

## User story

As a creator, I want to finalize, inspect, download, and deliberately release my latest take, so that I neither lose a recording nor leave an in-memory media artifact behind.

## Starting state

- A local or transformed AI source is live and recordable.
- There is no existing take under review; the app owns only one temporary take at a time.

## End-to-end steps

1. Confirm that **Record** is enabled. Local capture uses local camera/microphone; AI capture requires usable transformed video and uses provider audio when live or microphone fallback otherwise.
2. Select **Record** and verify the stage controls collapse to the sole **Stop recording** action,
   which remains visible and receives focus. The app pins the selected video/audio track identities
   and snapshots source metadata for this take.
3. Select **Stop recording**. If the take continues, Studio announces the final 30 seconds at 4:30
   and invokes the same coalesced Stop path at the independent 5:00 maximum. Do not start another
   media action while the stage reports finalization.
4. Wait for main video and optional audio-sidecar recorders to settle. The app creates the original Blob, URL, filename, metadata, and duration before it releases local/provider resources.
5. Confirm that the stage displays **Recorded take playback** with compact Download, Discard,
   Voice, and Close actions. After those controls time out, pointer/touch/focus/keyboard activity on
   the persistent stage restores them and resets the idle timer. Latest Take must still be closed.
6. Select **Take** to open Latest Take and review mode, video/audio source, start time, dimensions/frame rate, duration, size, and MIME information. The overlay does not create a second player.
7. Play the take on the main stage. If desired, select **Voice** on the stage or **Voice treatments** in Latest Take; processing temporarily locks playback/download until a complete replacement exists.
8. Select **Download** on the stage or **Download take** in the panel. This tells the browser to begin a download and changes the panel state to **A download was started**.
9. After download initiation, select **Close** or **Close take**. The app revokes original/processed URLs, clears the take, closes review, and returns to private idle. Or select **Discard**, read the irreversible confirmation, and confirm removal without a download.

## Failure and alternate paths

- If the optional sidecar fails but main video is valid, the app still publishes the video take and reports the voice limitation.
- If download dispatch fails, review remains intact and Close stays unavailable; retry the download or discard deliberately.
- If a selected recording track ends or an AI callback would change its source, the app finalizes the current take before accepting a new source.
- A take stopped by the supported maximum explains the boundary after playback appears and retains
  Voice, Download, Close, and confirmed Discard. A concurrent manual Stop or source end does not
  start a second finalization.
- A before-unload warning and discard confirmation reduce unintentional loss, but a refresh, crash, tab closure, or device restart still loses an unclosed in-memory take.

## Completion criteria

The creator has a playable take awaiting action, has initiated a download and closed it, or has confirmed discard. No new camera/provider activity begins while review owns the take.

## UX investigation cues

- Clarity of the transition between live, finalizing, playback, downloaded, and released states.
- Whether “download started” versus download completed is understood.
- Whether requiring Close after download prevents loss without feeling redundant.
