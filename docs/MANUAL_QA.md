# Manual QA checklist

For a release candidate, capture each physical target/browser result using the strict
[controlled-pilot qualification evidence contract](PILOT_QUALIFICATION_EVIDENCE.md). The validator
requires all approved check IDs for the exact commit and rejects arbitrary notes or extra fields
that could contain prompts, personal media, raw provider data, identifiers, or credentials.

Run `npm run quality`, `npm run test:coverage`, `npm run test:e2e`, `npm run test:visual`, and `npm run audit:prod` first. Manual checks complement deterministic tests; they are required for physical devices, codec output, track cleanup, and live provider integrations.

Synthetic-media automation cannot certify physical camera/microphone indicators, the final browser/OS codec artifact, real Decart disconnect billing/lifecycle, OpenAI/BFL/Wiro reference results, or real ElevenLabs conversion. Complete those checks with intended release browsers, physical devices, and explicitly authorized provider test accounts before release.

Record the date, browser/OS/version, device names, commit, configured capabilities, and downloaded sample MIME types. Never attach credentials, tokens, personal media, or raw provider responses to a report.

Touch/mobile creation and the exact physical browser/OS/device targets are approved in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md). The matrix includes one
desktop, five Apple phones, five popularity-led Android phones plus an Android 17 sentinel, and
five popularity-led tablets plus an Android 17 tablet sentinel across applicable stable Chrome,
Firefox, and Safari applications. This is a qualification target, not current support; the pilot
cannot be signed off from responsive emulation alone.

Character, VTO, local Voice, ElevenLabs, OpenAI, BFL, and Wiro are included in qualification; run
image-provider checks in separate startup configurations, keep Wiro operator-only, and require
confirmed zero-retention eligibility for participant ElevenLabs conversion. The approved take
maximum is 300 seconds with a warning at 270 seconds. The runtime enforces that independent
recording boundary through its coalesced Stop/finalize path; every named physical target must still
pass the warning, automatic
Stop/finalization, playback, processing, download, background/foreground, and cleanup checks at
that boundary.

## Viewport-bound shell and scroll ownership

Run idle, local-preview, recording, finalizing, main-stage playback, Character prepared/live, Try-On prepared/live, stage-error, and open-overlay states at each exact viewport below. At every checkpoint inspect `window.innerWidth/innerHeight`, `document.documentElement.scrollWidth/scrollHeight`, and `document.body.scrollWidth/scrollHeight`. Both document and body dimensions must be no greater than the viewport plus one CSS pixel for browser rounding. Scrolling the wheel/trackpad over the stage or page background must not move the document.

