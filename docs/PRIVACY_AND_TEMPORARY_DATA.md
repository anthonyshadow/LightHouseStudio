# Privacy and temporary data

Lightframe Studio is local-first, not offline-only. Local capture and local Voice stay in the
browser. Provider transfer occurs only after an explicit provider action through the loopback
broker.

This document separates current runtime behavior from the approved pilot operating procedure.

## Current data inventory

| Data                                                                          | Current location and lifetime                                                                               | External transfer                                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Saved/recent recipes, character metadata, opaque reference IDs                | Sanitized/versioned Recipe Shelf v4 in this browser profile’s `localStorage`                                | None                                                                                                                                |
| Active Character Builder draft/save journal                                   | One sanitized/versioned IndexedDB record until Reset, successful Save, site-data removal, or eviction       | Only after explicit optimization/image action                                                                                       |
| Legacy Guided projects/media                                                  | Versioned IndexedDB records until manager deletion, site-data removal, or eviction                          | None                                                                                                                                |
| Uploaded/generated/edited/composed references and metadata                    | Immutable owner-scoped files under `LIGHTFRAME_DATA_DIR` until operator retirement                          | Upload/direct save: none; provider image actions: prompt/options and source bytes when applicable                                   |
| Active mode text/enhancement, capture preferences, temporary portrait/garment | Tab memory until reset/reload/unmount                                                                       | Decart only after matching Start/Apply                                                                                              |
| Camera/microphone streams                                                     | Browser memory while live                                                                                   | None in Local; Decart during explicit AI session                                                                                    |
| Decart client credential/timing                                               | Browser memory for the connection/session                                                                   | Decart connection only                                                                                                              |
| Current converted original take, sidecar, processed result                    | Browser memory until Release/Discard/reload/crash/close; raw recorder input exists only during finalization | Sidecar only after explicit ElevenLabs Apply                                                                                        |
| Uploaded/recorded video, selected edit plan, latest healthy result            | Browser tab memory until replacement, Release/Discard, reload/crash/close                                   | Decart receives synthetic-named media/recipe after visual submit; ElevenLabs receives only immutable source audio after voice Apply |
| Remote VTO reference import URL and bytes                                     | URL exists only in request memory; validated bytes return no-store and become a tab-local `File`            | Public HTTPS origin receives one bounded GET; Decart receives validated bytes only on later submit, never the URL                   |
| Active batch input/reference/output                                           | Generated private paths under `LIGHTFRAME_DATA_DIR/.tmp/video-jobs`; process-temporary, 60-minute cap       | Decart during explicit submit/status/content; no provider cancellation or deletion is claimed                                       |
| Saved-voice pages/selection                                                   | React memory                                                                                                | ElevenLabs metadata after explicit Browse                                                                                           |
| Voice preview audio                                                           | Bounded, short-lived Blob URL; revoked on replacement/unmount                                               | ElevenLabs preview request; never the take                                                                                          |

The backend has no accounts, product database, take history, or session history. Its only durable
product data is the immutable reference store and its versioned metadata/idempotency mappings.
Generated records include the prompts needed for review/use, safe provider/model provenance,
settings, hashes, and derivation lineage. Raw edit instructions are stored only as a hash.

Credentials, internal storage keys/paths, task tokens, signed/polling URLs, source base64, and raw
provider payloads/errors are neither retained as product data nor returned to the browser.

## Explicit transfer boundaries

