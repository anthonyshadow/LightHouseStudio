# Privacy and temporary data

Lightframe Studio is local-first, not offline-only. Local capture and local Voice stay in the
browser. Provider transfer occurs only after an explicit provider action through the loopback
broker.

This document describes current runtime behavior and operator-controlled cleanup boundaries.

## Current data inventory

| Data                                                                                   | Current location and lifetime                                                                                                                                                                                                                                                                                                                                                                                                                                                              | External transfer                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Authenticated demo session                                                             | Host-only, HTTP-only, `SameSite=Strict` JWT cookie for at most 24 hours; safe snapshot in browser memory. Revocation is process-memory in `local`/`shadow` and durable in `neon`.                                                                                                                                                                                                                                                                                                          | Loopback API only; no provider receives auth data.                                                                      |
| Recipes, characters, outfits, wardrobe, and voice preferences                          | Sanitized/versioned owner-scoped IndexedDB records; a verified one-time migration removes the legacy `localStorage` value only after commit and re-read validation. In `neon`, revision-CAS sync copies the current canonical snapshot to PostgreSQL. Browser divergence pauses sync without overwrite.                                                                                                                                                                                    | None, except later explicit provider work.                                                                              |
| Character Builder draft/save journal                                                   | User-scoped IndexedDB until Reset, Save, site-data removal, or eviction; not cloud-synchronized.                                                                                                                                                                                                                                                                                                                                                                                           | Only after explicit optimization/image action.                                                                          |
| Saved videos, immutable versions, thumbnails, and attribution                          | Owner-scoped files/manifests in `local`; Drizzle rows plus registered local or private R2 bytes in `neon`; `shadow` retains local authority and may copy new video bytes to R2. Authoritative Neon/R2 direct uploads use an owner-scoped staged row for at most one hour and a protected bounded verification file; failed, cancelled, expired, or mismatched objects are aborted/deleted before readiness. Logical deletion retains detached local-only bytes pending approved GC policy. | None unless the operator later uses a loaded version in an explicit provider action.                                    |
| Uploaded/generated/edited/composed references                                          | Immutable owner-scoped local files in `local`. In authoritative `neon`, Drizzle/private-R2 may stage unsaved bytes; saved creative-library relationships retain them, explicit discard or relationship removal clears unreferenced assets, and a later library read/write purges unreferenced assets after 24 hours without metadata/content use.                                                                                                                                          | Upload/direct save: none; image-provider actions transfer required prompt/options/source bytes.                         |
| Active mode text, capture choices, unsaved portrait/garment, and direct-import recents | Bounded tab memory until reset, replacement, reload, or close.                                                                                                                                                                                                                                                                                                                                                                                                                             | Only after the matching explicit provider/import action.                                                                |
| Camera/microphone streams and Decart client state                                      | Browser memory while live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Decart only during explicit AI session; none in Local.                                                                  |
| Current take, sidecar, edit draft/chunks, and healthy result                           | Browser memory until replacement, Release/Discard, reload, crash, or close.                                                                                                                                                                                                                                                                                                                                                                                                                | Explicit visual submission or immutable source audio after Voice Apply.                                                 |
| Remote reference-import URL and bytes                                                  | URL only in request memory; validated no-store bytes become a local `File` before ordinary persistence.                                                                                                                                                                                                                                                                                                                                                                                    | The public HTTPS origin receives one bounded GET; a provider receives bytes only on later explicit work, never the URL. |
| Active batch input/reference/output                                                    | Private temporary paths with a fixed acceptance-plus-60-minute deadline. Neon may retain safe job state/provider correlation so an accepted submission can resume after restart; temporary bytes still do not survive startup.                                                                                                                                                                                                                                                             | Decart or Pruna during explicit submit/status/content.                                                                  |
| Optional OpenTelemetry traces                                                          | Disabled unless the explicit flag and OTLP endpoint are both set. Sampled spans contain trace/request correlation, bounded route/status, workflow kind, provider kind, attempt, and byte counts; the exporter strips full URLs/query strings, headers, prompts, credentials, presigned URLs, object keys, paths, bodies, and exception messages/stacks. Collector retention is operator-controlled.                                                                                        | Sent only to the configured OTLP/HTTP endpoint when enabled.                                                            |
| Saved/Browse voice state and API metadata cache                                        | Browser state plus bounded process cache (five minutes for shared/exact; 60 seconds for saved membership).                                                                                                                                                                                                                                                                                                                                                                                 | ElevenLabs metadata only after explicit Saved/Browse access.                                                            |
| Saved voice relationships                                                              | Owner-scoped file or Drizzle relationship until explicit removal.                                                                                                                                                                                                                                                                                                                                                                                                                          | Eligible save may add a community voice to the provider workspace; removal never requests provider deletion.            |
| Voice preview audio                                                                    | Short-lived Blob URL, revoked on replacement/unmount.                                                                                                                                                                                                                                                                                                                                                                                                                                      | ElevenLabs preview request; never the take.                                                                             |

