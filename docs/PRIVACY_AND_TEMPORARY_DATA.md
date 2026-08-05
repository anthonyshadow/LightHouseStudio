# Privacy and temporary data

Lightframe Studio is local-first, not offline-only. Local capture and local Voice stay in the
browser. Provider transfer occurs only after an explicit provider action through the loopback
broker.

This document separates current runtime behavior from the approved pilot operating procedure.

## Current data inventory

| Data                                                                           | Current location and lifetime                                                                                                                                                                                                                               | External transfer                                                                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved/recent recipes, character/outfit/wardrobe metadata, opaque reference IDs | Sanitized/versioned Recipe Shelf v6 in this browser profile’s `localStorage`; Wardrobe metadata is capped at 500 variants                                                                                                                                   | None                                                                                                                                                          |
| Active Character Builder draft/save journal                                    | One sanitized/versioned IndexedDB record until Reset, successful Save, site-data removal, or eviction                                                                                                                                                       | Only after explicit optimization/image action                                                                                                                 |
| Legacy Guided projects/media                                                   | Versioned IndexedDB records until manager deletion, site-data removal, or eviction                                                                                                                                                                          | None                                                                                                                                                          |
| Uploaded/generated/edited/composed references and metadata                     | Immutable owner-scoped files under `LIGHTFRAME_DATA_DIR` until operator retirement                                                                                                                                                                          | Upload/direct save: none; provider image actions: prompt/options and source bytes when applicable                                                             |
| Active mode text/enhancement, capture preferences, temporary portrait/garment  | Tab memory until reset/reload/unmount                                                                                                                                                                                                                       | Decart only after matching Start/Apply                                                                                                                        |
| Unsaved Outfit Builder image and directly uploaded/imported outfit recents     | Bounded tab memory until replacement, discard, reload, or tab close; final Save stores bytes locally                                                                                                                                                        | Import fetches the explicit public HTTPS origin; no Decart or image-provider transfer on Save                                                                 |
| Camera/microphone streams                                                      | Browser memory while live                                                                                                                                                                                                                                   | None in Local; Decart during explicit AI session                                                                                                              |
| Decart client credential/timing                                                | Browser memory for the connection/session                                                                                                                                                                                                                   | Decart connection only                                                                                                                                        |
| Current converted original take, sidecar, processed result                     | Browser memory until Release/Discard/reload/crash/close; raw recorder input exists only during finalization                                                                                                                                                 | Sidecar only after explicit ElevenLabs Apply                                                                                                                  |
| Uploaded/recorded video, selected edit plan, latest healthy result             | Browser tab memory until replacement, Release/Discard, reload/crash/close                                                                                                                                                                                   | Startup-selected visual provider receives synthetic-named media/recipe after visual submit; ElevenLabs receives only immutable source audio after voice Apply |
| Local video-edit draft, worker chunks, validated candidate                     | Browser memory only; chunks release on cancel/error, candidate releases after commit/discard/close, and no edit state survives reload                                                                                                                       | None; rendering and validation are provider-free                                                                                                              |
| Remote Character/VTO reference import URL and bytes                            | URL exists only in request memory; validated bytes return no-store and become a tab-local `File`                                                                                                                                                            | Public HTTPS origin receives one bounded GET; Decart receives validated bytes only on later submit, never the URL                                             |
| Active batch input/reference/output                                            | Generated private paths under `LIGHTFRAME_DATA_DIR/.tmp/video-jobs`; one immutable deadline 60 minutes after acceptance covers active and ready jobs, with earlier cleanup on delivery/release/shutdown and a lease only for content admitted before expiry | Decart or Pruna during explicit submit/status/content; local cleanup is not provider cancellation or provider-side deletion                                   |
| Saved-voice pages/selection                                                    | React memory                                                                                                                                                                                                                                                | ElevenLabs metadata after explicit Browse                                                                                                                     |
| Voice preview audio                                                            | Bounded, short-lived Blob URL; revoked on replacement/unmount                                                                                                                                                                                               | ElevenLabs preview request; never the take                                                                                                                    |

The backend has no accounts, product database, take history, or session history. Its only durable
product data is the immutable reference store and its versioned metadata/idempotency mappings.
Generated records include the prompts needed for review/use, safe provider/model provenance,
settings, hashes, and derivation lineage. Raw edit instructions are stored only as a hash.

Credentials, internal storage keys/paths, task tokens, signed/polling URLs, source base64, and raw
provider payloads/errors are neither retained as product data nor returned to the browser.

