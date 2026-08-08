# Architecture and ownership

Lightframe Studio is a TypeScript workspace with a React browser app, a loopback Fastify broker,
pure domain rules, and runtime API contracts. Its design is local-first and single-operator.

## Dependency boundaries

| Boundary                      | Owns                                                              | Must not own                                 |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `packages/domain`             | Pure session, prompt, asset, recording, and voice policy          | React, browser APIs, HTTP, provider payloads |
| `packages/contracts`          | Zod HTTP schemas and app-owned request/response types             | Secrets or raw provider types                |
| `apps/web/src/features`       | Capability-focused presentation and local view models             | Permanent credentials or server persistence  |
| `apps/web/src/orchestration`  | Async lifecycles, policy sequencing, and resource handoff         | Raw provider assumptions                     |
| `apps/web/src/adapters`       | Browser APIs, same-origin API calls, Decart SDK, audio processing | Product policy                               |
| `apps/api/src/features`       | Route validation and application services                         | Browser state or account data                |
| `apps/api/src/providers`      | Decart, OpenAI, BFL, Wiro, and ElevenLabs protocols               | UI state or unsafe upstream errors           |
| `apps/api/src/http`           | Loopback/origin checks, safe errors, and streaming lifetime       | Provider-specific policy                     |
| `apps/api/src/infrastructure` | Drizzle/Neon repositories and persistence composition             | UI/product policy or browser state           |
| `apps/api/src/storage`        | Local/R2 byte adapters and media-asset lifecycle                  | Feature-specific ownership decisions         |

Imports point inward toward domain rules and contracts. The web app does not import API
implementation code, and the API does not know about React.

## Authentication and ownership

Phase 1 has one configured, server-seeded local user. The API verifies the Argon2id password hash
and issues a session-specific HS256 JWT in a host-only, HTTP-only, `SameSite=Strict` cookie. The
cookie has a 24-hour `Max-Age`, so a healthy session can be restored after browser closure. JWT
issuer, audience, subject, expiry, ID, and user status are checked on each private request. In
`local` mode, revocation state is process-memory and a broker restart invalidates sessions. In
`neon` mode, session and revocation records are durable; `shadow` keeps local auth behavior.

The API uses a deny-by-default `/api/*` authentication hook with a small exact public allowlist.
State-changing cookie-authenticated routes also require the exact trusted Origin. `ownerUserId`
comes only from the verified JWT subject; browser bodies, queries, multipart fields, Host hashes,
provider IDs, storage paths, and device IDs cannot choose ownership. The legacy Host-hash namespace
is accepted only by the idempotent reference-asset claim migration into the stable seeded user.

The browser keeps the authenticated session snapshot in React memory and restores it through
`GET /api/auth/me`; it never reads or stores the cookie/JWT. A centralized cleanup coordinator
blocks logout during non-discardable work, confirms discardable work, cancels temporary work,
releases media, calls the idempotent logout endpoint, clears user caches, and returns to `/`.
Development may fetch the configured demo login and password prefill from the loopback-only
demo-config endpoint. Production never returns that prefill and rejects the checked development
JWT secret and password hash.

## Studio composition

`AppRouter.tsx` is the browser URL boundary. React Router's data browser router renders the
provider-free entry at `/` and protects the lazy Studio route family: `/studio`,
`/studio/videos`, `/studio/characters`, and `/studio/outfits`. The data-router form is required for
route blocking. Route metadata, focus handoff, and loading/error surfaces remain router-owned;
unknown paths return to `/`. All Studio children render the same `StudioApp` instance so moving
between a workspace and its libraries preserves the one media stage and active controller state.

The entry does not mount `StudioApp`, request capabilities, acquire media, load Decart, open a
WebSocket, or contact a provider. `StudioApp.tsx` remains the sole runtime composition boundary.
There is no second product shell, media session, global client store, or provider client.

Studio initializes the session draft in Local Camera mode and the media lifecycle at `idle`.
Entry intent may open the upload panel, but it never starts camera, microphone, AI, or provider
work. The control-bar **Record New Video** action and upload-panel **Record a local video** action
both explicitly acquire local media and mark the finalized local artifact for adoption by the
existing-video editor. Dock-started local preview and Character/VTO starts retain the advanced
live-session and Latest Take paths; post-recording workflow state is not mixed into provider
session orchestration.

The mounted Studio owns focused controllers for:

- local/realtime media and per-mode drafts;
- recording, review, and voice processing;
- existing-video selection, local inspection, and one mutually exclusive batch transformation;
- Character Builder, Outfit Builder, Prompt Workshop, and Recipe Shelf handoff;
- Saved Videos, Saved Characters, and Saved Outfits library presentation and handoff;
- account navigation and ordered logout cleanup;
- overlays and route-owned workspace presentation.

