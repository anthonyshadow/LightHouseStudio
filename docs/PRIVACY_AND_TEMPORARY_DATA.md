# Privacy and temporary data

Lightframe Studio is local-first, not offline-only. Local capture and local Voice stay in the
browser. Provider transfer occurs only after an explicit provider action through the loopback
broker.

This document describes current runtime behavior and operator-controlled cleanup boundaries.

## Current data inventory

| Data                                                                                                                 | Current location and lifetime                                                                                                                                                                                                                                      | External transfer                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated demo session                                                                                           | Session JWT in a host-only, HTTP-only, `SameSite=Strict` cookie for at most 24 hours; safe user/entitlement snapshot in browser memory only                                                                                                                        | Loopback API only; no provider receives the session or credentials                                                                                            |
| Saved/recent recipes, character/outfit/wardrobe metadata, nullable character voice preferences, opaque reference IDs | Sanitized/versioned, stable-user-namespaced Recipe Shelf v7 in this browser profile’s `localStorage`; Wardrobe metadata is capped at 500 variants; a voice preference contains only the provider voice ID and display name                                         | None; the voice is revalidated only after explicit library access or edit processing                                                                          |
| Active Character Builder draft/save journal                                                                          | Sanitized/versioned, user-scoped IndexedDB until Reset, successful Save, site-data removal, or eviction                                                                                                                                                            | Only after explicit optimization/image action                                                                                                                 |
| Legacy Guided projects/media                                                                                         | Deleted from the retired IndexedDB repository when authenticated Studio initializes; not imported into Saved Videos                                                                                                                                                | None                                                                                                                                                          |
| Saved videos, immutable versions, thumbnails, and optional character attribution                                     | Owner-scoped local files and private manifests under `LIGHTFRAME_DATA_DIR`; each new version may retain the safe base character name used for gallery filtering; logical deletion tombstones the gallery record while detached bytes remain retained until Phase 2 | None unless a later explicit provider action uses a loaded version                                                                                            |
| Uploaded/generated/edited/composed references and metadata                                                           | Immutable owner-scoped files plus a versioned derived lookup index under `LIGHTFRAME_DATA_DIR` until deliberate whole-directory cleanup; a dirty or invalid index is rebuilt from retained metadata                                                                | Upload/direct save: none; provider image actions: prompt/options and source bytes when applicable                                                             |
| Active mode text/enhancement, capture preferences, temporary portrait/garment                                        | Tab memory until reset/reload/unmount                                                                                                                                                                                                                              | Decart only after matching Start/Apply                                                                                                                        |
| Unsaved Outfit Builder image and directly uploaded/imported outfit recents                                           | Bounded tab memory until replacement, discard, reload, or tab close; final Save stores bytes locally                                                                                                                                                               | Import fetches the explicit public HTTPS origin; no Decart or image-provider transfer on Save                                                                 |
| Camera/microphone streams                                                                                            | Browser memory while live                                                                                                                                                                                                                                          | None in Local; Decart during explicit AI session                                                                                                              |
| Decart client credential/timing                                                                                      | Browser memory for the connection/session                                                                                                                                                                                                                          | Decart connection only                                                                                                                                        |
| Current converted original take, sidecar, processed result                                                           | Browser memory until Release/Discard/reload/crash/close; raw recorder input exists only during finalization                                                                                                                                                        | Sidecar only after explicit ElevenLabs Apply                                                                                                                  |
| Uploaded/recorded video, selected edit plan, latest healthy result                                                   | Browser tab memory until replacement, Release/Discard, reload/crash/close                                                                                                                                                                                          | Startup-selected visual provider receives synthetic-named media/recipe after visual submit; ElevenLabs receives only immutable source audio after voice Apply |
| Local video-edit draft, worker chunks, validated candidate                                                           | Browser memory only; chunks release on cancel/error, candidate releases after commit/discard/close, and no edit state survives reload                                                                                                                              | None; rendering and validation are provider-free                                                                                                              |
| Remote Builder/Character/VTO reference import URL and bytes                                                          | URL exists only in request memory; validated bytes return no-store and become a local `File`; Character Builder then persists the validated file through its ordinary local upload path                                                                            | Public HTTPS origin receives one bounded GET; a configured provider receives validated bytes only on a later explicit generation/submit, never the URL        |
| Active batch input/reference/output                                                                                  | Generated private paths under `LIGHTFRAME_DATA_DIR/.tmp/video-jobs`; one immutable deadline 60 minutes after acceptance covers active and ready jobs, with earlier cleanup on delivery/release/shutdown and a lease only for content admitted before expiry        | Decart or Pruna during explicit submit/status/content; local cleanup is not provider cancellation or provider-side deletion                                   |
| Saved/Browse voice criteria, pages, selection, and saved-state annotations                                           | React memory; at most 40 visited pages cached for five minutes in the current Voice workspace session                                                                                                                                                              | ElevenLabs metadata after explicit Saved/Browse access                                                                                                        |
| Voice provider metadata cache                                                                                        | Bounded API-process memory; shared pages/exact metadata up to five minutes, saved pages/membership up to 60 seconds; cleared by expiry/eviction/restart and invalidated by mutations                                                                               | None beyond the originating ElevenLabs metadata request                                                                                                       |
| Saved voice relationships                                                                                            | Owner-scoped app repository linking the seeded user to eligible provider voice IDs; relationship remains until explicit removal                                                                                                                                    | An initial save may add an eligible community voice to the provider workspace; removing the Lightframe relationship makes no provider-delete request          |
| Voice preview audio                                                                                                  | Bounded, short-lived Blob URL; revoked on replacement/unmount                                                                                                                                                                                                      | ElevenLabs preview request; never the take                                                                                                                    |

