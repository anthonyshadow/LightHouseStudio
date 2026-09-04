# Local non-destructive video editing

**Outcome:** adjust the artifact currently shown on the Studio stage without contacting
a provider, and replace the immutable source only after a validated export and explicit consent.

## Journey

1. Uploads may use any playable aspect ratio. **Edit video** opens the editor from three places:
   the Project workspace rail and its Create card open it directly on the Project's current cut,
   with no chooser in between; in the standalone flow it is offered in **Use existing video** for
   the currently displayed source or latest healthy result, and pressing it on a fresh finalized
   take adopts that take rather than opening an empty chooser beside it. The side panel closes and Studio
   enters one `video-edit` workspace around the existing `MediaStage`; its `<video>` node and
   playback time remain authoritative. Source geometry, duration, size, and audio facts come from
   that displayed artifact rather than being reused from the original upload.
2. The editor is frame-first: its heading and horizontal tool strip lead into one dominant 16:9
   stage. Desktop docks a collapsible inspector on the right, with labelled history/compare controls
   and one timeline directly below the stage. Tablet uses the same order in one column. Phone keeps
   the stage first and presents the inspector as an expanded 40dvh bottom sheet above persistent
   Save/Discard actions and the app navigation; collapsing the sheet exposes history and timeline.
   Capture controls are replaced while editing rather than duplicated.
3. Use the timeline playhead, timecodes, draggable in/out handles, accessible start/end ranges,
   **Set start to playhead**, and **Set end to playhead** to choose a trim of at least 100 ms. Left
   and Right Arrow step the playhead one 30fps preview frame; Shift steps ten. Playback loops inside
   the selected range.
4. Choose Original, Freeform, 16:9, 9:16, 1:1, or 4:5 crop. Crop mode shows the full rotated source
   with the excluded area dimmed. Drag anywhere inside the selected area to position it; fixed-ratio
   crops keep their ratio while moving. Dragging a corner resizes the selection as Freeform.
   Keyboard arrows move a focused selection or corner by 1%, or 5% with Shift.
5. Crop handles and 90° rotation controls are available directly on the frame. The inspector also
   offers rotation and horizontal/vertical flip controls. Combine Brightness, Contrast,
   Saturation, Temperature, Highlights, and Shadows values from -100 to 100, and optionally add the
   Original, Vivid, Warm, Cool, Mono, or Fade filter. Filters compose with manual adjustments.
6. Hold **Compare** (or hold **C**) to bypass every draft transformation without seeking or changing
   undo history. **Split** keeps the original and edited render side by side on the same stage.
   Reset the active tool or all edits, and use the labelled 50-entry grouped Undo/Redo history.
7. **Audio** sets how loud the clip's own audio is in the output, 0–100% of the source, and
   **Mute** silences it without forgetting the level. The stage plays at that level while you edit,
   and the render applies the same number to every sample, so what you hear is what the file
   carries. Neither drops the track: whether a saved video carries audio at all stays the
   placement's keep-or-drop, chosen when you save. A boost above the source is not offered.
8. **Subtitles** adds timed text that is burned into the render. **Add subtitle at playhead**
   creates a cue from the playhead — two seconds long, or to the trim end — selected and ready to
   type. The inspector lists every cue and edits the selected one: text up to 200 characters on
   three lines, start and end at least 100 ms apart with **Set start/end to playhead**, a Top /
   Middle / Bottom placement, and **Delete subtitle**. A lane under the timeline shows each cue as
   a block: click selects and seeks to it, drag moves it, Left/Right Arrow nudges one frame (ten
   with Shift), Delete removes it. Cues may overlap; simultaneous cues in one region stack toward
   the centre of the frame, earliest at the edge, and the lane gives each overlap its own row. A cue
   outside the trim is kept and marked, not rendered; an untyped cue is neither rendered nor
   counted as an edit. The stage draws subtitles exactly as the render burns them — same layout,
   same face — including inside the crop frame while Crop is active, and redraws on a paused frame.
9. **Save edited video** starts one module worker. Studio announces local render/validation
   progress; cancellation terminates the work and preserves the pinned source and draft.
10. After validation, the replacement dialog initially focuses **Cancel** and offers **Replace
    Without Saving** or **Replace and Save**. The Save path prompts for an optional gallery name,
    falling back to the existing generated artifact name when blank, and must finish publishing the
    artifact that was displayed when this edit session began—including a prior visual or voiced
    result—before replacement proceeds.
11. A confirmed replacement creates an `edited` artifact whose `parentArtifactId` identifies that
    pinned source, atomically makes it the immutable source, installs its matching audio sidecar,
    clears superseded visual/voice layers, and returns to **Use existing video**.
12. **Save Video** can then save the edited artifact as a new gallery record after the same optional
    naming prompt. If the source was loaded from Videos, the secondary confirmed Replace
    Existing action appends an immutable version using the captured saved video/version lineage.

### Project working-media path