`MediaStage` stays mounted once and owns one `<video>` element. A discriminated presentation state
switches among idle, live, finalizing, and playback. Live media uses `srcObject`; playback uses
`src`. Opening or closing a tool must not replace the player, restart media, alter playback time,
or create a second take player. One scoped exception is the **Use existing video** panel's inline
source/result `<video>`. A second scoped exception is the Saved Videos thumbnail Preview:
it mounts one authenticated content player only while its centered dialog is open, owns no tracks,
object URL, media/provider session, recording, or finalization, and detaches `src` on close or
unmount. The existing-video player borrows a controller-owned artifact URL and likewise detaches
listeners and `src` on replacement or unmount.
The recording-artifact owner may repair one stale playback URL from its retained Blob after a media
error. `MediaStage` reports the error but never creates or owns the replacement URL.
Original/Result comparison drives both this inline player and the stage.

Local video editing extends the same stage through an optional presentation contract; it does not
introduce another media node or URL owner. The contract supplies the normalized draft, playback
bounds, playhead updates, and crop callbacks. A lazily mounted WebGL canvas renders the composed
preview above the authoritative video. **Before** temporarily removes that canvas without seeking
or mutating history. Crop mode instead draws the full rotated source and a keyboard/pointer crop
overlay. The shared color shader is framework-independent and is reused by the export worker.

The standard Studio workspace uses that same persistent stage for both landscape and portrait
capture. At large desktop widths it is centered between the existing creative-tool rail and the
session/device region; tablet and mobile stack those same regions below it. The session control
bar is an in-flow sibling immediately below the bounded video frame, so Record, Stop, and take
actions never cover the video or compete with native playback chrome. This is a presentation-only
reflow: it does not duplicate controls, media nodes, controller state, or capture ownership.
New phone and tablet sessions start with the local 9:16 format; desktop sessions start with 16:9.
That viewport-sensitive choice is only the initial session value. The explicit format controls in
Capture Settings can switch either way and are never overwritten by a later viewport resize.
At the desktop breakpoint, the right-side session/device region renders the single Capture
Settings form inline. Below that breakpoint the inline form unmounts and the same controller is
presented through the shared overlay; the compact capture strip is the launcher. A breakpoint
change never leaves two mounted settings forms. Capture choices auto-apply, device discovery runs
on mount and `devicechange`, and failed live replacement restores the last applied draft while
preserving the visible safe error. There are no manual Apply, Refresh, or Discard actions.

`video-edit` is a Studio-owned workspace mode rather than an overlay. It replaces the capture/tool
regions while active: desktop uses categories / persistent stage / named-scroll settings columns;
tablet and mobile use stage / horizontal category strip / bounded settings rows. The settings
footer remains sticky and safe-area-aware. `useVideoEditSession` is the sole owner of the pinned
source, baseline, draft, 50-entry grouped history, generation, candidate, and worker cancellation.

At the existing `64rem` desktop breakpoint, the header has no AI selection control. The
creative-tool rail owns **Select Character**, **Select Outfit**, then **Workshop** as three ordered
preparation actions. The header contains only the brand plus mutually exclusive integration and
account popovers, with the account trigger anchored at the far right. Below the desktop breakpoint
the four-button bottom tool row remains Dock, Take, Workshop, and Shelf: Dock owns direct
Character/VTO recipe preparation, while Shelf owns saved character/outfit selection and builder
entry. These responsive presentations share the same overlay controller, recipe handoff, activity
locks, and return-focus behavior. They never mount duplicate stateful selectors or start
media/provider work.

All tools use the shared `OverlayPanel` portal. It owns focus trap, inert background, Escape,
topmost dismissal, scroll lock, transition-safe backdrop behavior, and return focus. The portal
follows the active browser fullscreen element. In stage fullscreen, the existing media stage fills
the viewport and the creative-tool and session/device regions are hidden; the stage control bar
remains beneath the video frame. A panel triggered from the stage still renders above the
full-screen video. Each overlay has one named internal scroll region; the document does not scroll.
Character Builder is fullscreen and uses one preview/generation DOM.
Narrow screens reveal that same region through **Review & Generate** instead of duplicating
stateful controls.

`StudioExitGuard` blocks navigation leaving `/studio` while recording, finalization, or local video
render/validation is active. A temporary take, active Voice process, dirty video-edit draft, or
dirty Shelf or Outfit Builder form requires confirmed discard before the route proceeds. Rendering
must be cancelled before discard; navigation cannot abandon the worker. Hard unload receives the
matching browser warning, while future navigation among `/studio/*` children is deliberately
exempt so a shared runtime layout can remain mounted.