The backend has one configured demo account, process-memory sessions/revocation, and owner-scoped
file repositories; it has no signup, recovery, remote database, or cloud tenancy. Durable local
data includes saved-video aggregates and bytes, thumbnails, immutable references, saved-voice
relationships, and safe processing traces. Generated records include only the metadata needed for
review/use, safe provenance, hashes, and derivation lineage. Raw edit instructions are stored only
as a hash.

Credentials, internal storage keys/paths, task tokens, signed/polling URLs, source base64, and raw
provider payloads/errors are neither retained as product data nor returned to the browser.

Relative `LIGHTFRAME_DATA_DIR` values resolve from the repository root. To avoid silently
orphaning existing local assets, a pre-existing API-relative default remains selected when the
repository-root directory is absent; startup reports that compatibility choice at informational
level and never migrates or deletes the directory automatically.

## Explicit transfer boundaries

| Action                            | Recipient and data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/capabilities`           | Local broker configuration only; no provider request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Adjust/render local video         | No recipient; source frames/audio, draft, worker chunks, and candidate remain in browser memory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Upload/direct image save          | Local broker/store only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Start/Apply Character or VTO      | Decart receives live camera/microphone media and the complete applied recipe/reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Submit selected Character Swap    | Startup-selected Decart or Pruna receives a synthetic-named compatible video, normalized prompt/options, and validated reference when required. Pruna receives one reference, the editor-selected resolution, fixed seed/turbo/frame-rate/audio/safety options, an ephemeral locally prepared MP4 for MOV/WebM input, and only the app-owned instruction that transfers reference identity and worn wardrobe, replaces source-person clothing, and preserves source performance plus non-worn/held/interacted items; the browser supplies no creator prompt and the broker rejects tampered non-empty text before provider work. A non-canonical server-approved prior result is locally contain-fitted into a canonical temporary copy before any visual-provider submission; selecting no visual edit stays local |
| Submit selected Virtual Try-On    | Decart receives a synthetic-named compatible video, normalized prompt/options, and optional validated garment reference; Pruna is never contacted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Optimize/Re-optimize              | OpenAI receives the raw character direction and selected reference options; response storage is disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Generate/Combined/Regenerate/Edit | Startup-selected OpenAI/BFL/Wiro image provider receives the optimized or documented raw-fallback prompt plus the app-owned swap-ready staging instruction requiring one character on uniform neutral gray with no environment or unrelated props; composition/editing also receives the owner-scoped source. Wardrobe Change Features omits the parent prompt when a saved variant is the source. The default-off major-departure option also omits the parent prompt and explicitly permits identity and defining-trait changes. Existing uploaded/immutable images are not rewritten.                                                                                                                                                                                                                            |
| Generate Wardrobe Add Outfit      | Pruna receives the owner-scoped selected character image and one locally stored garment only after explicit Generate/Regenerate; the result is validated and stored locally before return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Open/filter Saved Voices          | ElevenLabs receives saved-library metadata/search requests; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Open/filter Browse Voices         | ElevenLabs receives authenticated shared-catalog metadata/search/filter/sort requests with custom rates excluded; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Add catalog voice                 | ElevenLabs receives the selected public owner ID, voice ID, provider-returned name, and bookmark request after a fresh eligibility lookup; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Remove saved voice relationship   | No provider request; Lightframe removes only the authenticated user's app-owned relationship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Preview voice                     | ElevenLabs preview request; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Apply ElevenLabs voice            | ElevenLabs receives only the immutable original audio sidecar, not video                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Import reference image URL        | Loopback broker fetches one explicit public HTTPS URL with DNS/redirect/byte/content controls for Character Builder, Outfit Builder, Character Swap, or VTO; the URL is not sent to an image/video provider                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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
- A take survives overlay closure, but not reload, crash, tab closure, or device restart. An
  explicit Save Video copies a validated final artifact into the owner-scoped filesystem store;
  it does not change temporary take cleanup.
- Saved Videos list metadata first. Video content and thumbnails are served only through
  authenticated owner checks. Video bytes begin loading only after explicit Preview, Studio, Edit,
  or Download intent. The centered Preview player uses the authenticated content response directly
  and detaches it on close without creating a retained object URL. Rename updates metadata; replace
  appends an immutable version; logical delete tombstones only the chosen record and never requires
  another source or derived record to be deleted first. A retained derived record keeps its
  historical lineage and remains usable after source deletion because unreferenced bytes remain
  retained until Phase 2—there is no seven-day quarantine or automatic physical garbage collection
  in Phase 1.
- Saved/Browse criteria and page caches are session/process memory only. A saved voice is an
  app-owned relationship. Removing it never calls provider voice deletion; an initial eligible
  community save may still add that voice to the configured provider workspace.
- A dirty local video edit and rendered candidate are session-only. Cancel/discard retains the
  pinned source; confirmed replacement retains only the new edited source and matching sidecar,
  then releases the worker candidate and superseded visual/voice layers.
- Uploaded workflow/job recovery is intentionally unsupported across reload, crash, tab closure, or
  broker restart. The broker purges its dedicated job temp root at startup and enforces one
  accepted-at-plus-60-minute deadline for active and ready jobs without requiring later browser
  activity. Delivery, explicit release, and shutdown may clean local state earlier.
- Retired Guided project records and their browser-local media are cleared when authenticated
  Studio initializes. This is an intentional local reset; those records do not become gallery
  videos and are not recoverable through Lightframe afterward.
- Recipe Dock portrait/garment files are tab-ephemeral.
- Outfit Builder files remain tab-ephemeral until final Save. Successful final Save uses the
  idempotent local reference-upload endpoint, then stores only the opaque asset ID in Recipe Shelf
  v6. Directly uploaded/imported recent outfits stay bounded and tab-only; successful prompt uses
  and explicitly saved image outfits may create persistent Recipe Shelf recents.
- Character Builder references are immutable local assets. Remove/Detach, draft reset,
  regeneration, stale-preview rejection, and character deletion remove relationships only; they do
  not delete bytes.
- Wardrobe Save stores normalized variant metadata and exact immutable source/result/garment IDs in
  Recipe Shelf v7. Cancel saves no variant metadata. Parent deletion removes all child variant
  metadata; individual variant deletion removes that record, a matching selected-version link,
  and its Recent attribution links. Both retain detached immutable image bytes.
- Clearing browser site data removes browser stores but not `LIGHTFRAME_DATA_DIR`.
- There is no ordinary per-asset server delete or relationship-safe garbage collector.

Operator controls:

- stop/close media and revoke camera/microphone permission in browser settings;
- reload/close to clear tab-only drafts, device preferences, and current takes;
- use Release/Discard for the current take and Saved Videos rename/delete controls for gallery
  records;
- use Logout to cancel/release authorized session work and clear the cookie; otherwise the cookie
  expires at its fixed 24-hour boundary and may survive browser closure;
- clear exact-origin site data for browser persistence;
- remove provider keys and restart to disable integrations; and
- remove a dedicated `LIGHTFRAME_DATA_DIR` only after resolving and reviewing the exact target.

## Video-job retention

When the broker accepts a video job and returns its first status, it sets one immutable deadline at
`acceptedAt + 60 minutes`. A service-owned timer enforces that deadline across active and ready
states; polling, retry, retrieval, and completion never extend it. Successful delivery, explicit
release, and broker shutdown may remove local job state earlier. A content stream admitted before
the deadline may finish after it; the broker does not admit a new content stream at or after the
deadline. Expired jobs retain only a safe process-memory tombstone so the same job ID cannot become
a second provider submission; output bytes and result metadata are removed.

Queued and processing provider reads use server-owned 2/3/5/8/10-second capped backoff, reset when
provider state changes. Rapid browser status requests receive cached state and a nullable next-poll
hint rather than multiplying upstream traffic. Cleanup is idempotent, waits for an admitted content
delivery lease, retries transient filesystem removal failures, retains pending cleanup work, and
logs at most one safe diagnostic containing only the application job ID after retries are
exhausted.

Expiry and earlier cleanup apply only to Lightframe's in-memory state and private temporary files.
They do not cancel a provider job and do not establish provider-side deletion.

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

ElevenLabs conversion request and provider-output media are spooled through a private temporary
directory with private files, not retained as complete request/output buffers in server memory.
The output is bounded and fully validated before the response stream opens. Abort, disconnect,
failure, and normal completion all remove the temporary directory.

## Server security scope

The API is a trusted local broker: it binds to loopback, rejects non-loopback Host values, requires
exact loopback Origin/Host for provider/reference mutations, requires explicit voice/video/wardrobe
intent for ElevenLabs, visual batch contact, Pruna try-on, and remote reference import, validates/bounds inputs and outputs, owner-scopes
references/jobs, and sanitizes errors. It has no public authentication or authorization.

Do not expose it through LAN binding, a tunnel, proxy, container ingress, or public hostname.
Accounts, remote persistence, public ingress, and tenancy remain deferred behind the
[remote-backend handoff](REMOTE_BACKEND_HANDOFF.md). Local Host hashes, paths, keys, device IDs,
provider IDs, and tokens are never future identity or ownership.