## Explicit transfer boundaries

| Action                             | Recipient and data                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/capabilities`            | Local broker configuration only; no provider request                                                                                                                                                                                                                                                                                                           |
| Adjust/render local video          | No recipient; source frames/audio, draft, worker chunks, and candidate remain in browser memory                                                                                                                                                                                                                                                                |
| Upload/direct image save           | Local broker/store only                                                                                                                                                                                                                                                                                                                                        |
| Start/Apply Character or VTO       | Decart receives live camera/microphone media and the complete applied recipe/reference                                                                                                                                                                                                                                                                         |
| Submit selected Character Swap     | Startup-selected Decart or Pruna receives a synthetic-named compatible video, normalized prompt/options, and validated reference when required. Pruna receives one reference, the editor-selected resolution, fixed seed/turbo/frame-rate/audio/safety options, and an ephemeral locally prepared MP4 for MOV/WebM input; selecting no visual edit stays local |
| Submit selected Virtual Try-On     | Decart receives a synthetic-named compatible video, normalized prompt/options, and optional validated garment reference; Pruna is never contacted                                                                                                                                                                                                              |
| Optimize/Re-optimize               | OpenAI receives the raw character direction and selected reference options; response storage is disabled                                                                                                                                                                                                                                                       |
| Generate/Combined/Regenerate/Edit  | Startup-selected OpenAI/BFL/Wiro image provider receives the optimized or documented raw-fallback prompt; composition/editing also receives the owner-scoped source. Wardrobe Change Features omits the parent prompt when a saved variant is the source, sending only the selected image and requested changes.                                               |
| Generate Wardrobe Add Outfit       | Pruna receives the owner-scoped selected character image and one locally stored garment only after explicit Generate/Regenerate; the result is validated and stored locally before return                                                                                                                                                                      |
| Open Saved voice library           | ElevenLabs receives a saved-library metadata request; no take                                                                                                                                                                                                                                                                                                  |
| Preview voice                      | ElevenLabs preview request; no take                                                                                                                                                                                                                                                                                                                            |
| Apply ElevenLabs voice             | ElevenLabs receives only the immutable original audio sidecar, not video                                                                                                                                                                                                                                                                                       |
| Import Character/VTO reference URL | Loopback broker fetches one explicit public HTTPS URL with DNS/redirect/byte/content controls; the URL is not sent to Decart                                                                                                                                                                                                                                   |

Provider actions may incur usage. Reference image providers never fall back to another provider or
automatically repeat an initial billable submission. An optimizer failure may continue with the
raw prompt through the same selected provider and is recorded as unoptimized.

Local Camera does not request a Decart token, load the Decart SDK, create provider WebRTC, or send
camera/microphone/prompt/image data externally. Capture Settings may enumerate inputs and
permission state but does not request media. Recording conversion uses MediaBunny/WebCodecs and
the optional AAC WASM encoder entirely on the device. Local video editing uses the same on-device
MediaBunny/WebCodecs/AAC boundary inside a dedicated module worker plus WebGL; it creates no HTTP or
provider intent. Local Voice uses Web Audio/remux only.

## Current retention and deletion

- Studio owns one temporary take. Download starts a browser download but does not prove completion.
  Release or confirmed Discard revokes take URLs and returns to idle. A completed uploaded-video
  workflow downloads its generated result directly. Only the immutable source and latest healthy
  Result are retained after success; a visual remains temporarily while a following voice change
  runs. **Start over** revokes generated URLs but retains the source; confirmed **Discard video**
  releases the source, result, and recent outfits and returns to the local upload picker.
- A take survives overlay closure, but not reload, crash, tab closure, or device restart.
- A dirty local video edit and rendered candidate are session-only. Cancel/discard retains the
  pinned source; confirmed replacement retains only the new edited source and matching sidecar,
  then releases the worker candidate and superseded visual/voice layers.
- Uploaded workflow/job recovery is intentionally unsupported across reload, crash, tab closure, or
  broker restart. The broker purges its dedicated job temp root at startup and enforces one
  accepted-at-plus-60-minute deadline for active and ready jobs without requiring later browser
  activity. Delivery, explicit release, and shutdown may clean local state earlier.
- Legacy projects remain in IndexedDB until explicit manager deletion, site-data clearing, private
  session closure, eviction, or profile retirement.
- Recipe Dock portrait/garment files are tab-ephemeral.
- Outfit Builder files remain tab-ephemeral until final Save. Successful final Save uses the
  idempotent local reference-upload endpoint, then stores only the opaque asset ID in Recipe Shelf
  v5. Directly uploaded/imported recent outfits stay bounded and tab-only; successful prompt uses
  and explicitly saved image outfits may create persistent Recipe Shelf recents.
- Character Builder references are immutable local assets. Remove/Detach, draft reset,
  regeneration, stale-preview rejection, and character deletion remove relationships only; they do
  not delete bytes.
- Wardrobe Save stores normalized variant metadata and exact immutable source/result/garment IDs in
  Recipe Shelf v6. Cancel saves no variant metadata. Parent deletion removes its variant metadata,
  selected-version link, and Recent links but retains detached immutable image bytes.
- Clearing browser site data removes browser stores but not `LIGHTFRAME_DATA_DIR`.
- There is no ordinary per-asset server delete or relationship-safe garbage collector.

Operator controls:

- stop/close media and revoke camera/microphone permission in browser settings;
- reload/close to clear tab-only drafts, device preferences, and current takes;
- use Release/Discard for the current take and Legacy Projects for legacy media;
- clear exact-origin site data for browser persistence;
- remove provider keys and restart to disable integrations; and
- retire a dedicated `LIGHTFRAME_DATA_DIR` only through the reviewed whole-environment procedure.

## Video-job retention

When the broker accepts a video job and returns its first status, it sets one immutable deadline at
`acceptedAt + 60 minutes`. A service-owned timer enforces that deadline across active and ready
states; polling, retry, retrieval, and completion never extend it. Successful delivery, explicit
release, and broker shutdown may remove local job state earlier. A content stream admitted before
the deadline may finish after it; the broker does not admit a new content stream at or after the
deadline. Expired jobs retain only a safe process-memory tombstone so the same job ID cannot become
a second provider submission; output bytes and result metadata are removed.

Expiry and earlier cleanup apply only to Lightframe's in-memory state and private temporary files.
They do not cancel a provider job and do not establish provider-side deletion.

## Approved pilot lifecycle (operating target)

The runtime does not automate participant isolation or whole-environment deletion. The moderated
pilot operator must:

- use a fresh browser profile and dedicated, resolved data-directory leaf for each anonymous
  participant code;
- retain it only through the engagement and at most one planned seven-day return;
- retire it within 24 hours after the final session/withdrawal/cancellation and no later than day
  eight after first use;
- clear exact-origin site data/profile, retire only the reviewed data leaf, verify old asset IDs
  fail against an empty environment, reconcile provider cleanup, and preserve siblings/shared
  roots; and
- retain only aggregated content-free metrics with no participant lookup key.

The former pilot retirement checklist remains historical operating guidance, not an application
gate or current project command.

Downloaded participant copies are their durable handoff and are outside the operator’s Lightframe
dataset.

## Provider retention

Provider-side retention is separate from local deletion and must be disclosed/reviewed for the
exact account configuration:

- Wiro availability follows the selected provider and required credentials; successful remote
  work still requests `InputOutputDelete` cleanup.
- ElevenLabs retention follows `ELEVENLABS_ENABLE_LOGGING`; `false` requests zero retention and
  may require an eligible provider account.
- Pruna file uploads are documented as expiring after approximately 30 minutes and generated
  delivery content is typically available for 24 hours. Lightframe relies on neither a documented
  cancellation endpoint nor a provider deletion endpoint, and local cleanup never claims Pruna
  deletion. This boundary applies to both video replacement and Wardrobe try-on uploads/results.
- Other provider-managed artifacts and account/library data use provider account controls.

Local cleanup must never be described as provider-side deletion.

## Server security scope

The API is a trusted local broker: it binds to loopback, rejects non-loopback Host values, requires
exact loopback Origin/Host for provider/reference mutations, requires explicit voice/video/wardrobe
intent for ElevenLabs, visual batch contact, Pruna try-on, and remote reference import, validates/bounds inputs and outputs, owner-scopes
references/jobs, and sanitizes errors. It has no public authentication or authorization.

Do not expose it through LAN binding, a tunnel, proxy, container ingress, or public hostname.
Accounts, remote persistence, public ingress, and tenancy remain deferred behind the
[remote-backend handoff](REMOTE_BACKEND_HANDOFF.md). Local Host hashes, paths, keys, device IDs,
provider IDs, and tokens are never future identity or ownership.

The [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) is authoritative for
cohort, content, limits, roles, metrics, and escalation.