The backend has one configured demo account and no signup, recovery, public tenancy, or public
deployment. Persistence is selected at startup: local files/process state, Neon shadow records, or
authoritative Neon plus registered local/private R2 bytes. Generated records retain only metadata
needed for use, safe provenance, checksums, and lineage. Raw edit instructions are stored only as a
hash.

Credentials, internal storage keys/paths, task tokens, signed/polling URLs, source base64, and raw
provider payloads/errors are neither retained as product data nor returned to the browser.

Relative `LIGHTFRAME_DATA_DIR` values resolve from the repository root. To avoid silently
orphaning existing local assets, a pre-existing API-relative default remains selected when the
repository-root directory is absent; startup reports that compatibility choice at informational
level and never migrates or deletes the directory automatically.

## Explicit transfer boundaries

| Action                            | Recipient and data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/capabilities`           | Local broker configuration only; no provider request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Adjust/render local video         | No recipient; source frames/audio, draft, worker chunks, and candidate remain in browser memory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Upload/direct image save          | Local broker/store only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Start/Apply Character or VTO      | Decart receives live camera/microphone media and the complete applied recipe/reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Submit selected Character Swap    | The explicitly selected configured Decart or Pruna binding receives a synthetic-named compatible video, normalized prompt/options, and validated reference when required. Pruna receives one reference, the editor-selected resolution, fixed seed/turbo/frame-rate/audio/safety options, an ephemeral locally prepared MP4 for MOV/WebM input, and only the app-owned instruction that transfers reference identity and worn wardrobe, replaces source-person clothing, and preserves source performance plus non-worn/held/interacted items; the browser supplies no creator prompt and the broker rejects tampered non-empty text before provider work. A non-canonical server-approved prior result is locally contain-fitted into a canonical temporary copy before any visual-provider submission; selecting no visual edit stays local |
| Submit selected Virtual Try-On    | Decart receives a synthetic-named compatible video, normalized prompt/options, and optional validated garment reference; Pruna is never contacted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Optimize/Re-optimize              | OpenAI receives the raw character direction and selected reference options; response storage is disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Generate/Combined/Regenerate/Edit | Startup-selected OpenAI/BFL/Wiro image provider receives the optimized or documented raw-fallback prompt plus the app-owned swap-ready staging instruction requiring one character on uniform neutral gray with no environment or unrelated props; composition/editing also receives the owner-scoped source. Wardrobe Change Features omits the parent prompt when a saved variant is the source. The default-off major-departure option also omits the parent prompt and explicitly permits identity and defining-trait changes. Existing uploaded/immutable images are not rewritten.                                                                                                                                                                                                                                                      |
| Generate Wardrobe Add Outfit      | Pruna receives the owner-scoped selected character image and one locally stored garment only after explicit Generate/Regenerate; the result is validated and stored locally before return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Open/filter Saved Voices          | ElevenLabs receives saved-library metadata/search requests; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Open/filter Browse Voices         | ElevenLabs receives authenticated shared-catalog metadata/search/filter/sort requests with custom rates excluded; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Add catalog voice                 | ElevenLabs receives the selected public owner ID, voice ID, provider-returned name, and bookmark request after a fresh eligibility lookup; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Remove saved voice relationship   | No provider request; Lightframe removes only the authenticated user's app-owned relationship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Preview voice                     | ElevenLabs preview request; no take                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Apply ElevenLabs voice            | ElevenLabs receives only the immutable original audio sidecar, not video                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Import reference image URL        | Loopback broker fetches one explicit public HTTPS URL with DNS/redirect/byte/content controls for Character Builder, Outfit Builder, Character Swap, or VTO; the URL is not sent to an image/video provider                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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
  explicit Save Video copies a validated final artifact into the configured owner-scoped byte store;
  it does not change temporary take cleanup.
- In authoritative Neon/R2, direct Saved Video transfer exposes only short-lived exact-part R2
  bearer URLs to the browser. They are neither persisted nor included in logs or traces. The API
  retains owner, declared type/size, filename, target lineage, opaque internal key, multipart ID,
  status, and expiry in the staged row. Completion downloads one protected temporary verification
  copy, checks the object and media, and removes that file in all outcomes. Part retries retransmit
  bytes only; provider generation, replacement, voice, and other potentially billable operations
  remain explicit and are never retried by this transfer path.
- Saved Videos list metadata first. Video content and thumbnails are served only through
  authenticated owner checks. Video bytes begin loading only after explicit Preview, Studio, Edit,
  or Download intent. The centered Preview player uses the authenticated content response directly
  and detaches it on close without creating a retained object URL. Version metadata may retain the
  attributed parent character name and optional exact Wardrobe variant name; filtering uses the
  parent name only. Rename updates metadata; replace
  appends an immutable version; delete tombstones only the chosen record and never requires another
  source or derived record to be deleted first. In local-only storage, detached video and thumbnail
  bytes remain retained pending whole-environment retirement. With private R2 selected, explicit
  user deletion rechecks the owner's remaining Saved Video relationships and physically deletes
  every unshared version and thumbnail object. The tombstone preserves lineage and makes an
  interrupted object deletion idempotently retryable; this is scoped manual cleanup, not blanket
  orphan garbage collection or an account-deletion/backup-expiry policy.
- Saved/Browse criteria and page caches are session/process memory only. A saved voice is an
  app-owned relationship. Removing it never calls provider voice deletion; an initial eligible
  community save may still add that voice to the configured provider workspace.
- A dirty local video edit and rendered candidate are session-only. Cancel/discard retains the
  pinned source; confirmed replacement retains only the new edited source and matching sidecar,
  then releases the worker candidate and superseded visual/voice layers.
- Browser recovery of an uploaded workflow remains unsupported across reload, crash, or tab close.
  With Neon, provider jobs that already have a durable provider job ID resume status/retrieval after
  broker restart without resubmission. An interrupted initial submission without a confirmed ID is
  marked ambiguous. Local mode still loses active jobs on restart. All modes purge temporary bytes
  and retain the accepted-at-plus-60-minute deadline.
- Recipe Dock portrait/garment files are tab-ephemeral.
- Outfit Builder files remain tab-ephemeral until final Save. Successful final Save uses the
  idempotent local reference-upload endpoint, then stores only the opaque asset ID in Recipe Shelf
  v7. In authoritative Neon/R2, a failed or cancelled final Save discards its unreferenced staged
  upload; the cloud creative-library relationship is the retention authority. Directly
  uploaded/imported recent outfits stay bounded and tab-only; successful prompt uses
  and explicitly saved image outfits may create persistent Recipe Shelf recents.
- Character Builder references are immutable assets. In authoritative Neon/R2, Remove/Detach,
  replacement, Reset Draft, confirmed draft discard, and stale-preview replacement request
  owner-scoped deletion; the server deletes only when no saved creative record references the
  asset. Ordinary close retains the resumable IndexedDB draft, and asset access refreshes its
  inactivity window. `local` mode retains its conservative whole-environment cleanup policy.
- Wardrobe Save stores normalized variant metadata and exact immutable source/result/garment IDs in
  Recipe Shelf v7. Cancel saves no variant metadata. Parent deletion removes all child variant
  metadata; individual variant deletion removes that record, a matching selected-version link,
  and its Recent attribution links. In authoritative Neon/R2, the creative-library CAS identifies
  source/result/garment IDs that lost their final saved relationship and deletes them after a
  second owner-scoped reference check. Local mode retains detached immutable bytes.
- Clearing browser site data removes browser stores but not `LIGHTFRAME_DATA_DIR`.
- `DELETE /api/reference-images/:assetId` is the trusted-origin discard path. It is idempotent and
  cannot delete an asset still referenced by a saved character, variant, outfit, or recent recipe.
  Unreferenced authoritative Neon/R2 rows inactive for 24 hours are retried by opportunistic
  cleanup during later cloud-library reads/writes; storage failures leave work retryable rather
  than weakening the saved-reference check.

Operator controls:

- stop/close media and revoke camera/microphone permission in browser settings;
- reload/close to clear tab-only drafts, device preferences, and current takes;
- use Release/Discard for the current take and Saved Videos rename/delete controls for gallery
  records;
- use Logout to cancel/release authorized session work and clear the cookie; otherwise the cookie
  expires at its fixed 24-hour boundary and may survive browser closure;
- clear exact-origin site data for browser persistence;
- remove provider keys and restart to disable integrations; and
- remove a dedicated `LIGHTFRAME_DATA_DIR` only after resolving and reviewing the exact target;
- use the cloud-persistence rollback procedure before changing or removing Neon/R2 data.

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
Real accounts, remote operation, public ingress, and tenancy remain deferred behind the
[remote-backend handoff](REMOTE_BACKEND_HANDOFF.md). Configuration-gated Neon/R2 persistence does
not alter that boundary. Local Host hashes, paths, keys, device IDs, provider IDs, and tokens are
never identity or ownership.