The shell is viewport-bound with safe-area padding and deliberate support for `1440×960`,
`1280×720`, `834×1112`, `390×844`, and `320×568`. The stage, responsive tool/session regions, and
primary actions must remain reachable at short heights, touch sizes, and 200% text. Stage notices
overlay the video frame rather than changing its geometry.

## Session lifecycle

`useStudioSession` coordinates the session; pure domain rules decide valid modes and transitions.
The three modes are Local, `lucy-latest`, and pinned `lucy-vton-latest`.

1. The user edits a mode-specific in-memory draft. Text and enhancement survive mode switches;
   every departing reference relationship is cleared, and owned object URLs are revoked.
2. Model input is validated before camera, token, SDK, or provider work. Local needs no provider
   input.
3. Explicit Start acquires or reuses local media. Replacement media commits only after the new
   stream is healthy; the old owned stream remains valid on failure.
4. For AI modes, the browser requests a short-lived model/origin-scoped credential from the
   loopback broker, then lazily loads Decart.
5. The Decart adapter connects a clone of the local input. Local preview remains independently
   owned until transformed video is usable.
6. Start and Apply send one complete prompt/reference/enhancement snapshot. `image: null` clears
   provider image state. The last successful snapshot is the applied state; later edits remain
   pending until Apply. Revert restores it.
7. Stop and Reset invalidate the operation generation, abort where supported, disconnect provider
   resources, dispose late results, and remove listeners. Reset replaces the whole mode draft and
   clears prompt, enhancement, reference, and applied state.

The active-session clock begins only after a healthy AI connection commits. Provider ticks may
move its display forward but cannot reset it. At the app boundary, an active recording finalizes
before AI/local resources release; otherwise Studio returns to local preview with the working
draft preserved.

Capture preferences are tab-memory state, not recipe data. Device enumeration does not request
permission and device IDs are not persisted. Local format is an app-owned 16:9 or 9:16 choice:
orchestration swaps the selected quality profile's width/height, the browser adapter constrains
the camera aspect, and the persistent stage follows the applied format. Recording continues to
borrow that same negotiated source track. Apply during local preview performs atomic stream
replacement. Source changes are blocked while AI or recording owns the source. Facing-mode and
track zoom controls appear only when the active camera exposes those capabilities.

## Character and recipe ownership

Character Builder exclusively owns character create/edit, its resumable IndexedDB draft,
reference upload, prompt optimization, image generation/edit/composition, durable save journal,
and Shelf persistence. Its completion handoff is destination-specific: general Studio entry
atomically preloads the Lucy Dock, while uploaded-video entry hydrates and selects the saved
character in the originating unsubmitted Character Swap step. For an editable-prompt binding, a
saved character with a reference hydrates only that image and a prompt-only character copies its
prompt. For a server-default binding such as Pruna, only image-backed choices are offered and the
step prompt is always empty.

New character reference generation uses one provider-neutral swap-ready staging profile. The
browser removes the background chooser, normalizes restored legacy draft options to neutral gray,
and normalizes options again before each generation request. The broker independently forces
neutral gray for optimize, generate, edit, and composition routes, while the final provider prompt
requires one centered character, even lighting, no scene/depth cues, and no unrelated props.
Existing uploaded or immutable references are not rewritten.

Prompt Workshop owns only Add, Replace, and Restyle structured object recipes. Recipe Shelf owns
saved/recent/character metadata and atomic reuse. Neither owns Character generation or a media
session.

Saved Character Wardrobe extends that repository with normalized version metadata, not another
character store. Each variant points to one parent and one immutable result asset. A pure resolver
turns `{ characterId, variantId }` into the ordinary character prompt, label, and exact image ID
used by Studio and Existing Video. The original remains the default; only successful hydration/use
persists a different selected version and updates exact parent/variant usage attribution. Parent
deletion cascades variant metadata and Recent links. Individual variant deletion resets a matching
selected-version link and detaches Recent attribution for that version. Retained image bytes follow
the existing immutable-asset policy. Wardrobe owns no media node or provider client.

Each character may also retain one nullable ElevenLabs voice preference containing only the opaque
voice ID and display name. Wardrobe loads the existing Voice library only after explicit voice
configuration. Selecting that character/version in Existing Video copies the preference into the
tab-local edit plan; the ordinary Voice workspace remains authoritative for manual override and
provider membership is revalidated only when processing starts. Creating a new character from a
saved character hydrates the source into a new Builder create target rather than updating the
source ID.

