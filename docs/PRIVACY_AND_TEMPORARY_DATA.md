# Privacy, temporary data, and provider cost

Lightframe Studio is local-first, not offline-only. Local capture stays in the browser; explicitly started AI and voice actions intentionally use external providers.

The product owner approved the external-participant retention, detach, deletion, and whole-dataset
cleanup promise in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) on 2026-07-28. The
current behavior documented below remains implementation truth. Wave 5 now exposes the approved
detach/retention and provider-usage boundaries, server-gates Wiro in participant mode, and provides
the [operator retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md). The executable disposable
retirement drill must pass before participant data is admitted; the real checklist remains
mandatory for every participant.

## Data inventory

| Data                                                                                                                   | Location and lifetime                                                                                                                                                             | External recipient                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved/recent prompt text, names, tags, notes, canonical builder state, reference/guided provenance, timestamps, counts | Recipe Shelf v4, versioned and sanitized in this browser profile's `localStorage`                                                                                                 | None                                                                                                                                                                   |
| Uploaded/final reference asset IDs and final reference kind                                                            | Nullable relationships in Recipe Shelf v4 `localStorage`; no image bytes or internal storage keys                                                                                 | None                                                                                                                                                                   |
| Active character-builder draft and save journal                                                                        | One versioned, sanitized IndexedDB record until Reset Draft, successful Save, site-data clearing, or browser eviction                                                             | None unless Generate Preview, Generate Combined Preview, or Regenerate is explicitly selected                                                                          |
| Legacy Guided project checkpoints and media Blobs                                                                      | Retained versioned IndexedDB records until manager deletion, site-data clearing, or browser eviction; tab memory on legacy fallback                                               | None                                                                                                                                                                   |
| Uploaded, generated, edited, or composed character reference and metadata                                              | Immutable owner-only files under `LIGHTFRAME_DATA_DIR` until the local operator removes retained assets                                                                           | None for upload/direct save; prompt/options and, for composition/editing, source bytes go to the selected OpenAI, BFL, or Wiro image provider after an explicit action |
| Active Local, Character, and Try-On text/enhancement drafts                                                            | React memory for this tab; independent per mode until reset or reload                                                                                                             | Decart only when the corresponding model draft is explicitly started/applied                                                                                           |
| Camera id, microphone id, and local quality target                                                                     | React memory for this tab; never written to recipes or browser storage                                                                                                            | None; used only in browser capture constraints                                                                                                                         |
| Camera and microphone streams                                                                                          | Browser memory while the session is live                                                                                                                                          | None in local mode; Decart during an explicitly started model session                                                                                                  |
| Portrait or garment file and preview URL                                                                               | Browser memory until clear, departure from that mode, reset, or unmount                                                                                                           | Decart when included in model Start/Apply                                                                                                                              |
| Decart temporary credential and app-owned active-session timing                                                        | Browser memory only; credential is scoped to one model/origin with a five-minute start TTL, while maximum/elapsed/remaining state lasts only for the active/completed tab session | Decart receives the credential/session connection; app timing itself is not sent as product analytics                                                                  |
| Current original recording and object URL                                                                              | Studio browser memory; legacy Guided projects may retain immutable Blob checkpoints                                                                                               | None unless its audio sidecar is explicitly converted                                                                                                                  |
| Audio sidecar                                                                                                          | Studio browser memory; legacy projects may retain the original sidecar                                                                                                            | ElevenLabs only after explicit cloud voice Apply                                                                                                                       |
| Locally processed take                                                                                                 | Studio browser memory; legacy projects may retain a processed Blob                                                                                                                | None                                                                                                                                                                   |
| Voice selection and voice-list pages                                                                                   | React memory for the current page                                                                                                                                                 | Voice metadata is obtained from ElevenLabs through the broker                                                                                                          |
| Provider preview audio                                                                                                 | Fetched through the broker into one short-lived browser Blob URL; aborted/revoked on replacement or unmount and never persisted                                                   | ElevenLabs/provider preview storage                                                                                                                                    |

The backend has no product database, accounts, or take/session history. It retains uploaded/generated/edited/composed character-reference bytes, applicable original/optimized/Lucy prompts, bounded optimizer metadata and settings, prompt hashes, safe image metadata, operation lineage, local owner ID, and idempotency mapping in the private local asset directory. Generated records also retain authoritative provider/model, an optional provider task/request ID, and allowlisted numeric provider settings/usage. Polling URLs, signed result URLs, raw provider payloads, credentials, and source base64 are never retained. For instructed edits it stores only a hash of the change instructions, never their raw text. Owner-scoped browser responses include the prompts and settings needed to review a reference and apply its Lucy prompt; image bytes are served from a separate immutable content route. Internal storage keys, provider secrets, task/request IDs, and provider-specific settings are never returned to the browser.

