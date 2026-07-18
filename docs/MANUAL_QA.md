# Manual QA checklist

Run `npm run quality` and `npm run test:e2e` first. Manual checks complement deterministic tests; they are required for physical devices, codec output, track cleanup, and live provider integrations.

Record the date, browser/OS/version, device names, commit, configured capabilities, and downloaded sample MIME types. Never attach credentials, tokens, personal media, or raw provider responses to a report.

## Viewport-bound shell and scroll ownership

Run the idle, local-preview, recording, latest-take, Character prepared/live, Try-On prepared/live, and open-overlay states at each exact viewport below. At every checkpoint inspect `window.innerWidth/innerHeight`, `document.documentElement.scrollWidth/scrollHeight`, and `document.body.scrollWidth/scrollHeight`. Both document and body dimensions must be no greater than the viewport plus one CSS pixel for browser rounding. Scrolling the wheel/trackpad over the stage or page background must not move the document.

| Viewport   | Required base layout                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1440×960` | Persistent right Recipe Dock; Workshop widens/replaces that column; Shelf occupies the lower-left workspace; stage and capture remain visible.                  |
| `1280×720` | Persistent narrower dock; compact capture strip; Latest Take/Voice single-tool tabs; dense Workshop/Shelf overlays; recording uses the narrow `REC` rail.       |
| `834×1112` | Stage over capture strip; Dock launcher opens a right modal drawer; workbench uses one-tool tabs; only the selected lower tool is expanded.                     |
| `390×844`  | Compact header/status dots; stage and Record/Finish remain in the shell; source/quality details are in Capture Settings; major tools are full-viewport modals.  |
| `320×568`  | Ultra-compact header/tool rail; no inline workbench; Dock, Take, Workshop, Shelf, and Capture Settings use full-viewport overlays with internal scrolling only. |

For the Recipe Dock, Character Workshop, Recipe Shelf, Capture Settings, and take overlay, confirm the element marked with the relevant `data-scroll-region` can reach its last control while the document dimensions remain unchanged. Repeat with a very long filename, recipe name, tag, prompt, and provider voice name: text may wrap or truncate with its title/accessible name intact, but no control or focus ring may create horizontal document overflow.

At `320×568` and `390×844`, repeat with browser chrome expanded/collapsed and the software keyboard open. Safe-area padding must keep the header, close control, primary action, and bottom rail reachable. At 150–200% text/zoom, dense tools may scroll internally; the document still must not scroll.

## No-key and local guarantee

1. Leave both provider key fields empty, restart `npm run dev`, and open a private browser window.
2. Confirm the capability strip reports local ready and both optional integrations unavailable.
3. Before Start, edit prompts, open the workshop, save/search/edit/delete a recipe, and attach then clear a valid image. Confirm no camera permission prompt appears.
4. Open DevTools Network, preserve the log, and filter for `realtime-token`, `decart`, and provider/WebSocket traffic.
5. Select Local Camera and start preview. Allow the camera/microphone.
6. Confirm no `/api/realtime-token`, Decart SDK chunk, Decart request, or provider WebRTC connection appears. `/api/capabilities` is an expected local broker request and should not create external provider traffic.
7. Record 5–10 seconds, stop, play the take, download it, and confirm the downloaded file contains video and expected microphone audio.
8. Apply each local voice treatment. Confirm no external request occurs and each render starts from the original. Restore Original and confirm immediate recovery.
9. Stop camera and verify the browser's camera/mic indicator clears while the completed take remains available.

## Capture settings and draft isolation

1. Open Capture Settings before preview. Confirm device enumeration may occur but `getUserMedia` does not, no permission prompt appears, and no provider request is made.
2. Select a camera, microphone, and local quality target, then Apply. With no live preview, confirm media still does not start; the choices are used only when a later explicit Start occurs.
3. Reload. Confirm camera id, microphone id, and local quality target return to defaults and that no device id or label was added to `localStorage`.
4. Start local preview, open Capture Settings, and verify Active capture reports labels and negotiated resolution/frame rate from track settings. The browser may negotiate below the target.
5. With two usable inputs, Apply a different camera/microphone. Confirm the complete replacement becomes live, then the old owned tracks stop. During acquisition there must never be an empty committed stream.
6. Force replacement acquisition to fail. Confirm the existing preview and its track identities remain live, the panel reports that settings were unchanged, and the failed candidate is cleaned up.
7. Confirm Apply/Discard and overlay close handle pending choices correctly: Discard restores applied values; close warns, and declining preserves the panel and draft. Capture changes are unavailable while recording or while AI is starting/live.
8. In Character mode enter unique prompt text and toggle enhancement. Switch to Try-On while idle and enter different values. Switch back and forth; each mode's text/enhancement draft must return unchanged.
9. Add a reference image, then switch modes. Confirm the warning says text is kept and the reference is removed; declining keeps the mode and image. Accepting revokes the departing preview and never carries the file to the other mode.
10. Reload and confirm active mode drafts are gone while saved Recipe Shelf text remains. Inspect storage again: no active prompt draft, image/file URL, device id, recording, or voice selection is durable.

## Permission and device failures

- Deny camera permission. Confirm an actionable error and no token request.
- Deny microphone or make it unavailable. Confirm the surfaced state is safe and no invalid provider start survives.
- Start with a camera already in use, no camera, or a privacy shutter when possible.
- Revoke permission or unplug a device while previewing and while recording. Confirm the failure is announced and recording finalizes or fails without stopping unrelated tracks.
- Retry after fixing the device; confirm stale streams are stopped and only one active capture remains.

## Character and try-on sessions

Use [the gated live smoke procedure](LIVE_PROVIDER_SMOKE.md) when a Decart key is available.

- Confirm an empty model draft blocks before media/token work.
- Check camera/mic first, then Start Character AI with prompt only, portrait only, and both. Portrait-only should add functional character substitution intent.
- Start Try-On AI with prompt only, garment only, and both. Image-only must not invent prompt text.
- Confirm the local stage remains until transformed output contains a live video track.
- Edit prompt, enhancement, and image while live. Confirm the pending notice appears and output does not change before Apply.
- Apply all fields atomically; clear the image and Apply, confirming stale provider image state clears.
- Revert an unapplied draft. Reset during a delayed start and confirm no late connection appears.
- Simulate/provider-disconnect or end the remote track. Confirm local fallback and actionable recovery.
- Confirm mode switching is unavailable while connecting, live, or recording.

## Stable stage and panel independence

- Before opening a tool, retain the stage `<video>` node and its `srcObject` in DevTools. Open/close the Recipe Dock, Capture Settings, Character Workshop, Recipe Shelf, take review, and ElevenLabs voice browser. Confirm the video is the same DOM node, its stream identity is unchanged, no extra `getUserMedia` call occurs, and an active provider connection is not restarted or disconnected.
- Confirm the local preview has `data-mirrored="true"`, transformed output has `data-mirrored="false"`, and computed `object-fit` is `contain` in both cases. Test landscape and portrait camera sources; the whole frame must remain visible without subject-cropping.
- Confirm the stage resolution/frame-rate badge reflects live track settings rather than a hard-coded target; long device labels remain contained. Verify the live status, source badge, framing guides, audio meter, and native fullscreen control where supported.
- During provider connection, partial/audio-only remote streams must not replace local preview. Only a live transformed video track may become the stage and recording source; disconnect/end must restore local fallback.
- While recording, confirm the stage gains the recording treatment and timer, the desktop Recipe Dock becomes the narrow `REC` rail, secondary tools cannot open, and Finish take remains visible without scrolling. After finalization, the desktop workbench or compact take overlay appears without remounting the stage.

## Structured prompt workshop and Recipe Shelf

- Generate each intent: character transform, add object with placement, replace named object, and change an attribute.
- Confirm required-field blocking, concise normalized output, advisory warnings, adult-only age choices, 500-character detail bounds, and no hidden traits.
- Use generated text and confirm it changes only the draft—no media, token, or Apply.
- Save and reopen a structured character prompt; confirm fields restore and no image was persisted.
- Close and reopen an unsaved structured workshop draft; confirm it is restored. Edit an inline shelf form, try to switch shelf section/creative panel, and confirm the discard warning preserves the form when declined.
- Create/search/use/edit/rename/delete character and try-on recipes. Confirm model scoping and case-insensitive metadata search.
- Successfully Start/Apply a nonempty prompt and confirm it enters Recents; typing alone must not.
- Corrupt the `realtime-creator-studio.creative-assets.v1` storage value, reload, and confirm safe recovery notice. Block storage or force a quota failure and confirm session-only operation.
- Inspect local storage: only versioned text/metadata should exist—no image data, URLs, tokens, device ids, recordings, sidecars, or voice selection.

## Images

- Accept JPEG, PNG, and WebP; reject other MIME types.
- Confirm the file field visibly distinguishes an optional portrait from a garment reference, states format/10 MiB guidance, and has a keyboard-visible 44 px selector target.
- Accept exactly 10 MiB and reject anything larger before media/provider work.
- Confirm guidance for files above 5 MiB, weak dimensions, and unsuitable portrait/garment framing.
- Clear, switch modes, and Reset; confirm preview URLs are revoked and incompatible state does not leak between modes.

## Recording and take safety

- Local: verify local video plus microphone, independent live/recording timers, and that stopping recording leaves preview live.
- Model: verify Record is unavailable before transformed live video; provider audio is preferred and microphone is fallback.
- Stop a model take. Confirm the clip finalizes first, provider usage ends second, local preview remains, and the take still plays/downloads.
- Stop/reset the session after recording and confirm the take remains.
- Verify the take reports its immutable start-time mode, timestamp, actual video dimensions/frame rate when the track exposes them, and selected video/audio source labels. Change live sources afterward and confirm the completed take metadata does not change.
- Start another take before downloading and confirm the replacement warning. Decline and keep the take; accept and confirm the app keeps only the new take and releases the prior URL. There is no history, rename, or trim control. Confirm Discard requires approval and clears only the take.
- Attempt to refresh/close with a take and confirm unload protection. After intentionally leaving, confirm the take does not persist.
- Play every downloaded output in a second player/browser and check filename, duration, size, video, and audio.
- With focus on the page background and Record enabled, press Space to start and Space again to finish. Confirm held/repeated Space or Space with a modifier does not retrigger. Repeat while focus is in an input, textarea, select, button, link, tab, summary, or contenteditable element and while a modal is open; recording must not toggle.
- At `390×844` and `320×568`, finish a take and confirm Latest Take opens automatically as an internally scrolling modal. Record/Finish stays reachable in the base shell, and Download/Discard remain reachable in the take overlay.

## Voice treatments

- Record with and without audio. No-audio takes must remain valid while non-none effects are unavailable.
- Apply warm, clear, and robot; reapply in different orders and confirm no cumulative processing.
- Cancel mid-process; confirm original/last successful presentation and download remain recoverable.
- Force decode, audio-encode, or remux failure; confirm the valid take remains.
- With ElevenLabs configured, browse/search/page workspace and public voices, preview without uploading the take, explicitly import one eligible public voice, then select it without conversion.
- Apply the selected cloud voice and confirm only then is the completed sidecar uploaded. During processing, playback/download must be locked; after success, the complete processed artifact appears.
- Force auth, plan/credits, rate-limit, incompatible voice, invalid audio, timeout, and provider outage responses through fakes or a test environment. Confirm sanitized guidance and no raw body/key/URL.
- Choose Original and confirm immediate restoration with no network request.

## Overlays, focus, and unsaved work

- Open each modal from its launcher. Confirm it has an accessible dialog name, initial focus moves inside, Tab/Shift+Tab wrap within the topmost dialog, focus is visible, and background controls cannot receive focus.
- Press Escape and confirm only the topmost dialog closes. Focus must return to the exact Dock, Take, Workshop, Shelf, or settings launcher. Repeat with the close button and backdrop press.
- Open Dock, Take, Workshop, Shelf, and Capture Settings in succession. Confirm only one major tool remains open and opening/closing it does not start or stop media/provider work.
- Make a Recipe Shelf editor dirty, then close or replace the Shelf. Declining the warning must keep the form and focus context; accepting discards only unsaved form edits. Make capture settings pending and verify its separate discard warning behaves the same way.
- Close and reopen the Character Workshop. Confirm the current draft for each supported intent remains in tab memory. Reset current intent must warn only when that intent has content and must not clear another intent's draft.
- Inspect modal scrolling at the five target viewports. Sticky modal headers/footers and primary actions must remain reachable, the focus ring must not be clipped, and Escape must still work after scrolling to the end.

## Accessibility and responsive behavior

- Use keyboard only from the skip link through mode selection, fields, file input/drop target, Start/Apply, Capture Settings, recording, Recipe Shelf, take download, voice controls, and discard confirmation.
- Confirm visible focus, logical order, field labels, fieldset/segmented-control semantics, status announcements, and associated validation.
- Test a screen reader on idle, requesting permission, pending Apply, recording, processing, error, and success states.
- Test exactly `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`, then one intermediate width on each side of the 1024 px and 640 px layout changes. Also test portrait/landscape, 200% zoom, large text, touch targets, and reduced motion.
- At narrow sizes confirm status pills retain complete accessible names when visible text becomes dots, More settings retains its accessible label when icon-only, and truncated metadata exposes its full value through a title or accessible name.
- Confirm no horizontal or vertical document overflow, clipped critical action/focus ring, hover-only function, unexpected multi-line button, or stage content covering controls. Every touch action must remain approximately 44×44 CSS px or larger.

## Cleanup inspection

- Repeat Start/Stop/Reset/model switches and recording/processing cycles while watching browser media indicators, WebRTC internals, memory/object URL behavior, and server requests.
- Confirm Stop/Reset/unmount releases provider clients, owned tracks, timers, recorders, audio contexts, generated streams, and superseded object URLs.
- Confirm recording and processing never stop camera/provider source tracks they merely reference.
- Confirm aborted browser requests cancel voice HTTP work where supported, discard any late token response, and never let late results replace current state.
