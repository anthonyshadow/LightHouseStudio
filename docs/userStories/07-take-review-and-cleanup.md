# Take review and cleanup

## User story

As a creator, I want to finalize, inspect, download, and deliberately release my latest take, so that I neither lose a recording nor leave an in-memory media artifact behind.

## Starting state

- A local or transformed AI source is live and recordable.
- There is no existing take under review; the app owns only one temporary take at a time.

## End-to-end steps

1. Confirm that **Record a take** is enabled. Local capture uses local camera/microphone; AI capture requires usable transformed video and uses provider audio when live or microphone fallback otherwise.
2. Select **Record a take** and verify it becomes **Finish take**. The app pins the selected video/audio track identities and snapshots source metadata for this take.
3. Select **Finish take**. Do not start another media action while the stage reports finalization.
4. Wait for main video and optional audio-sidecar recorders to settle. The app creates the original Blob, URL, filename, metadata, and duration before it releases local/provider resources.
5. Confirm that the stage displays **Recorded take playback** and **Latest take** opens. Review mode, video/audio source, start time, dimensions/frame rate, duration, size, and MIME information.
6. Play the take on the main stage. If desired, select **Voice treatments** before download; processing temporarily locks playback/download until a complete replacement exists.
7. Select **Download take**. This tells the browser to begin a download and changes the panel state to **A download was started**.
8. After download initiation, select **Close take**. The app revokes original/processed URLs, clears the take, closes review, and returns to private idle.
9. Or select **Discard**, read the irreversible confirmation, and confirm. This removes the temporary take without initiating a download.

## Failure and alternate paths

- If the optional sidecar fails but main video is valid, the app still publishes the video take and reports the voice limitation.
- If download dispatch fails, review remains intact and Close stays unavailable; retry the download or discard deliberately.
- If a selected recording track ends or an AI callback would change its source, the app finalizes the current take before accepting a new source.
- A before-unload warning and discard confirmation reduce unintentional loss, but a refresh, crash, tab closure, or device restart still loses an unclosed in-memory take.

## Completion criteria

The creator has a playable take awaiting action, has initiated a download and closed it, or has confirmed discard. No new camera/provider activity begins while review owns the take.

## UX investigation cues

- Clarity of the transition between live, finalizing, playback, downloaded, and released states.
- Whether “download started” versus download completed is understood.
- Whether requiring Close after download prevents loss without feeling redundant.
