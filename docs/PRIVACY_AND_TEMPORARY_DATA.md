# Privacy, temporary data, and provider cost

Lightframe Studio is local-first, not offline-only. Local capture stays in the browser; explicitly started AI and voice actions intentionally use external providers.

## Data inventory

| Data                                                                                       | Location and lifetime                                                                                       | External recipient                                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Saved/recent prompt text, names, tags, notes, structured builder state, timestamps, counts | Versioned and sanitized in this browser profile's `localStorage`                                            | None                                                                         |
| Generated reference asset IDs                                                              | Nullable relationships in Recipe Shelf v2 `localStorage`; no image bytes or internal storage keys           | None                                                                         |
| Generated character reference image and private generation metadata                        | Immutable owner-only files under `LIGHTFRAME_DATA_DIR` until the local operator removes retained assets     | Prompt sent to OpenAI only after explicit Generate                           |
| Active Local, Character, and Try-On text/enhancement drafts                                | React memory for this tab; independent per mode until reset or reload                                       | Decart only when the corresponding model draft is explicitly started/applied |
| Camera id, microphone id, and local quality target                                         | React memory for this tab; never written to recipes or browser storage                                      | None; used only in browser capture constraints                               |
| Camera and microphone streams                                                              | Browser memory while the session is live                                                                    | None in local mode; Decart during an explicitly started model session        |
| Portrait or garment file and preview URL                                                   | Browser memory until clear, departure from that mode, reset, or unmount                                     | Decart when included in model Start/Apply                                    |
| Decart temporary credential                                                                | Browser memory for connection setup; scoped to one model/origin with a five-minute expiry and session limit | Decart realtime service                                                      |
| Current original recording and object URL                                                  | Browser memory until Close, confirmed Discard, or unmount/tab closure                                       | None unless its audio sidecar is explicitly converted                        |
| Audio sidecar                                                                              | Browser memory, tied to the current original take                                                           | ElevenLabs only after explicit cloud voice Apply                             |
| Locally processed take                                                                     | Browser memory until restored, replaced, Close, confirmed Discard, or unmount                               | None                                                                         |
| Voice selection and voice-list pages                                                       | React memory for the current page                                                                           | Voice metadata is obtained from ElevenLabs through the broker                |
| Provider preview audio                                                                     | Streamed through the broker; not stored by the app                                                          | ElevenLabs/provider preview storage                                          |
| Imported public voice                                                                      | Persistent external change in the configured ElevenLabs workspace                                           | ElevenLabs                                                                   |

The backend has no product database, accounts, or take/session history. It retains only generated character-reference bytes, their original and derived prompts, prompt hash, safe image metadata, local owner ID, and idempotency mapping in the private local asset directory. These private prompts, image bytes, storage keys, OpenAI secrets, and provider request details are never returned to the browser. Automatic HTTP request URL logging is disabled so query-string voice searches and provider ids are not written to application logs.

## Explicit consent points

- **Start local preview**, **Check camera & mic**, or a valid **Start Character/Try-On AI** is the first possible camera/microphone permission request. Editing prompts and recipes does not open devices.
- **Apply capture settings** stores selected devices/quality for this tab. With no preview it does not start media; with a local preview it atomically acquires a replacement before releasing the current stream.
- **Check camera & mic** starts only the local preview; provider activation remains a separate action.
- **Start Character AI / Start Try-On AI** sends live camera media and the complete applied recipe to Decart after local media succeeds.
- **Apply changes** sends the complete current model snapshot, including an explicit image clear when applicable.
- **Generate reference image** sends the completed character prompt through the loopback broker to OpenAI, validates the returned image, and persists a new immutable local asset. Regenerate is another explicit, potentially billable action; neither action is retried automatically.
- **Browse ElevenLabs voices · contacts provider** requests workspace voice metadata only after the disclosure is opened; it does not send the take.
- **Preview voice** requests provider preview audio but does not send the recording.
- **Import voice** changes the configured ElevenLabs workspace and is an explicit action.
- **Apply ElevenLabs voice** sends only the completed audio sidecar, not video, through the same-origin broker.

## Local no-provider guarantee

Selecting and starting Local Camera does not:

