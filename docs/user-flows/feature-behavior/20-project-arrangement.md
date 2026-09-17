# Project arrangement

**Outcome:** turn a Project's video into an ordered sequence of clips — split, trimmed, levelled,
reordered — and see exactly what that sequence produces, without a provider and without writing
anything but the arrangement itself.

## Journey

1. A Project workspace whose revision presents a video carries **Arrange** in its masthead (or
   **Edit arrangement** once one exists). It opens the arrangement editor over the stage, the way
   **Edit video** opens the single-clip editor: the Project route steps aside and **Back to the
   Project** returns to it.
2. A Project that has never been arranged says so and offers **Arrange this video**. Pressing it
   makes the first clip — the whole of the video the Project works from — and stages that
   arrangement through the Project session, which autosaves it like any other change. Looking
   writes nothing; only the press does.
3. The clip strip is a listbox: click or arrow keys select, `Home`/`End` jump, `Alt`+arrows
   reorder, and a reorder is announced. The selected clip is shown at its in-point as a still. The
   inspector trims it in its own media time, sets its level and mute, moves it earlier or later,
   and removes it; removing the last clip un-arranges the Project. **Split at playhead** cuts the
   clip under the playhead in two — refused, with the reason beside the control, on a cut, inside
   the last tenth of a second, or in a full arrangement. **Add a clip** opens a panel listing every
   video the Project holds — its sources and the cut it presents — with each one's frame, length,
   whether it carries sound, and how many clips already stand over it; choosing one adds the whole
   of it as the last clip, selects it, moves the playhead to its start, puts focus on it and says
   so. The same video may be added more than once. A full arrangement refuses the split and the
   add with one notice that both controls point at. Undo and Redo step the arrangement back and
   forward through the same session.
4. **Subtitles** opens a band between the playhead and the preview: a list of the arrangement's
   cues and an editor for the selected one. **Add a subtitle at the playhead** mints one there,
   already selected with its text selected, so the first keystroke replaces it — a cue carries text
   from the moment it exists, because an arrangement's cues are autosaved and the contract refuses
   an empty one. Clearing a cue's text deletes it. Each row says which clip the cue falls over,
   since cues are in sequence time and may span a cut. Typing is one change and one undo entry per
   focus, as a slider drag is.
5. **Render arrangement** produces the stitched file on this device and plays it. It is disabled
   until the browser has shown it can encode, with a notice when it cannot, and refused with a
   reason while any clip stands over media the Project can no longer open. An archived Project can
   still render: a render writes nothing.
6. While rendering, a status region shows the phase, the percentage and — once the render has
   decided it — the frame and sound it is rendering at. Every gesture is disabled, Undo and Redo
   included, so nothing changes under the render. **Cancel render** stops it; leaving the surface
   cancels it too, and the notice says so. Route exit, the browser's leave prompt and logout treat
   the render as they treat the single-clip editor's.
7. The rendered file is validated against the plan — its frame, its length, its sound — before it
   is shown, then plays in the product's one video player with a caption naming the clip count, the
   length and the frame, and saying plainly that it is exactly what the arrangement produces and
   that it is kept nowhere. **Render again** and **Back to editing** are always there. A gesture
   after the render leaves the file playable and marks it out of date.
8. The selected clip's inspector says what the render did to it, from the render's own plan:
   scaled to the frame, shown with bars, its sound resampled or folded, or silent — because it is
   muted or has no sound. When the clips' own sound format could not be encoded, a notice names the
   format the file carries instead.
9. A render that fails says why in words the worker chose for the operator — a clip whose video or
   sound this browser cannot decode is named, with the way out — and that nothing in the Project
   changed, with **Try again** and **Dismiss**.

## The normalization policy

One rule, stated twice in the domain (`packages/domain/src/composition/{video,audio}.ts`): the
widest source is the target, and no clip is narrowed for a neighbour.

- **Frame:** the largest clip's by pixel area, the earliest on a tie, both dimensions evened. Every
  clip is drawn into it with a contain fit over black — nothing is downscaled, a smaller clip of
  the same shape is scaled up, a clip of another shape gets bars. Stable under reorder, trim and
  split.
- **Frame rate:** carried. Each clip keeps its own frame timing, re-based onto the sequence clock;
  no frame is dropped or duplicated.
- **Sound:** the highest sample rate among the clips that contribute sound, at most two channels;
  every clip is resampled and remixed to it with a continuous seam and placed in whole frames from
  the sequence edges, so clips meet exactly. A muted clip or one without sound contributes silence
  and does not raise the target. When the chosen rate cannot be encoded, the domain's fallback
  (48 kHz stereo) is used and the surface says so.
- **Codec:** not a target dimension. Every render transcodes to H.264/AAC MP4, the one output the
  validator gates.
- **Cues** are sequence time and are burned in across cuts exactly as the single-clip editor burns
  them, through the same rasterizer.

## Validation and compatibility

- The render runs in the same dedicated worker as the single-clip editor, with the same cancel
  protocol, the same 300,000,000-byte output ceiling and the same H.264 and AAC probes before any
  paid work — the video probe asked at the frame the arrangement needs, the sound probe at the
  target it chose.
- Each clip is streamed from its own content route by HTTP ranges inside the worker, one input
  open at a time, so an arrangement of a hundred clips never holds a hundred files.
- **Keep as the current cut** hands the rendered file to the Project through the same adoption path
  the single-clip editor uses, recorded as a `stitched-render` with no single-clip edit
  specification, because none describes it. Save and the placement variants then deliver it without
  knowing a composition exists. It is refused while the preview is out of date with the arrangement,
  and on an archived Project, because keeping appends a revision where rendering writes nothing.
- The kept cut does not follow later edits to the arrangement. Change the arrangement, render, and
  keep it again; the surface says so, and the Save step repeats it.
- A kept cut is never offered back as a clip of the arrangement it came from.
- A clip is added from media the Project already holds; the panel does not upload, record or
  borrow — that is the Media area's, and a video added there is offered here on the next open.
  While the Project's media is still being read the panel says so rather than reporting nothing,
  and a read that failed is shown as that, with **Retry**.

## Evidence status

- Domain rules, the concat loop against a fake runtime, the worker's protocol, the render client,
  the render hook and the surface's states are covered by vitest.
- The real encoder is exercised in Chromium: three committed fixtures of three formats through the
  render client (`e2e/stitched-render.spec.ts`), and the surface's own journey on the real stack
  (`e2e/real-stack-project-deliverable.spec.ts`) — a portrait source split in two, a 16:9 second
  video added as the third clip, the mixed arrangement rendered and its frame read back with bars
  where the policy puts them — both printing their timings.
- Playback of the rendered file in the page's `<video>` needs an engine that decodes H.264 there;
  the automated Linux Chromium does not, and the surface says so rather than showing a black player.