## Approved controlled-pilot data lifecycle

- Give every participant a fresh browser profile and a dedicated, explicitly resolved
  `LIGHTFRAME_DATA_DIR`. Never share a participant environment or use a repository, home
  directory, cloud-synced folder, or unresolved path as the data root.
- Use a random participant code with no name, email, device identifier, or provider ID.
- Retain the isolated local dataset only through the participant's scheduled engagement, including
  at most one planned seven-day return.
- Retire the whole local dataset within 24 hours after the final scheduled session, withdrawal, or
  cancellation, and no later than eight days after the first session.
- Explain before first upload/save that Remove, Detach, draft reset, and character deletion remove
  relationships but do not delete immutable reference bytes. The pilot promises deletion only
  through whole-environment retirement.
- At retirement, stop the API and media/provider work, clear all site data for the exact loopback
  origin, remove the dedicated browser profile, move only the reviewed participant data-directory
  leaf to the operating-system Trash, verify the asset IDs fail against a fresh disposable
  environment, reconcile provider cleanup, obtain Evidence Recorder and Support & Escalation Owner
  initials, then permanently remove that reviewed leaf.
- Use the [controlled-pilot data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md) for the
  content-free proof. `npm run pilot:data-retirement:drill` verifies exact-leaf retirement and
  shared-root/sibling preservation using disposable temporary data.
- Never use a recursive deletion command with an unresolved variable, broad glob, shared root,
  home directory, repository, or provider credential directory. Any ambiguity fails closed and
  blocks the next participant.
- Downloaded participant copies are the participant's durable handoff and are outside the
  operator's Lightframe dataset. Operator-created test downloads are retired with the environment.
- Aggregate content-free metrics at cohort close and delete row-level participant codes with the
  environment. Content, raw provider data, credentials, URLs, device IDs, and network archives are
  never evidence.

Provider-side retention is a separate disclosed boundary. Before participant contact, the
Credential Custodian and Billing Authorizer must review the exact account setting and current
terms. `PILOT_ACCESS_MODE=participant` server-disables selected Wiro image work even when its
credentials are configured. Wiro technical passes require the explicit
`PILOT_ACCESS_MODE=operator-qualification` startup mode, no participant present, and successful
`InputOutputDelete`. Participant ElevenLabs conversion requires confirmed zero-retention
eligibility. Local cleanup is never represented as provider-side deletion.

## Explicit consent points

- **Upload reference** sends validated image bytes only to the same-origin local broker, which writes an immutable asset under `LIGHTFRAME_DATA_DIR`. The picker states this retention before first selection. Upload does not contact an image provider. **Detach uploaded character reference** removes the draft relationship; it does not delete the stored asset.
- **Save Character** validates and durably stores the current character, then preloads Lucy 2.5 without starting/applying the provider session. The naming surface distinguishes prompt-only save from a save that retains immutable local reference bytes. Prompt-only and direct-upload Save make no optimizer or image request. **Save & Use Image Only** is also local-only. A stale generated/composed preview is never attached.
- **Generate Preview** is the explicit automatic optimize→image action. If image generation fails after successful optimization, an unchanged retry reuses that in-memory optimizer result; it does not contact the optimizer again. **Generate Combined Preview** additionally sends the owner-scoped uploaded source bytes to the selected image provider after optimization. OpenAI receives an SDK upload, BFL receives raw base64 in `input_image`, and Wiro receives one multipart `inputImage`; none requires a public temporary upload. **Regenerate** first asks for optional feedback: without an upload, blank feedback sends no previous generated image; with an upload, blank feedback composes from that source again. Written feedback sends an opaque source asset ID and instructions to the broker, which resolves owner-scoped image bytes server-side for the selected provider.
- **Start Camera + Mic**, **Check camera & mic**, or a valid direct **Start Character/Try-On AI** is the first possible camera/microphone permission request. Editing prompts and recipes does not open devices.
- **Apply capture settings** stores selected devices/quality for this tab. With no preview it does not start media; with a local preview it atomically acquires a replacement before releasing the current stream.
- **Check camera & mic** starts only the local preview; provider activation remains a separate action.
- **Start Character AI / Start Try-On AI** surfaces the same decision-point disclosure in the
  chooser and Dock, then sends live camera/microphone media, the complete applied recipe, and any
  reference to Decart after local media succeeds. Provider usage may begin for at most 300 active
  seconds. After a healthy connection commits, the app-owned monotonic timer shows maximum,
  elapsed, and remaining time and announces the final 30-second warning. Provider ticks may move
  that display forward but are not billing truth. **Stop AI** ends usage; expected maximum
  completion preserves local preview/current recipe, and an active model recording finalizes
  before resource release.
