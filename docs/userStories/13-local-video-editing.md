# Local non-destructive video editing

**Outcome:** adjust the artifact currently shown on the persistent Studio stage without contacting
a provider, and replace the immutable source only after a validated export and explicit consent.

## Journey

1. Uploads may use any playable aspect ratio. In **Use existing video**, select **Adjust video** for
   the currently displayed source or latest healthy result. The side panel closes and Studio
   enters one `video-edit` workspace around the existing `MediaStage`; its `<video>` node and
   playback time remain authoritative.
2. Desktop presents editing categories on the left, the stage in the center, and one named-scroll
   settings panel with sticky actions on the right. Tablet and phone place the stage first, then one
   horizontal category strip and a bounded safe-area-aware settings region. Capture controls are
   replaced while editing rather than duplicated.
3. Use accessible start/end ranges, the playhead, **Set start to playhead**, and **Set end to
   playhead** to choose a trim of at least 100 ms. Playback loops inside that range.
4. Choose Original, Freeform, 16:9, 9:16, 1:1, or 4:5 crop. Crop mode shows the full rotated source
   with the excluded area dimmed. Drag anywhere inside the selected area to position it; fixed-ratio
   crops keep their ratio while moving. Dragging a corner resizes the selection as Freeform.
   Keyboard arrows move a focused selection or corner by 1%, or 5% with Shift.
5. Rotate in 90° increments, flip horizontally or vertically, combine Brightness, Contrast,
   Saturation, Temperature, Highlights, and Shadows values from -100 to 100, and optionally add the
   Original, Vivid, Warm, Cool, Mono, or Fade filter. Filters compose with manual adjustments.
6. **Preview before** bypasses every draft transformation without seeking or changing undo
   history. Reset the active tool or all edits, and use the 50-entry grouped undo/redo history.
7. **Save edited video** starts one module worker. Studio announces local render/validation
   progress; cancellation terminates the work and preserves the pinned source and draft.
8. After validation, the replacement dialog initially focuses **Cancel** and offers **Replace
   Without Downloading** or **Download Original and Replace**. “Original” is the artifact displayed
   when this edit session began, including a prior visual or voiced result.
9. A confirmed replacement creates an `edited` artifact whose `parentArtifactId` identifies that
   pinned source, atomically makes it the immutable source, installs its matching audio sidecar,
   clears superseded visual/voice layers, and returns to **Use existing video**.

## Validation and compatibility

- Preview and export use the same WebGL color shader; the editor never depends on
  `CanvasRenderingContext2D.filter` and has no synchronous main-thread encoder fallback.
- MediaBunny runs in the dedicated worker, trims and bakes rotation/crop, preserves the primary
  audio track, and writes H.264/AAC MP4 through an offset-aware 4 MiB chunk accumulator capped at
  300,000,000 bytes.
- Publication requires a non-empty playable H.264 MP4, expected primary tracks, exact requested
  even dimensions, duration within 500 ms, and a matching immutable audio sidecar whenever the
  pinned source has audio. A silent source remains silent.
- 16:9 and 9:16 uploads and edited outputs remain eligible for Character Swap and Virtual Try On
  within the existing 1% tolerance. Other upload ratios and square, 4:5, or incompatible Freeform
  output disable those visual tools before provider intent or HTTP traffic; local adjustment,
  download, and Voice remain available.
- If WebGL, WebCodecs, OffscreenCanvas, or dedicated workers are unavailable, Studio explains that
  local editing is unsupported. Ordinary playback, download, Voice, and existing provider flows
  remain usable.

## Guards and recovery

- The pinned source, baseline, draft, generation, and worker have one session owner. A drag creates
  one history entry; duplicate Save and stale worker completions are ignored.
- Dirty edits participate in confirmed route exit and `beforeunload`. Rendering/validation blocks
  route exit and must be cancelled explicitly before discard.
- Discard, cancellation, render or validation failure, failed replacement, and stale completion
  never publish or revoke the prior artifact. The draft remains available after recoverable errors.
- Editing is browser-session-only. Refresh, crash, tab closure, or device restart does not recover
  the draft or candidate.

## Evidence status

Pure and component tests cover geometry, history grouping, worker progress/cancellation/staleness,
chunk limits, keyboard crop behavior, provider gating, replacement controls, and source ownership.
Real H.264/AAC export, five-minute and maximum-size memory, browser downloads, external playback,
touch hardware, and Safari/Firefox/Chrome codec behavior require physical qualification and must
not be inferred from automation.