In an open source-bearing Project, entering edit mode replaces the Project masthead/side panel with
the same full frame-first editor view used by standalone Studio. It uses the same persistent stage,
timeline, inspector, normalized `VideoEditSpec`, grouped history, and worker, but the primary action
is **Render preview**. The validated candidate
remains temporary and does not replace the source. **Use as the current cut** flushes the one
Project session, durably stores/inspects/checksums the candidate, and CAS-appends its exact edit plus
working/presented reference. Success closes the editor only after server acceptance and reports
that no Saved Video or Version was created. Conflict/failure preserves the candidate for retry.
Refresh hydrates adopted working media while the first accepted original remains immutable. The
applied edit — its subtitles included — is shown as a historical baseline; new controls start
neutral over already-rendered bytes so prior changes are not applied twice. The baseline says how
many subtitles were burned in and that changing them means editing again from a cut that does not
carry them: burned text is pixels, the same way every baked edit is.

### Placement exports

Choosing a placement at a save step reuses this worker rather than adding a second render path. The
placement is expressed as an ordinary `VideoEditSpec` — a centred crop to the destination shape, full
duration, no rotation, filter or adjustment — plus one exact destination size that the worker scales
the cropped frame to. Nothing else about the edit path changes: the same 300,000,000-byte ceiling
applies before publication, the same cancel semantics apply, and a browser that cannot render here
cannot re-frame there either. Placement exports are chosen at a save step, not in this editor.
Subtitles are pixels in the cut by then, so a placement crops them like any other pixel; the
chooser says whether a shape keeps them, from the same region geometry the renderer laid them out
with, once the cut's frame is known.

## Validation and compatibility

- Preview and export use the same WebGL color shader; the editor never depends on
  `CanvasRenderingContext2D.filter` and has no synchronous main-thread encoder fallback.
- Subtitles are rasterized on a 2D canvas — an `OffscreenCanvas` in the worker — and composited
  by that shader in output space, over the graded frame, so text is never cropped, rotated, flipped
  or colour-graded. The layout is the domain's, in fractions of the frame: text at most 80 % of
  the width, type 4.5 % of the height, white on translucent boxes, in the interface's sans-serif
  stack; portrait frames keep a 22 % band clear at top and bottom (the band a square or tall
  re-frame of a phone cut removes), landscape frames 8 % and 10 %. Rasterization happens once per
  change of the cues on screen, never per frame. Cues are re-based to the output's time through the
  trim, because the worker receives frames in trimmed time.
- MediaBunny runs in the dedicated worker, trims and bakes rotation/crop, optionally scales the
  cropped frame to one exact requested size, preserves the primary audio track unless a caller
  explicitly excludes it, and writes H.264/AAC MP4 through an offset-aware 4 MiB chunk accumulator
  capped at 300,000,000 bytes.
- Publication requires a non-empty playable H.264 MP4, expected primary tracks, exact requested
  even dimensions, duration within 500 ms, and a matching immutable audio sidecar whenever the
  pinned source has audio. A silent source remains silent.
- 16:9 and 9:16 uploads and edited outputs remain eligible for Character Swap and Virtual Try-On
  within the existing 1% tolerance. Other upload ratios and square, 4:5, or incompatible Freeform
  output disable those visual tools before provider intent or HTTP traffic; local adjustment,
  saving and Voice remain available.
- If WebGL, WebCodecs, OffscreenCanvas, or dedicated workers are unavailable, Studio explains that
  local editing is unsupported. Ordinary playback, saving, Voice, and existing provider flows
  remain usable.

## Guards and recovery

- The pinned source, baseline, draft, generation, and worker have one session owner. A drag creates
  one history entry; duplicate Save and stale worker completions are ignored.
- Dirty edits participate in confirmed route exit and `beforeunload`. Rendering/validation blocks
  route exit and must be cancelled explicitly before discard.
- Discard, cancellation, render or validation failure, failed replacement, and stale completion
  never publish or revoke the prior artifact. The draft remains available after recoverable errors.
- Editing drafts and candidates are browser-session-only. Refresh, crash, tab closure, or device
  restart does not recover them. A successfully adopted Project candidate is no longer a candidate:
  its ready bytes, exact spec, and revision rehydrate from Project authority.

## Evidence status

Pure and component tests cover geometry, history grouping, timeline playback/trim controls,
keyboard compare, split and inspector state, on-frame crop/rotation, worker
progress/cancellation/staleness, chunk limits, provider gating, replacement controls, and source ownership.
Subtitles are covered at every altitude: domain rules (clamping, ordering, stacking, re-basing
through the trim, region geometry against every placement crop — unit and property tests), the
contract (defaults, order, limits, overlapping cues accepted), the rasterizer's wrapping and
geometry against a scripted 2D context, the shader's overlay texture lifecycle, the worker's
burn-in timing across cue boundaries through a non-zero trim, the preview's redraw discipline,
the tool and lane components, and a Chromium journey that adds a cue on the timeline and renders
it. Real H.264/AAC export, the burned text's pixel fidelity in an external player, five-minute and
maximum-size memory, gallery downloads, external playback, touch hardware, and
Safari/Firefox/Chrome codec and 2D-text behavior require physical validation and must not be
inferred from automation.