Wardrobe **Add Outfit** is an independent optional Pruna operation. Its garment may be an explicit
upload/import or an existing image-backed saved outfit; prompt-only outfits remain editor recipes
and are not treated as garment images. The server uploads the owner-scoped person and one garment,
submits one pinned `p-image-try-on` prediction, polls bounded
starting/processing states, downloads through the authenticated allowlisted delivery path,
validates decoded output, and stores a flexible-dimension derived asset before returning. Browser
abort stops local polling but is not described as provider cancellation or deletion. **Change
Features** remains an edit through the startup-selected OpenAI/BFL/Wiro adapter with prompt
optimization disabled. Original-source edits include the parent character prompt. Variant-source
edits use the selected immutable image as authoritative through the image-only edit contract, so
the parent prompt is absent from both the browser request and provider prompt. Every saved result
still points directly to the original parent character as a sibling Wardrobe variant. The
default-off major-departure option also selects the image-only contract for an original source and
adds explicit server-owned prompt policy allowing identity and other defining traits to change.

Outfit Builder exclusively owns reusable VTO recipe creation, edit, copy, naming, prompt/image mode
exclusion, prompt enhancement, temporary reference files, and idempotent final-save upload. It
uses the same validated JPEG/PNG/WebP picker and explicit public-HTTPS importer as the
existing-video Character Swap/VTO reference fields. New outfits are prompt-or-image; migrated combined prompt/reference outfits remain usable and
editable. Selector-originated Save creates and selects the recipe without acquiring media,
loading Decart, or contacting a provider. Shelf edit updates the existing ID; Save a copy creates a
new ID. Recipe Shelf remains the metadata repository and immutable reference storage remains the
local broker's responsibility.

Character references follow these rules:

- JPEG, PNG, and WebP uploads are validated before storage.
- Upload and prompt-only Save do not contact an image provider.
- A stale generated preview may remain visible but cannot be attached to Save.
- Optimization failure may continue with the raw direction and an explicit warning.
- Image-provider failure never triggers fallback or automatic billable resubmission.
- Generation uses one startup-selected provider: OpenAI, BFL, or Wiro.
- Generated, edited, and composed assets are immutable; new work creates a child asset.
- Handoff commits prompt, reference bytes, provenance, and enhancement as one validated state.

## Recording, review, and voice

Recording composes a new stream from borrowed live tracks:

| Session                 | Video             | Audio                                                |
| ----------------------- | ----------------- | ---------------------------------------------------- |
| Local                   | Local camera      | Local microphone when present                        |
| AI before usable output | Not recordable    | Not applicable                                       |
| AI with usable output   | Transformed video | Provider audio when live, otherwise local microphone |

The chosen track identities and take metadata are pinned at Start. Recording never owns or stops
source tracks.

For the primary record flow, a healthy normalized local artifact is adopted by the existing-video
workflow after finalization and the editor reopens with Character Swap, Virtual Try On, and Voice.
For Dock-started local and live AI recordings, the existing Latest Take review remains
authoritative. Both paths borrow the same stage-owned recording lifecycle and preserve its
cleanup ordering.

Recording orchestration owns the `MediaRecorder` instances, chunks, optional audio sidecar,
warning/cap timer, MediaBunny conversion, and finalization:

- warn accessibly at 270 seconds;
- route the 300-second cap and manual Stop through one coalesced path;
- settle final recorder data and the optional sidecar before releasing live resources;
- force the settled main video through an on-device H.264/AAC MP4 conversion;
- publish only the converted MP4, never the raw recorder container, even when the sidecar fails;
- cancel conversion and withhold the download artifact if ownership ends or a required track would
  be dropped; and
- release local/provider resources only after finalization settles.

MediaBunny uses the browser's AVC/H.264 WebCodecs encoder and its official AAC encoder extension
when native AAC encoding is unavailable. The conversion keeps the raw recorder Blob private to
finalization and creates the artifact URL only after a complete MP4 exists. Review, Voice, and
Download therefore remain unavailable while transcoding.

Recorded and uploaded media publish through one artifact boundary:

`immutable source → latest healthy result`.

An edited export crosses that boundary only after worker completion, browser-local decode and
track validation, and a three-action replacement confirmation. The dedicated module worker lazily
loads MediaBunny and its AAC extension, uses `Conversion` for trim/baked rotation/crop and
H.264/AAC encoding, and runs the shared WebGL shader after geometric transforms for flips, filters,
and lighting. Its `StreamTarget` writes into offset-aware 4 MiB blocks with a 300,000,000-byte
maximum; cancellation and failure release all blocks. There is no synchronous main-thread export
fallback. The preview creates one renderer for a stable canvas/media/geometry binding and sends
crop, filter, and lighting changes through shader uniforms; those edits do not churn WebGL
contexts. Partial shader/program setup is unwound, the worker disposes partially initialized
resources on every exit, and feature probes explicitly release their temporary context.

