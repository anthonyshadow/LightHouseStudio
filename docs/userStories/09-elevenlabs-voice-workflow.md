# ElevenLabs voice workflow

## User story

As a creator, I want to preview and apply a voice already saved in my ElevenLabs library to a completed take, so that every choice shown by Studio is intentionally available to my account.

## Starting state

- ElevenLabs is configured and shown as available.
- At least one compatible voice is already saved in the configured ElevenLabs account's library.
- A reviewed take has a usable audio sidecar, is no longer than five minutes, and the browser can replace audio.
- No voice processing is active.

## End-to-end steps

1. Open **Voice treatments** from Latest take.
2. Select **Browse saved ElevenLabs voices · contacts provider**. Read the disclosure: previews do not upload the take; applying a voice sends only original audio and may use credits.
3. Confirm Voice Browser explains that only voices currently saved in the ElevenLabs library are shown. The project has no public-library or add/import action.
4. Enter a search term (name, style, accent, etc.) and select **Search**. Use **Previous**, **Next**, or **Refresh voices** to navigate saved results.
5. Select an inline audio preview to listen. If a preview fails, use the displayed retry path or select another voice; no recording has been uploaded.
6. Select a saved voice card, then select **Apply [voice] to recorded audio**. Confirm the processing state; the server first revalidates that the voice remains saved, then sends the immutable original audio sidecar through the local broker and never sends video.
7. Wait for ElevenLabs conversion and local video/audio remuxing to complete. On success, inspect the processed playback, then return to take review for download, close, or discard.

## Failure and alternate paths

- ElevenLabs UI is unavailable if the service is unconfigured, the take is over five minutes, there is no usable sidecar, or the browser cannot replace audio; local effects/original may still work.
- If a voice was removed from the ElevenLabs library, refresh the list and choose another. A stale submitted ID is rejected before preview or conversion.
- Add or remove voices only in ElevenLabs account controls, then select **Refresh voices** in Studio.
- Cancel active processing to preserve the existing artifact.
- Provider errors are sanitized; retry retrieval or conversion from the visible error action.
- Select **Original** to restore the immutable capture without another provider call.

## Completion criteria

The creator has either a processed, playable take using the selected saved-library voice; the original restored; or an error/cancelled processing path that preserved the valid take.

## UX investigation cues

- Whether “contacts provider,” preview, and apply make their different privacy/cost consequences obvious.
- Whether creators understand that library membership is managed in ElevenLabs rather than Studio.
- Wait-state clarity across saved-voice search, preview, conversion, and remuxing.
