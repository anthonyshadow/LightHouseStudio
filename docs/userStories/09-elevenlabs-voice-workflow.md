# ElevenLabs voice workflow

## User story

As a creator, I want to discover, preview, optionally import, and apply an ElevenLabs voice to a completed take, so that I can use cloud voice conversion only when I explicitly decide to do so.

## Starting state

- ElevenLabs is configured and shown as available.
- A reviewed take has a usable audio sidecar, is no longer than five minutes, and the browser can replace audio.
- No voice processing is active.

## End-to-end steps

1. Open **Voice treatments** from Latest take.
2. Select **Browse ElevenLabs voices · contacts provider**. Read the disclosure: previews do not upload the take; applying a voice sends only original audio and may use credits.
3. In **Voice Browser**, select **Workspace** or **Public library**.
4. Enter a search term (name, style, accent, etc.) and select **Search**. Use **Previous**, **Next**, or **Refresh voices** to navigate results.
5. Select an inline audio preview to listen. If a preview fails, use the displayed retry path or select another voice; no recording has been uploaded.
6. Select a voice card. For a workspace voice, continue to step 8.
7. For a public voice, select **Import**. Wait for its separate workspace mutation to succeed, then switch to/select the imported workspace voice. Public voices cannot be applied directly.
8. Select **Apply [voice] to recorded audio**. Confirm the processing state; the app sends the immutable original audio sidecar through the local broker and never sends video.
9. Wait for ElevenLabs conversion and local video/audio remuxing to complete. On success, inspect the processed playback, then return to take review for download, close, or discard.

## Failure and alternate paths

- ElevenLabs UI is unavailable if the service is unconfigured, the take is over five minutes, there is no usable sidecar, or the browser cannot replace audio; local effects/original may still work.
- Cancel active processing to preserve the existing artifact.
- Provider errors are sanitized; retry retrieval/import/conversion from the visible error action.
- Select **Original** to restore the immutable capture without another provider call.

## Completion criteria

The creator has either a processed, playable take using the selected workspace voice; the original restored; or an error/cancelled processing path that preserved the valid take.

## UX investigation cues

- Whether “contacts provider,” preview, import, and apply make their different privacy/cost consequences obvious.
- Friction caused by the public-voice import detour before conversion.
- Wait-state clarity across voice search, preview, import, conversion, and remuxing.
