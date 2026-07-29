# ElevenLabs voice workflow

## User story

As a creator, I want to preview and apply a voice already saved in my ElevenLabs library to a completed take, so that every choice shown by Studio is intentionally available to my account.

## Starting state

- ElevenLabs is configured and shown as available.
- At least one voice is already saved in the configured ElevenLabs account's library.
- A reviewed take has a usable audio sidecar, is no longer than five minutes, and the browser can replace audio.
- No voice processing is active.

## End-to-end steps

1. Open **Voice treatments** from Latest take.
2. Select **Browse saved voices · contacts ElevenLabs**. Confirm the Voice Browser breadcrumb
   remains **Take review → Voice treatments → Saved voices** and read the concise disclosure:
   preview does not upload the take; Apply sends only original audio and may use credits.
3. Open **Where these voices come from** when needed and confirm only voices currently saved in the
   ElevenLabs library are shown. The project has no public-library or add/import action.
4. Enter a search term (name, style, accent, etc.) and select **Search**. Use **Previous**, **Next**, or **Refresh voices** to navigate saved results.
5. Select an inline audio preview to listen. The broker validates and normalizes saved provider MP3 previews even when ElevenLabs storage supplies a generic text media header. If a preview fails validation, use the displayed retry path or select another voice; no recording has been uploaded.
6. Select a saved voice card, including a saved community Professional Voice Clone if present.
   Before **Apply [voice] to recorded audio**, read the exact clip duration, configured
   speech-to-speech model, possible provider-credit use, and zero-retention requirement. Apply is
   the upload boundary: the server first revalidates that the voice remains saved and the
   configured model supports speech-to-speech, then sends the immutable original audio sidecar
   through the local broker and never sends video.
7. Wait for ElevenLabs conversion and local video/audio remuxing to complete. On success, inspect the processed playback, then return to take review for download, close, or discard.

## Failure and alternate paths

- ElevenLabs UI is unavailable if the service is unconfigured, the take is over five minutes, there is no usable sidecar, or the browser cannot replace audio; local effects/original may still work.
- If a voice was removed from the ElevenLabs library, refresh the list and choose another. A stale submitted ID is rejected before preview or conversion.
- Add or remove voices only in ElevenLabs account controls, then select **Refresh voices** in Studio.
- If ElevenLabs rejects a particular saved voice for plan, sharing, or voice policy reasons, the original take remains available and the safe provider guidance is shown.
- Cancel active processing to preserve the existing artifact.
- Provider errors are sanitized; retry retrieval or conversion from the visible error action.
- Select **Original** to restore the immutable capture without another provider call.

## Completion criteria

The creator has either a processed, playable take using the selected saved-library voice; the original restored; or an error/cancelled processing path that preserved the valid take.

## UX investigation cues

- Whether “contacts provider,” preview, and apply make their different privacy/cost consequences obvious.
- Whether creators understand that library membership is managed in ElevenLabs rather than Studio.
- Wait-state clarity across saved-voice search, preview, conversion, and remuxing.