- **Apply changes** sends the complete current model snapshot, including an explicit image clear when applicable.
- **Optimize / Re-optimize reference prompt** sends the raw character recipe and selected framing, orientation, rendering, expression, and background settings through the loopback broker to the OpenAI Responses API with response storage disabled. The result remains separate from the raw recipe and can be edited before generation.
- Character reference generation exists only in Character Builder. Beside **Generate Preview** and
  **Generate Combined Preview**, and again inside **Regenerate**, Builder names the optimizer,
  selected image provider/model, possible credit usage, retained immutable output, and provider-free
  upload/save alternatives. If optimization fails, Builder continues through the same explicitly
  selected image provider with the raw direction, shows a yellow warning on the result, and offers
  an explicit optimization retry that creates a new immutable image only after optimization
  succeeds. Each image-provider action may be billable. Prompt Workshop has no provider or
  reference-generation action.
- **Browse saved ElevenLabs voices · contacts provider** requests only `voice_type=saved` metadata after the disclosure is opened; it does not send the take. Every provider-contacting voice request carries the explicit Studio voice-intent header, which the loopback broker requires before invoking ElevenLabs.
- **Preview voice** is a labeled click-to-fetch action. It requests provider preview audio, owns and revokes the resulting Blob URL, and does not send the recording.
- **Apply ElevenLabs voice** shows the exact take duration, configured speech-to-speech model,
  possible credit usage, and zero-retention requirement at the selected-voice action. Apply sends
  only the completed immutable audio sidecar, not video, through the same-origin broker.

## Local no-provider guarantee

Selecting and starting Local Camera does not:

- request `/api/realtime-token`;
- dynamically import the Decart SDK;
- create a Decart client or provider WebRTC connection;
- send the camera, microphone, prompt, or image to Decart.

The page does call the local `/api/capabilities` broker endpoint to render integration availability. That endpoint reads server configuration and does not contact Decart, OpenAI, BFL, Wiro, or ElevenLabs. Local voice effects use Web Audio and local remuxing only.

Opening Capture Settings may enumerate browser-visible input devices and read permission state, but
it does not call `getUserMedia` or prompt for permission. Device ids, device labels, and the
selected quality target remain in React memory and are not added to Recipe Shelf storage. A
preferred device can therefore survive settings closure and camera stop/start in the same tab, but
not reload. If that device disappears, the app retains the in-memory preference while using the
browser default for a later explicit start.

## Recording retention and temporary artifacts

Studio recordings are temporary Blobs behind object URLs, not saved files. Studio owns one take, not a take history. **Stop recording** finalizes the artifact before releasing camera/provider resources, then the take replaces live media on the same stage. The detailed Latest Take overlay remains closed until **Take** is selected. The artifact survives tool-overlay closure but not refresh, browser crash, tab closure, or device restart. Download dispatch leaves playback active and enables Close; the browser does not expose download completion to the app. Close releases recording URLs and returns to private idle. Confirmed Discard does the same without download and is irreversible. Rename and trim are not implemented.

Legacy Guided projects may contain finalized original video, optional original-audio sidecar, and selected processed output as IndexedDB Blobs. Project metadata is allowlisted and revisioned; media streams, device identifiers, provider clients, credentials, and object URLs are excluded. The Studio legacy manager can download and transactionally delete these records but cannot reopen Guided. A project remains until explicit manager deletion, site-data clearing, private-session closure, or browser eviction.

Legacy Guided records keep their original immutable; no migration or route canonicalization automatically deletes or rewrites that media.

Recipe Dock portrait/garment files and their object URLs are ephemeral. Text and enhancement drafts are retained independently while switching idle modes, but a departing Dock reference and preview URL are cleared and revoked. Character Builder uploaded/generated references are immutable local assets; saved prompts, Recents, saved characters, and active drafts retain only opaque asset IDs and fetch validated bytes when used. Resetting a draft, removing an upload, stale-preview Save, blank regeneration, or instructed regeneration does not delete older assets. Superseded assets may be unreferenced and remain on disk by design.

## Provider usage and cost