Validation requires non-empty playable H.264/AAC MP4 output, expected primary tracks, exact even
dimensions and orientation, duration within 500 ms, and a newly extracted immutable audio sidecar
when the pinned source has audio. A confirmed controller transaction publishes an `edited` child
with `parentArtifactId`, updates selected-video metadata and compatibility, then releases
superseded source/visual/voice URLs. Failure before publication leaves the prior source and draft
intact. Provider compatibility is derived from edited output geometry; only 16:9 and 9:16 within
the existing 1% tolerance can create Character Swap or VTO intent, while Voice and Download remain
available for uploaded or edited sources at other ratios.

The finalized or validated source replaces live media on the same persistent stage. The artifact
owner creates and revokes every source/visual/voice URL. Changing source invalidates downstream
layers. During a combined edit, the transcoded visual is staged privately while voice conversion
runs; only the healthy voiced result is published. If Voice fails or is canceled, the healthy
visual is then published for comparison and retry. The combined plan is not reported complete
before the voiced result commits. A Voice retry after visual success continues from the retained
visual, not the original frame source. Every Voice treatment reads immutable source audio and
remuxes it onto the explicitly selected Original or Result video. Existing-video comparison
selects the immutable source or latest result without changing artifact ownership. The controller
retains inspected metadata for both layers, so comparison, local editing, provider compatibility,
and iterative result editing use the dimensions of the artifact actually selected. Its
source-preserving Start over revokes the latest result, retains the source, and returns
presentation to that source. Every artifact has a UUID, app-owned name, creation time, kind, and
parent lineage; generated filenames include the operation, UTC timestamp, and UUID suffix.

The lazy ElevenLabs library keeps independent Saved and Browse criteria, pagination, error, and
cache state inside the existing Voice workspace. Browse uses authenticated `/v1/shared-voices`
server-side search/filter/sort with fixed 20-item pages. The adapter always sends
`include_custom_rates=false`, then fails closed unless the exact shared response fields satisfy
`rate === 1` and `free_users_allowed === true`; authenticated visibility is the account-plan
entitlement check. `available_for_tiers` and interface labels are not eligibility inputs. Add
re-fetches the exact `public_owner_id`/`voice_id` candidate before an idempotent provider bookmark
when needed, then writes an app-owned user/voice relationship. The first explicit Saved read may
claim eligible provider-workspace memberships for the seeded user. Remove deletes only the
Lightframe relationship; it never calls the ElevenLabs voice-delete API. Preview and conversion
fail closed unless the authenticated user owns the relationship.

Saved search continues through `/v2/voices?voice_type=saved`. Search runs upstream, while exact
language, gender, age, accent, use-case, and descriptive matching incrementally aggregates cached
provider cursor pages behind an app-owned opaque cursor. Server metadata caches are bounded to
five minutes/60 shared entries and 60 seconds/40 saved entries; identical in-flight reads share
work, failures and aborts are not cached, and mutations invalidate saved membership/pages. The
browser keeps at most 40 visited pages for five minutes, debounces three-character text search for
300 ms, aborts superseded requests, and guards against late response commits.

The existing-video controller uses Mediabunny plus browser decode confirmation for an early check.
The API streams bytes to generated private paths and performs authoritative
container/track/codec/duration/aspect/size inspection before visual-provider contact. One app job
runs at a time. An uploaded workflow can switch its single active choice between Character Swap
and VTO before submission, and only that active operation is submitted. Browser and HTTP contracts
use `character-swap` and `virtual-try-on`; Lucy model identifiers remain inside Decart/live and
saved-recipe mappings.

Before the potentially billable `PUT`, the browser creates one operation UUID in `submitting`
state. A valid success response advances it to `accepted`; an aborted, malformed, or lost success
response advances it to `acceptance-unknown` without changing the UUID. Both accepted states lock
resubmission controls. Recovery performs `GET` for that exact UUID and never repeats `PUT`; only a
confirmed not-found response unlocks a new explicit submission with a new UUID. A valid submission
response is passed directly into polling, avoiding a redundant immediate status read.

