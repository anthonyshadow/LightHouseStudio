# Privacy, temporary data, and provider cost

Lightframe Studio is local-first, not offline-only. Local capture stays in the browser; explicitly started AI and voice actions intentionally use external providers.

## Data inventory

| Data                                                                                       | Location and lifetime                                                                                       | External recipient                                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Saved/recent prompt text, names, tags, notes, structured builder state, timestamps, counts | Versioned and sanitized in this browser profile's `localStorage`                                            | None                                                                         |
| Active Local, Character, and Try-On text/enhancement drafts                                | React memory for this tab; independent per mode until reset or reload                                       | Decart only when the corresponding model draft is explicitly started/applied |
| Camera id, microphone id, and local quality target                                         | React memory for this tab; never written to recipes or browser storage                                      | None; used only in browser capture constraints                               |
| Camera and microphone streams                                                              | Browser memory while the session is live                                                                    | None in local mode; Decart during an explicitly started model session        |
| Portrait or garment file and preview URL                                                   | Browser memory until clear, departure from that mode, reset, or unmount                                     | Decart when included in model Start/Apply                                    |
| Decart temporary credential                                                                | Browser memory for connection setup; scoped to one model/origin with a five-minute expiry and session limit | Decart realtime service                                                      |
| Current original recording and object URL                                                  | Browser memory until discard, next-take replacement, or unmount/tab closure                                 | None unless its audio sidecar is explicitly converted                        |
| Audio sidecar                                                                              | Browser memory, tied to the current original take                                                           | ElevenLabs only after explicit cloud voice Apply                             |
| Locally processed take                                                                     | Browser memory until restored, replaced, discarded, or unmounted                                            | None                                                                         |
| Voice selection and voice-list pages                                                       | React memory for the current page                                                                           | Voice metadata is obtained from ElevenLabs through the broker                |
| Provider preview audio                                                                     | Streamed through the broker; not stored by the app                                                          | ElevenLabs/provider preview storage                                          |
| Imported public voice                                                                      | Persistent external change in the configured ElevenLabs workspace                                           | ElevenLabs                                                                   |

The backend has no product database or media store. It does not retain takes, images, sessions, prompt history, device ids, or user profiles. Automatic HTTP request URL logging is disabled so query-string voice searches and provider ids are not written to application logs.

## Explicit consent points

- **Start local preview**, **Check camera & mic**, or a valid **Start Character/Try-On AI** is the first possible camera/microphone permission request. Editing prompts and recipes does not open devices.
- **Apply capture settings** stores selected devices/quality for this tab. With no preview it does not start media; with a local preview it atomically acquires a replacement before releasing the current stream.
- **Check camera & mic** starts only the local preview; provider activation remains a separate action.
- **Start Character AI / Start Try-On AI** sends live camera media and the complete applied recipe to Decart after local media succeeds.
- **Apply changes** sends the complete current model snapshot, including an explicit image clear when applicable.
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

Recordings are Blobs behind object URLs, not saved files. The app owns one take, not a take history. A take survives session/model stop but not a page refresh, browser crash, tab closure, or device restart. Download a wanted take before leaving. Starting a new take replaces the previous artifact; an undownloaded current take requires confirmation first. Confirmed discard is irreversible. Rename and trim are not implemented.

Images and generated object URLs are likewise ephemeral. Text and enhancement drafts are retained independently while switching idle modes, but the departing mode's reference file and preview URL are cleared and revoked. A saved character recipe records whether a portrait is needed or was present in the current session, but never stores the portrait itself.

## Provider usage and cost

- Decart usage can begin only after explicit model Start and ends on Stop/Reset, unexpected disconnect, or after a model recording is finalized. Realtime sessions are constrained to five minutes by the issued credential. Provider pricing, quota, and billing are external account concerns.
- ElevenLabs browsing and previews create provider API requests. Import mutates the workspace. Speech-to-speech conversion can consume credits and is triggered only by Apply. The UI discloses this before the voice library action.
- `ELEVENLABS_ENABLE_LOGGING=false` asks the conversion API for zero-retention mode. ElevenLabs currently limits that mode to eligible enterprise accounts. It is not a promise about infrastructure retention; confirm the configured account's terms and eligibility. A non-eligible account must deliberately choose `true` for conversion to work.
- Local preview, recording, prompt assets, the prompt workshop, and local voice treatments require no provider account and incur no provider usage.

Do not put credentials, provider tokens, user media, or real personal data in source, docs, fixtures, screenshots, logs, or browser storage.

## Server security scope

The server is a trusted local integration broker. It binds to `127.0.0.1`, accepts loopback Host values only, requires a loopback Origin for provider mutations, uses no-store responses, validates inputs, restricts preview URL hosts, and sanitizes provider failures.

There is no account authentication because there is one local operator. Do not expose this server through a LAN binding, tunnel, reverse proxy, container ingress, or public hostname. Such deployment needs a new threat model and implementation for authentication, authorization, CSRF, rate limits, abuse/cost controls, tenant isolation, TLS, secrets, and privacy disclosure.

## Operator controls

- Revoke camera/microphone permission in browser site settings.
- Reload or close the tab to clear session-only mode drafts and capture-device preferences. Device ids are never part of `localStorage`.
- Use Stop camera to release owned device tracks.
- Clear an image or Reset AI to revoke its preview and clear pending/applied reference state.
- Download then Discard a take to release recording and processed object URLs.
- Clear site storage to remove Recipe Shelf text assets.
- Remove provider keys from `.env` and restart the API to disable integrations.

Provider-side data or imported voices must be managed with the provider's own account controls; this app has no remote-delete authority.