- Decart usage can begin only after explicit model Start and ends on Stop/Reset, unexpected
  disconnect, expected active-session completion, or after a model recording is finalized.
  Saving/preloading a character never starts or applies Decart. The visible timer is planning
  state, not a provider invoice or quota meter; provider pricing, quota, and billing remain
  external account concerns.
- OpenAI text-model usage begins after Optimize/Re-optimize or when Generate/Combined Preview must refresh a stale optimization. Image usage begins only after Generate, Generate Combined Preview, or Regenerate reaches the selected OpenAI/BFL/Wiro image stage. Upload, direct-upload save, and image-only save make no external image request. OpenAI defaults to one high-quality `gpt-image-2` result; BFL uses one `flux-2-pro` task and Wiro uses one ByteDance `seedream-v5-lite-uncensored` task. Neither task provider automatically retries its initial billable POST. Client/server idempotency and provider-aware fingerprints suppress duplicate submission and cross-provider replay.
- Wiro task outputs and uploaded task inputs are remote provider artifacts. After the downloaded result has been normalized and the local persistence attempt settles, the adapter calls Wiro `InputOutputDelete`. The cleanup endpoint is idempotent. Cleanup failure is recorded only as a safe lifecycle event and does not remove a successfully stored local asset; operators should verify provider retention behavior in the Wiro project when this warning occurs.
- ElevenLabs saved-library browsing and previews create provider API requests. Speech-to-speech conversion can consume credits and is triggered only by Apply. The project cannot add, import, or remove library voices; those changes occur only in ElevenLabs. The UI discloses provider contact before the voice library action.
- `ELEVENLABS_ENABLE_LOGGING=false` asks the conversion API for zero-retention mode. ElevenLabs currently limits that mode to eligible enterprise accounts. It is not a promise about infrastructure retention; confirm the configured account's terms and eligibility. The software can deliberately use `true` for a non-eligible account after an informed decision, but the approved controlled pilot does not: participant cloud conversion stays unavailable unless zero-retention eligibility is confirmed.
- Local preview, recording, prompt assets, the prompt workshop, and local voice treatments require no provider account and incur no provider usage.

Do not put credentials, provider tokens, device identifiers, or unallowlisted user data in browser storage. Do not put real personal data or user media in source, docs, fixtures, screenshots, or logs. Legacy project media belongs only in its typed IndexedDB artifact store.

## Server security scope

The server is a trusted local integration broker. It binds to `127.0.0.1`, accepts loopback Host values only, requires an exactly matching loopback Origin/Host for provider and reference-asset mutations, requires explicit voice intent for all provider-contacting ElevenLabs reads and writes, uses no-store responses, validates inputs, restricts preview URL hosts, enforces the local owner for all reference-asset reads, and sanitizes provider failures. Unknown server faults return `internal_error`; their structured diagnostic omits URLs, queries, bodies, prompts, provider URLs, raw messages, and causes.

There is no account authentication because there is one local operator. Do not expose this server through a LAN binding, tunnel, reverse proxy, container ingress, or public hostname. Such deployment needs a new threat model and implementation for authentication, authorization, CSRF, rate limits, abuse/cost controls, tenant isolation, TLS, secrets, and privacy disclosure.

## Operator controls

- Revoke camera/microphone permission in browser site settings.
- Reload or close the tab to clear session-only mode drafts and capture-device preferences. Device ids are never part of `localStorage` or IndexedDB.
- Use Close/Stop camera to release owned device tracks outside recording; **Stop recording** releases all owned live resources only after recording finalization settles.
- Clear an image or Reset AI to revoke its preview and clear pending/applied reference state.
- Detach/remove a reference to unlink the current selection without deleting an uploaded or generated asset used by history. Removing `LIGHTFRAME_DATA_DIR` is an operator-level destructive action that invalidates all stored reference IDs; retained orphans otherwise remain on disk by design.
- In Studio, Download then Close a take, or confirm Discard without download, to release recording and processed object URLs.
- Use Manage Legacy Projects in Recipe Shelf (or enter through retired `/projects`) to remove one legacy project's checkpoint metadata and owned media transactionally; reusable Recipe Shelf characters remain.
- Clear site storage to remove Recipe Shelf text/reference provenance, guided provenance, project checkpoints, and IndexedDB media. Uploaded and generated files remain in `LIGHTFRAME_DATA_DIR` until separately removed by the operator.
- Remove provider keys from `.env` and restart the API to disable integrations.

Provider-side data and ElevenLabs library membership must otherwise be managed with the providers' own account controls. The only automated remote deletion is the post-persistence Wiro task input/output cleanup described above.

The exact retirement checklist, generic owner roles, limits, refusal rules, and escalation path are
authoritative in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md).