Startup configuration selects the existing-video Character Swap provider through one centralized
factory. The default Decart binding keeps its exact Lucy endpoint, multipart fields, fixed 720p
output, and retry behavior. The Pruna binding is Character Swap only: it requires one reference,
requires H.264 MP4 submission input, disables prompt enhancement, pins `p-video-replace`, and
advertises the documented approximate 1 MP (`720p`) and 2 MP (`1080p`) output classes through the
provider-neutral capabilities contract. The editor stores one resolution on the visual step and
the broker validates it against that operation binding before passing it to Pruna. Its prediction
input also pins `seed=0`, `turbo=false`, `target_fps=original`, `save_audio=true`,
`ignore_audio=false`, and `disable_safety_checker=true`. Its capability advertises
`promptInput=server-default`: the browser renders no prompt/enhancement controls and submits an
empty prompt, the broker rejects non-empty prompt text before provider work, and the adapter always
uses the app-owned Pruna replacement instruction. Reference image 1 is
authoritative for facial identity, body, hair, wardrobe, costume, clothing, footwear, and worn
accessories. Source-person clothing is replaced and must not transfer onto the reference character.
The source supplies expression, lip sync, gaze, pose, hand placement, gestures, movement, timing,
and blocking. Every non-worn object and item the source person holds, carries, touches, picks up,
puts down, or otherwise interacts with retains its appearance, visibility, position, motion,
contact, occlusion, and interaction timing. Every other non-character scene/audio property is kept.
Its server-only sizing policy records
content-free informational metadata for non-canonical dimensions and continues with the inspected
result; Decart keeps exact canonical 720p validation. When a server-approved result is selected as
the next frame source, a non-canonical result is fitted locally inside the smallest canonical
16:9/9:16 canvas at explicit Start. That ephemeral H.264 MP4 copy is revalidated before upload;
the retained result is never cropped, stretched, or replaced. Virtual Try-On always resolves
independently to Decart. The shared
server provider contract normalizes submit, queued/processing/completed/failed status, opaque
output location, bounded download, retryable failure classification, output resolution, and
safe failure data. Environment reads do not enter UI or orchestration.

The broker owns upstream polling cadence. Stable queued/processing states back off through
2/3/5/8/10-second intervals, reset to two seconds when state changes, and expose a nullable
`nextPollAfterMs` hint. Rapid browser reads return cached app state without another provider
request. The job registry uses a job map, owner-to-active-job index, and generation-token deadline
min-heap; matching replays of the same owner/job UUID coalesce while a different fingerprint for
that UUID fails safely. Temporary cleanup is idempotent, protects active delivery leases, retries
transient removal failures, retains pending cleanup state, and emits at most one safe job-ID-only
diagnostic when retries are exhausted.

`GET /api/capabilities` exposes availability, `none | h264-mp4` input preparation,
`optional | required` reference policy, `editable | server-default` prompt ownership,
prompt-enhancement support, and terminal-failure release
ownership per operation. It exposes no batch model/provider name. When H.264 MP4 preparation is required, the browser converts MOV/WebM at
explicit Start, revalidates the ephemeral Blob, submits it, and leaves the immutable source and
audio sidecar unchanged. MP4 remains pass-through unless iterative result editing needs the
canonical contain-fit preparation above. Downloaded metadata is compared with the server-approved
result rather than a browser-hard-coded 720p size.
VTO recipes carry an explicit batch input discriminator for saved/recent outfit, direct reference
image, or prompt. Saved and recent recipe records separately persist `vtonInputKind` as `prompt` or
`saved-outfit` plus `enhancePrompt`; image-only records are valid only with an opaque persisted
reference ID. Prompt recipes restore Prompt mode and enhancement. Saved-image and migrated combined
recipes restore Saved outfit mode with enhancement off. An explicit Character Builder, Outfit
Builder, Character Swap, or VTO remote reference import goes through the loopback API with its own
`reference-image-import` intent: HTTPS-only URL parsing,
credential/private/mixed-address rejection, per-hop DNS pinning, bounded redirects/bytes,
JPEG/PNG/WebP header and decoded-content validation, cancellation, no-store bytes, and sanitized
errors. The URL is neither persisted nor forwarded to a visual provider.

## Persistence

| Store                       | Data                                                                                                                                       | Lifetime and trust boundary                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe Shelf `localStorage` | User-namespaced v7 prompt, character, outfit, wardrobe metadata, voice preferences, and opaque asset IDs                                   | Immediate schema-validated browser cache. In `neon`, a complete snapshot synchronizes through an owner-derived revision CAS; divergence pauses sync and preserves the browser copy. Never stores bytes or credentials.                                                                                                                             |
| Character Builder IndexedDB | User-scoped resumable draft and save journal                                                                                               | Compare-and-swap autosave prevents duplicate save/preload after retry or reload. Drafts remain device-local.                                                                                                                                                                                                                                       |
| Local persistence           | Saved-video aggregates/versions, thumbnails, references, saved voices, and safe processing traces                                          | Default `local` mode under `LIGHTFRAME_DATA_DIR`; atomic publication, checksums, idempotent receipts, and owner checks remain supported. Sessions are process-memory.                                                                                                                                                                              |
| Neon PostgreSQL             | Users/credentials, sessions, videos/versions/receipts, voices, references, creative records, jobs, media lifecycle, references, and outbox | `shadow` records safe jobs while files remain authoritative. `neon` makes injected Drizzle repositories authoritative. Transactions protect version append and creative revision replacement; saved creative rows are the retention authority for reference assets.                                                                                |
| Cloudflare R2               | Private video, thumbnail, and reference bytes selected through `AssetByteStore`                                                            | Opaque app keys, server-mediated range reads, SHA-256 verification, multipart abort, and database pending/ready/deleting/deleted states. Unsaved reference bytes may be staged, but owner-scoped discard and 24-hour inactive-orphan cleanup delete only after a saved-relationship recheck. The bucket and credentials are never browser-visible. |
| Session memory              | Auth snapshot, streams, tokens, files, direct-import outfit recents, device IDs, takes, and sidecars                                       | JWT remains only in the HTTP-only cookie; other state is cleaned on auth change, replacement, release/discard, unmount, or tab close as applicable.                                                                                                                                                                                                |
| Video-job temp root         | Streamed input/reference and inspected provider output                                                                                     | Process-temporary. Accepted provider jobs can resume status/retrieval from Neon after restart, but input is purged and an unconfirmed submission is never repeated. The fixed accepted-at-plus-60-minute deadline remains authoritative.                                                                                                           |

