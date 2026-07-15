# Manual QA checklist

Run `npm run quality` and `npm run test:e2e` first. Manual checks complement deterministic tests; they are required for physical devices, codec output, track cleanup, and live provider integrations.

Record the date, browser/OS/version, device names, commit, configured capabilities, and downloaded sample MIME types. Never attach credentials, tokens, personal media, or raw provider responses to a report.

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
- Start another take and confirm replacement behavior and prior URL release. Confirm Discard requires approval and clears only the take.
- Attempt to refresh/close with a take and confirm unload protection. After intentionally leaving, confirm the take does not persist.
- Play every downloaded output in a second player/browser and check filename, duration, size, video, and audio.

## Voice treatments

- Record with and without audio. No-audio takes must remain valid while non-none effects are unavailable.
- Apply warm, clear, and robot; reapply in different orders and confirm no cumulative processing.
- Cancel mid-process; confirm original/last successful presentation and download remain recoverable.
- Force decode, audio-encode, or remux failure; confirm the valid take remains.
- With ElevenLabs configured, browse/search/page workspace and public voices, preview without uploading the take, explicitly import one eligible public voice, then select it without conversion.
- Apply the selected cloud voice and confirm only then is the completed sidecar uploaded. During processing, playback/download must be locked; after success, the complete processed artifact appears.
- Force auth, plan/credits, rate-limit, incompatible voice, invalid audio, timeout, and provider outage responses through fakes or a test environment. Confirm sanitized guidance and no raw body/key/URL.
- Choose Original and confirm immediate restoration with no network request.

## Accessibility and responsive behavior

- Use keyboard only from the skip link through mode selection, fields, file input, Start/Apply, recording, Recipe Shelf, take download, voice controls, and discard confirmation.
- Confirm visible focus, logical order, field labels, fieldset/segmented-control semantics, status announcements, and associated validation.
- Test a screen reader on idle, requesting permission, pending Apply, recording, processing, error, and success states.
- Test at approximately 320, 390, 768, 1024, 1440, and 1920 CSS pixels; portrait/landscape; short viewport; 200% zoom; large text; touch targets; and reduced motion.
- Confirm no horizontal page overflow, clipped critical action, hover-only function, or stage content covering controls.

## Cleanup inspection

- Repeat Start/Stop/Reset/model switches and recording/processing cycles while watching browser media indicators, WebRTC internals, memory/object URL behavior, and server requests.
- Confirm Stop/Reset/unmount releases provider clients, owned tracks, timers, recorders, audio contexts, generated streams, and superseded object URLs.
- Confirm recording and processing never stop camera/provider source tracks they merely reference.
- Confirm aborted browser requests cancel voice HTTP work where supported, discard any late token response, and never let late results replace current state.