- request `/api/realtime-token`;
- dynamically import the Decart SDK;
- create a Decart client or provider WebRTC connection;
- send the camera, microphone, prompt, or image to Decart.

The page does call the local `/api/capabilities` broker endpoint to render integration availability. That endpoint reads server configuration and does not contact Decart or ElevenLabs. Local voice effects use Web Audio and local remuxing only.

Opening Capture Settings may enumerate browser-visible input devices, but it does not call `getUserMedia`. Device ids, device labels, and the selected quality target remain in React memory and are not added to Recipe Shelf storage.

## Temporary artifact warning

Recordings are Blobs behind object URLs, not saved files. The app owns one take, not a take history. Finish finalizes the artifact before releasing camera/provider resources, then the take replaces live media on the same stage. A take survives tool-overlay closure but not a page refresh, browser crash, tab closure, or device restart. All new camera/provider work is blocked until review exits. Download dispatch leaves playback active and enables Close; the browser does not expose download completion to the app. Close releases recording URLs and returns to private idle. Confirmed Discard does the same without download and is irreversible. Rename and trim are not implemented.

Manual image files and their object URLs are ephemeral. Text and enhancement drafts are retained independently while switching idle modes, but a departing manual reference and preview URL are cleared and revoked. Prompt Workshop-generated references are immutable local assets; saved prompts, Recents, and saved characters retain only their opaque asset IDs and fetch validated bytes when used. Detaching or regenerating does not delete older assets because a historical record may still reference them.

## Provider usage and cost

- Decart usage can begin only after explicit model Start and ends on Stop/Reset, unexpected disconnect, or after a model recording is finalized. Realtime sessions are constrained to five minutes by the issued credential. Provider pricing, quota, and billing are external account concerns.
- OpenAI image usage begins only after Generate or Regenerate. Each request uses one high-quality `gpt-image-2` image; client and server idempotency suppress duplicate submission, and the broker performs no automatic billable retry.
- ElevenLabs browsing and previews create provider API requests. Import mutates the workspace. Speech-to-speech conversion can consume credits and is triggered only by Apply. The UI discloses this before the voice library action.
- `ELEVENLABS_ENABLE_LOGGING=false` asks the conversion API for zero-retention mode. ElevenLabs currently limits that mode to eligible enterprise accounts. It is not a promise about infrastructure retention; confirm the configured account's terms and eligibility. A non-eligible account must deliberately choose `true` for conversion to work.
- Local preview, recording, prompt assets, the prompt workshop, and local voice treatments require no provider account and incur no provider usage.

Do not put credentials, provider tokens, user media, or real personal data in source, docs, fixtures, screenshots, logs, or browser storage.

## Server security scope

The server is a trusted local integration broker. It binds to `127.0.0.1`, accepts loopback Host values only, requires an exactly matching loopback Origin/Host for provider mutations, uses no-store responses, validates inputs, restricts preview URL hosts, enforces the local owner for generated-asset reads, and sanitizes provider failures.

There is no account authentication because there is one local operator. Do not expose this server through a LAN binding, tunnel, reverse proxy, container ingress, or public hostname. Such deployment needs a new threat model and implementation for authentication, authorization, CSRF, rate limits, abuse/cost controls, tenant isolation, TLS, secrets, and privacy disclosure.

## Operator controls

- Revoke camera/microphone permission in browser site settings.
- Reload or close the tab to clear session-only mode drafts and capture-device preferences. Device ids are never part of `localStorage`.
- Use Stop camera to release owned device tracks outside recording; Finish releases all owned live resources only after recording finalization settles.
- Clear an image or Reset AI to revoke its preview and clear pending/applied reference state.
- Detach a generated reference to unlink the current selection without deleting an asset used by history. Removing `LIGHTFRAME_DATA_DIR` is an operator-level destructive action that invalidates all stored reference IDs; retained orphans otherwise remain on disk by design.
- Download then Close a take, or confirm Discard without download, to release recording and processed object URLs.
- Clear site storage to remove Recipe Shelf text and asset relationships; generated files remain in `LIGHTFRAME_DATA_DIR` until separately removed by the operator.
- Remove provider keys from `.env` and restart the API to disable integrations.

Provider-side data or imported voices must be managed with the provider's own account controls; this app has no remote-delete authority.