Browser storage is untrusted, schema-migrated, and user-namespaced. Opaque IDs, provenance, and
timestamps are preserved. The filesystem store uses atomic publication and never exposes internal paths,
provider URLs, credentials, or raw payloads. Local reference storage conservatively retains
detached assets. Authoritative Neon/R2 derives the complete saved reference set from canonical
creative-library rows. The trusted-origin discard route and creative-library replacement cleanup
delete only owner-scoped assets absent from that set; metadata/content access refreshes temporary
activity, and later library reads/writes purge unreferenced assets inactive for 24 hours. Reference lookup uses versioned
owner/request transaction mappings plus a versioned, atomically replaced derived index. A clean
startup reads that index once rather than reading every asset metadata and mapping file. A missing,
schema-invalid, or dirty index triggers the conservative legacy scan, mapping repair, and index
rebuild; a dirty marker is published before an asset commit and removed only after the replacement
index is durable. Ordinary new reads and misses do not rescan the asset directory. The repository
contract distinguishes a missing asset from a backend that cannot return a streamable local file:
only the latter may fall back to buffered content, so a miss performs one storage lookup.

The retired Guided repository and compatibility presentation were removed after the one-time local
reset period. No current code lists, imports, downloads, promotes, or hydrates those records. New
saved media is written only through the authenticated server Saved Video service.

See [privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) for the user-facing data contract.

The broker assigns one immutable deadline when it accepts a job: `acceptedAt + 60 minutes`. That
same deadline covers validating, submitting, queued, processing, retrieving, and ready states;
status reads, retries, and the transition to ready never extend it. A service-owned nearest-deadline
timer enforces expiry without requiring another request, preserves an expired in-memory tombstone,
and guards late provider work from restoring state or bytes. Successful delivery, explicit release,
or broker shutdown may delete local state earlier. A content stream admitted before the deadline
may finish after it, but no new content stream may start at or after the deadline. This is local
lifecycle cleanup only, not provider cancellation or provider-side deletion. Pruna uploads expire
after approximately 30 minutes and generated delivery content is typically available for 24 hours;
no documented Pruna cancellation/deletion endpoint is treated as part of local cleanup.
Pruna terminal failures remain visible through their safe app-owned status until explicit user
discard/replacement or the fixed deadline; browser polling does not issue an automatic DELETE.

## Backend boundary

Fastify binds to `127.0.0.1`, rejects non-loopback Host headers, and requires exact loopback Origin
checks for provider or reference mutations. Browsers may omit `Origin` on same-origin `GET`
requests, so provider reads accept an exact loopback `Origin` or referrer, or browser
`Sec-Fetch-Site: same-origin`; their explicit provider-intent header remains mandatory. ElevenLabs
provider-contact routes require `X-Lightframe-Provider-Intent: voice`; visual batch routes require
`X-Lightframe-Provider-Intent: video`; remote reference import requires
`X-Lightframe-Provider-Intent: reference-image-import`; Pruna Wardrobe generation requires the
independent `X-Lightframe-Provider-Intent: wardrobe`. Responses are `no-store`.

Permanent keys remain in server environment memory. App-owned schemas validate every HTTP
boundary. Provider adapters normalize upstream data into allowlisted safe codes; raw messages,
bodies, URLs, prompts, credentials, causes, and arbitrary codes never reach clients or logs.

Wiro availability follows the startup-selected reference provider and its required server-only
credentials. There is no separate runtime access-mode layer. Missing configuration disables only that
provider path and never causes provider fallback.

