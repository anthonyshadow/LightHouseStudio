# Manual QA checklist

Run `npm run quality` and `npm run test:e2e` first. Manual checks complement deterministic tests; they are required for physical devices, codec output, track cleanup, and live provider integrations.

Synthetic-media automation cannot certify physical camera/microphone indicators, the final browser/OS codec artifact, real Decart disconnect billing/lifecycle, or real ElevenLabs conversion. Complete those four checks with intended release browsers, physical devices, and explicitly authorized provider test accounts before release.

Record the date, browser/OS/version, device names, commit, configured capabilities, and downloaded sample MIME types. Never attach credentials, tokens, personal media, or raw provider responses to a report.

## Viewport-bound shell and scroll ownership

Run idle, local-preview, recording, finalizing, main-stage playback, Character prepared/live, Try-On prepared/live, stage-error, and open-overlay states at each exact viewport below. At every checkpoint inspect `window.innerWidth/innerHeight`, `document.documentElement.scrollWidth/scrollHeight`, and `document.body.scrollWidth/scrollHeight`. Both document and body dimensions must be no greater than the viewport plus one CSS pixel for browser rounding. Scrolling the wheel/trackpad over the stage or page background must not move the document.

| Viewport   | Required base layout                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1440×960` | Fixed header, stable stage, capture strip, and launcher. Dock/Settings use right drawers; Workshop is a wide overlay; Shelf/Review/Voice use bounded bottom workspaces. |
| `1280×720` | Compact fixed rows and the same stage rectangle across states. Standard drawers and bounded bottom tools overlay the shell without creating a `REC` rail or workbench.  |
| `834×1112` | Compact header and reserved two-row capture area. Dock/Settings slide over from the right; Workshop/Shelf/Review/Voice use tall bottom workspaces.                      |
| `390×844`  | Icon-first header and fixed capture/launcher rows. Every tool is a near-full-height bottom sheet with one internal scroller and sticky actions.                         |
| `320×568`  | Short-brand header and icon-only launcher with accessible names. Every tool is full-screen with visible Close and primary actions; no backdrop dismissal is required.   |

For the Recipe Dock, Character Workshop, Recipe Shelf, Capture Settings, and take overlay, confirm the element marked with the relevant `data-scroll-region` can reach its last control while the document dimensions remain unchanged. Repeat with a very long filename, recipe name, tag, prompt, and provider voice name: text may wrap or truncate with its title/accessible name intact, but no control or focus ring may create horizontal document overflow.

At `320×568` and `390×844`, repeat with browser chrome expanded/collapsed and the software keyboard open. Safe-area padding must keep the header, close control, primary action, and bottom rail reachable. At 150–200% text/zoom, dense tools may scroll internally; the document still must not scroll.

## No-key and local guarantee

1. Leave both provider key fields empty, restart `npm run dev`, and open a private browser window.
2. Confirm the capability strip reports local ready and both optional integrations unavailable.
3. Before Start, edit prompts, open the workshop, save/search/edit/delete a recipe, and attach then clear a valid image. Confirm no camera permission prompt appears.
4. Open DevTools Network, preserve the log, and filter for `realtime-token`, `decart`, and provider/WebSocket traffic.
5. Select Local Camera and start preview. Allow the camera/microphone.
6. Confirm no `/api/realtime-token`, Decart SDK chunk, Decart request, or provider WebRTC connection appears. `/api/capabilities` is an expected local broker request and should not create external provider traffic.
7. Record 5–10 seconds and Finish. Confirm the stage holds its last frame under `Finalizing take…`; only after the artifact is ready should the camera/mic indicator clear and the same stage become paused playback with native controls.
8. Apply each local voice treatment. Confirm no external request occurs, each render starts from the immutable original, and failed/cancelled processing leaves the previous stage playback recoverable. Restore Original and confirm immediate recovery.
9. Download the take and confirm playback remains active. Confirm successful browser download dispatch enables Close, Close returns the stage to private idle, and the downloaded file contains video and expected microphone audio. Record that the app can verify dispatch, not browser download completion.

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

- Before opening a tool, retain the stage figure/video nodes and current binding in DevTools. Open/close Recipe Dock, Capture Settings, Character Workshop, Recipe Shelf, Take Review, Voice Treatments, and ElevenLabs Voice Browser during live media and recorded playback. Confirm the nodes, stage rectangle, `srcObject`/`src`, live tracks, playback `currentTime`, and provider connection are unchanged. No overlay action may issue another `getUserMedia` call.
- Confirm local preview has `data-mirrored="true"`, transformed output and recorded playback have `data-mirrored="false"`, and computed `object-fit` is `contain` in every media state. Test landscape and portrait sources; the whole frame must remain visible without subject-cropping.
- Confirm the stage resolution/frame-rate badge reflects live track settings rather than a hard-coded target; long device labels remain contained. Verify the live status, source badge, framing guides, audio meter, and native fullscreen control where supported.
- During provider connection, partial/audio-only remote streams must not replace local preview. Only a live transformed video track may become the stage and recording source; disconnect/end must restore local fallback.
- While recording, confirm the stage gains the recording treatment and timer, the capture strip reserves the same height, nonessential tools close, and Finish remains visible without scrolling. Finish must immediately show a blocking finalizing layer while preserving the last live binding/frame. Take Review opens only after finalization and resource release, with playback in the original stage rather than a second video.

## Structured prompt workshop and Recipe Shelf

- Generate each intent: character transform, add object with placement, replace named object, and change an attribute.
- Confirm required-field blocking, concise normalized output, advisory warnings, adult-only age choices, 500-character detail bounds, and no hidden traits.
- Use generated text and confirm it changes only the draft—no media, token, or Apply.
- For a completed character transform, confirm Generate is explicit, unavailable without the capability/prompt, prevents double clicks, shows an inline square loading state, and leaves the generated image attached after closing and reopening the workshop.
- Edit the prompt after generation and confirm the stale warning appears without automatic regeneration. Confirm failed Regenerate keeps the previous image; successful Regenerate selects a new asset without changing an already saved character or populated Recent version.
- Save and reopen a structured character prompt; confirm its exact generated reference ID and preview restore. Legacy/manual-image records still restore without durable image bytes.
- Close and reopen an unsaved structured workshop draft or Recipe Shelf editor; confirm each draft is restored. Ordinary overlay closure must not discard edits. Explicit Reset/Discard/Delete actions retain their destructive confirmation where applicable.
- Create/search/use/edit/rename/delete character and try-on recipes. Confirm model scoping and case-insensitive metadata search.
- Successfully Start/Apply a nonempty prompt and confirm it enters Recents; typing alone must not.
- Seed `realtime-creator-studio.creative-assets.v1` without image fields, reload, and confirm v2 migration preserves every record with null references. Corrupt v2, or block storage/force a quota failure, and confirm safe recovery/session-only behavior.
- Use a persisted reference from Recent and Character cards. Confirm the exact asset is fetched and validated before prompt/image are committed together; a missing asset leaves the current draft unchanged and offers Retry plus explicit Continue without reference.
- Inspect local storage: only versioned text/metadata and opaque asset IDs should exist—no image data, content URLs, storage keys, tokens, device ids, recordings, sidecars, or voice selection.

## Images

- Accept JPEG, PNG, and WebP; reject other MIME types.
- Confirm the file field visibly distinguishes an optional portrait from a garment reference, states format/10 MiB guidance, and has a keyboard-visible 44 px selector target.
- Accept exactly 10 MiB and reject anything larger before media/provider work.
- Confirm guidance for files above 5 MiB, weak dimensions, and unsuitable portrait/garment framing.
- Clear, switch modes, and Reset; confirm preview URLs are revoked and incompatible state does not leak between modes.
- Open generated thumbnails from Recent and Character cards in the shared large preview. Break the content route and confirm each card shows a retryable placeholder without breaking text-only actions.

## Recording and take safety

- Local: verify local video plus microphone and independent live/recording timers. On Finish, verify recorder finalization settles before owned camera/microphone tracks stop; local preview must not remain or be reacquired.
- Model: verify Record is unavailable before transformed live video; provider audio is preferred and microphone is fallback.
- Finish Character and Try-On takes. Confirm final recorder data and artifact publication happen first; provider disconnect, listener removal, remote/cloned-input track stops, owned camera/mic stops, analyser/timer cleanup, and playback handoff happen afterward. No local or provider session may automatically reacquire.
- Confirm the recorded artifact replaces live media inside the same stage, begins paused with native controls/audio, and remains there when Take Review closes or another tool opens. There must be no duplicate player in Take Review.
- While review is active, confirm Start Local/AI, Record, mode changes, and device switching are blocked. Review exit is limited to Download-then-Close or confirmed Discard.
- Verify the take reports its immutable start-time mode, timestamp, actual video dimensions/frame rate when the track exposes them, and selected video/audio source labels. Change live sources afterward and confirm the completed take metadata does not change.
- Click Download and confirm synchronous dispatch leaves playback intact and enables Close. Confirm Close revokes original/processed URLs and returns to private idle. Simulate dispatch failure and confirm playback, review state, and disabled Close remain intact. The browser cannot report actual download completion.
- Confirm Discard requires approval, then revokes the same URLs and returns to private idle without a download. There is no media Save, take history, rename, or trim control.
- Force sidecar failure or its 1.5-second grace timeout and confirm valid main video still enters review with a warning. Force empty output, main-recorder timeout, Blob construction failure, and object-URL creation failure; Finish must settle, live resources must release, and the app must return to private idle with an actionable stage error unless a valid artifact was already published.
- Attempt to refresh/close with a take and confirm unload protection. After intentionally leaving, confirm the take does not persist.
- Play every downloaded output in a second player/browser and check filename, duration, size, video, and audio.
- With focus on the page background and Record enabled, press Space to start and Space again to finish. Confirm held/repeated Space or Space with a modifier does not retrigger. Repeat while focus is in an input, textarea, select, button, link, tab, summary, or contenteditable element and while a modal is open; recording must not toggle.
- At `390×844` and `320×568`, Finish a take and confirm Take Review opens automatically as an internally scrolling sheet/dialog. Playback remains in the stable stage behind it; Download, Close, Discard, and Voice Treatments remain reachable through sticky actions.

## Voice treatments

- Record with and without audio. No-audio takes must remain valid while non-none effects are unavailable.
- Apply warm, clear, and robot; reapply in different orders and confirm no cumulative processing.
- Before processing, seek the main-stage player to the middle. During processing confirm playback is paused and locked without replacing the video node. After success confirm the processed URL is active, prior time is restored up to the new duration, and playback remains paused.
- Cancel mid-process; confirm original/last successful presentation and download remain recoverable.
- Force decode, audio-encode, remux, or processed-object-URL creation failure; confirm the prior playable artifact remains and is not revoked.
- With ElevenLabs configured, browse/search/page workspace and public voices, preview without uploading the take, explicitly import one eligible public voice, then select it without conversion.
- Apply the selected cloud voice and confirm only then is the completed sidecar uploaded. During processing, playback/download must be locked; after success, the complete processed artifact appears.
- Force auth, plan/credits, rate-limit, incompatible voice, invalid audio, timeout, and provider outage responses through fakes or a test environment. Confirm sanitized guidance and no raw body/key/URL.
- Choose Original and confirm immediate restoration with no network request.

## Overlays, focus, and unsaved work

- Open each modal from its launcher. Confirm it has an accessible dialog name, initial focus moves inside, Tab/Shift+Tab wrap within the topmost dialog, focus is visible, and background controls cannot receive focus.
- Press Escape and confirm only the topmost dialog closes. Focus must return to the exact Dock, Take, Workshop, Shelf, or settings launcher. Repeat with the close button and backdrop press.
- Open Dock, Take, Workshop, Shelf, and Capture Settings in succession. Confirm only one major tool remains open and opening/closing it does not start or stop media/provider work.
- Make a Recipe Shelf editor or capture-settings draft dirty, close the overlay, open another major tool, and reopen it. Ordinary closure must preserve the draft and focus return; only the tool's explicit Reset/Discard action may clear pending values.
- Close and reopen the Character Workshop. Confirm the current draft for each supported intent remains in tab memory. Reset current intent must warn only when that intent has content and must not clear another intent's draft.
- In the Character Workshop, confirm prompt optimization and full-body reference framing are enabled by default and the framing, orientation, rendering, expression, and background choices persist as browser preferences. Confirm Auto orientation produces the known landscape target size, while deliberate portrait, square, waist-up, and head-and-shoulders choices remain available. Optimize a valid character and verify the raw recipe, editable optimized reference-image prompt, separate Lucy 2.5 prompt, warnings, and optimizer model/version remain distinguishable.
- Edit the optimized image prompt, confirm it is marked manually edited, and generate. Verify the exact edit reaches the image request. Change any raw character field or reference option and confirm the result becomes stale; Generate must re-optimize before generation. Force optimizer auth, rate-limit, timeout, refusal, and malformed-output failures and confirm image generation is blocked with Retry and no raw fallback.
- Explicitly disable optimization and confirm direct generation is permitted and clearly indicated. Re-enable it and confirm the prior bypass cannot silently carry forward. After a generated reference is inserted, verify Lucy receives the saved compact prompt, image, and `enhance: true` in the same state replacement.
- Stack Voice Browser over Voice Treatments. Confirm the parent is inert/hidden from assistive technology until the child closes, Escape closes only the child, and focus then returns to the parent before the major overlay can close.
- Begin closing an overlay and immediately pointer-down/click its backdrop above Record or a stage action. Confirm the exiting backdrop remains mounted for the animation, intercepts the event, and no underlying action fires. Repeat with reduced motion enabled.
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
- Confirm Stop/Reset/unmount releases provider clients, owned tracks, timers, recorders, audio contexts, generated streams, and superseded object URLs. For Finish, confirm all final recorder data precedes the session-level release and that every owned track/resource terminates exactly once.
- Confirm recording and processing never stop camera/provider source tracks they merely reference.
- Confirm a take URL survives overlay closure and download dispatch, then is revoked only on processed replacement, Close, Discard, or unmount. A new processed URL must exist before the previous processed URL is revoked.
- Confirm aborted browser requests cancel voice HTTP work where supported, discard any late token response, and never let late results replace current state.