| Viewport   | Required base layout                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1440×960` | Fixed header, stable stage, capture strip, and launcher. Dock/Settings use right drawers; Workshop is a wide overlay; Shelf/Review/Voice use bounded bottom workspaces. |
| `1280×720` | Compact fixed rows and the same stage rectangle across states. Standard drawers and bounded bottom tools overlay the shell without creating a `REC` rail or workbench.  |
| `834×1112` | Compact header and reserved two-row capture area. Dock/Settings slide over from the right; Workshop/Shelf/Review/Voice use tall bottom workspaces.                      |
| `390×844`  | Icon-first header and fixed capture/launcher rows. Every tool is a near-full-height bottom sheet with one internal scroller and sticky actions.                         |
| `320×568`  | Short-brand header and icon-only launcher with accessible names. Every tool is full-screen with visible Close and primary actions; no backdrop dismissal is required.   |

For the Recipe Dock, Prompt Workshop, Recipe Shelf, Capture Settings, and take overlay, confirm the element marked with the relevant `data-scroll-region` can reach its last control while the document dimensions remain unchanged. Repeat with a very long filename, recipe name, tag, prompt, and provider voice name: text may wrap or truncate with its title/accessible name intact, but no control or focus ring may create horizontal document overflow.

At `320×568` and `390×844`, repeat with browser chrome expanded/collapsed and the software keyboard open. Safe-area padding must keep the header, close control, primary action, and bottom rail reachable. At 150–200% text/zoom, dense tools may scroll internally; the document still must not scroll.

### Fullscreen character builder

Open the header character selector, choose **Create new character**, and repeat at `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`, plus portrait/landscape, short-height, notched-safe-area, and 200% zoom cases. Confirm the dialog title is **Build Your Character**. The Studio document must remain fixed while the fullscreen panel scrolls internally. Open Reference image, Presentation, Ethnicity, Skin Tone, Body Shape, Hairstyle, Hair Color, and Outfit together and confirm every card, preview state, and footer action remains reachable. Expand and collapse each category independently. Confirm Ethnicity offers representative portraits plus custom text, stays independent from Skin Tone in the compiled direction, and does not change when Presentation changes. Body and outfit imagery must show the complete head-to-feet silhouette, hairstyle imagery must show the complete defining cut, and every applicable image container must use a contain/letterbox treatment instead of subject-cropping.

Above `64rem`, confirm Character Direction Preview remains in the sticky right rail beside the form. At `64rem` and below, confirm it follows **Preserve and constraints** as the final item in the single-column flow, so users can reach preview and generation without returning to the top.

Before choosing Presentation, confirm the direction preview uses a diverse four-profile montage. Choose Woman, Man, Non-binary, and explicit Not specified in turn; confirm person-bearing artwork swaps immediately, the change is announced, shared Skin Tone remains unfiltered, and any outside-suggestion current choice remains pinned rather than erased. Legacy starter-backed characters must still hydrate with their saved identity and preview fallback even though the retired starter picker is no longer part of the form.

Edit the form, close and reopen the panel, then reload and confirm the single active IndexedDB draft resumes. Confirm **Reset Draft** requires confirmation and the next open is fresh. Force IndexedDB open, transaction, and quota failures; a failed close flush must leave the tab copy intact, explain that changes are not reload-safe, and require explicit discard. After a successful Save Character, reopen and confirm a fresh character starts.

Upload JPEG, PNG, and WebP references and reject unsupported, over-10-MiB, or over-40-megapixel files. Confirm upload writes an immutable local asset, survives builder reload, and does not contact OpenAI, BFL, or Wiro. Removing it must only detach the draft relationship. Test prompt+upload **Save Character**, **Save & Use Image Only**, and **Generate Combined Preview**. Direct and image-only saves must preload the upload with enhancement off and make no generation request; a combined preview must optimize, compose from the owner-scoped upload through the selected provider, and preload the generated child with enhancement on. Make a combined preview stale and confirm the current upload remains a valid direct-save fallback. With generation/edit capability unavailable, direct upload save must remain usable. None of these save/preload paths may start AI or create a Recent.

Enter through `/projects`, `/?project=…`, and `/guided?project=…`; confirm each history-replaces to `/` and opens Legacy Projects. Seed a project with original/processed media, confirm download uses the selected variant, and confirm deletion removes the project and owned artifacts after accessible confirmation. No Reopen action or Guided navigation may be present.

## No-key and local guarantee

1. Leave all Decart, OpenAI, BFL, Wiro, and ElevenLabs credential variables empty, restart
   `npm run dev`, and open a private browser window.
2. Confirm the header reports local ready, **AI video not configured**, and **Voice cloud optional**, while Character Builder reports reference generation unavailable. `/api/capabilities` must not contact any provider.
3. Before Start, edit prompts, open the workshop, save/search/edit/delete a recipe, and attach then clear a valid image. Confirm no camera permission prompt appears.
4. Open DevTools Network, preserve the log, and filter for `realtime-token`, `reference-images`, `elevenlabs`, `decart`, and provider/WebSocket traffic.
5. Select **Start Camera + Mic**. Allow the camera/microphone.
6. Confirm no `/api/realtime-token`, Decart SDK chunk, Decart request, or provider WebRTC connection appears. `/api/capabilities` is an expected local broker request and should not create external provider traffic.
7. Select **Record**, capture 5–10 seconds, then select **Stop recording**. Confirm the stage holds its last frame under `Finalizing take…`; only after the artifact is ready should the camera/mic indicator clear and the same stage become paused playback with native controls. Confirm Latest Take remains closed until **Take** is selected.
8. Apply each local voice treatment. Confirm no external request occurs, each render starts from the immutable original, and failed/cancelled processing leaves the previous stage playback recoverable. Restore Original and confirm immediate recovery.
9. Download the take and confirm playback remains active. Confirm successful browser download dispatch enables Close, Close returns the stage to private idle, and the downloaded file contains video and expected microphone audio. Record that the app can verify dispatch, not browser download completion.

## Capture settings and draft isolation

1. Open Capture Settings before preview. Confirm device enumeration may occur but `getUserMedia` does not, no permission prompt appears, and no provider request is made.
2. Select a camera, microphone, and local quality target, then Apply. With no live preview, confirm media still does not start; the choices are used only when a later explicit Start occurs.
3. Reload. Confirm camera id, microphone id, and local quality target return to defaults and that no device id or label was added to `localStorage`.
4. Start local preview, open Capture Settings, and verify Active capture reports labels and negotiated resolution/frame rate from track settings. The browser may negotiate below the target.
   Confirm the post-permission rescan reveals any front/back/phone cameras that were hidden or
   generically labelled before Start.
5. With two usable inputs, Apply a different camera/microphone. Confirm the complete replacement becomes live, then the old owned tracks stop. During acquisition there must never be an empty committed stream.
   On a phone whose post-permission capabilities report both `user` and `environment`, close
   settings and select **Switch camera** in the stage control bar. Confirm it requests the opposite
   facing mode and preserves the current stream until replacement succeeds. Confirm the button is
   absent for desktop webcams, Continuity Camera, and any source without an exposed opposite mode;
   it must not cycle those unrelated sources.
   If the active track reports zoom capabilities, exercise **Zoom camera out** and **Zoom camera
   in**, confirm bounds are enforced and affect the captured track, and confirm the controls are
   absent on a track without numeric `getCapabilities().zoom`.
6. On macOS, expose a nearby iPhone through Continuity Camera. Confirm its browser-provided label
   appears beside the built-in and other connected cameras without a custom network/proximity
   request. Selecting it and applying settings must switch the persistent preview while the panel
   stays open.
7. Disconnect the selected iPhone. Confirm `devicechange` refreshes the list, the phone is not
   replaced by a fake disabled option, and a dismissible default-camera notice appears. Stop and
   restart local preview; confirm the browser default is used safely while the preferred ID remains
   session-only. Reconnect and Refresh; confirm the phone returns without automatic selection.
8. Repeat with any Android/third-party phone webcam exposed by the operating system. Confirm the app
   treats it as a normal `videoinput` and shows no Apple-specific support claim.
9. Force replacement acquisition to fail. Confirm the existing preview and its track identities remain live, the panel reports that settings were unchanged, and the failed candidate is cleaned up.
10. Confirm Apply/Discard and overlay close handle pending choices correctly: Discard restores applied values; close warns, and declining preserves the panel and draft. Capture changes are unavailable while recording or while AI is starting/live.
11. In Character mode enter unique prompt text and toggle enhancement. Switch to Try-On while idle and enter different values. Switch back and forth; each mode's text/enhancement draft must return unchanged.
12. Add a reference image, then switch modes. Confirm the warning says text is kept and the reference is removed; declining keeps the mode and image. Accepting revokes the departing preview and never carries the file to the other mode.
13. Reload and confirm active mode drafts are gone while saved Recipe Shelf text remains. Inspect storage again: no active prompt draft, image/file URL, device id, recording, or voice selection is durable.

## Permission and device failures

- Deny camera permission. Confirm an actionable error and no token request.
- Deny microphone or make it unavailable. Confirm the surfaced state is safe and no invalid provider start survives.
- Start with a camera already in use, no camera, or a privacy shutter when possible.
- Revoke permission or unplug a device while previewing and while recording. Confirm the failure is announced and recording finalizes or fails without stopping unrelated tracks.
- Retry after fixing the device; confirm stale streams are stopped and only one active capture remains.

## Character and try-on sessions

Use [the gated live smoke procedure](LIVE_PROVIDER_SMOKE.md) when a Decart key is available.

- Confirm an empty model draft blocks before media/token work.
- Exercise the primary surface: **Start Camera + Mic**, **Start AI**, and both cards in **Choose AI experience**. Character must offer **Create Character**, **Choose Saved Character**, or **Start with [name]** as applicable; Try-On must offer **Configure Virtual Try-On**, **Choose Saved Try-On**, or **Start Virtual Try-On**.
- Check camera/mic first, then Start Character AI with prompt only, portrait only, and both. Portrait-only should add functional character substitution intent.
- Start Try-On AI with prompt only, garment only, and both. Image-only must not invent prompt text.
- Confirm the local stage remains until transformed output contains a live video track.
- Edit prompt, enhancement, and image while live. Confirm the pending notice appears and output does not change before Apply.
- Apply all fields atomically; clear the image and Apply, confirming stale provider image state clears.
- Revert an unapplied draft. Reset during a delayed start and confirm no late connection appears.
- Simulate/provider-disconnect or end the remote track. Confirm local fallback and actionable recovery.
- Confirm mode switching is unavailable while connecting, live, or recording.

## Stable stage and panel independence

- Before opening a tool, retain the stage figure/video nodes and current binding in DevTools. Open/close Recipe Dock, Capture Settings, Prompt Workshop, Recipe Shelf, Character Builder, Take Review, Voice Treatments, and ElevenLabs Voice Browser during live media and recorded playback. Confirm the nodes, stage rectangle, `srcObject`/`src`, live tracks, playback `currentTime`, and provider connection are unchanged. No overlay action may issue another `getUserMedia` call.
- Confirm local preview has `data-mirrored="true"`, transformed output and recorded playback have `data-mirrored="false"`, and computed `object-fit` is `contain` in every media state. Test landscape and portrait sources; the whole frame must remain visible without subject-cropping.
- Confirm the stage resolution/frame-rate badge reflects live track settings rather than a hard-coded target; long device labels remain contained. Verify the live status, source badge, framing guides, audio meter, and native fullscreen control where supported.
- During provider connection, partial/audio-only remote streams must not replace local preview. Only a live transformed video track may become the stage and recording source; disconnect/end must restore local fallback.
- While recording, confirm the stage gains the recording treatment and timer, the capture strip reserves the same height, nonessential tools close, and **Stop recording** remains visible without scrolling. Stop must immediately show a blocking finalizing layer while preserving the last live binding/frame. After finalization and resource release, playback must occupy the original stage and Latest Take must remain closed until **Take** is selected.

## Structured prompt workshop and Recipe Shelf

- Generate each Prompt Workshop intent: add object with placement, replace named object, and change an attribute. Confirm **Transform character** is absent.
- Confirm required-field blocking, concise normalized output, advisory warnings, 500-character detail bounds, and no hidden traits.
- Use generated text and confirm it changes only the draft—no media, token, or Apply.
- Confirm Prompt Workshop exposes no character fields, optimizer settings, Generate/Regenerate/Detach reference actions, or provider traffic.
- Create a character through the Shelf and edit it through both the Shelf card and active-character header action. Confirm each opens Character Builder, while direct **Use** remains an atomic preload.
- With an unfinished Builder draft, choose Edit on a different character. Confirm **Cancel** leaves the draft and navigation unchanged; repeat and choose **Continue**, then confirm the old draft is durably discarded before the selected character is hydrated.
- Regenerate and save an edited character. Confirm its existing ID, notes, tags, and use metadata remain and no duplicate character appears.
- Close and reopen an unsaved structured workshop draft or Recipe Shelf editor; confirm each draft is restored. Ordinary overlay closure must not discard edits. Explicit Reset/Discard/Delete actions retain their destructive confirmation where applicable.
- Create/search/use/edit/rename/delete character and try-on recipes. Confirm model scoping and case-insensitive metadata search.
- Successfully Start/Apply a nonempty prompt and confirm it enters Recents; typing alone must not.
- Seed `realtime-creator-studio.creative-assets.v1` without image fields, reload, and confirm v4 migration preserves every record with null references and empty Skin Tone/Body Shape/Hair Color values without splitting legacy Appearance or Hair text. Repeat from valid v2 and v3 shelves to confirm reference identities and guided provenance survive while uploaded-source/final-kind fields receive safe defaults. Corrupt v4, or block storage/force a quota failure, and confirm safe recovery/session-only behavior.
- Use a persisted reference from Recent and Character cards. Confirm the exact asset is fetched and validated before prompt/image are committed together; a missing asset leaves the current draft unchanged and offers Retry plus explicit Continue without reference.
- Inspect local storage: only versioned text/metadata and opaque asset IDs should exist—no image data, content URLs, storage keys, tokens, device ids, recordings, sidecars, or voice selection.

## Images

- Accept JPEG, PNG, and WebP; reject other MIME types.
- Confirm Recipe Dock fields visibly distinguish an optional portrait from a garment reference, state format/10 MiB guidance, and have a keyboard-visible 44 px selector target. These files remain tab-ephemeral.
- Accept exactly 10 MiB and reject anything larger before media/provider work.
- Confirm guidance for files above 5 MiB, weak dimensions, and unsuitable portrait/garment framing.
- Clear, switch modes, and Reset; confirm preview URLs are revoked and incompatible state does not leak between modes.
- Open persisted uploaded/generated thumbnails from Recent and Character cards in the shared large preview. Break the content route and confirm each card shows a retryable placeholder without breaking text-only actions.
- In Character Builder, confirm upload also enforces the 40-megapixel decoded-image limit, writes bytes to the local reference store, and restores the same opaque asset after reload. A removed upload may remain on disk and must not be described as deleted.

## Recording and take safety

- Exercise the 270-second warning and let a take reach the 300-second cap without manually
  selecting Stop. Confirm the app coalesces any concurrent Stop, finalizes the
  main recording and optional sidecar before releasing live/provider resources, publishes one
  playable original, reports why recording ended, and never silently drops chunks. Repeat locally
  and with Character/VTO on every named physical target; run local and ElevenLabs processing from
  the resulting five-minute original.
- Local: verify local video plus microphone and independent live/recording timers. On **Stop recording**, verify recorder finalization settles before owned camera/microphone tracks stop; local preview must not remain or be reacquired.
- Model: verify Record is unavailable before transformed live video; provider audio is preferred and microphone is fallback.
- Stop Character and Try-On recordings. Confirm final recorder data and artifact publication happen first; provider disconnect, listener removal, remote/cloned-input track stops, owned camera/mic stops, analyser/timer cleanup, and playback handoff happen afterward. No local or provider session may automatically reacquire.
- Confirm the recorded artifact replaces live media inside the same stage, begins paused with native controls/audio, and remains there when Take Review closes or another tool opens. There must be no duplicate player in Take Review.
- While review is active, confirm Start Local/AI, Record, mode changes, and device switching are blocked. Review exit is limited to Download-then-Close or confirmed Discard.
- Verify the take reports its immutable start-time mode, timestamp, actual video dimensions/frame rate when the track exposes them, and selected video/audio source labels. While review is active, confirm those displayed values remain stable. The source-ending/provider-callback-before-finalization variant requires the automated mocked recording tests because the review UI intentionally blocks source changes.
- Click Download and confirm synchronous dispatch leaves playback intact and enables Close. Confirm Close revokes original/processed URLs and returns to private idle. Simulate dispatch failure and confirm playback, review state, and disabled Close remain intact. The browser cannot report actual download completion.
- Confirm Discard requires approval, then revokes the same URLs and returns to private idle without a download. There is no media Save, take history, rename, or trim control.
- Force sidecar failure or its 1.5-second grace timeout and confirm valid main video still enters review with a warning. Force empty output, main-recorder timeout, Blob construction failure, and object-URL creation failure; Stop recording must settle, live resources must release, and the app must return to private idle with an actionable stage error unless a valid artifact was already published.
- Attempt to refresh/close with a take and confirm unload protection. After intentionally leaving, confirm the take does not persist.
- Play every downloaded output in a second player/browser and check filename, duration, size, video, and audio.
- With focus on the page background and Record enabled, press Space to start and Space again to finish. Confirm held/repeated Space or Space with a modifier does not retrigger. Repeat while focus is in an input, textarea, select, button, link, tab, summary, or contenteditable element and while a modal is open; recording must not toggle.
- At `390×844` and `320×568`, stop a take and confirm playback plus compact Download, Discard, Voice, and Close actions remain reachable on the stable stage. Select **Take** and confirm Latest Take then opens as an internally scrolling sheet/dialog with metadata and sticky actions, but no duplicate player.

## Voice treatments

- Record with and without audio. No-audio takes must remain valid while non-none effects are unavailable.
- Apply warm, clear, and robot; reapply in different orders and confirm no cumulative processing.
- Before processing, seek the main-stage player to the middle. During processing confirm playback is paused and locked without replacing the video node. After success confirm the processed URL is active, prior time is restored up to the new duration, and playback remains paused.
- Cancel mid-process; confirm original/last successful presentation and download remain recoverable.
- Force decode, audio-encode, remux, or processed-object-URL creation failure; confirm the prior playable artifact remains and is not revoked.
- With ElevenLabs configured, browse/search/page the saved library and click Preview to fetch owned Blob audio without uploading the take. Confirm every displayed voice is currently saved in the configured ElevenLabs account, saved community Professional Voice Clones remain visible, no public-library or import action exists, model discovery does not occur during browsing/preview, and the preview Blob URL is replaced/revoked when another preview starts or the panel closes. Include one saved Google Storage preview declared as `text/plain`: a valid MP3 signature must stream as `audio/mpeg`, while a fake or malformed body with the same path/header must fail safely.
- Apply the selected cloud voice and confirm only then is the completed sidecar uploaded. During processing, playback/download must be locked; after success, the complete processed artifact appears.
- Force auth, plan/credits, rate-limit, incompatible voice, invalid audio, timeout, and provider outage responses through fakes or a test environment. Confirm sanitized guidance and no raw body/key/URL.
- Choose Original and confirm immediate restoration with no network request.

## Overlays, focus, and unsaved work

- Open each modal from its launcher. Confirm it has an accessible dialog name, initial focus moves inside, Tab/Shift+Tab wrap within the topmost dialog, focus is visible, and background controls cannot receive focus.
- Press Escape and confirm only the topmost dialog closes. Focus must return to the exact Dock, Take, Workshop, Shelf, or settings launcher. Repeat with the close button and backdrop press.
- Open Dock, Take, Workshop, Shelf, and Capture Settings in succession. Confirm only one major tool remains open and opening/closing it does not start or stop media/provider work.
- Make a Recipe Shelf editor or capture-settings draft dirty, close the overlay, open another major tool, and reopen it. Ordinary closure must preserve the draft and focus return; only the tool's explicit Reset/Discard action may clear pending values.
- Close and reopen Prompt Workshop. Confirm the current Add, Replace, and Restyle draft remains in tab memory. Reset current intent must warn only when that intent has content and must not clear another intent's draft.
- In Character Builder, confirm full-body reference framing is the default and framing, orientation, rendering, expression, and background choices are draft-persisted. Force optimization to fail while image generation remains available: the image must generate from the raw direction, show a yellow warning, and retain Save. Select **Retry optimization and regenerate**; a successful optimizer retry must create a new optimized asset, while another optimizer failure must keep the valid raw preview. Separately force image-provider failure and confirm it blocks with targeted Retry and no provider fallback.
- After a generated Builder reference is saved, verify Lucy receives the saved compact prompt, image, and `enhance: true` in the same state replacement.
- Stack Voice Browser over Voice Treatments. Confirm the parent is inert/hidden from assistive technology until the child closes, Escape closes only the child, and focus then returns to the parent before the major overlay can close.
- Begin closing an overlay and immediately pointer-down/click its backdrop above Record or a stage action. Confirm the exiting backdrop remains mounted for the animation, intercepts the event, and no underlying action fires. Repeat with reduced motion enabled.
- Inspect modal scrolling at the five target viewports. Sticky modal headers/footers and primary actions must remain reachable, the focus ring must not be clipped, and Escape must still work after scrolling to the end.

## Accessibility and responsive behavior

- Use keyboard only from the skip link through mode selection, fields, file input/drop target, Start/Apply, Capture Settings, recording, Recipe Shelf, take download, voice controls, and discard confirmation.
- Confirm visible focus, logical order, field labels, fieldset/segmented-control semantics, status announcements, and associated validation.
- Test a screen reader on idle, requesting permission, pending Apply, recording, processing, error, and success states.
- Test exactly `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`, then one intermediate width on each side of the 1024 px and 640 px layout changes. Also test portrait/landscape, 200% zoom, large text, touch targets, and reduced motion.
- On the idle stage, confirm the dismissible first-take cue states **Start camera → choose
  Character → Record → optional Voice → Download**, disappears for the current mounted session,
  and returns after reload without writing a preference or issuing analytics/network work.
- Confirm the rail retains Dock/Take/Workshop/Shelf while its action subtitles explain setup,
  review/download, advanced visual change, and saved-work reuse. Start AI must present Character as
  primary and Virtual Try-On as secondary/beta; an unconfigured Decart state must explain why Start
  is unavailable without blocking local character/recipe preparation.
- In Character Builder at `834×1112`, `390×844`, and `320×568`, choose the anchored **Review &
  Generate** shortcut at normal and 200% text. It must move focus to the one preview/generation
  region, retain logical focus order, and never create a second preview or Generate action.
- In Voice Treatments, confirm the breadcrumb remains understandable through the stacked saved
  voice browser, compatibility/library detail is available through disclosure controls, and the
  action-adjacent preview/Apply transfer and usage statements remain visible.
- In live and playback states, wait three seconds for the session control bar to hide, then verify
  keyboard and mouse-pointer activity restore it and restart the full timeout. Explicitly verify
  touch/pointer and focus recovery on every named physical touch target. While recording, wait
  beyond the same timeout and confirm the dominant **Stop recording** action never hides, becomes
  inert, loses visible focus, or falls outside the viewport/safe area, including at 200% text.
- At narrow sizes confirm status pills retain complete accessible names when visible text becomes dots, More settings retains its accessible label when icon-only, and truncated metadata exposes its full value through a title or accessible name.
- In Studio, confirm no horizontal or vertical document overflow. In the fullscreen character builder, confirm controlled internal scrolling and no document overflow. Confirm no clipped critical action/focus ring, hover-only function, unexpected multi-line button, or stage content covering controls. Every touch action must remain approximately 44×44 CSS px or larger.

## Cleanup inspection

- Repeat Start/Stop/Reset/model switches and recording/processing cycles while watching browser media indicators, WebRTC internals, memory/object URL behavior, and server requests.
- Confirm Stop/Reset/unmount releases provider clients, owned tracks, timers, recorders, audio contexts, generated streams, and superseded object URLs. For Stop recording, confirm all final recorder data precedes the session-level release and that every owned track/resource terminates exactly once.
- Confirm recording and processing never stop camera/provider source tracks they merely reference.
- Confirm a take URL survives overlay closure and download dispatch, then is revoked only on processed replacement, Close, Discard, or unmount. A new processed URL must exist before the previous processed URL is revoked.
- Confirm aborted browser requests cancel voice HTTP work where supported, discard any late token response, and never let late results replace current state.