| Boundary                    | Routes                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication              | `GET /api/auth/demo-config`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`                                                                                                                                                                                                                                                   |
| Local status                | `GET /api/health`, authenticated `GET /api/capabilities`                                                                                                                                                                                                                                                                                           |
| Decart                      | `POST /api/realtime-token`                                                                                                                                                                                                                                                                                                                         |
| Existing-video processing   | `PUT /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId/content`, `DELETE /api/video-jobs/:jobId`                                                                                                                                                                                                                  |
| Saved videos                | `POST/GET /api/videos`, `GET/PATCH/DELETE /api/videos/:videoId`, `POST /api/videos/:videoId/versions`, owner-checked current/version content, and optional thumbnail upload/content                                                                                                                                                                |
| Creative library            | `GET/PUT /api/creative-library` with an owner-derived revision compare-and-swap when Neon is authoritative                                                                                                                                                                                                                                         |
| Reference optimization/work | `POST /api/reference-images/optimize`, `POST /api/reference-images`, `POST /api/reference-images/import`, `POST /api/reference-images/:sourceAssetId/edits`, `POST /api/reference-images/:sourceAssetId/compositions`, `POST /api/reference-images/:sourceAssetId/outfit-try-ons`                                                                  |
| Reference asset lifecycle   | `POST /api/reference-images/uploads`, `GET /api/reference-images/:assetId`, `GET /api/reference-images/:assetId/content`, trusted-origin `DELETE /api/reference-images/:assetId`                                                                                                                                                                   |
| ElevenLabs                  | `GET /api/elevenlabs/voices`, `GET /api/elevenlabs/voices/:voiceId/preview`, `DELETE /api/elevenlabs/voices/:voiceId`, `GET /api/elevenlabs/shared-voices`, `GET /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview`, `POST /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/save`, `POST /api/elevenlabs/voice-changer/recording` |

Capabilities report configuration presence only. The backend has one configured demo user and no
signup, analytics, public tenancy, billing, or general durable worker queue. Local mode uses files
and process-memory sessions. Configuration-gated Neon provides SQL metadata, durable sessions, and
accepted-job recovery; private R2 provides bytes. Neither changes the loopback trust boundary.
Host-derived legacy namespaces are migration inputs only, never authenticated identity.

## Resource ownership

The creator of a resource owns idempotent cleanup.

| Owner                 | Resources                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session orchestration | Owned local/remote streams, cloned provider input, provider client, token abort, active-session clock                                                          |
| Session draft         | Ephemeral files and preview object URLs                                                                                                                        |
| Recording/review      | Recorders, chunks, conversion abort, immutable source/sidecar, edited/visual/voice artifact URLs, cap timer, unload protection                                 |
| Existing-video flow   | Validation generations, one ephemeral visual draft, provider polling/download                                                                                  |
| Video edit session    | Pinned source/draft/history, module worker generation, render candidate, chunk accumulator, validation abort                                                   |
| Character Wardrobe    | Variant creation draft, generation abort, stale-result rejection, uncommitted reference discard, exact version handoff                                         |
| Voice processing      | Abort controllers, Web Audio/Mediabunny resources, temporary processed URLs                                                                                    |
| Media stage           | DOM media attachment and control-visibility timer                                                                                                              |
| Overlay               | Focus/inert/scroll state only; never media                                                                                                                     |
| API request/service   | Request abort, upstream streams, shared-operation subscribers, provider deadline                                                                               |
| Video-job service     | Active map, durable accepted-job restore, admission, exact-once submission, private temp paths, expiry and cleanup                                             |
| Reference store       | Storage-neutral byte streams, metadata/request mappings, activity refresh, saved-relationship checks, lifecycle registration, and idempotent temporary cleanup |

Late async results check their generation or abort state before commit. A healthy replacement
commits before the previous owned resource is released. Duplicate Stop coalesces. Recording only
borrows source tracks.

## Deployment and tests

Development uses Vite on `127.0.0.1:4173` and the API on `127.0.0.1:4100`. Production mode serves
the built client and API from Fastify on one loopback origin. There is no supported public
deployment, authentication, tenancy, billing, infrastructure automation, backup, remote
observability, or asset garbage collection.

Tests keep provider and browser effects behind injectable seams:

- domain tests cover pure policy;
- component/controller tests cover state, races, focus, and cleanup;
- Fastify tests inject provider dependencies and fetch;
- Storybook uses typed local doubles and is typechecked/statically built as a review catalog;
- Playwright uses deterministic synthetic media and denies unexpected HTTP/WebSockets;
- live provider and physical-device checks are manual release evidence.

The visual and responsive suites protect all five canonical viewports, one persistent player,
bounded scrolling, accessible actions, source continuity, finalization ordering, and provider-free
local preparation. See [testing strategy](TESTING.md),
[screenshot coverage](screenshot-test-coverage.md), [manual QA](MANUAL_QA.md), and
[live provider smoke](LIVE_PROVIDER_SMOKE.md).