| Action                            | Recipient and data                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/capabilities`           | Local broker configuration only; no provider request                                                                                                                                 |
| Upload/direct image save          | Local broker/store only                                                                                                                                                              |
| Start/Apply Character or VTO      | Decart receives live camera/microphone media and the complete applied recipe/reference                                                                                               |
| Submit selected upload visual     | Decart receives a synthetic-named compatible video, normalized prompt/options, and optional validated reference for the one active Lucy or VTO choice; selecting neither stays local |
| Optimize/Re-optimize              | OpenAI receives the raw character direction and selected reference options; response storage is disabled                                                                             |
| Generate/Combined/Regenerate/Edit | Startup-selected OpenAI/BFL/Wiro image provider receives the optimized or documented raw-fallback prompt; composition/editing also receives the owner-scoped source                  |
| Browse saved voices               | ElevenLabs receives a saved-library metadata request; no take                                                                                                                        |
| Preview voice                     | ElevenLabs preview request; no take                                                                                                                                                  |
| Apply ElevenLabs voice            | ElevenLabs receives only the immutable original audio sidecar, not video                                                                                                             |
| Import VTO reference URL          | Loopback broker fetches one explicit public HTTPS URL with DNS/redirect/byte/content controls; the URL is not sent to Decart                                                         |

Provider actions may incur usage. Reference image providers never fall back to another provider or
automatically repeat an initial billable submission. An optimizer failure may continue with the
raw prompt through the same selected provider and is recorded as unoptimized.

Local Camera does not request a Decart token, load the Decart SDK, create provider WebRTC, or send
camera/microphone/prompt/image data externally. Capture Settings may enumerate inputs and
permission state but does not request media. Recording conversion uses MediaBunny/WebCodecs and
the optional AAC WASM encoder entirely on the device. Local Voice uses Web Audio/remux only.

## Current retention and deletion

- Studio owns one temporary take. Download starts a browser download but does not prove completion.
  Release or confirmed Discard revokes take URLs and returns to idle. A completed uploaded-video
  workflow downloads its generated result directly. Only the immutable source and latest healthy
  Result are retained after success; a visual remains temporarily while a following voice change
  runs. **Start over** revokes generated URLs but retains the source; confirmed **Discard video**
  releases the source, result, and recent outfits and returns to the local upload picker.
- A take survives overlay closure, but not reload, crash, tab closure, or device restart.
- Uploaded workflow/job recovery is intentionally unsupported across reload, crash, tab closure, or
  broker restart. The broker purges its dedicated job temp root at startup and expires jobs after
  60 minutes.
- Legacy projects remain in IndexedDB until explicit manager deletion, site-data clearing, private
  session closure, eviction, or profile retirement.
- Recipe Dock portrait/garment files are tab-ephemeral.
- Character Builder references are immutable local assets. Remove/Detach, draft reset,
  regeneration, stale-preview rejection, and character deletion remove relationships only; they do
  not delete bytes.
- Clearing browser site data removes browser stores but not `LIGHTFRAME_DATA_DIR`.
- There is no ordinary per-asset server delete or relationship-safe garbage collector.

Operator controls:

- stop/close media and revoke camera/microphone permission in browser settings;
- reload/close to clear tab-only drafts, device preferences, and current takes;
- use Release/Discard for the current take and Legacy Projects for legacy media;
- clear exact-origin site data for browser persistence;
- remove provider keys and restart to disable integrations; and
- retire a dedicated `LIGHTFRAME_DATA_DIR` only through the reviewed whole-environment procedure.

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

Use the [pilot data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md) every time. The
disposable `pnpm pilot:data-retirement:drill` proves exact-leaf/sibling handling but does not
replace real retirement evidence.

Downloaded participant copies are their durable handoff and are outside the operator’s Lightframe
dataset.

## Provider retention

Provider-side retention is separate from local deletion and must be disclosed/reviewed for the
exact account configuration:

- `PILOT_ACCESS_MODE=participant` server-disables Wiro even when credentials exist.
- Wiro technical qualification requires `operator-qualification`, no participant, and evidence of
  `InputOutputDelete`; this is the only automated provider-side deletion.
- ElevenLabs participant conversion requires confirmed zero-retention eligibility with
  `ELEVENLABS_ENABLE_LOGGING=false`.
- Other provider-managed artifacts and account/library data use provider account controls.

Local cleanup must never be described as provider-side deletion.

## Server security scope

The API is a trusted local broker: it binds to loopback, rejects non-loopback Host values, requires
exact loopback Origin/Host for provider/reference mutations, requires explicit voice/video intent
for ElevenLabs, Decart batch contact, and remote reference import, validates/bounds inputs and outputs, owner-scopes
references/jobs, and sanitizes errors. It has no public authentication or authorization.

Do not expose it through LAN binding, a tunnel, proxy, container ingress, or public hostname.
Accounts, remote persistence, public ingress, and tenancy remain deferred behind the
[remote-backend handoff](REMOTE_BACKEND_HANDOFF.md). Local Host hashes, paths, keys, device IDs,
provider IDs, and tokens are never future identity or ownership.

The [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) is authoritative for
cohort, content, limits, roles, metrics, and escalation.
